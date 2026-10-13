import { describe, it, expect, vi } from 'vitest';
import { chiaveCella, urlCella, leggiGriglia, quotaNellaGriglia, infittisci, creaLettoreTinitaly, pezziConQuoteTinitaly, utm32 } from '../src/lib/tinitaly.js';

// griglia 3×3 di 0,01°: quote crescenti verso est (10 m a colonna) e verso nord (100 m a riga)
const testo = `NCOLS 3
NROWS 3
XLLCORNER 13.0
YLLCORNER 41.0
CELLSIZE 0.01
NODATA_VALUE -9999.0
1200 1210 1220
1100 1110 1120
1000 1010 -9999.0
`;

describe('quote TINITALY', () => {
  it('UTM 32N come TINITALY; celle di 1 km e indirizzo del servizio in metri', () => {
    expect(utm32([9, 0]).map(Math.round)).toEqual([500000, 0]);
    expect(utm32([9, 45]).map(Math.round)).toEqual([500000, 4982950]);
    expect(chiaveCella(13.7905, 41.8085)).toBe('4639:897');
    const u = urlCella('4639:897');
    expect(u).toContain('coverageId=TINItaly_1_1__tinitaly_dem');
    expect(u).toContain('format=text/plain');
    expect(u).toContain('subset=E(896980,898020)&subset=N(4638980,4640020)');
  });

  it('legge la griglia (prima riga a nord) e interpola tra i quattro valori vicini', () => {
    const g = leggiGriglia(testo);
    expect(g).toMatchObject({ ncol: 3, nrig: 3, ovest: 13, sud: 41, passo: 0.01 });
    expect(g.valori[8]).toBeNull();
    // centro della cella in alto a sinistra: 1200
    expect(quotaNellaGriglia(g, 13.005, 41.025)).toBe(1200);
    // a metà tra le prime due righe e le prime due colonne
    expect(quotaNellaGriglia(g, 13.01, 41.02)).toBe(1155);
    // fuori dalla griglia
    expect(quotaNellaGriglia(g, 12.9, 41.02)).toBeNull();
    expect(leggiGriglia('niente')).toBeNull();
  });

  it('un punto almeno ogni 25 m lungo la traccia', () => {
    const [linea] = infittisci([[[13.8, 41.8], [13.801, 41.8]]]); // circa 83 m
    expect(linea.length).toBe(5);
    expect(linea[0]).toEqual([13.8, 41.8]);
    expect(linea.at(-1)).toEqual([13.801, 41.8]);
  });

  // la stessa griglia 3×3, in metri UTM attorno a un punto vero
  const [e0, n0] = utm32([13.79, 41.81]).map((x) => Math.floor(x / 10) * 10 - 10);
  const testoUtm = testo.replace('XLLCORNER 13.0', `XLLCORNER ${e0}`).replace('YLLCORNER 41.0', `YLLCORNER ${n0}`).replace('CELLSIZE 0.01', 'CELLSIZE 10');
  it('le celle si scaricano una volta sola e restano in memoria', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, text: async () => testoUtm }));
    const salvate = new Map();
    const l = creaLettoreTinitaly({ fetchFn, leggiCella: async (k) => salvate.get(k) ?? null, salvaCella: async (k, g) => salvate.set(k, g) });
    const q = await l.quote([[13.79, 41.81], [13.79002, 41.81]]);
    expect(q[0]).toBeGreaterThan(1000);
    expect(q[1]).toBeGreaterThanOrEqual(q[0]); // più a est: quota più alta
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const l2 = creaLettoreTinitaly({ fetchFn, leggiCella: async (k) => salvate.get(k) ?? null });
    await l2.quote([[13.79, 41.81]]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('se TINITALY non risponde o mancano troppe quote, Open-Meteo', async () => {
    const giu = creaLettoreTinitaly({ fetchFn: async () => ({ ok: false, status: 503 }) });
    const riserva = vi.fn(async (p) => p.map((l) => l.map(([x, y]) => [x, y, 5])));
    const r = await pezziConQuoteTinitaly([[[13.79, 41.81], [13.79002, 41.81]]], giu, riserva);
    expect(r.fonte).toBe('open-meteo');
    const ok = creaLettoreTinitaly({ fetchFn: async () => ({ ok: true, text: async () => testoUtm }) });
    const r2 = await pezziConQuoteTinitaly([[[13.79, 41.81], [13.79002, 41.81]]], ok, riserva);
    expect(r2.fonte).toBe('tinitaly');
    expect(r2.pezzi[0].every((p) => p[2] > 1000)).toBe(true);
    // fuori dalla griglia (troppi punti senza quota): Open-Meteo
    const r3 = await pezziConQuoteTinitaly([[[13.9, 41.9], [13.91, 41.9]]], ok, riserva);
    expect(r3.fonte).toBe('open-meteo');
  });
});

import { profiloTinitaly } from '../src/lib/tinitaly.js';
describe('profilo con TINITALY', () => {
  it('stesso formato del profilo del robot, quote dalle celle', async () => {
    const lettore = { quote: async (punti) => punti.map(([lon]) => Math.round(1000 + (lon - 13.8) * 10000)) };
    const g = { type: 'MultiLineString', coordinates: [[[13.8, 41.8], [13.81, 41.8]]] };
    const r = await profiloTinitaly(g, lettore);
    // un campione ogni 50 m: l'ultimo cade poco prima della fine
    expect(r).toMatchObject({ min: 1000, discesa: 0 });
    expect(r.max).toBeGreaterThan(1090);
    expect(r.salita).toBe(r.max - 1000);
    expect(r.partenza.quota).toBe(1000);
    expect(await profiloTinitaly(g, { quote: async (p) => p.map(() => null) })).toBeNull();
  });
});
