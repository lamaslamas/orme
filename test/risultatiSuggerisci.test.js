import { describe, it, expect } from 'vitest';
import { specieDelPercorso, comuniATutti, motiviDistintivi, eInverso, unisciInversi } from '../src/lib/risultatiSuggerisci.js';

describe('specie lungo il percorso', () => {
  const s = { faunaInat: { specie: [
    { animale: 'cervo', livello: 'percorso', osservazioni: 5 },
    { animale: 'lupo', livello: 'zona', osservazioni: 90 },
    { animale: 'camoscio', livello: 'percorso', osservazioni: 12 },
  ] } };
  it('solo quelle sul percorso, le più viste prima; quelle del parco no', () => {
    expect(specieDelPercorso(s)).toEqual(['camoscio', 'cervo']);
  });
  it('il tratto con più fauna conta', () => {
    expect(specieDelPercorso(s, { migliore: { specie: ['nibbio_reale', 'cervo'] } })).toEqual(['nibbio_reale', 'cervo', 'camoscio']);
    expect(specieDelPercorso({}, null)).toEqual([]);
  });
});

describe('quello che vale per tutti', () => {
  it('comuni a tutte le liste (con un solo risultato niente)', () => {
    expect(comuniATutti([['a', 'b'], ['b', 'c'], ['b', 'a']])).toEqual(['b']);
    expect(comuniATutti([['a', 'b']])).toEqual([]);
    expect(comuniATutti([])).toEqual([]);
  });
  it('i motivi del meteo: i comuni una volta sola, nelle card solo quelli che cambiano', () => {
    const g = (...fattori) => ({ giudizio: 'attenzione', fattori: fattori.map(([chiave, livello, testo]) => ({ chiave, livello, testo })) });
    const r = motiviDistintivi([
      g(['vento', 'attenzione', 'raffiche 73'], ['fango', 'attenzione', 'fango']),
      g(['vento', 'attenzione', 'raffiche 75']),
      g(['vento', 'attenzione', 'raffiche 70'], ['panorama', 'info', 'cielo sereno']),
    ]);
    expect(r.comuni.map((m) => m.chiave)).toEqual(['vento']);
    expect(r.perVoce.map((l) => l.map((m) => m.chiave))).toEqual([['fango'], [], ['panorama']]);
  });
  it('senza meteo per qualcuno: niente comuni inventati', () => {
    expect(motiviDistintivi([null, { fattori: [{ chiave: 'vento', livello: 'attenzione', testo: 'x' }] }]).comuni).toEqual([]);
  });
});

describe('un sentiero e il suo inverso', () => {
  const a = { codici: ['536'], km: 9, inizio: [13.8, 41.7], fine: [13.9, 41.75] };
  const b = { codici: ['536A'], km: 9.1, inizio: [13.9005, 41.7502], fine: [13.8004, 41.7001] };
  it('stesso codice a meno della lettera, lunghezza uguale, estremi scambiati', () => {
    expect(eInverso(a, b)).toBe(true);
  });
  it('non lo sono: estremi no, lunghezza diversa, codice diverso o uguale', () => {
    expect(eInverso(a, { ...b, inizio: [14.2, 41.7] })).toBe(false);
    expect(eInverso(a, { ...b, km: 14 })).toBe(false);
    expect(eInverso(a, { ...b, codici: ['537A'] })).toBe(false);
    expect(eInverso(a, { ...a })).toBe(false);
  });
  it('anelli al contrario: stessa partenza', () => {
    const r1 = { codici: ['12'], km: 7, inizio: [13.8, 41.7], fine: [13.8001, 41.7001] };
    const r2 = { codici: ['12A'], km: 7, inizio: [13.8002, 41.7], fine: [13.8, 41.7002] };
    expect(eInverso(r1, r2)).toBe(true);
  });
  it('resta il primo della classifica, con «anche al contrario»', () => {
    const voci = [{ id: 'x', e: a }, { id: 'altro', e: { codici: ['9'], km: 3, inizio: [10, 40], fine: [10.1, 40] } }, { id: 'y', e: b }];
    const r = unisciInversi(voci, (v) => v.e);
    expect(r.map((v) => v.id)).toEqual(['x', 'altro']);
    expect(r[0].ancheAlContrario).toBe('536A');
  });
  it('il migliore è quello che arriva prima, anche se è l\'inverso', () => {
    const r = unisciInversi([{ id: 'y', e: b }, { id: 'x', e: a }], (v) => v.e);
    expect(r.map((v) => v.id)).toEqual(['y']);
    expect(r[0].ancheAlContrario).toBe('536');
  });
});

import { separaLuce, testoLuce } from '../src/lib/risultatiSuggerisci.js';

describe('la luce non è meteo', () => {
  const luce = (ultima, durata = 420) => ({ chiave: 'luce', livello: 'sconsigliato', testo: 'troppo lungo', tramonto: '18:05', ultimaPartenzaMin: ultima, durataMin: durata });
  const g = (...fattori) => ({ fattori });
  it('la luce comune a tutti esce dai motivi del meteo', () => {
    const comuni = [{ chiave: 'luce', livello: 'sconsigliato' }, { chiave: 'vento', livello: 'attenzione', testo: 'raffiche 70' }];
    const r = separaLuce(comuni, [g(luce(10 * 60 + 35)), g(luce(9 * 60 + 5))], { oraPartenza: '12:00' });
    expect(r.meteo.map((m) => m.chiave)).toEqual(['vento']);
    expect(r.luce).toMatchObject({ tramonto: '18:05', ultimaPartenza: '10:35', oraPartenza: '12:00', proposta: '09:00' });
  });
  it('la riga: parti entro le 10:35, con la partenza scelta', () => {
    expect(testoLuce({ tramonto: '18:05', ultimaPartenza: '10:35', oraPartenza: '12:00', proposta: '09:00' })).toBe('Partendo alle 12:00 una giornata finisce dopo il tramonto (18:05): parti entro le 10:35');
  });
  it('se le 9:00 sono troppo tardi si propone l\'ora giusta; se nemmeno le 6:00 bastano, niente pulsante', () => {
    const r = separaLuce([{ chiave: 'luce', livello: 'sconsigliato' }], [g(luce(8 * 60 + 40))], { oraPartenza: '12:00' });
    expect(r.luce.proposta).toBe('08:40');
    const nessuno = separaLuce([{ chiave: 'luce', livello: 'sconsigliato' }], [g(luce(5 * 60))], { oraPartenza: '12:00' });
    expect(nessuno.luce.proposta).toBeNull();
    expect(testoLuce(nessuno.luce)).toContain('nessun percorso si fa con la luce di quel giorno');
  });
  it('senza luce tra i motivi comuni: niente riga', () => {
    const r = separaLuce([{ chiave: 'vento', livello: 'attenzione' }], [g()], {});
    expect(r.luce).toBeNull();
    expect(r.meteo).toHaveLength(1);
    expect(testoLuce(null)).toBe('');
  });
});

import { zonaDaScelte, raggioDaMinuti } from '../src/lib/zonaSpecie.js';
import { specieDellaZonaPerOsservatori, inGruppo } from '../src/lib/specieZona.js';
import { possibilitaFauna } from '../src/lib/faunaPercorso.js';
import { testoPerche, PERIODI, RAGGIO_PERIODO, SCELTE_PREDEFINITE } from '../src/lib/suggerimenti.js';
import { normalizzaScelte } from '../src/lib/scelteSuggerisci.js';

describe('periodo per la fauna', () => {
  it('predefinito: mesi vicini; valori validi', () => {
    expect(SCELTE_PREDEFINITE.periodo).toBe('vicini');
    expect(Object.keys(PERIODI)).toEqual(['mese', 'vicini', 'anno']);
    expect(RAGGIO_PERIODO).toEqual({ mese: 0, vicini: 1, anno: null });
    expect(normalizzaScelte({ periodo: 'anno' }).periodo).toBe('anno');
    expect(normalizzaScelte({ periodo: 'boh' }).periodo).toBe('vicini');
    expect(normalizzaScelte({}).periodo).toBe('vicini');
  });
  it('«ricco di fauna» segue il periodo: mese, mesi vicini, anno', () => {
    // 40 osservazioni lungo il percorso solo a ottobre (mese 10)
    const s = { lunghezzaKm: 5, faunaInat: { km: 5, specie: [{ animale: 'cervo', livello: 'percorso', osservazioni: 40, persone: 12, perMese: [0, 0, 0, 0, 0, 0, 0, 0, 0, 40, 0, 0], mesi: 'ott' }] } };
    expect(possibilitaFauna(s, 10, { stagione: true, raggioMesi: 0 })?.livello).toBe('frequenti');
    expect(possibilitaFauna(s, 9, { stagione: true, raggioMesi: 0 })).toBeNull(); // settembre: niente
    expect(possibilitaFauna(s, 9, { stagione: true, raggioMesi: 1 })?.livello).toBe('frequenti'); // ±1 arriva a ottobre
    expect(possibilitaFauna(s, 3, { stagione: false })?.livello).toBe('frequenti'); // tutto l'anno
  });
  it('con «Tutto l\'anno» la card dice in quali mesi è segnalato', () => {
    const c = { misure: { km: 5, salita: 100, durataMin: 90 }, specie: { animale: 'cervo', nome: 'molto segnalato', persone: 30, testo: '30 osservatori', dove: 'percorso', mesi: 'set–ott' } };
    expect(testoPerche(c, { periodoAnno: true })).toContain('segnalato in set–ott');
    expect(testoPerche(c)).not.toContain('segnalato in');
  });
});

describe('zona di «Più segnalate qui» senza mappa', () => {
  const parco = { id: 'appennino-lucano', nome: "Parco Nazionale dell'Appennino Lucano – Val d'Agri – Lagonegrese", bbox: [40, 15.5, 40.5, 16.2] };
  it('il parco scelto: il suo riquadro e il titolo', () => {
    const z = zonaDaScelte({ distanza: 'parco', parco: 'appennino-lucano' }, { parcoScelto: parco, centro: [15, 40] });
    expect(z.tipo).toBe('parco');
    expect(z.riquadro).toEqual(parco.bbox);
    expect(z.etichetta).toBe("nel Parco dell'Appennino Lucano – Val d'Agri – Lagonegrese");
  });
  it('il tempo: l\'area raggiungibile da me, con il titolo', () => {
    const z = zonaDaScelte({ distanza: '60' }, { centro: [13.9, 41.9] });
    expect(z.tipo).toBe('tempo');
    expect(z.etichetta).toBe('entro 1 h da te');
    expect(z.raggioKm).toBe(raggioDaMinuti(60));
    expect(raggioDaMinuti(30)).toBeLessThan(raggioDaMinuti(60));
    expect(raggioDaMinuti(600)).toBe(50); // al massimo 50 km
    expect(zonaDaScelte({ distanza: '30' }, { centro: [13.9, 41.9] }).etichetta).toBe('entro 30 min da te');
    expect(zonaDaScelte({ distanza: '' }, { centro: [13.9, 41.9] }).etichetta).toBe('entro 50 km da te');
  });
  it('senza la mia posizione si dice da dove si guarda; senza centro né parco niente zona', () => {
    expect(zonaDaScelte({ distanza: '120' }, { centro: [13.9, 41.9], daMe: false }).etichetta).toBe('entro 2 h dalla zona che guardavi');
    expect(zonaDaScelte({ distanza: '60' }, {})).toBeNull();
    expect(zonaDaScelte({ distanza: 'parco', parco: '' }, { centro: [13.9, 41.9] }).tipo).toBe('tempo');
  });
  it('la zona cambia con la scelta (chiave diversa)', () => {
    const a = zonaDaScelte({ distanza: '30' }, { centro: [13.9, 41.9] });
    const b = zonaDaScelte({ distanza: '60' }, { centro: [13.9, 41.9] });
    expect(a.chiave).not.toBe(b.chiave);
  });
});

describe('«Più segnalate qui» segue il gruppo di «Quale animale»', () => {
  const o = (specie, animale, classe, ordine) => Array.from({ length: 4 }, (_, i) => ({ nomeScientifico: specie, specie, animale, classe, ordine, data: '2025-10-10', osservatore: i % 3 }));
  const oss = [...o('Cervus elaphus', 'cervo', 'Mammalia', 'Artiodactyla'), ...o('Hystrix cristata', null, 'Mammalia', 'Rodentia'), ...o('Milvus milvus', 'nibbio_reale', 'Aves', 'Accipitriformes'), ...o('Buteo buteo', null, 'Aves', 'Accipitriformes'), ...o('Egretta garzetta', null, 'Aves', 'Pelecaniformes')];
  const nomi = (r) => r.map((x) => x.chiave).sort();
  it('qualsiasi: tutte; mammiferi: solo mammiferi; rapaci: solo rapaci', () => {
    expect(nomi(specieDellaZonaPerOsservatori(oss, 10))).toHaveLength(5);
    expect(nomi(specieDellaZonaPerOsservatori(oss, 10, { gruppo: 'mammiferi' }))).toEqual(['Cervus elaphus', 'Hystrix cristata']);
    expect(nomi(specieDellaZonaPerOsservatori(oss, 10, { gruppo: 'rapaci' }))).toEqual(['Buteo buteo', 'Milvus milvus']);
  });
  it('una specie sola o un valore qualsiasi non filtra come un gruppo', () => {
    expect(inGruppo({ animale: 'cervo' }, 'cervo')).toBe(true);
    expect(inGruppo({ animale: null, classe: 'Aves', ordine: 'Pelecaniformes' }, 'rapaci')).toBe(false);
  });
  it('il periodo vale anche per le specie della zona: tutto l\'anno e solo il mese', () => {
    const marzo = [...o('Cervus elaphus', 'cervo', 'Mammalia', 'Artiodactyla')].map((x) => ({ ...x, data: '2025-03-10' }));
    expect(specieDellaZonaPerOsservatori(marzo, 10, { raggioMesi: 1 })).toHaveLength(0);
    expect(specieDellaZonaPerOsservatori(marzo, null)).toHaveLength(1); // tutto l'anno: senza mese
  });
});
