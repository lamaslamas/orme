import { describe, it, expect } from 'vitest';
import { dimensioniRidotte, inBase64, daBase64, creaIdFoto, fotoValida } from '../src/lib/foto.js';

describe('foto personali', () => {
  it('riduce mantenendo le proporzioni, senza ingrandire', () => {
    expect(dimensioniRidotte(4000, 3000, 1600)).toEqual({ larghezza: 1600, altezza: 1200 });
    expect(dimensioniRidotte(3000, 4000, 1600)).toEqual({ larghezza: 1200, altezza: 1600 });
    expect(dimensioniRidotte(800, 600, 1600)).toEqual({ larghezza: 800, altezza: 600 });
  });

  it('base64 andata e ritorno', () => {
    const dati = new Uint8Array([0, 1, 2, 250, 255, 128]).buffer;
    expect(new Uint8Array(daBase64(inBase64(dati)))).toEqual(new Uint8Array(dati));
  });

  it('id e controllo del backup', () => {
    expect(creaIdFoto(1000, 0.5)).toMatch(/^foto-/);
    expect(fotoValida({ id: 'a', sentieroId: 's', immagine: 'AAA' })).toBe(true);
    expect(fotoValida({ id: 'a', immagine: 'AAA' })).toBe(false);
  });
});
