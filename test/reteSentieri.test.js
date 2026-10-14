import { describe, it, expect } from 'vitest';
import { distanzaKm } from '../src/lib/geo.js';
import { puntoA } from '../src/lib/anello.js';
import { reteDeiSentieri, anelliNellaRete, giriDallaPartenza, lineaDelGiro, sentieriDelGiro, nodiVicini, puntiLungo } from '../src/lib/reteSentieri.js';

const P = [13.79, 41.81];
const dritta = (a, b, n = 40) => Array.from({ length: n + 1 }, (_, k) => [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
// quadrato di lato 2 km: P (sud-ovest), N (nord-ovest), NE, E (sud-est)
const N = puntoA(P, 2, 0);
const E = puntoA(P, 2, 90);
const NE = puntoA(N, 2, 90);
const sentiero = (id, ...tratti) => ({ id, linee: [tratti.flatMap((t, i) => (i ? t.slice(1) : t))] });

describe('reteDeiSentieri', () => {
  it('quattro lati: gli incroci con due rami si uniscono, tranne vicino alla partenza', () => {
    const lati = [sentiero('a', dritta(P, N)), sentiero('b', dritta(N, NE)), sentiero('c', dritta(NE, E)), sentiero('d', dritta(E, P))];
    const senza = reteDeiSentieri(lati);
    expect(senza.archi).toHaveLength(1); // un giro solo, chiuso
    expect(senza.archi[0].km).toBeCloseTo(8, 1);
    const conP = reteDeiSentieri(lati, { partenza: puntoA(P, 0.05, 45) });
    expect(nodiVicini(conP, P)[0].distanzaM).toBe(0);
  });
  it('sentiero in più pezzi: un arco solo', () => {
    const M = puntoA(P, 1, 0);
    const rete = reteDeiSentieri([{ id: 'a', linee: [dritta(P, M), dritta(M, N)] }, sentiero('b', dritta(N, NE)), sentiero('c', dritta(N, puntoA(N, 1, 0)))]);
    expect(rete.archi.find((x) => x.sentieri.includes('a')).km).toBeCloseTo(2, 1);
  });
  it('un sentiero che parte dal mezzo di un altro (a T) lo spezza', () => {
    const M = puntoA(P, 1, 0); // metà del lato ovest
    const rete = reteDeiSentieri([sentiero('a', dritta(P, N)), sentiero('t', dritta(puntoA(M, 0.02, 90), puntoA(M, 1, 90)))]);
    expect(rete.archi.filter((x) => x.sentieri.includes('a'))).toHaveLength(2);
    expect(rete.nodi).toHaveLength(4); // P, N, M e la fine del sentiero t
    expect(rete.archi).toHaveLength(3);
  });
  it('due sentieri sullo stesso tratto: un arco solo per il tratto comune', () => {
    const M = puntoA(P, 1, 0);
    const rete = reteDeiSentieri([sentiero('a', dritta(P, N, 40)), sentiero('b', dritta(P, M, 20), dritta(M, puntoA(M, 1, 90)))], { partenza: P });
    // P–M in comune (un arco), M–N di a, M–est di b
    expect(rete.archi).toHaveLength(3);
  });
});

describe('anelliNellaRete', () => {
  const lati = [sentiero('a', dritta(P, N)), sentiero('b', dritta(N, NE)), sentiero('c', dritta(NE, E)), sentiero('d', dritta(E, P))];
  it('trova il giro del quadrato da P, una volta sola', () => {
    const rete = reteDeiSentieri(lati, { partenza: P });
    const [p] = nodiVicini(rete, P);
    expect(p.distanzaM).toBe(0);
    const giri = anelliNellaRete(rete, p.id, { minKm: 6, maxKm: 10 });
    expect(giri).toHaveLength(1);
    expect(giri[0].km).toBeCloseTo(8, 1);
    const linea = lineaDelGiro(rete, giri[0]);
    expect(distanzaKm(linea[0], P) * 1000).toBeLessThan(1);
    expect(distanzaKm(linea.at(-1), P) * 1000).toBeLessThan(1);
    // la linea è continua
    expect(linea.every((x, i) => !i || distanzaKm(linea[i - 1], x) < 0.1)).toBe(true);
    expect(sentieriDelGiro(rete, giri[0]).sort()).toEqual(['a', 'b', 'c', 'd']);
  });
  it('rispetta la lunghezza voluta', () => {
    const rete = reteDeiSentieri(lati, { partenza: P });
    const [p] = nodiVicini(rete, P);
    expect(anelliNellaRete(rete, p.id, { minKm: 10, maxKm: 14 })).toHaveLength(0);
  });
  it('con una diagonale: da P il triangolo e il quadrato', () => {
    const rete = reteDeiSentieri([...lati, sentiero('x', dritta(N, E))], { partenza: P });
    const [p] = nodiVicini(rete, P);
    const giri = anelliNellaRete(rete, p.id, { minKm: 5, maxKm: 10 });
    expect(giri.map((g) => Math.round(g.km)).sort()).toEqual([7, 8]); // il triangolo con P (2 + 2 + 2,83) e il quadrato
  });
});

describe('puntiLungo', () => {
  it('un punto ogni 0,8 km, con partenza e arrivo', () => {
    const punti = puntiLungo(dritta(P, puntoA(P, 4, 0), 400));
    expect(punti).toHaveLength(6);
    expect(punti[0]).toEqual(P);
  });
});

describe('giriDallaPartenza', () => {
  // partenza S a 1 km a sud di P, collegata a P da un sentiero; da P il quadrato
  const S = puntoA(P, 1, 180);
  const rete = reteDeiSentieri(
    [sentiero('g', dritta(S, P)), sentiero('a', dritta(P, N)), sentiero('b', dritta(N, NE)), sentiero('c', dritta(NE, E)), sentiero('d', dritta(E, P))],
    { partenza: S },
  );
  const [s] = nodiVicini(rete, S);
  it('senza gambo non c\'è giro; con il gambo il lecca-lecca, con il gambo nei km', () => {
    expect(giriDallaPartenza(rete, s.id, { minKm: 6, maxKm: 12 })).toHaveLength(0);
    const giri = giriDallaPartenza(rete, s.id, { minKm: 6, maxKm: 12, maxGamboKm: 1.5 });
    expect(giri).toHaveLength(1);
    expect(giri[0].gamboKm).toBeCloseTo(1, 1);
    expect(giri[0].km).toBeCloseTo(10, 1);
    const linea = lineaDelGiro(rete, giri[0]);
    expect(distanzaKm(linea[0], S) * 1000).toBeLessThan(1);
    expect(distanzaKm(linea.at(-1), S) * 1000).toBeLessThan(1);
    expect(linea.every((x, i) => !i || distanzaKm(linea[i - 1], x) < 0.1)).toBe(true);
  });
});
