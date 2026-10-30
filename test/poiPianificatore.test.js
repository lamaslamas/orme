import { describe, it, expect } from 'vitest';
import { categoriaDelPoi, nomePoi, nomePerTappa, queryPoiNuovi, tipoNuovo, poiDaElemento, poiDallaRisposta, celleDelRiquadro, idCella, riquadroCella, poiLungoIlPercorso, poiVicinoA, passaDiQui, leggiCategorie, salvaCategorie, CATEGORIE_POI } from '../src/lib/poiPianificatore.js';
import { nuovaTappa } from '../src/lib/pianificatore.js';

const memoria = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};
// una traccia verso est: 0,001° di longitudine ≈ 83 m a questa latitudine
const linea = Array.from({ length: 101 }, (_, i) => [13 + i * 0.001, 41.8]);
const aNord = (m) => 41.8 + m / 111_195;
const lon = (km) => 13 + (km * 1000) / 83_000;

describe('POI del pianificatore: categorie e dati', () => {
  it('ogni tipo ha una categoria; nessun glifo è una lettera (le lettere sono delle tappe)', () => {
    expect(categoriaDelPoi({ tipo: 'fontanella' }).chiave).toBe('acqua');
    expect(categoriaDelPoi({ tipo: 'bivacco' }).chiave).toBe('dormire');
    expect(categoriaDelPoi({ tipo: 'agriturismo' }).chiave).toBe('dormire');
    expect(categoriaDelPoi({ tipo: 'torretta' }).chiave).toBe('osservazione');
    expect(categoriaDelPoi({ tipo: 'xxx' })).toBeNull();
    for (const c of CATEGORIE_POI) expect(c.glifo).toMatch(/^[a-z]{4,}$/);
  });
  it('i nomi: il nome, altrimenti il tipo; la cima con la quota', () => {
    expect(nomePoi({ tipo: 'fonte', nome: 'Fonte della Rocca' })).toBe('Fonte della Rocca');
    expect(nomePoi({ tipo: 'fontanella' })).toBe('Fontanella');
    expect(nomePoi({ tipo: 'cima', nome: 'Monte Marrone', quota: 1642 })).toMatch(/^Monte Marrone · 1[.\s]?642 m$/);
    expect(nomePerTappa({ tipo: 'cima', nome: 'Monte Marrone', quota: 1642 })).toBe('Monte Marrone');
    expect(nomePerTappa({ tipo: 'capanno' })).toBe('Capanno di osservazione');
  });
  it('OpenStreetMap: capanni, torrette, belvedere, cime con nome, parcheggi', () => {
    expect(tipoNuovo({ leisure: 'bird_hide' })).toBe('capanno');
    expect(tipoNuovo({ man_made: 'tower', 'tower:type': 'observation' })).toBe('torretta');
    expect(tipoNuovo({ man_made: 'tower', 'tower:type': 'communication' })).toBeNull();
    expect(tipoNuovo({ tourism: 'viewpoint' })).toBe('belvedere');
    expect(tipoNuovo({ natural: 'peak' })).toBe('cima');
    expect(tipoNuovo({ amenity: 'parking' })).toBe('parcheggio');
    expect(poiDaElemento({ type: 'node', id: 7, lat: 41.80001, lon: 13.5, tags: { natural: 'peak', name: 'Monte X', ele: '1642' } })).toEqual({ id: 'n7', tipo: 'cima', lat: 41.80001, lon: 13.5, nome: 'Monte X', quota: 1642 });
    expect(poiDaElemento({ type: 'way', id: 3, center: { lat: 41, lon: 13 }, tags: { amenity: 'parking' } }).id).toBe('w3');
    expect(poiDaElemento({ type: 'node', id: 1, lat: 1, lon: 1, tags: { shop: 'bakery' } })).toBeNull();
    expect(poiDallaRisposta({ elements: [{ type: 'node', id: 1, lat: 41, lon: 13, tags: { tourism: 'viewpoint' } }, { type: 'node', id: 1, lat: 41, lon: 13, tags: { tourism: 'viewpoint' } }] })).toHaveLength(1);
    const q = queryPoiNuovi([41.8, 13.8, 41.9, 13.9]);
    expect(q).toContain('bird_hide');
    expect(q).toContain('viewpoint');
    expect(q).toContain('(41.8000,13.8000,41.9000,13.9000)');
  });
  it('le celle da 0,1°', () => {
    expect(idCella(13.84, 41.83)).toBe('418_138');
    expect(riquadroCella('418_138').map((x) => Math.round(x * 10) / 10)).toEqual([41.8, 13.8, 41.9, 13.9]);
    expect(celleDelRiquadro([41.79, 13.79, 41.81, 13.81]).sort()).toEqual(['417_137', '417_138', '418_137', '418_138']);
  });
});

describe('POI lungo il percorso', () => {
  const poi = [
    { id: 'a', tipo: 'fontanella', lat: aNord(120), lon: lon(2) },
    { id: 'b', tipo: 'cima', nome: 'Monte', quota: 1500, lat: aNord(250), lon: lon(5) },
    { id: 'c', tipo: 'belvedere', lat: aNord(450), lon: lon(5) }, // troppo lontano (450 m)
    { id: 'd', tipo: 'parcheggio', lat: aNord(80), lon: lon(0.1) }, // vicino alla partenza
    { id: 'e', tipo: 'parcheggio', lat: aNord(80), lon: lon(4) }, // a metà: no
    { id: 'f', tipo: 'rifugio', lat: aNord(10), lon: lon(7), chiuso: true }, // chiuso: no
    { id: 'g', tipo: 'bivacco', lat: aNord(5), lon: lon(7.5) },
    { id: 'h', tipo: 'sconosciuto', lat: aNord(5), lon: lon(3) },
  ];
  it('entro 300 m con il km e la distanza; parcheggi solo agli estremi; dal km 0', () => {
    const r = poiLungoIlPercorso(poi, linea);
    expect(r.map((p) => p.id)).toEqual(['d', 'a', 'b', 'g']);
    expect(r.find((p) => p.id === 'a')).toMatchObject({ categoria: 'acqua', distanzaM: 120 });
    expect(r.find((p) => p.id === 'a').km).toBeCloseTo(2, 0);
    expect(r.find((p) => p.id === 'b').distanzaM).toBeGreaterThan(240);
  });
  it('categorie spente non si contano', () => {
    const r = poiLungoIlPercorso(poi, linea, { categorie: new Set(['cime']) });
    expect(r.map((p) => p.id)).toEqual(['b']);
  });
  it('il POI entro 100 m dà il nome alla tappa; il più vicino vince; oltre i 100 m e i parcheggi no', () => {
    const vicini = [...poi, { id: 'i', tipo: 'capanno', lat: aNord(40), lon: lon(2) }, { id: 'l', tipo: 'fonte', lat: aNord(90), lon: lon(2) }];
    expect(poiVicinoA([lon(2), 41.8], vicini)?.id).toBe('i'); // 40 m e 90 m: il più vicino
    expect(poiVicinoA([lon(2), 41.8], poi)).toBeNull(); // la fontanella è a 120 m
    expect(poiVicinoA([lon(0.1), 41.8], poi)).toBeNull(); // c'è solo un parcheggio
  });
  it('«Passa di qui»: la tappa nuova va dove il km del POI la mette', () => {
    const t = [nuovaTappa([13, 41.8]), nuovaTappa([13.03, 41.8]), nuovaTappa([13.1, 41.8])];
    const km = [0, 2.5, 8];
    const dopo = passaDiQui(t, km, 5, { id: 'b', tipo: 'cima', nome: 'Monte', lat: 41.8, lon: 13.06 });
    expect(dopo).toHaveLength(4);
    expect(dopo[2]).toMatchObject({ poi: 'Monte', p: [13.06, 41.8] });
    expect(dopo[3].id).toBe(t[2].id); // l'arrivo resta ultimo
    expect(passaDiQui(t, km, 1, { id: 'x', tipo: 'fonte', lat: 41.8, lon: 13.01 })[1].poi).toBe('Sorgente');
    expect(passaDiQui(t, null, null, { id: 'y', tipo: 'fonte', lat: 41.8, lon: 13.01 })[2].poi).toBe('Sorgente'); // senza km: prima dell'arrivo
    expect(passaDiQui([], null, null, { id: 'z', tipo: 'fonte', lat: 41.8, lon: 13 })).toHaveLength(1);
  });
});

describe('POI: le categorie si ricordano', () => {
  it('di base tutte; quelle scelte restano; valori rotti: tutte', () => {
    const m = memoria();
    expect(leggiCategorie(m).size).toBe(CATEGORIE_POI.length);
    salvaCategorie(new Set(['acqua', 'cime']), m);
    expect([...leggiCategorie(m)]).toEqual(['acqua', 'cime']);
    m.setItem('orme.poiPianificatore', '{rotto');
    expect(leggiCategorie(m).size).toBe(CATEGORIE_POI.length);
    m.setItem('orme.poiPianificatore', JSON.stringify(['acqua', 'xx']));
    expect([...leggiCategorie(m)]).toEqual(['acqua']);
  });
});
