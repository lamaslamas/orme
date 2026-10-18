// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { impostaAperturaDisegno, consumaAperturaDisegno, aperturaDaMappa } from '../src/lib/bozza.js';

const mappaFinta = (lat, lng, zoom) => ({ getCenter: () => ({ lat, lng }), getZoom: () => zoom });
beforeEach(() => sessionStorage.clear());

describe('vista di apertura del disegno', () => {
  it('la vista della mappa: centro e zoom, letta una volta sola', () => {
    impostaAperturaDisegno(aperturaDaMappa(mappaFinta(40.2235, 18.2025, 15)));
    expect(consumaAperturaDisegno()).toEqual({ centro: [40.2235, 18.2025], zoom: 15 });
    expect(consumaAperturaDisegno()).toBeNull();
  });
  it('sotto lo zoom 12 si apre a 12 sullo stesso centro', () => {
    impostaAperturaDisegno(aperturaDaMappa(mappaFinta(41.8, 13.85, 6)));
    expect(consumaAperturaDisegno()).toEqual({ centro: [41.8, 13.85], zoom: 12 });
  });
  it('«Disegna da qui»: centrato sul punto scelto, con lo zoom della mappa', () => {
    impostaAperturaDisegno(aperturaDaMappa(mappaFinta(40, 18, 14), [18.5, 40.5]));
    expect(consumaAperturaDisegno()).toEqual({ centro: [40.5, 18.5], zoom: 14 });
  });
  it('«Riprendi»: nessuna vista, il disegno si apre sulla bozza', () => {
    impostaAperturaDisegno('bozza');
    expect(consumaAperturaDisegno()).toBeNull();
  });
});
