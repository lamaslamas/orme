import { describe, it, expect } from 'vitest';
import {
  campionaPercorso,
  aperturaOrizzonte,
  siVede,
  calcolaPanorama,
  trattiPanoramici,
  trattoMigliore,
  riassuntoPanorama,
  PESI,
} from '../src/lib/panorama.js';

// percorso dritto di circa 2 km verso est a 42° N
const linea = { type: 'MultiLineString', coordinates: [[[13.8, 42], [13.8242, 42]]] };
const pianura = () => 1000;
// conca: il terreno sale di 30 m ogni 100 m allontanandosi da (13.81, 42)
const conca = (lon, lat) => 1000 + 300 * Math.hypot((lon - 13.81) * 82.8, (lat - 42) * 111.3);
// cresta: il terreno scende allontanandosi dalla linea del percorso
const cresta = (lon, lat) => 2000 - 300 * Math.abs((lat - 42) * 111.3);

describe('campionamento', () => {
  it('un punto ogni 100 m con la distanza progressiva', () => {
    const p = campionaPercorso(linea);
    expect(p.length).toBe(21);
    expect(p[0]).toMatchObject({ lon: 13.8, lat: 42, km: 0 });
    expect(p[10].km).toBeCloseTo(1, 5);
  });
});

describe('orizzonte', () => {
  it('aperto in pianura e in cresta, chiuso in fondo a una conca', () => {
    const punto = { lon: 13.81, lat: 42 };
    expect(aperturaOrizzonte(punto, pianura)).toBe(1);
    expect(aperturaOrizzonte(punto, cresta)).toBe(1);
    expect(aperturaOrizzonte(punto, conca)).toBeLessThan(0.1);
  });

  it('linea di vista: una montagna in mezzo nasconde il lago', () => {
    const muro = (lon) => (lon > 13.85 && lon < 13.86 ? 3000 : 1000);
    const da = { lon: 13.8, lat: 42 };
    const lago = { lon: 13.9, lat: 42 };
    expect(siVede(da, lago, pianura)).toBe(true);
    expect(siVede(da, lago, muro)).toBe(false);
  });
});

describe('indice panoramico', () => {
  const luoghi = {
    belvedere: [{ lon: 13.81, lat: 42.0005, nome: 'Belvedere' }],
    vette: [{ lon: 13.8242, lat: 42, nome: 'Monte A' }, { lon: 13.85, lat: 42.02, nome: 'Monte B' }],
    laghi: [{ lon: 13.82, lat: 41.99, nome: 'Lago' }],
  };

  it('la cresta senza bosco vale molto più della conca nel bosco', () => {
    const alta = calcolaPanorama(linea, { quota: cresta, bosco: () => false, luoghi });
    const bassa = calcolaPanorama(linea, { quota: conca, bosco: () => true, luoghi: {} });
    expect(alta.punteggio).toBeGreaterThan(70);
    expect(bassa.punteggio).toBeLessThan(25);
    expect(alta.metodo).toBe('preliminare');
    expect(alta.affidabilita).toBe('media');
    expect(alta.belvedere).toHaveLength(1);
    expect(alta.vetteRaggiunte).toEqual(['Monte A']);
    expect(alta.visuale).toHaveLength(21);
    expect(riassuntoPanorama(alta)).toMatchObject({ visuale: 'Ampia', belvedere: 2 });
  });

  it('il punteggio è la somma pesata dei criteri', () => {
    const r = calcolaPanorama(linea, { quota: cresta, bosco: () => false, luoghi });
    const atteso = Object.entries(PESI).reduce((s, [k, p]) => s + p * r.criteri[k], 0);
    expect(r.punteggio).toBe(Math.round(atteso));
  });

  it('affidabilità bassa se la traccia è parziale o manca il bosco', () => {
    expect(calcolaPanorama(linea, { quota: pianura, bosco: () => null }).affidabilita).toBe('bassa');
    expect(calcolaPanorama(linea, { quota: pianura, bosco: () => false, parziale: true }).affidabilita).toBe('bassa');
  });

  it('senza quote non si calcola', () => {
    expect(calcolaPanorama(linea, { quota: () => null, bosco: () => false })).toBeNull();
  });
});

describe('tratti', () => {
  const c = (vis) => vis.map((v, i) => ({ km: i / 10, visuale: v }));
  it('raggruppa i tratti per classe e trova il chilometro migliore', () => {
    const campioni = c([0.1, 0.1, 0.1, 0.1, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9]);
    const t = trattiPanoramici(campioni);
    expect(t[0].classe).toBe('limitata');
    expect(t.at(-1)).toMatchObject({ classe: 'panoramica', aKm: 1.4 });
    expect(trattoMigliore(campioni)).toMatchObject({ daKm: 0.4, aKm: 1.3, visuale: 90 });
  });
});
