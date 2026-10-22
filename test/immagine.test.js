import { describe, it, expect } from 'vitest';
import { pixelMondo, riquadroLinee, zoomPer, vista, suImmagine, serieProfilo, LARGHEZZA, TESSERA } from '../src/lib/immagine.js';

const linee = [[[13.8, 41.7], [13.85, 41.75], [13.9, 41.72]]];

describe('immagine del percorso', () => {
  it('pixel mondo: il centro del mondo e la scala', () => {
    const [x, y] = pixelMondo([0, 0], 1);
    expect([x, y]).toEqual([256, 256]);
    expect(pixelMondo([180, 0], 0)[0]).toBe(256);
  });
  it('il riquadro e lo zoom: la traccia sta nella mappa', () => {
    const r = riquadroLinee(linee);
    expect(r).toEqual([13.8, 41.7, 13.9, 41.75]);
    const z = zoomPer(r, 960, 760);
    const [x0, y1] = pixelMondo([r[0], r[1]], z);
    const [x1, y0] = pixelMondo([r[2], r[3]], z);
    expect(x1 - x0).toBeLessThanOrEqual(960 - 120);
    expect(y1 - y0).toBeLessThanOrEqual(760 - 120);
    // un livello più vicino non starebbe più
    const [a0, b1] = pixelMondo([r[0], r[1]], z + 1);
    const [a1, b0] = pixelMondo([r[2], r[3]], z + 1);
    expect(a1 - a0 > 960 - 120 || b1 - b0 > 760 - 120 || z === 16).toBe(true);
  });
  it('le tessere coprono tutta l\'immagine e la traccia cade dentro', () => {
    const v = vista(riquadroLinee(linee), 960, 760);
    expect(v.tessere.length).toBeGreaterThan(0);
    const minX = Math.min(...v.tessere.map((t) => t.px));
    const maxX = Math.max(...v.tessere.map((t) => t.px)) + TESSERA;
    expect(minX).toBeLessThanOrEqual(0);
    expect(maxX).toBeGreaterThanOrEqual(960);
    for (const p of linee[0]) {
      const [x, y] = suImmagine(p, v);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(960);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(760);
    }
    expect(LARGHEZZA).toBe(1080);
  });
  it('profilo: solo punti con quota, ridotto', () => {
    const l = Array.from({ length: 1000 }, (_, i) => [13.8 + i * 0.0001, 41.7, 1000 + i % 50]);
    const s = serieProfilo([l], 100);
    expect(s).toHaveLength(100);
    expect(s[0].km).toBe(0);
    expect(s.at(-1).km).toBeGreaterThan(5);
    expect(serieProfilo([[[1, 2], [3, 4]]])).toEqual([]);
  });
});
