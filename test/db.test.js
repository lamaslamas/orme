import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach } from 'vitest';
import * as db from '../src/db.js';
import { DATI_INIZIALI } from '../src/datiIniziali.js';

beforeEach(async () => {
  await db.chiudiDb();
  globalThis.indexedDB = new IDBFactory();
});

describe('archivio locale', () => {
  it('carica i dati iniziali una sola volta', async () => {
    expect(await db.caricaDatiIniziali()).toBe(true);
    expect(await db.tuttiISentieri()).toHaveLength(DATI_INIZIALI.length);
    await db.eliminaSentiero('cicerana');
    expect(await db.caricaDatiIniziali()).toBe(false);
    expect(await db.tuttiISentieri()).toHaveLength(DATI_INIZIALI.length - 1);
  });

  it('tutti i dati iniziali sono da verificare e hanno un parco esistente', async () => {
    const { parcoDa } = await import('../src/datiParchi.js');
    expect(DATI_INIZIALI.every((s) => s.daVerificare)).toBe(true);
    expect(DATI_INIZIALI.every((s) => parcoDa(s.parco))).toBe(true);
    expect(new Set(DATI_INIZIALI.map((s) => s.id)).size).toBe(DATI_INIZIALI.length);
  });

  it('salva e modifica un sentiero tenendo la data di creazione', async () => {
    const primo = await db.salvaSentiero({ id: 'prova', nome: 'Prova' });
    const secondo = await db.salvaSentiero({ ...primo, nome: 'Prova 2' });
    expect(secondo.creato).toBe(primo.creato);
    expect((await db.leggiSentiero('prova')).nome).toBe('Prova 2');
  });

  it('eliminando un sentiero elimina anche la sua traccia', async () => {
    await db.salvaSentiero({ id: 'prova', nome: 'Prova' });
    await db.salvaTraccia({ sentieroId: 'prova', origine: 'gpx', geojson: { type: 'MultiLineString', coordinates: [] } });
    expect(await db.sentieriConTraccia()).toEqual(new Set(['prova']));
    await db.eliminaSentiero('prova');
    expect(await db.leggiTraccia('prova')).toBeUndefined();
  });

  it('esporta e reimporta (sostituisci e unisci)', async () => {
    await db.caricaDatiIniziali();
    await db.salvaTraccia({ sentieroId: 'f2-val-fondillo', origine: 'gpx', geojson: { type: 'MultiLineString', coordinates: [[[13.8, 41.8], [13.81, 41.81]]] } });
    const backup = JSON.parse(JSON.stringify(await db.esporta()));
    expect(backup.app).toBe('orme');

    await db.salvaSentiero({ id: 'extra', nome: 'Extra' });
    await db.importa(backup, 'sostituisci');
    expect(await db.leggiSentiero('extra')).toBeUndefined();
    expect(await db.tuttiISentieri()).toHaveLength(DATI_INIZIALI.length);
    expect(await db.leggiTraccia('f2-val-fondillo')).toBeTruthy();

    await db.salvaSentiero({ id: 'extra', nome: 'Extra' });
    await db.importa(backup, 'unisci');
    expect(await db.leggiSentiero('extra')).toBeTruthy();
  });

  it('rifiuta file che non sono backup di Orme', async () => {
    await expect(db.importa({ app: 'altro', sentieri: [], tracce: [] })).rejects.toThrow('non è un backup');
    await expect(db.importa({ app: 'orme', versione: 1, sentieri: [{}], tracce: [] })).rejects.toThrow('senza id');
    await expect(db.importa(null)).rejects.toThrow();
  });
});

describe('aggiornamento dalla versione 1', () => {
  it('aggiunge la bici ai sentieri salvati senza toccare le modifiche', async () => {
    await new Promise((risolvi, rifiuta) => {
      const req = indexedDB.open('orme', 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        d.createObjectStore('sentieri', { keyPath: 'id' }).put({ id: 'mio', nome: 'Mio', notePersonali: 'note mie', stato: 'fatto' });
        d.createObjectStore('tracce', { keyPath: 'sentieroId' });
        d.createObjectStore('meta', { keyPath: 'chiave' }).put({ chiave: 'datiIniziali', caricati: 'ieri' });
      };
      req.onsuccess = () => {
        req.result.close();
        risolvi();
      };
      req.onerror = () => rifiuta(req.error);
    });

    const s = await db.leggiSentiero('mio');
    expect(s.bici.consentita).toBe('da_verificare');
    expect(s.parco).toBe('pnalm');
    expect(s.notePersonali).toBe('note mie');
    expect(s.stato).toBe('fatto');
    // arrivano i sentieri dei nuovi parchi, ma non quelli del PNALM già caricati (e magari eliminati)
    expect(await db.caricaDatiIniziali()).toBe(true);
    const tutti = await db.tuttiISentieri();
    expect(tutti.some((x) => x.parco === 'foreste-casentinesi')).toBe(true);
    expect(tutti.some((x) => x.id === 'cicerana')).toBe(false);
    expect(await db.caricaDatiIniziali()).toBe(false);
  });

  it('importa un backup vecchio senza il campo bici', async () => {
    await db.importa({ app: 'orme', versione: 1, sentieri: [{ id: 'a', nome: 'A' }], tracce: [] }, 'sostituisci');
    expect((await db.leggiSentiero('a')).bici.consentita).toBe('da_verificare');
    const backup = await db.esporta();
    expect(backup.sentieri[0].bici).toBeTruthy();
  });

  it('i dati iniziali hanno tutti la bici da verificare', async () => {
    await db.caricaDatiIniziali();
    const tutti = await db.tuttiISentieri();
    expect(tutti.every((s) => s.bici.consentita === 'da_verificare')).toBe(true);
  });
});

describe('giri', () => {
  it('salva, legge ed elimina un giro', async () => {
    await db.salvaGiro({ id: 'g1', nome: 'Anello', tappe: [{ sentieroId: 'a' }, { sentieroId: 'b', alContrario: true }] });
    const g = await db.leggiGiro('g1');
    expect(g.tappe[1].alContrario).toBe(true);
    expect(g.stato).toBe('da_fare');
    expect(await db.tuttiIGiri()).toHaveLength(1);
    await db.eliminaGiro('g1');
    expect(await db.leggiGiro('g1')).toBeUndefined();
  });

  it('eliminare un sentiero non elimina i giri che lo contengono', async () => {
    await db.salvaSentiero({ id: 'a', nome: 'A' });
    await db.salvaGiro({ id: 'g1', nome: 'Anello', tappe: [{ sentieroId: 'a' }, { sentieroId: 'b' }] });
    await db.eliminaSentiero('a');
    expect((await db.leggiGiro('g1')).tappe).toHaveLength(2);
  });

  it('il backup include i giri e accetta backup vecchi senza giri', async () => {
    await db.salvaGiro({ id: 'g1', nome: 'Anello', tappe: [] });
    const backup = JSON.parse(JSON.stringify(await db.esporta()));
    expect(backup.versione).toBe(4);
    expect(backup.giri).toHaveLength(1);

    await db.importa({ app: 'orme', versione: 1, sentieri: [], tracce: [] }, 'sostituisci');
    expect(await db.tuttiIGiri()).toHaveLength(0);
    const n = await db.importa(backup, 'unisci');
    expect(n.giri).toBe(1);
    expect(await db.leggiGiro('g1')).toBeTruthy();
    await expect(db.importa({ ...backup, giri: [{ nome: 'senza id' }] })).rejects.toThrow('giro non valido');
  });
});

describe('avvistamenti nel backup', () => {
  // punti inventati per i test: mai dati reali nel codice
  const avv = { id: 'a1', animale: 'cervo', dataOra: '2026-01-01T10:00', punto: { lat: 1, lon: 1 } };

  it('per impostazione predefinita il backup esclude gli avvistamenti', async () => {
    await db.salvaAvvistamento(avv);
    const b = await db.esporta();
    expect(b.avvistamenti).toBeUndefined();
    expect(b.avvistamentiEsclusi).toBe(true);
    const completo = await db.esporta({ escludiAvvistamenti: false });
    expect(completo.avvistamenti).toHaveLength(1);
  });

  it('"sostituisci" con un backup senza avvistamenti non cancella i miei', async () => {
    await db.salvaAvvistamento(avv);
    const senza = JSON.parse(JSON.stringify(await db.esporta()));
    await db.importa(senza, 'sostituisci');
    expect(await db.tuttiGliAvvistamenti()).toHaveLength(1);
  });

  it('un backup completo li ripristina', async () => {
    await db.salvaAvvistamento(avv);
    const completo = JSON.parse(JSON.stringify(await db.esporta({ escludiAvvistamenti: false })));
    await db.eliminaAvvistamento('a1');
    const n = await db.importa(completo, 'sostituisci');
    expect(n.avvistamenti).toBe(1);
    expect((await db.leggiAvvistamento('a1')).animale).toBe('cervo');
  });
});

describe('tracce iniziali', () => {
  it('arrivano con i dati iniziali, con i sentieri mancanti segnalati', async () => {
    await db.caricaDatiIniziali();
    const f10 = await db.leggiTraccia('f10-pianezza');
    expect(f10.dettagli.iniziale).toBe(true);
    expect(f10.geojson.coordinates.length).toBeGreaterThan(0);
    expect((await db.leggiTraccia('l1-m1-n1-monte-meta')).dettagli.mancanti).toEqual(['N1']);
    expect((await db.leggiTraccia('b5-b4-monte-tranquillo')).dettagli.codici).toEqual(['C5', 'B4']);
    expect((await db.leggiTraccia('cicerana')).dettagli.ricostruita).toBe(true);
  });

  it('non sovrascrivono una traccia che ho già salvato', async () => {
    // telefono con i dati della versione 2 e un mio GPX su F2
    await db.caricaDatiIniziali();
    await db.salvaTraccia({ sentieroId: 'f2-val-fondillo', origine: 'gpx', geojson: { type: 'MultiLineString', coordinates: [[[13.8, 41.7], [13.81, 41.71]]] } });
    await db.importa({ ...(await db.esporta()), versioneDatiIniziali: 2 }, 'unisci');
    await db.caricaDatiIniziali();
    expect((await db.leggiTraccia('f2-val-fondillo')).origine).toBe('gpx');
  });
});

describe('aggiornamento alla versione 4 dei dati iniziali', () => {
  it('aggiorna i campi non modificati, lascia le mie modifiche e le mie tracce', async () => {
    const { PNALM_ORIGINALI } = await import('../src/datiIniziali.js');
    // telefono con i dati originali della versione 3, una mia nota e un mio GPX
    const tranquillo = PNALM_ORIGINALI.find((s) => s.id === 'b5-b4-monte-tranquillo');
    const f1 = { ...PNALM_ORIGINALI.find((s) => s.id === 'f1-monte-amaro'), accesso: { tipo: 'numero_chiuso', nota: 'mia nota', link: 'x' } };
    await db.importa({ app: 'orme', versione: 3, versioneDatiIniziali: 3, sentieri: [tranquillo, f1], tracce: [
      { sentieroId: 'f1-monte-amaro', origine: 'gpx', geojson: { type: 'MultiLineString', coordinates: [[[13.8, 41.7], [13.81, 41.71]]] } },
    ] }, 'sostituisci');
    expect(await db.caricaDatiIniziali()).toBe(true);
    const t = await db.leggiSentiero('b5-b4-monte-tranquillo');
    expect(t.codici).toEqual(['C5', 'B4']);
    expect(t.escursione.url).toContain('PNALMnov75472');
    expect((await db.leggiTraccia('b5-b4-monte-tranquillo')).dettagli.codici).toEqual(['C5', 'B4']);
    const a = await db.leggiSentiero('f1-monte-amaro');
    expect(a.accesso.nota).toBe('mia nota');
    expect(a.dislivelloM).toBe(780);
    expect((await db.leggiTraccia('f1-monte-amaro')).origine).toBe('gpx');
  });
});

describe('percorsi', () => {
  it('si salvano, entrano nel backup e un backup vecchio non li cancella', async () => {
    await db.salvaPercorso({ id: 'p1', nome: 'Prova', origine: 'disegnato', geojson: { type: 'MultiLineString', coordinates: [] } });
    expect((await db.leggiPercorso('p1')).nome).toBe('Prova');
    const backup = JSON.parse(JSON.stringify(await db.esporta()));
    expect(backup.percorsi).toHaveLength(1);
    await db.importa({ app: 'orme', versione: 3, sentieri: [], tracce: [] }, 'sostituisci');
    expect(await db.tuttiIPercorsi()).toHaveLength(1);
    await db.eliminaPercorso('p1');
    await db.importa(backup, 'unisci');
    expect(await db.leggiPercorso('p1')).toBeTruthy();
  });
});

describe('più finestre aperte', () => {
  it('una finestra vecchia libera l\'archivio quando un\'altra lo aggiorna', async () => {
    const vecchia = await db.apriDb();
    let avvisata = false;
    globalThis.addEventListener?.('orme-aggiornata-altrove', () => (avvisata = true));
    // un'altra "finestra" apre una versione più nuova
    const nuova = await new Promise((risolvi, rifiuta) => {
      const req = indexedDB.open('orme', vecchia.version + 1);
      req.onsuccess = () => risolvi(req.result);
      req.onerror = () => rifiuta(req.error);
    });
    expect(nuova.version).toBe(vecchia.version + 1);
    nuova.close();
    if (globalThis.addEventListener) expect(avvisata).toBe(true);
  });
});

describe('sincronizzazione con l\'archivio pubblico', () => {
  it('aggiunge i campi nuovi, rispetta le mie modifiche e i miei GPX', async () => {
    const { readFileSync } = await import('node:fs');
    const archivio = JSON.parse(readFileSync(new URL('../public/dati/archivio.json', import.meta.url)));
    await db.caricaDatiIniziali();
    const f1 = await db.leggiSentiero('f1-monte-amaro');
    await db.salvaSentiero({ ...f1, accesso: { ...f1.accesso, nota: 'mia nota' }, stato: 'fatto', notePersonali: 'bello' });
    await db.salvaTraccia({ sentieroId: 'f2-val-fondillo', origine: 'gpx', geojson: { type: 'MultiLineString', coordinates: [[[13.8, 41.7], [13.81, 41.71]]] } });

    await db.sincronizzaArchivio(archivio);
    const dopo = await db.leggiSentiero('f1-monte-amaro');
    expect(dopo.accesso.nota).toBe('mia nota');
    expect(dopo.stato).toBe('fatto');
    expect(dopo.notePersonali).toBe('bello');
    expect(dopo.attivita.trekking.stato).toBe('con_limitazioni');
    expect(dopo.parchi).toEqual(['pnalm']);
    expect((await db.leggiTraccia('f2-val-fondillo')).origine).toBe('gpx');
    expect((await db.leggiTraccia('cicerana')).dettagli.archivio).toBe(true);

    // una seconda sincronizzazione uguale non cambia nulla
    expect(await db.sincronizzaArchivio(archivio)).toEqual({ sentieri: 0, tracce: 0 });

    // l'archivio cambia la nota: la mia resta, un campo non toccato si aggiorna
    const cambiato = structuredClone(archivio);
    const p = cambiato.percorsi.find((x) => x.id === 'f1-monte-amaro');
    p.accesso.nota = 'nota nuova del parco';
    p.zona = 'Monte Amaro di Opi';
    await db.sincronizzaArchivio(cambiato);
    const ancora = await db.leggiSentiero('f1-monte-amaro');
    expect(ancora.accesso.nota).toBe('mia nota');
    expect(ancora.zona).toBe('Monte Amaro di Opi');
  });
});
