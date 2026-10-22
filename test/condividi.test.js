import { describe, it, expect } from 'vitest';
import { codificaLinea, decodificaLinea, codificaTraccia, decodificaTraccia, semplifica, costruisciLink, leggiLink, MAX_LINK, TOLLERANZE_M } from '../src/lib/condividi.js';
import { creaGpx } from '../src/lib/gpxScrittura.js';
import { distanzaKm } from '../src/lib/geo.js';

// una traccia ondulata di circa 8 km con un punto ogni ~10 m
const traccia = (n = 800) => Array.from({ length: n }, (_, i) => [13.85 + i * 0.0001 + Math.sin(i / 20) * 0.0004, 41.78 + i * 0.00005 + Math.cos(i / 13) * 0.0003]);
// un cammino irregolare (pseudo-casuale, sempre uguale): non si semplifica quasi niente
const irregolare = (n) => {
  let x = 13.85;
  let y = 41.78;
  let seme = 7;
  const r = () => ((seme = (seme * 16807) % 2147483647) / 2147483647 - 0.5);
  return Array.from({ length: n }, () => [(x += r() * 0.0006), (y += r() * 0.0006)]);
};
const base = 'https://esempio.github.io/orme/';

describe('codifica della traccia', () => {
  it('andata e ritorno con la precisione di circa un metro', () => {
    const l = traccia(50);
    const r = decodificaLinea(codificaLinea(l));
    expect(r).toHaveLength(50);
    r.forEach(([lon, lat], i) => expect(distanzaKm([lon, lat], l[i]) * 1000).toBeLessThan(1.5));
  });
  it('coordinate negative e salti grandi', () => {
    const l = [[-122.4194, 37.7749], [-122.4, 37.8], [10, -45], [10.00001, -45.00001]];
    const r = decodificaLinea(codificaLinea(l));
    r.forEach(([lon, lat], i) => expect(distanzaKm([lon, lat], l[i]) * 1000).toBeLessThan(1.5));
  });
  it('più pezzi', () => {
    const p = [traccia(10), traccia(20).map(([a, b]) => [a + 0.1, b])];
    expect(decodificaTraccia(codificaTraccia(p)).map((l) => l.length)).toEqual([10, 20]);
    expect(decodificaTraccia('')).toEqual([]);
  });
  it('un codice rovinato non passa', () => {
    expect(() => decodificaLinea('!!!')).toThrow();
  });
  it('usa solo caratteri sicuri per un indirizzo', () => {
    expect(codificaTraccia([traccia(100)])).toMatch(/^[A-Za-z0-9_.-]+$/);
  });
});

describe('semplificazione', () => {
  it('toglie punti restando entro la tolleranza', () => {
    const l = traccia(800);
    const s = semplifica(l, 5);
    expect(s.length).toBeLessThan(l.length / 2);
    // ogni punto originale sta entro 5 m (più la quantizzazione) dalla linea semplificata
    expect(s[0]).toEqual(l[0]);
    expect(s.at(-1)).toEqual(l.at(-1));
  });
  it('una linea corta resta com\'è', () => {
    expect(semplifica([[1, 2], [3, 4]], 5)).toEqual([[1, 2], [3, 4]]);
  });
});

describe('link', () => {
  it('un percorso piccolo sta nel link senza semplificare oltre i 5 m', () => {
    const r = costruisciLink({ nome: 'Anello del lago', note: 'Bello', verso: true, pezzi: [traccia(60)], base });
    expect(r.url.length).toBeLessThanOrEqual(MAX_LINK);
    expect(r.semplificata).toBe(false);
    expect(r.url).toContain('#/condiviso?d=');
    expect(r.url).toContain('&r=1');
  });
  it('un percorso lungo si semplifica di più e lo dice', () => {
    const r = costruisciLink({ nome: 'Lungo', pezzi: [irregolare(4000)], base });
    expect(r.url.length).toBeLessThanOrEqual(MAX_LINK);
    expect(r.semplificata).toBe(true);
    expect(r.toleranzaM).toBeGreaterThan(TOLLERANZE_M[0]);
  });
  it('si legge quello che si è scritto', () => {
    const { url } = costruisciLink({ nome: 'Giro & ritorno', note: 'Portare acqua ✓', verso: true, pezzi: [traccia(100)], base });
    const l = leggiLink(url.split('#/condiviso?')[1]);
    expect(l.nome).toBe('Giro & ritorno');
    expect(l.note).toBe('Portare acqua ✓');
    expect(l.verso).toBe(true);
    expect(l.pezzi[0].length).toBeGreaterThan(5);
  });
  it('nel link solo traccia, nome, note e verso', () => {
    const { url } = costruisciLink({ nome: 'X', note: 'Y', pezzi: [traccia(50)], base });
    const chiavi = [...new URLSearchParams(url.split('#/condiviso?')[1]).keys()];
    expect(chiavi.sort()).toEqual(['d', 'n', 't']);
  });
  it('link non validi', () => {
    expect(leggiLink('d=&n=x')).toBeNull();
    expect(leggiLink('n=x')).toBeNull();
    expect(leggiLink('d=!!!!')).toBeNull();
    expect(leggiLink(`d=${codificaLinea([[500, 10], [501, 11]])}`)).toBeNull(); // longitudine impossibile
    expect(leggiLink('d=AAAA')).toBeNull(); // un solo punto
  });
  it('note troppo lunghe: si accorciano per ultime', () => {
    const r = costruisciLink({ nome: 'N', note: 'x'.repeat(500), pezzi: [irregolare(6000)], base });
    expect(r.url === null || r.url.length <= MAX_LINK).toBe(true);
  });
});

describe('GPX condiviso', () => {
  it('nome, note, traccia con quote: niente altro', () => {
    const gpx = creaGpx({ nome: 'Giro <1>', note: 'Via & via', linee: [[[13.8, 41.7, 1000], [13.81, 41.71, 1010.5]]] });
    expect(gpx).toContain('<name>Giro &lt;1&gt;</name>');
    expect(gpx).toContain('<desc>Via &amp; via</desc>');
    expect(gpx).toContain('<ele>1010.5</ele>');
    expect(gpx).not.toMatch(/time|extensions|device/i);
  });
});
