import { describe, it, expect, vi } from 'vitest';
import { urlTessera, tessereDi, quotaDaRgb, decodificaTessera, quotaInterpolata, creaLettoreTerrain, LATO_TESSERA } from '../src/lib/terrainTiles.js';

// una tessera di prova: la quota cresce di 1 m per pixel verso est
const rampa = () => {
  const q = new Float32Array(LATO_TESSERA * LATO_TESSERA);
  for (let y = 0; y < LATO_TESSERA; y++) for (let x = 0; x < LATO_TESSERA; x++) q[y * LATO_TESSERA + x] = 1000 + x;
  return q;
};

describe('Terrain Tiles', () => {
  it('indirizzo e formato Terrarium: R*256 + G + B/256 − 32768', () => {
    expect(urlTessera(13, 4400, 3040)).toBe('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/13/4400/3040.png');
    expect(quotaDaRgb(131, 232, 128)).toBeCloseTo(131 * 256 + 232 + 0.5 - 32768, 5); // 1000,5 m
    expect(quotaDaRgb(128, 0, 0)).toBe(0);
    const rgba = new Uint8ClampedArray(LATO_TESSERA * LATO_TESSERA * 4);
    rgba.set([131, 232, 128, 255], 0);
    expect(decodificaTessera(rgba)[0]).toBeCloseTo(1000.5, 3);
  });
  it('coordinate di tessera: Greenwich/equatore al centro, Pescasseroli nella tessera giusta', () => {
    const t = tessereDi(0, 0, 1);
    expect(t.x).toBeCloseTo(1, 5);
    expect(t.y).toBeCloseTo(1, 5);
    const p = tessereDi(13.79, 41.81, 13);
    expect(Math.floor(p.x)).toBe(4409);
    expect(Math.floor(p.y)).toBe(3046);
  });
  it('quota interpolata tra i pixel; tessera mancante: null; bordo: il pixel che c\'è', () => {
    const q = rampa();
    const tessera = (tx, ty) => (tx === 100 && ty === 200 ? q : null);
    // un punto a metà tra i centri dei pixel 10 e 11 della riga 5 della tessera 100/200
    const lon = ((100 * 256 + 11) / (256 * 2 ** 13)) * 360 - 180; // bordo tra i pixel 10 e 11
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (200 * 256 + 5.5)) / (256 * 2 ** 13)))) * 180) / Math.PI;
    expect(quotaInterpolata(tessera, 13, lon, lat)).toBeCloseTo(1010.5, 1);
    expect(quotaInterpolata(() => null, 13, lon, lat)).toBeNull();
  });
  it('il lettore scarica una volta sola ogni tessera e restituisce le quote dei punti', async () => {
    const leggiTessera = vi.fn(async () => rampa());
    const l = creaLettoreTerrain({ leggiTessera, z: 13 });
    const q = await l.quote([[13.79, 41.81], [13.7901, 41.8101]]);
    expect(q.every((x) => x > 1000 && x < 1256)).toBe(true);
    const n = leggiTessera.mock.calls.length;
    await l.quote([[13.79, 41.81]]);
    expect(leggiTessera.mock.calls.length).toBe(n); // già in memoria
  });
  it('una tessera che non si scarica fa fallire la richiesta (e si riprova dopo)', async () => {
    let giu = true;
    const l = creaLettoreTerrain({ leggiTessera: async () => { if (giu) throw new Error('rete'); return rampa(); }, z: 13 });
    await expect(l.quote([[13.79, 41.81]])).rejects.toThrow('rete');
    giu = false;
    expect((await l.quote([[13.79, 41.81]]))[0]).toBeGreaterThan(1000);
  });
});
