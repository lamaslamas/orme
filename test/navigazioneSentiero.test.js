import { describe, it, expect } from 'vitest';
import { preparaNavigazione, posizioneSulPercorso } from '../src/lib/navigazioneSentiero.js';

// andata e ritorno sullo stesso sentiero: 1 km verso est e ritorno, con 100 m di salita all'andata
const andata = [[13.8, 42, 1000], [13.806, 42, 1050], [13.81215, 42, 1100]];
const ritorno = [[13.81215, 42, 1100], [13.806, 42, 1050], [13.8, 42, 1000]];
const nav = preparaNavigazione({ type: 'MultiLineString', coordinates: [[...andata, ...ritorno.slice(1)]] });

describe('navigazione lungo il sentiero', () => {
  it('lunghezza totale e posizione all\'andata', () => {
    expect(nav.totaleM).toBeGreaterThan(1990);
    expect(nav.totaleM).toBeLessThan(2030);
    const p = posizioneSulPercorso(nav, [13.806, 42.0001], null);
    expect(p.fattiM).toBeGreaterThan(480);
    expect(p.fattiM).toBeLessThan(520);
    expect(p.fuori).toBe(false);
    expect(p.salitaRimanenteM).toBe(50);
  });

  it('al ritorno la posizione segue l\'ultima nota, non salta all\'andata', () => {
    const p = posizioneSulPercorso(nav, [13.806, 42.0001], 1300);
    expect(p.fattiM).toBeGreaterThan(1450);
    expect(p.mancantiM).toBeLessThan(560);
    expect(p.salitaRimanenteM).toBe(0);
  });

  it('fuori traccia e arrivo', () => {
    expect(posizioneSulPercorso(nav, [13.806, 42.002], 500).fuori).toBe(true);
    expect(posizioneSulPercorso(nav, [13.8, 42], 1980).arrivato).toBe(true);
  });

  it('tempo rimanente stimato', () => {
    const p = posizioneSulPercorso(nav, [13.8, 42], null);
    expect(p.durataRimanenteMin).toBeGreaterThan(25);
  });
});

describe('traccia in più pezzi non collegati', () => {
  it('il salto in linea d\'aria tra i pezzi non conta nella distanza', () => {
    // due pezzi da circa 500 m separati da 2 km
    const g = { type: 'MultiLineString', coordinates: [[[13.8, 42], [13.806, 42]], [[13.83, 42], [13.836, 42]]] };
    const n = preparaNavigazione(g);
    expect(n.totaleM).toBeGreaterThan(980);
    expect(n.totaleM).toBeLessThan(1010);
    const p = posizioneSulPercorso(n, [13.833, 42], null);
    expect(p.fattiM).toBeGreaterThan(720);
    expect(p.fattiM).toBeLessThan(780);
  });
});
