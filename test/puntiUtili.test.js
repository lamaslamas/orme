import { describe, it, expect } from 'vitest';
import { queryPuntiParco, tipoDelPunto, puntoDaElemento, puntiDallaRisposta, puntiLungoIlPercorso, riassuntoPunti, noteDelPunto, puntiNelRiquadro, perLaNotte, conAcqua } from '../src/lib/puntiUtili.js';
import { parcoDa } from '../src/datiParchi.js';

const quadrato = [[[13.8, 41.8], [13.9, 41.8], [13.9, 41.9], [13.8, 41.9], [13.8, 41.8]]];

describe('punti utili (rifugi e acqua)', () => {
  it('la query usa l\'area del parco o, per i parchi disegnati come linea, il riquadro', () => {
    expect(queryPuntiParco(parcoDa('pnalm'))).toContain('area(id:3608426003)');
    expect(queryPuntiParco(parcoDa('pnalm'))).toContain('out center tags');
    expect(queryPuntiParco(parcoDa('pollino'))).toContain('(39.61,15.82,40.23,16.44)');
  });

  it('riconosce i tipi', () => {
    expect(tipoDelPunto({ tourism: 'alpine_hut' })).toBe('rifugio');
    expect(tipoDelPunto({ tourism: 'wilderness_hut' })).toBe('bivacco');
    expect(tipoDelPunto({ amenity: 'shelter', shelter_type: 'basic_hut' })).toBe('ricovero');
    expect(tipoDelPunto({ natural: 'spring' })).toBe('fonte');
    expect(tipoDelPunto({ amenity: 'drinking_water' })).toBe('fontanella');
    expect(tipoDelPunto({ amenity: 'bench' })).toBeNull();
  });

  it('salva solo i dati del luogo, mai i contatti', () => {
    const p = puntoDaElemento({ type: 'node', id: 5, lat: 41.812345678, lon: 13.8, tags: { tourism: 'alpine_hut', name: 'Rifugio X', ele: '1536', phone: '+39 1', email: 'a@b.it', fireplace: 'yes' } });
    expect(p).toEqual({ id: 'n5', tipo: 'rifugio', lat: 41.81235, lon: 13.8, nome: 'Rifugio X', quota: 1536, camino: true });
  });

  it('usa il centro delle aree e capisce potabilità, stagionalità e chiusura', () => {
    expect(puntoDaElemento({ type: 'way', id: 7, center: { lat: 41.85, lon: 13.85 }, tags: { tourism: 'wilderness_hut', note: 'closed' } })).toMatchObject({ id: 'w7', chiuso: true });
    expect(puntoDaElemento({ type: 'node', id: 1, lat: 41, lon: 13, tags: { amenity: 'drinking_water' } }).potabile).toBe(true);
    expect(puntoDaElemento({ type: 'node', id: 1, lat: 41, lon: 13, tags: { natural: 'spring' } }).potabile).toBeUndefined();
    expect(puntoDaElemento({ type: 'node', id: 1, lat: 41, lon: 13, tags: { natural: 'spring', drinking_water: 'no', intermittent: 'yes' } })).toMatchObject({ potabile: false, stagionale: true });
    expect(puntoDaElemento({ type: 'node', id: 1, tags: { natural: 'spring' } })).toBeNull();
  });

  it('scarta i doppioni e i punti fuori dal confine', () => {
    const json = {
      elements: [
        { type: 'node', id: 1, lat: 41.85, lon: 13.85, tags: { natural: 'spring' } },
        { type: 'node', id: 1, lat: 41.85, lon: 13.85, tags: { natural: 'spring' } },
        { type: 'node', id: 2, lat: 42.5, lon: 13.85, tags: { natural: 'spring' } },
      ],
    };
    expect(puntiDallaRisposta(json, quadrato).map((p) => p.id)).toEqual(['n1']);
    expect(puntiDallaRisposta(json).map((p) => p.id)).toEqual(['n1', 'n2']);
  });

  it('trova i punti lungo il percorso, dal più vicino', () => {
    const traccia = { type: 'MultiLineString', coordinates: [[[13.8, 41.8], [13.9, 41.8]]] };
    const punti = [
      { id: 'a', tipo: 'fonte', lat: 41.802, lon: 13.85 }, // ~220 m
      { id: 'b', tipo: 'bivacco', lat: 41.8005, lon: 13.82 }, // ~55 m
      { id: 'c', tipo: 'rifugio', lat: 41.81, lon: 13.85 }, // ~1,1 km
    ];
    const vicini = puntiLungoIlPercorso(punti, traccia);
    expect(vicini.map((p) => p.id)).toEqual(['b', 'a']);
    expect(vicini[0].distanzaM).toBeGreaterThan(40);
    expect(puntiLungoIlPercorso(punti, null)).toEqual([]);
  });

  it('riassume e descrive', () => {
    expect(riassuntoPunti([{ tipo: 'fonte' }, { tipo: 'bivacco' }, { tipo: 'fonte' }])).toBe('1 bivacco, 2 sorgenti');
    expect(riassuntoPunti([])).toBe('');
    expect(noteDelPunto({ tipo: 'fonte', quota: 1200, stagionale: true })).toEqual(['1200 m', 'potabilità non indicata', 'può seccarsi in estate']);
  });

  it('trova i punti nella zona inquadrata', () => {
    const punti = [{ id: 'a', lat: 41.85, lon: 13.85 }, { id: 'b', lat: 42.5, lon: 13.85 }];
    expect(puntiNelRiquadro(punti, [41.8, 13.8, 41.9, 13.9]).map((p) => p.id)).toEqual(['a']);
  });

  it('punti per la notte e acqua utilizzabile', () => {
    expect(perLaNotte({ tipo: 'bivacco' })).toBe(true);
    expect(perLaNotte({ tipo: 'rifugio', chiuso: true })).toBe(false);
    expect(perLaNotte({ tipo: 'fonte' })).toBe(false);
    expect(conAcqua({ tipo: 'fonte' })).toBe(true);
    expect(conAcqua({ tipo: 'fonte', potabile: false })).toBe(false);
  });
});

import { categoriaAcqua, acquaSuCuiContare } from '../src/lib/puntiUtili.js';
describe('acqua in categorie', () => {
  it('potabile, non indicata, da trattare, stagionale', () => {
    expect(categoriaAcqua({ tipo: 'fontanella', potabile: true })).toBe('potabile');
    expect(categoriaAcqua({ tipo: 'fonte' })).toBe('non_indicata');
    expect(categoriaAcqua({ tipo: 'fonte', potabile: false })).toBe('da_trattare');
    expect(categoriaAcqua({ tipo: 'fonte', stagionale: true })).toBe('stagionale');
    expect(categoriaAcqua({ tipo: 'fonte', potabile: false, stagionale: true })).toBe('da_trattare');
    expect(categoriaAcqua({ tipo: 'rifugio' })).toBeNull();
  });
  it('per il tratto senza acqua contano solo potabili e non indicate', () => {
    const fonti = [{ tipo: 'fontanella', potabile: true }, { tipo: 'fonte' }, { tipo: 'fonte', potabile: false }, { tipo: 'fonte', stagionale: true }];
    expect(fonti.map(acquaSuCuiContare)).toEqual([true, true, false, false]);
  });
});

import { celleNelRiquadro, cellaScaduta } from '../src/lib/puntiUtili.js';
describe('punti fuori dai parchi: celle', () => {
  it('le celle che coprono la vista, nessuna se la vista è troppo ampia', () => {
    const c = celleNelRiquadro([40.12, 18.42, 40.18, 18.52]);
    expect(c.map((x) => x.chiave)).toEqual(['401:184', '401:185']);
    expect(c[0].bbox).toEqual([40.1, 18.4, 40.2, 18.5]);
    expect(celleNelRiquadro([39, 15, 42, 18])).toEqual([]);
  });
  it('si riscarica dopo 30 giorni', () => {
    expect(cellaScaduta(null)).toBe(true);
    expect(cellaScaduta({ scaricato: '2026-10-01' }, new Date('2026-10-13'))).toBe(false);
    expect(cellaScaduta({ scaricato: '2026-08-01' }, new Date('2026-10-13'))).toBe(true);
  });
});

describe('dati dei rifugi da OSM', () => {
  it('legge gestore, posti, prenotazione, telefono, sito e orari solo se ci sono', async () => {
    const { puntoDaElemento, righeRifugio } = await import('../src/lib/puntiUtili.js');
    const p = puntoDaElemento({
      type: 'node', id: 5, lat: 41.8, lon: 13.9,
      tags: { tourism: 'alpine_hut', name: 'Rifugio Prova', operator: 'CAI Sulmona', capacity: '24', reservation: 'required', phone: '+39 0864 123456; +39 333', 'contact:website': 'https://www.esempio.it/rifugio/', opening_hours: 'Jun-Sep', email: 'a@b.it' },
    });
    expect(p).toMatchObject({ gestore: 'CAI Sulmona', posti: 24, prenotazione: 'prenotazione obbligatoria', telefono: '+39 0864 123456', sito: 'https://www.esempio.it/rifugio/', orari: 'Jun-Sep' });
    expect(JSON.stringify(p)).not.toContain('a@b.it');
    expect(righeRifugio(p).map((r) => r[0])).toEqual(['Gestione', 'Posti', 'Prenotazione', 'Telefono', 'Sito', 'Orari']);
  });
  it('niente di inventato: senza tag nessun campo; sito non http e telefono strano scartati; acqua senza dati', async () => {
    const { puntoDaElemento, righeRifugio } = await import('../src/lib/puntiUtili.js');
    const nudo = puntoDaElemento({ type: 'node', id: 6, lat: 41, lon: 13, tags: { tourism: 'wilderness_hut' } });
    expect(righeRifugio(nudo)).toEqual([]);
    const strano = puntoDaElemento({ type: 'node', id: 7, lat: 41, lon: 13, tags: { tourism: 'alpine_hut', website: 'javascript:alert(1)', phone: 'chiedere al bar' } });
    expect(strano.sito).toBeUndefined();
    expect(strano.telefono).toBeUndefined();
    const fonte = puntoDaElemento({ type: 'node', id: 8, lat: 41, lon: 13, tags: { natural: 'spring', operator: 'Comune', phone: '+39 0864 111111' } });
    expect(fonte.gestore).toBeUndefined();
    expect(fonte.telefono).toBeUndefined();
  });
});

describe('dove dormire: strutture oltre ai rifugi', () => {
  it('campeggi, agriturismi, B&B, ostelli e alberghi solo con i tipi che scrive OSM; niente dedotto', async () => {
    const { puntoDaElemento, perLaNotte, etichettaPernotto } = await import('../src/lib/puntiUtili.js');
    const el = (tags, id = 1) => ({ type: 'node', id, lat: 40.3, lon: 15.8, tags });
    expect(puntoDaElemento(el({ tourism: 'camp_site', name: 'Camping Sirino', phone: '+39 0973 111111', website: 'https://camping.example' }))).toMatchObject({ tipo: 'campeggio', nome: 'Camping Sirino', telefono: '+39 0973 111111', sito: 'https://camping.example' });
    expect(puntoDaElemento(el({ tourism: 'guest_house', guest_house: 'agritourism' })).tipo).toBe('agriturismo');
    expect(puntoDaElemento(el({ tourism: 'guest_house', guest_house: 'bed_and_breakfast' })).tipo).toBe('bb');
    expect(puntoDaElemento(el({ tourism: 'hostel' })).tipo).toBe('ostello');
    expect(puntoDaElemento(el({ tourism: 'hotel', name: 'Hotel Prova' })).tipo).toBe('albergo');
    expect(puntoDaElemento(el({ tourism: 'guest_house' })).tipo).toBe('alloggio'); // tipo non indicato: non si inventa
    const rif = puntoDaElemento(el({ tourism: 'alpine_hut' }));
    const camp = puntoDaElemento(el({ tourism: 'camp_site' }, 2));
    expect([rif, camp].filter(perLaNotte)).toHaveLength(2);
    expect(etichettaPernotto({ ...camp, nome: 'Camping Sirino', distanzaM: 800 })).toBe('Camping Sirino (campeggio, a 800 m dalla traccia)');
    expect(etichettaPernotto({ ...camp, distanzaM: 10 })).toBe('un campeggio (sulla traccia)');
  });
  it('posto per dormire vicino: il più vicino entro 2 km dalla partenza o dalla traccia', async () => {
    const { postoPerDormire, testoPostoPerDormire } = await import('../src/lib/puntiUtili.js');
    const geojson = { type: 'MultiLineString', coordinates: [[[15.8, 40.3], [15.84, 40.3]]] };
    const aNord = (m) => 40.3 + m / 111_195;
    const punti = [
      { id: 'l', tipo: 'campeggio', nome: 'Lontano', lon: 15.82, lat: aNord(2500) },
      { id: 'a', tipo: 'agriturismo', nome: 'Il Poggio', lon: 15.8, lat: aNord(800) },
      { id: 'c', tipo: 'rifugio', nome: 'Rifugio Chiuso', chiuso: true, lon: 15.8, lat: aNord(100) },
      { id: 'f', tipo: 'sorgente', lon: 15.8, lat: aNord(50) },
    ];
    const r = postoPerDormire(punti, geojson, [15.8, 40.3]);
    expect(r).toMatchObject({ nome: 'Il Poggio', tipo: 'agriturismo', daPartenza: true });
    expect(r.distanzaM).toBeGreaterThan(780);
    expect(r.distanzaM).toBeLessThan(820);
    expect(testoPostoPerDormire({ ...r, distanzaM: 800 })).toBe('Agriturismo Il Poggio, a 800 m dalla partenza');
    expect(testoPostoPerDormire({ tipo: 'campeggio', nome: null, distanzaM: 1400, daPartenza: false })).toBe('un campeggio, a 1,4 km dalla traccia');
    expect(postoPerDormire(punti.slice(0, 1), geojson, [15.8, 40.3])).toBeNull();
  });
});
