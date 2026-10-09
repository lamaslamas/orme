import { describe, it, expect } from 'vitest';
import { centriRicerca, sceltaLuoghi, candidateFoto, fotoDaInfo, sceltaFoto, luogoConEstratto, riassuntoDaVedere, urlLuoghiVicini, MAX_FOTO } from '../src/lib/daVedere.js';

// traccia verso est di circa 8,3 km
const traccia = { type: 'MultiLineString', coordinates: [[[13.8, 41.8], [13.9, 41.8]]] };
const geo = (pageid, title, lon, lat = 41.8) => ({ pageid, title, lon, lat });

describe('da vedere lungo il percorso', () => {
  it('centri di ricerca lungo la traccia', () => {
    const c = centriRicerca(traccia, 1500);
    expect(c.length).toBeGreaterThanOrEqual(6);
    expect(c[0]).toMatchObject({ lat: 41.8, lon: 13.8, km: 0 });
    expect(urlLuoghiVicini(c[0], 1500)).toContain('gscoord=41.80000|13.80000');
  });

  it('luoghi entro 1 km, senza doppioni, in ordine lungo il percorso', () => {
    const r = sceltaLuoghi(
      [
        [geo(1, 'Lago', 13.85, 41.803), geo(2, 'Paese lontano', 13.85, 41.85)],
        [geo(1, 'Lago', 13.85, 41.803), geo(3, 'Vetta', 13.81, 41.801)],
      ],
      traccia,
    );
    expect(r.map((x) => x.titolo)).toEqual(['Vetta', 'Lago']);
    expect(r[1].distanzaM).toBeGreaterThan(250);
    expect(r[1].km).toBeCloseTo(4.1, 0);
  });

  it('foto distribuite lungo il percorso, una per tratto, la più vicina', () => {
    const vicino = [geo(10, 'File:A.jpg', 13.801, 41.8001), geo(11, 'File:B.jpg', 13.802, 41.802), geo(12, 'File:C.jpg', 13.89, 41.8), geo(13, 'File:mappa.svg', 13.85, 41.8)];
    const tratti = candidateFoto([vicino], traccia, 8.3);
    expect(tratti).toHaveLength(2);
    expect(tratti[0].map((f) => f.id)).toEqual([10, 11]); // stesso tratto, prima la più vicina
    expect(tratti.flat().some((f) => f.id === 13)).toBe(false); // solo fotografie
  });

  it('solo licenze libere senza NC/ND, con autore', () => {
    const pagina = (licenza, mime = 'image/jpeg') => ({ imageinfo: [{ thumburl: 'https://upload/x.jpg?1', descriptionurl: 'https://commons/x', mime, extmetadata: { LicenseShortName: { value: licenza }, Artist: { value: '<a>Anna</a>' } } }] });
    const c = { km: 1.2, lat: 41.8, lon: 13.8 };
    expect(fotoDaInfo(pagina('CC BY-SA 4.0'), c)).toMatchObject({ url: 'https://upload/x.jpg', autore: 'Anna', licenza: 'CC BY-SA 4.0', km: 1.2 });
    expect(fotoDaInfo(pagina('CC BY-NC 2.0'), c)).toBeNull();
    expect(fotoDaInfo(pagina('All rights reserved'), c)).toBeNull();
    expect(fotoDaInfo(pagina('CC0', 'image/png'), c)).toBeNull();
  });

  it('una foto per tratto, la prima con licenza adatta, al massimo MAX_FOTO', () => {
    const ok = { imageinfo: [{ thumburl: 'u', descriptionurl: 'p', extmetadata: { LicenseShortName: { value: 'CC0' } } }] };
    const no = { imageinfo: [{ thumburl: 'u', descriptionurl: 'p', extmetadata: { LicenseShortName: { value: 'CC BY-ND' } } }] };
    const info = new Map([[1, no], [2, ok], [3, ok]]);
    const tratti = [[{ id: 1, km: 0 }, { id: 2, km: 0.2 }], [{ id: 3, km: 4 }]];
    expect(sceltaFoto(tratti, info).map((f) => f.km)).toEqual([0.2, 4]);
    const molti = Array.from({ length: 12 }, (_, i) => [{ id: 3, km: i }]);
    expect(sceltaFoto(molti, info)).toHaveLength(MAX_FOTO);
  });

  it('luogo con la frase di Wikipedia, e riassunto della scheda', () => {
    const l = luogoConEstratto({ titolo: 'Val Fondillo', distanzaM: 20, km: 1 }, { extract: 'Valle del Parco nazionale.' });
    expect(l).toMatchObject({ url: 'https://it.wikipedia.org/wiki/Val_Fondillo', frase: 'Valle del Parco nazionale.' });
    expect(riassuntoDaVedere({ luoghi: [l, l], foto: [{}] })).toBe('2 luoghi · 1 foto');
    expect(riassuntoDaVedere(null)).toBe('');
  });
});
