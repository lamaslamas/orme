import { describe, it, expect } from 'vitest';
import { tappeDaTraccia, tagliaCode, aggancioDelleTappe, DISTANZA_MASSIMA_AGGANCIO_M, muovi, rinomina, luoghiDaRisposta, nomeAutomaticoTappa, nomeDellaTappa, etichettaConKm, kmDelleTappe, urlReverseTappa, nuovaTappa, tappeDaPunti, etichetta, inserisciDopo, sposta, togli, riordina, sostituisci, creaStoria, trattoPiuVicino, classeFondo, fondoDaTerreno, preferenzaPer, chiaveTratto } from '../src/lib/pianificatore.js';

const t = (lon, lat) => nuovaTappa([lon, lat]);
const nomi = (l) => l.map((x) => x.p.join(','));

describe('pianificatore: le tappe', () => {
  it('etichette A, 1, 2… B', () => {
    expect([0, 1, 2, 3].map((i) => etichetta(i, 4))).toEqual(['A', '1', '2', 'B']);
    expect(etichetta(0, 1)).toBe('A');
  });
  it('trascinare un tratto crea una tappa nel punto giusto, senza toccare le altre', () => {
    const l = [t(13, 41), t(13.1, 41.1), t(13.2, 41.2)];
    const r = inserisciDopo(l, 0, [13.05, 41.05]);
    expect(r).toHaveLength(4);
    expect(nomi(r)).toEqual(['13,41', '13.05,41.05', '13.1,41.1', '13.2,41.2']);
    expect(r[2].id).toBe(l[1].id); // le altre tappe restano le stesse
  });
  it('spostare toglie il nome (si ritrova), eliminare e riordinare tengono la partenza «normale»', () => {
    const l = [{ ...t(13, 41), nome: 'Opi' }, { ...t(13.1, 41.1), libero: true }, t(13.2, 41.2)];
    expect(sposta(l, 0, [13.5, 41.5])[0]).toMatchObject({ p: [13.5, 41.5], nome: null });
    expect(togli(l, 0)[0].libero).toBe(false);
    expect(riordina(l, 1, -1)[0].libero).toBe(false);
    expect(nomi(riordina(l, 2, -1))).toEqual(['13,41', '13.2,41.2', '13.1,41.1']);
    expect(riordina(l, 0, -1)).toBe(l); // già in cima
    expect(sostituisci(l, 2, [14, 42], 'Scanno')[2]).toMatchObject({ p: [14, 42], nome: 'Scanno' });
  });
  it('i punti salvati diventano tappe', () => {
    const r = tappeDaPunti([{ p: [1, 2], libero: true }, { p: [3, 4], libero: true }]);
    expect(r.map((x) => x.libero)).toEqual([false, true]);
    expect(new Set(r.map((x) => x.id)).size).toBe(2);
  });
});

describe('pianificatore: Annulla e Ripeti', () => {
  it('si torna indietro e avanti; una scelta nuova cancella il «ripeti»', () => {
    const s = creaStoria([]);
    const a = [t(1, 1)];
    const b = [...a, t(2, 2)];
    s.vai(a);
    s.vai(b);
    expect(s.puoAnnullare()).toBe(true);
    expect(s.annulla()).toBe(a);
    expect(s.puoRipetere()).toBe(true);
    expect(s.ripeti()).toBe(b);
    s.annulla();
    s.vai([t(9, 9)]);
    expect(s.puoRipetere()).toBe(false);
    expect(s.annulla()).toBe(a);
    expect(creaStoria([]).annulla()).toEqual([]);
  });
});

describe('pianificatore: tratto più vicino e fondo', () => {
  it('il tratto da cui parte il trascinamento', () => {
    const tratti = [[[13, 41], [13.1, 41]], [[13.1, 41], [13.1, 41.1]]];
    expect(trattoPiuVicino(tratti, [13.05, 41.0005]).indice).toBe(0);
    expect(trattoPiuVicino(tratti, [13.1005, 41.05]).indice).toBe(1);
    expect(trattoPiuVicino([], [13, 41]).indice).toBe(-1);
  });
  it('classi del fondo dai tag OSM', () => {
    expect(classeFondo({ highway: 'path', surface: 'ground' })).toBe('sentiero');
    expect(classeFondo({ highway: 'track', surface: 'gravel' })).toBe('sterrata');
    expect(classeFondo({ highway: 'track' })).toBe('sterrata');
    expect(classeFondo({ highway: 'residential' })).toBe('asfalto');
    expect(classeFondo({ highway: 'track', surface: 'asphalt' })).toBe('asfalto');
    expect(classeFondo({ highway: 'footway', surface: 'paving_stones' })).toBe('asfalto');
    expect(classeFondo({})).toBe('altro');
  });
  it('le percentuali fanno 100', () => {
    const f = fondoDaTerreno([{ daM: 0, aM: 620, tag: { highway: 'path' } }, { daM: 620, aM: 820, tag: { highway: 'track' } }, { daM: 820, aM: 1000, tag: { highway: 'residential' } }]);
    expect(f.percentuali).toEqual({ sentiero: 62, sterrata: 20, asfalto: 18, altro: 0 });
    const tre = fondoDaTerreno([1, 2, 3].map((n) => ({ daM: (n - 1) * 100, aM: n * 100, tag: { highway: n === 1 ? 'path' : n === 2 ? 'track' : 'residential' } })));
    expect(Object.values(tre.percentuali).reduce((a, b) => a + b, 0)).toBe(100);
    expect(fondoDaTerreno([]).percentuali).toBeNull();
  });
  it('preferenze: solo Trekking; la chiave del tratto cambia con le opzioni', () => {
    expect(preferenzaPer('sentieri', 'trekking')).toBe(1.5);
    expect(preferenzaPer('misto', 'trekking')).toBeNull();
    expect(preferenzaPer('sentieri', 'mtb')).toBeNull();
    const a = t(1, 1);
    const b = t(2, 2);
    expect(chiaveTratto(a, b, false, 'trekking:1.5')).not.toBe(chiaveTratto(a, b, false, 'mtb'));
  });
});

describe('pianificatore: riordino con trascinamento e nomi', () => {
  it('trascinare una tappa in un altro posto; la partenza non è mai «libera»', () => {
    const l = [t(1, 1), { ...t(2, 2), libero: true }, t(3, 3), t(4, 4)];
    expect(nomi(muovi(l, 3, 1))).toEqual(['1,1', '4,4', '2,2', '3,3']);
    expect(nomi(muovi(l, 0, 2))).toEqual(['2,2', '3,3', '1,1', '4,4']);
    expect(muovi(l, 0, 2)[0].libero).toBe(false);
    expect(muovi(l, 1, 1)).toBe(l);
    expect(muovi(l, 1, 9)).toBe(l);
  });
  it('rinominare a mano resta anche spostando la tappa; vuoto torna automatico', () => {
    const l = [{ ...t(1, 1), nome: 'Opi', luoghi: { paese: 'Opi' } }];
    const r = rinomina(l, 0, '  Fonte della Rocca ');
    expect(r[0]).toMatchObject({ nome: 'Fonte della Rocca', nomeManuale: true });
    expect(sposta(r, 0, [2, 2])[0].nome).toBe('Fonte della Rocca');
    expect(rinomina(r, 0, '')[0]).toMatchObject({ nome: null, nomeManuale: false });
    expect(sposta(l, 0, [2, 2])[0]).toMatchObject({ nome: null, luoghi: null }); // l'automatico si ritrova
  });
  it('il nome: POI, poi via, poi località, poi paese; sempre con il km', () => {
    const luoghi = { via: 'Via Monteroni', localita: 'Tarantini', paese: 'Copertino' };
    expect(nomeAutomaticoTappa({ poi: 'Fontana del Gigante', luoghi })).toBe('Fontana del Gigante');
    expect(nomeAutomaticoTappa({ luoghi })).toBe('Via Monteroni');
    expect(nomeAutomaticoTappa({ luoghi: { localita: 'Tarantini', paese: 'Copertino' } })).toBe('Tarantini');
    expect(nomeAutomaticoTappa({ luoghi: { paese: 'Copertino' } })).toBe('Copertino');
    expect(nomeAutomaticoTappa({})).toBeNull();
    expect(nomeDellaTappa({ nome: 'A mano', luoghi })).toBe('A mano');
    expect(etichettaConKm('Via Monteroni', 4.2)).toBe('Via Monteroni · km 4,2');
    expect(etichettaConKm('Copertino', 0)).toBe('Copertino · km 0');
    expect(etichettaConKm('Copertino', undefined)).toBe('Copertino');
  });
  it('Nominatim: via o sentiero, frazione, paese', () => {
    expect(luoghiDaRisposta({ address: { road: 'Via Monteroni', hamlet: 'Tarantini', town: 'Copertino' } })).toEqual({ via: 'Via Monteroni', localita: 'Tarantini', paese: 'Copertino' });
    expect(luoghiDaRisposta({ address: { footway: 'Sentiero I1', village: 'Opi' } })).toEqual({ via: 'Sentiero I1', localita: null, paese: 'Opi' });
    expect(luoghiDaRisposta({ address: { isolated_dwelling: 'Masseria Cesine', city: 'Vernole' } }).localita).toBe('Masseria Cesine');
    expect(luoghiDaRisposta({ address: { country: 'Italia' } })).toBeNull();
    expect(luoghiDaRisposta({})).toBeNull();
    expect(urlReverseTappa(40.3, 18.1)).toContain('zoom=17');
  });
  it('i km di ogni tappa', () => {
    expect(kmDelleTappe([1500, 2700]).map((x) => Math.round(x * 10) / 10)).toEqual([0, 1.5, 4.2]);
    expect(kmDelleTappe([])).toEqual([0]);
  });
});

// 0,001° di longitudine ≈ 83 m a questa latitudine
const dritta = (n, lat = 41.8, lon0 = 13) => Array.from({ length: n }, (_, i) => [lon0 + i * 0.001, lat]);

describe('pianificatore: una traccia esistente come tappe', () => {
  it('senza punti di controllo: partenza, arrivo e una tappa ogni 3 km, tutte sulla traccia', () => {
    const { base, tappe } = tappeDaTraccia([dritta(121)]); // ≈ 10 km
    expect(base.totaleM).toBeGreaterThan(9800);
    expect(tappe.length).toBeGreaterThanOrEqual(4);
    expect(tappe[0].pos).toBe(0);
    expect(tappe.at(-1).pos).toBeCloseTo(base.totaleM, 0);
    expect(tappe.every((t, i) => i === 0 || t.pos > tappe[i - 1].pos)).toBe(true);
    expect(tappeDaTraccia([[[13, 41]]]).tappe).toEqual([]);
  });
  it('con i punti di controllo di un anello: ogni punto trova il suo posto, sempre in avanti', () => {
    const andata = dritta(51);
    const anello = [...andata, ...[...andata].reverse().slice(1)]; // andata e ritorno sulla stessa linea
    const { tappe } = tappeDaTraccia([anello], [{ p: andata[0] }, { p: andata[50] }, { p: andata[0] }]);
    expect(tappe.map((t) => Math.round(t.pos))).toEqual([0, Math.round(tappe[1].pos), Math.round(tappe[2].pos)]);
    expect(tappe[2].pos).toBeGreaterThan(tappe[1].pos); // il ritorno è dopo l'andata
  });
  it('un punto lontano dalla traccia resta dov\'è e senza posizione (BRouter lo ricalcola)', () => {
    const { tappe } = tappeDaTraccia([dritta(31)], [{ p: [13, 41.8] }, { p: [13.01, 41.85] }]);
    expect(tappe[1].pos).toBeUndefined();
    expect(tappe[1].p).toEqual([13.01, 41.85]);
  });
  it('spostare o sostituire una tappa toglie la posizione sulla base', () => {
    const t = { ...nuovaTappa([13, 41.8]), pos: 120 };
    expect(sposta([t], 0, [13.5, 41.8])[0].pos).toBeUndefined();
    expect(sostituisci([t], 0, [13.5, 41.8], 'X')[0].pos).toBeUndefined();
  });
});

describe('pianificatore: tratti senza code e agganciati', () => {
  const tratto = (coordinate, terreno = null) => ({ coordinate, terreno: terreno ?? [{ daM: 0, aM: 1000, tag: { highway: 'path' } }] });
  it('la tappa su un ramo senza uscita: il ramo si toglie e il percorso passa dalla giunzione', () => {
    // A → J → (ramo) → Z; poi Z → ramo indietro → J → B
    const J = [13.002, 41.8];
    const a = tratto([[13, 41.8], [13.001, 41.8], J, [13.002, 41.801], [13.002, 41.802]], [{ daM: 0, aM: 400, tag: { highway: 'path' } }, { daM: 400, aM: 700, tag: { highway: 'track' } }]);
    const b = tratto([[13.002, 41.802], [13.002, 41.801], J, [13.003, 41.8], [13.004, 41.8]], [{ daM: 0, aM: 300, tag: { highway: 'track' } }, { daM: 300, aM: 700, tag: { highway: 'path' } }]);
    const [a2, b2] = tagliaCode([a, b]);
    expect(a2.coordinate.at(-1)).toEqual(J);
    expect(b2.coordinate[0]).toEqual(J);
    expect(a2.coordinate).toHaveLength(3);
    expect(b2.coordinate).toHaveLength(3);
    // il terreno resta coerente con le lunghezze (il ramo è tolto da entrambi)
    expect(a2.terreno.at(-1).aM).toBeLessThan(700);
    expect(b2.terreno[0].daM).toBe(0);
    expect(a2.codaTolta && b2.codaTolta).toBe(true);
  });
  it('senza ritorno sullo stesso cammino non cambia niente', () => {
    const a = tratto([[13, 41.8], [13.001, 41.8], [13.002, 41.8]]);
    const b = tratto([[13.002, 41.8], [13.003, 41.8], [13.004, 41.8]]);
    const r = tagliaCode([a, b]);
    expect(r[0].coordinate).toEqual(a.coordinate);
    expect(r[1].coordinate).toEqual(b.coordinate);
    expect(r[0].codaTolta).toBeUndefined();
  });
  it('un tratto «fuori sentiero» non si tocca', () => {
    const a = { ...tratto([[13, 41.8], [13.001, 41.8], [13.002, 41.8]]), libero: true };
    const b = tratto([[13.002, 41.8], [13.001, 41.8], [13, 41.8]]);
    expect(tagliaCode([a, b])[0].coordinate).toHaveLength(3);
  });
  it('dove cade ogni tappa: la fine del tratto che arriva o l\'inizio di quello che parte; lontano più di 200 m si riconosce', () => {
    const tappe = [nuovaTappa([13, 41.8]), nuovaTappa([13.0002, 41.8]), nuovaTappa([13.01, 41.8])];
    const tratti = [tratto([[13, 41.8], [13.0004, 41.8]]), tratto([[13.0004, 41.8], [13.0100, 41.801]])];
    const a = aggancioDelleTappe(tappe, tratti);
    expect(a[1].p).toEqual([13.0004, 41.8]);
    expect(a[1].distanzaM).toBeLessThan(DISTANZA_MASSIMA_AGGANCIO_M);
    expect(a[2].distanzaM).toBeGreaterThan(50);
    const lontana = aggancioDelleTappe([nuovaTappa([13, 41.8]), nuovaTappa([13.01, 41.8])], [tratto([[13, 41.8], [13.01, 41.8 + 400 / 111195]])]);
    expect(lontana[1].distanzaM).toBeGreaterThan(DISTANZA_MASSIMA_AGGANCIO_M);
    // fuori sentiero o sulla traccia di partenza: non si sa
    expect(aggancioDelleTappe(tappe.slice(0, 2), [{ ...tratto([[13, 41.8], [13.001, 41.8]]), libero: true }])[1].p).toBeNull();
  });
});

import { posizionePiuLogica, inserisciIn, aggiungiAlPercorso, comePartenza, comeArrivo, tappaComePartenza, tappaComeArrivo, impostaLibero, taglia, chiusuraAnello, tappeConAnello, ID_CHIUSURA, sovrapposizione, proiettaSuTratti } from '../src/lib/pianificatore.js';

describe('pianificatore: comandi del fumetto', () => {
  const base = () => [t(13.8, 41.8), t(13.82, 41.8), t(13.84, 41.8)];
  it('«Aggiungi al percorso» mette il punto dove allunga meno il percorso', () => {
    const l = base();
    expect(posizionePiuLogica(l, [13.81, 41.8003])).toBe(1); // tra A e la tappa 1
    expect(posizionePiuLogica(l, [13.83, 41.8003])).toBe(2); // tra la tappa 1 e B
    expect(posizionePiuLogica(l, [13.9, 41.8])).toBe(3); // oltre l'arrivo: in fondo
    expect(posizionePiuLogica(l, [13.7, 41.8])).toBe(3); // dietro la partenza: mai prima di A, quindi in fondo (per questo c'è «Imposta come partenza»)
    expect(posizionePiuLogica([], [13.7, 41.8])).toBe(0);
    expect(posizionePiuLogica([t(13.8, 41.8)], [13.7, 41.8])).toBe(1);
  });
  it('aggiungere inserisce una tappa nuova, libera se così si è scelto', () => {
    const l = aggiungiAlPercorso(base(), [13.81, 41.8003], { poi: 'Fonte' }, true);
    expect(l).toHaveLength(4);
    expect(l[1].p).toEqual([13.81, 41.8003]);
    expect(l[1].libero).toBe(true);
    expect(l[1].poi).toBe('Fonte');
    expect(inserisciIn(base(), 0, [1, 1], {}, true)[0].libero).toBe(false); // la prima non è mai libera
  });
  it('partenza e arrivo nuovi', () => {
    const l = comePartenza(base(), [13.79, 41.8], {}, true);
    expect(l[0].p).toEqual([13.79, 41.8]);
    expect(l[0].libero).toBe(false);
    expect(l[1].libero).toBe(true); // il tratto verso la vecchia partenza
    const f = comeArrivo(base(), [13.9, 41.8], {}, true);
    expect(f.at(-1).libero).toBe(true);
    expect(comeArrivo([], [13.9, 41.8], {}, true)[0].libero).toBe(false);
  });
  it('una tappa che c\'è già diventa partenza o arrivo', () => {
    const l = base();
    expect(tappaComePartenza(l, 2)[0].id).toBe(l[2].id);
    expect(tappaComeArrivo(l, 0).at(-1).id).toBe(l[0].id);
    expect(tappaComeArrivo(l, 0)[0].libero).toBe(false);
  });
  it('«fuori sentiero» vale per il tratto che arriva alla tappa, mai per la prima', () => {
    const l = base();
    expect(impostaLibero(l, 1, true)[1].libero).toBe(true);
    expect(impostaLibero(l, 0, true)[0].libero).toBe(false);
    expect(impostaLibero(impostaLibero(l, 2, true), 2, false)[2].libero).toBe(false);
  });
  it('le forbici tengono la parte scelta e il taglio diventa arrivo o partenza', () => {
    const l = base();
    const inizio = taglia(l, 0, [13.81, 41.8], 'inizio');
    expect(inizio).toHaveLength(2);
    expect(inizio[0].id).toBe(l[0].id);
    expect(inizio[1].p).toEqual([13.81, 41.8]);
    const fine = taglia(l, 0, [13.81, 41.8], 'fine');
    expect(fine).toHaveLength(3);
    expect(fine[0].p).toEqual([13.81, 41.8]);
    expect(fine[0].libero).toBe(false);
    expect(fine[1].id).toBe(l[1].id);
    expect(taglia(l, 5, [0, 0], 'fine')).toBe(l);
  });
});

describe('pianificatore: giro ad anello', () => {
  it('la tappa finale è la partenza, senza posizione sulla traccia né nome', () => {
    const l = [{ ...t(13.8, 41.8), pos: 0, nome: 'Casa' }, t(13.82, 41.8)];
    const c = chiusuraAnello(l);
    expect(c.id).toBe(ID_CHIUSURA);
    expect(c.p).toEqual(l[0].p);
    expect(c.pos).toBeUndefined();
    expect(c.libero).toBe(false);
    expect(c.nome).toBeNull();
  });
  it('con l\'anello si calcola una tappa in più, ma solo con almeno due tappe', () => {
    const l = [t(13.8, 41.8), t(13.82, 41.8)];
    expect(tappeConAnello(l, true)).toHaveLength(3);
    expect(tappeConAnello(l, false)).toBe(l);
    expect(tappeConAnello([l[0]], true)).toHaveLength(1);
  });
  it('quanto il ritorno ripassa dall\'andata', () => {
    const andata = Array.from({ length: 21 }, (_, i) => [13.8 + i * 0.001, 41.8]);
    const stessa = [...andata].reverse();
    const altra = Array.from({ length: 21 }, (_, i) => [13.82 - i * 0.001, 41.805]); // 550 m più a nord
    expect(sovrapposizione(andata, stessa)).toBe(1);
    expect(sovrapposizione(andata, altra)).toBe(0);
    const meta = [...andata.slice(10).reverse(), ...altra.slice(10)];
    expect(sovrapposizione(andata, meta)).toBeGreaterThan(0.4);
    expect(sovrapposizione(andata, meta)).toBeLessThan(0.6);
    expect(sovrapposizione([], stessa)).toBe(0);
  });
  it('il punto più vicino sulle linee', () => {
    const r = proiettaSuTratti([[[13.8, 41.8], [13.82, 41.8]], [[13.8, 41.9], [13.82, 41.9]]], [13.81, 41.801]);
    expect(r.indice).toBe(0);
    expect(r.p[0]).toBeCloseTo(13.81, 4);
    expect(r.p[1]).toBeCloseTo(41.8, 4);
    expect(r.distanzaM).toBeGreaterThan(100);
    expect(r.distanzaM).toBeLessThan(120);
    expect(proiettaSuTratti([], [0, 0]).indice).toBe(-1);
  });
});

import { spostaId, inserisciNelTratto } from '../src/lib/pianificatore.js';

describe('pianificatore: trascinare sposta sempre quello che si è preso', () => {
  const nuove = () => [t(13.8, 41.8), t(13.82, 41.8), t(13.84, 41.8), t(13.86, 41.8)];
  const ids = (l) => l.map((x) => x.id);
  const A = (l) => l[0].p.join(',');
  // gli stati da provare: all'inizio, dopo aver riordinato, dopo Annulla, dopo Ripeti
  function stati() {
    const s = creaStoria(nuove());
    const r = [['inizio', s.ora()]];
    s.vai(muovi(s.ora(), 2, 1));
    r.push(['riordinate', s.ora()]);
    s.annulla();
    r.push(['annulla', s.ora()]);
    s.ripeti();
    r.push(['ripeti', s.ora()]);
    return r;
  }

  it('trascinando la tappa 2 si sposta la 2 e A resta dov\'è (anche dopo riordino, Annulla e Ripeti)', () => {
    for (const [nome, l] of stati()) {
      const daPrendere = l[2];
      const dopo = spostaId(l, daPrendere.id, [14, 42]);
      expect(dopo.find((x) => x.id === daPrendere.id).p, nome).toEqual([14, 42]);
      expect(A(dopo), nome).toBe(A(l));
      expect(ids(dopo), nome).toEqual(ids(l));
      // le altre non si muovono
      l.forEach((x, i) => x.id !== daPrendere.id && expect(dopo[i].p, nome).toEqual(x.p));
    }
  });
  it('trascinando un punto della linea tra la 2 e la 3 nasce una tappa tra la 2 e la 3 e A non si muove (anche dopo riordino, Annulla e Ripeti)', () => {
    for (const [nome, l] of stati()) {
      const percorso = ids(l); // gli id che il percorso calcolato ricorda: il tratto k va da percorso[k] a percorso[k+1]
      const k = 2; // tra la tappa 2 e la tappa 3
      const dopo = inserisciNelTratto(l, percorso, k, [13.85, 41.81]);
      expect(dopo, nome).toHaveLength(l.length + 1);
      expect(dopo[3].p, nome).toEqual([13.85, 41.81]);
      expect(dopo[2].id, nome).toBe(percorso[2]);
      expect(dopo[4].id, nome).toBe(percorso[3]);
      expect(A(dopo), nome).toBe(A(l));
    }
  });
  it('se l\'elenco è cambiato dopo il calcolo, la tappa nuova va dopo quella che la linea collegava', () => {
    const l = nuove();
    const calcolati = ids(l);
    const riordinate = muovi(l, 3, 0); // D diventa la prima
    const dopo = inserisciNelTratto(riordinate, calcolati, 1, [13.83, 41.81]); // tra la 1 e la 2 di prima
    const i1 = dopo.findIndex((x) => x.id === calcolati[1]);
    expect(dopo[i1 + 1].p).toEqual([13.83, 41.81]);
    expect(dopo[0].id).toBe(calcolati[3]);
    // una tappa tolta nel frattempo: niente da inserire
    expect(inserisciNelTratto(togli(l, 1), calcolati, 1, [1, 1])).toHaveLength(3);
  });
  it('un id che non c\'è non cambia niente', () => {
    const l = nuove();
    expect(spostaId(l, 'x', [1, 1])).toBe(l);
    expect(inserisciNelTratto(l, null, 0, [1, 1])).toBe(l);
  });
});
