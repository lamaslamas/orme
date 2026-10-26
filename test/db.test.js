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

// i giri e gli avvistamenti di prima: non ci sono più nell'app; si scrivono direttamente nell'archivio come li aveva salvati
// la versione vecchia (i dati dei test sono inventati: mai dati reali nel codice)
async function scriviVecchio(archivio, valore) {
  const d = await db.apriDb();
  const tx = d.transaction(archivio, 'readwrite');
  tx.objectStore(archivio).put(valore);
  await new Promise((ok, no) => {
    tx.oncomplete = ok;
    tx.onerror = () => no(tx.error);
  });
}

describe('giri di prima', () => {
  const traccia = (id, da, a) => ({ sentieroId: id, origine: 'gpx', geojson: { type: 'MultiLineString', coordinates: [[[13.8 + da, 41.7], [13.8 + a, 41.7]]] } });

  it('diventano percorsi miei, una volta sola, e restano nell\'archivio finché non si eliminano', async () => {
    await db.salvaSentiero({ id: 'a', nome: 'A' });
    await db.salvaSentiero({ id: 'b', nome: 'B' });
    await db.salvaTraccia(traccia('a', 0, 0.01));
    await db.salvaTraccia(traccia('b', 0.01, 0.02));
    await scriviVecchio('giri', { id: 'g1', nome: 'Anello', notePersonali: 'bello', tappe: [{ sentieroId: 'a' }, { sentieroId: 'b', alContrario: false }] });
    expect(await db.convertiGiriInPercorsi()).toBe(1);
    const p = await db.leggiPercorso('percorso-giro-g1');
    expect(p.nome).toBe('Anello');
    expect(p.note).toContain('bello');
    expect(p.geojson.coordinates.length).toBeGreaterThan(0);
    expect(await db.convertiGiriInPercorsi()).toBe(0); // non si converte due volte
    expect(await db.giriVecchi()).toHaveLength(1);
  });

  it('il backup normale non ha più giri né avvistamenti; quello completo li ha, per scaricarli prima di eliminarli', async () => {
    await scriviVecchio('giri', { id: 'g1', nome: 'Anello', tappe: [] });
    await scriviVecchio('avvistamenti', { id: 'a1', animale: 'cervo', dataOra: '2026-01-01T10:00', punto: { lat: 1, lon: 1 } });
    const normale = JSON.parse(JSON.stringify(await db.esporta()));
    expect(normale.versione).toBe(5);
    expect(normale.giri).toBeUndefined();
    expect(normale.avvistamenti).toBeUndefined();
    const completo = JSON.parse(JSON.stringify(await db.esporta({ conDatiVecchi: true })));
    expect(completo.giri).toHaveLength(1);
    expect(completo.avvistamenti).toHaveLength(1);
  });

  it('eliminare i dati vecchi svuota giri e avvistamenti', async () => {
    await scriviVecchio('giri', { id: 'g1', nome: 'Anello', tappe: [] });
    await scriviVecchio('avvistamenti', { id: 'a1', animale: 'cervo', punto: { lat: 1, lon: 1 } });
    await db.eliminaDatiVecchi();
    expect(await db.giriVecchi()).toHaveLength(0);
    expect(await db.avvistamentiVecchi()).toHaveLength(0);
  });

  it('importando un backup vecchio i giri diventano percorsi e gli avvistamenti non si importano', async () => {
    const backup = {
      app: 'orme', versione: 4, sentieri: [{ id: 'a', nome: 'A' }, { id: 'b', nome: 'B' }], tracce: [traccia('a', 0, 0.01), traccia('b', 0.01, 0.02)],
      giri: [{ id: 'g9', nome: 'Vecchio giro', tappe: [{ sentieroId: 'a' }, { sentieroId: 'b' }] }],
      avvistamenti: [{ id: 'x', animale: 'lupo', punto: { lat: 1, lon: 1 } }],
    };
    const n = await db.importa(backup, 'sostituisci');
    expect(n).toMatchObject({ giri: 1, avvistamentiIgnorati: 1 });
    expect((await db.leggiPercorso('percorso-giro-g9')).nome).toBe('Vecchio giro');
    expect(await db.avvistamentiVecchi()).toHaveLength(0);
    await expect(db.importa({ ...backup, giri: [{ nome: 'senza id' }] })).rejects.toThrow('giro non valido');
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

describe('foto personali nel database e nel backup', () => {
  it('si salvano per sentiero e nel backup entrano solo se richiesto', async () => {
    const db = await import('../src/db.js');
    const immagine = new Uint8Array([1, 2, 3, 4]).buffer;
    await db.salvaFoto({ id: 'foto-1', sentieroId: 'f2-val-fondillo', immagine, miniatura: immagine, tipo: 'image/jpeg' });
    expect((await db.fotoDelSentiero('f2-val-fondillo')).map((f) => f.id)).toEqual(['foto-1']);
    expect((await db.esporta()).foto).toBeUndefined();
    const conFoto = await db.esporta({ includiFoto: true });
    expect(conFoto.foto).toHaveLength(1);
    expect(typeof conFoto.foto[0].immagine).toBe('string');
    await db.eliminaFoto('foto-1');
    expect(await db.fotoDelSentiero('f2-val-fondillo')).toEqual([]);
    await db.importa(JSON.parse(JSON.stringify(conFoto)), 'unisci');
    const [ripristinata] = await db.fotoDelSentiero('f2-val-fondillo');
    expect(new Uint8Array(ripristinata.immagine)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });
});
