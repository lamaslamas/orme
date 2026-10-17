import { describe, it, expect } from 'vitest';
import { distanzaKm } from '../src/lib/geo.js';
import {
  puntoA,
  puntiDellAnello,
  sovrapposizione,
  quotaComune,
  quotaSegnata,
  trattiNonSegnati,
  ammessoNeiParchi,
  vicinoAiSentieri,
  agganciaAlSentiero,
  senzaPunte,
  gambo,
  direzioniDelGiro,
  prossimiAnelli,
  valutaAnello,
  scegliAnelli,
  correzioneLunghezza,
  FATTORE_SENTIERI,
} from '../src/lib/anello.js';

const P = [13.79, 41.81]; // Pescasseroli
// linea dritta da a verso b con un punto ogni ~10 m
const dritta = (a, b, n = 100) => Array.from({ length: n + 1 }, (_, k) => [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
const lunghezza = (l) => l.reduce((s, p, i) => (i ? s + distanzaKm(l[i - 1], p) : 0), 0);

describe('puntiDellAnello', () => {
  it('puntoA va alla distanza e nella direzione giuste', () => {
    const nord = puntoA(P, 2, 0);
    expect(distanzaKm(P, nord)).toBeCloseTo(2, 2);
    expect(nord[1]).toBeGreaterThan(P[1]);
    const est = puntoA(P, 2, 90);
    expect(distanzaKm(P, est)).toBeCloseTo(2, 2);
    expect(est[0]).toBeGreaterThan(P[0]);
  });
  it('parte e torna alla partenza, con i lati dritti pari alla lunghezza / fattore dei sentieri', () => {
    const punti = puntiDellAnello(P, 13, 45);
    expect(punti).toHaveLength(5);
    expect(punti[0]).toEqual(P);
    expect(punti.at(-1)).toEqual(P);
    expect(lunghezza(punti)).toBeCloseTo(13 / FATTORE_SENTIERI, 1);
  });
  it('il centro del giro è dalla parte della direzione scelta', () => {
    const punti = puntiDellAnello(P, 10, 0); // verso nord
    expect(punti.slice(1, -1).every((p) => p[1] >= P[1] - 1e-9)).toBe(true);
  });
});

describe('sovrapposizione', () => {
  it('un anello vero non si sovrappone', () => {
    const quadrato = [P, puntoA(P, 1, 0), puntoA(puntoA(P, 1, 0), 1, 90), puntoA(P, 1, 90), P];
    const linea = quadrato.flatMap((p, i) => (i ? dritta(quadrato[i - 1], p, 50).slice(1) : [p]));
    expect(sovrapposizione(linea)).toBe(0);
  });
  it('andata e ritorno sulla stessa strada è tutta sovrapposta', () => {
    const b = puntoA(P, 2, 30);
    const linea = [...dritta(P, b, 200), ...dritta(b, P, 200).slice(1)];
    expect(sovrapposizione(linea)).toBeGreaterThan(0.85);
  });
  it('un anello con un tratto in comune: la quota è quella del tratto', () => {
    // 1 km di andata e ritorno ("ramo") più un quadrato di 4 km
    const a = puntoA(P, 1, 0);
    const q = [a, puntoA(a, 1, 0), puntoA(puntoA(a, 1, 0), 1, 90), puntoA(a, 1, 90), a];
    const giro = q.flatMap((p, i) => (i ? dritta(q[i - 1], p, 100).slice(1) : [p]));
    const linea = [...dritta(P, a, 100), ...giro.slice(1), ...dritta(a, P, 100).slice(1)];
    const s = sovrapposizione(linea);
    expect(s).toBeGreaterThan(0.25); // 2 km su 6 ≈ 0,33
    expect(s).toBeLessThan(0.4);
  });
});

describe('quotaComune', () => {
  it('stessa linea: 1; linee lontane: 0', () => {
    const l = dritta(P, puntoA(P, 2, 0));
    expect(quotaComune(l, l)).toBe(1);
    expect(quotaComune(l, dritta(puntoA(P, 1, 90), puntoA(puntoA(P, 1, 90), 2, 0)))).toBe(0);
  });
});

describe('sentieri segnati', () => {
  const terreno = [
    { daM: 0, aM: 1000, tag: { highway: 'path', route_hiking_lwn: 'yes' } },
    { daM: 1000, aM: 1500, tag: { highway: 'path' } },
    { daM: 1500, aM: 1800, tag: { highway: 'track' } },
    { daM: 1800, aM: 4000, tag: { highway: 'unclassified' } },
  ];
  it('quotaSegnata: tutto tranne i sentieri non segnati (le strade valgono)', () => {
    expect(quotaSegnata(terreno)).toBeCloseTo(1 - 800 / 4000, 5);
    expect(quotaSegnata([])).toBe(0);
  });
  it('trattiNonSegnati: uniti se si toccano, con il pezzo di linea', () => {
    const linea = dritta(P, puntoA(P, 4, 0), 400); // un punto ogni 10 m
    const t = trattiNonSegnati(linea, terreno);
    expect(t).toHaveLength(1);
    expect(t[0].daM).toBe(1000);
    expect(t[0].aM).toBe(1800);
    expect(lunghezza(t[0].linea) * 1000).toBeGreaterThan(780);
    expect(lunghezza(t[0].linea) * 1000).toBeLessThan(820);
  });
});

describe('ammessoNeiParchi', () => {
  const parco = { id: 'pnalm' };
  // tratto di n punti (uno ogni 25 m) verso est
  const tratto = (motivo, n, extra = {}) => ({ motivo, parco, daM: 0, aM: (n - 1) * 25, linea: Array.from({ length: n }, (_, k) => puntoA(P, k * 0.025, 90)), ...extra });
  it('niente accesso regolato né mano libera; dei non segnati solo i raccordi', () => {
    expect(ammessoNeiParchi([])).toBe(true);
    expect(ammessoNeiParchi([tratto('non_segnato', 2)])).toBe(true);
    expect(ammessoNeiParchi([tratto('non_segnato', 12)])).toBe(false);
    expect(ammessoNeiParchi([tratto('regolato', 2, { nome: 'F1', accesso: 'guida' })])).toBe(false);
    expect(ammessoNeiParchi([tratto('mano_libera', 2)])).toBe(false);
  });
  it('i non segnati in OSM che sono sentieri del nostro archivio valgono', () => {
    const vertici = Array.from({ length: 20 }, (_, k) => puntoA(P, k * 0.02, 90));
    expect(ammessoNeiParchi([tratto('non_segnato', 12)], { suiSentieri: vicinoAiSentieri(vertici) })).toBe(true);
  });
});

describe('aggancio ai sentieri', () => {
  const vertici = [puntoA(P, 0.3, 0), puntoA(P, 0.8, 90), puntoA(P, 3, 180)];
  it('agganciaAlSentiero: il vertice più vicino entro il limite', () => {
    const a = agganciaAlSentiero(P, vertici);
    expect(a.p).toEqual(vertici[0]);
    expect(a.distanzaM).toBe(300);
    expect(agganciaAlSentiero(puntoA(P, 10, 270), vertici)).toBeNull();
  });
  it('vicinoAiSentieri: entro 40 m', () => {
    const vicino = vicinoAiSentieri(vertici);
    expect(vicino(puntoA(vertici[1], 0.03, 0))).toBe(true);
    expect(vicino(puntoA(vertici[1], 0.06, 0))).toBe(false);
    expect(vicinoAiSentieri([])(P)).toBe(false);
  });
});

describe('valutaAnello e scegliAnelli', () => {
  const base = { km: 12, salita: 500, durataMin: 240, sovrapposizione: 0.02, segnata: 0.9, acqua: 1 };
  it('scarta lunghezze lontane, sovrapposizioni e fatica sbagliata', () => {
    expect(valutaAnello(base, { volutaKm: 12 })).toBeGreaterThan(100);
    expect(valutaAnello({ ...base, km: 18 }, { volutaKm: 12 })).toBeNull();
    expect(valutaAnello({ ...base, sovrapposizione: 0.25 }, { volutaKm: 12 })).toBeNull();
    expect(valutaAnello({ ...base, salita: 900 }, { volutaKm: 12, fatica: 'facile' })).toBeNull();
  });
  it('preferisce la lunghezza giusta, i segnati e l\'acqua', () => {
    const v = (x) => valutaAnello({ ...base, ...x }, { volutaKm: 12 });
    expect(v({ km: 12 })).toBeGreaterThan(v({ km: 14 }));
    expect(v({ segnata: 1 })).toBeGreaterThan(v({ segnata: 0.5 }));
    expect(v({ acqua: 2 })).toBeGreaterThan(v({ acqua: 0 }));
  });
  it('scegliAnelli: i migliori, senza doppioni', () => {
    const l1 = dritta(P, puntoA(P, 2, 0));
    const l2 = dritta(P, puntoA(P, 2, 90));
    const scelti = scegliAnelli(
      [
        { punteggio: 90, linea: l1, id: 'a' },
        { punteggio: 95, linea: l1, id: 'b' },
        { punteggio: 80, linea: l2, id: 'c' },
        { punteggio: null, linea: l2, id: 'd' },
      ],
      3,
    );
    expect(scelti.map((x) => x.id)).toEqual(['b', 'c']);
  });
  it('correzioneLunghezza: le prossime si accorciano se vengono lunghe', () => {
    expect(correzioneLunghezza([], 10)).toBe(1);
    expect(correzioneLunghezza([12.5], 10)).toBeCloseTo(0.8, 5);
    expect(correzioneLunghezza([40], 10)).toBe(0.5);
  });
});

describe('senzaPunte', () => {
  it('sposta alla base il punto raggiunto con un andata e ritorno', () => {
    // da P verso est 1 km (A), poi punta verso nord 500 m (T) e ritorno ad A, poi altri 1 km verso est
    const A = puntoA(P, 1, 90);
    const T = puntoA(A, 0.5, 0);
    const B = puntoA(A, 1, 90);
    const linea = [...dritta(P, A, 50), ...dritta(A, T, 25).slice(1), ...dritta(T, A, 25).slice(1), ...dritta(A, B, 50).slice(1)];
    const nuove = senzaPunte(linea, [P, T, B]);
    expect(nuove).not.toBeNull();
    expect(distanzaKm(nuove[1], A) * 1000).toBeLessThan(40);
    expect(nuove[0]).toEqual(P);
    expect(nuove[2]).toEqual(B);
  });
  it('nessuna punta: null', () => {
    const A = puntoA(P, 1, 90);
    const B = puntoA(A, 1, 0);
    expect(senzaPunte([...dritta(P, A, 50), ...dritta(A, B, 50).slice(1)], [P, A, B])).toBeNull();
  });
});

describe('gambo', () => {
  it('lecca-lecca: il gambo si misura e non conta nella sovrapposizione', () => {
    // 1 km dalla partenza ad A, quadrato di 4 km, ritorno da A alla partenza
    const a = puntoA(P, 1, 0);
    const q = [a, puntoA(a, 1, 0), puntoA(puntoA(a, 1, 0), 1, 90), puntoA(a, 1, 90), a];
    const giro = q.flatMap((p, i) => (i ? dritta(q[i - 1], p, 100).slice(1) : [p]));
    const linea = [...dritta(P, a, 100), ...giro.slice(1), ...dritta(a, P, 100).slice(1)];
    const g = gambo(linea);
    expect(g).toBeGreaterThan(900);
    expect(g).toBeLessThan(1100);
    expect(sovrapposizione(linea, { gamboM: g })).toBeLessThan(0.05);
  });
  it('anello vero: nessun gambo', () => {
    const q = [P, puntoA(P, 1, 0), puntoA(puntoA(P, 1, 0), 1, 90), puntoA(P, 1, 90), P];
    expect(gambo(q.flatMap((p, i) => (i ? dritta(q[i - 1], p, 50).slice(1) : [p])))).toBeLessThan(50);
  });
  it('valutaAnello scarta i gambi troppo lunghi', () => {
    const base = { km: 12, salita: 500, durataMin: 240, sovrapposizione: 0, segnata: 1, acqua: 0 };
    expect(valutaAnello({ ...base, gamboM: 1000 }, { volutaKm: 12 })).not.toBeNull();
    expect(valutaAnello({ ...base, gamboM: 3000 }, { volutaKm: 12 })).toBeNull();
  });
  it('senzaPunte: anche con un piccolo giro in cima alla punta', () => {
    const A = puntoA(P, 1, 90);
    const T = puntoA(A, 0.6, 0);
    const T2 = puntoA(T, 0.03, 90);
    const T3 = puntoA(T2, 0.15, 180);
    const B = puntoA(A, 1, 90);
    // su verso T, giretto in cima T→T2→T3, poi giù ad A (il ritorno corre a 30 m dall'andata)
    const linea = [...dritta(P, A, 50), ...dritta(A, T, 30).slice(1), ...dritta(T, T2, 5).slice(1), ...dritta(T2, T3, 5).slice(1), ...dritta(T3, puntoA(A, 0.03, 90), 30).slice(1), ...dritta(puntoA(A, 0.03, 90), B, 50).slice(1)];
    const nuove = senzaPunte(linea, [P, T2, B]);
    expect(nuove).not.toBeNull();
    expect(distanzaKm(nuove[1], A) * 1000).toBeLessThan(150);
  });
});

describe('direzioniDelGiro', () => {
  it('4 direzioni a 90°, ogni giro ruotato rispetto ai precedenti', () => {
    expect(direzioniDelGiro(0)).toEqual([0, 90, 180, 270]);
    expect(direzioniDelGiro(1)).toEqual([45, 135, 225, 315]);
    expect(direzioniDelGiro(2)).toEqual([22.5, 112.5, 202.5, 292.5]);
    expect(new Set([0, 1, 2, 3].flatMap(direzioniDelGiro)).size).toBe(16);
  });
});

describe('classifica degli anelli nei parchi: pagine e ricomincia', () => {
  const lista = Array.from({ length: 7 }, (_, i) => ({ id: i, buono: i !== 2 && i !== 5 }));
  const accetta = async (v) => v.buono;
  it('pagine di 3 che saltano gli scartati', async () => {
    const a = await prossimiAnelli(lista, 0, 3, accetta);
    expect(a.pagina.map((v) => v.id)).toEqual([0, 1, 3]);
    expect(a.posizione).toBe(4);
    expect(a.scartate).toBe(1);
    const b = await prossimiAnelli(lista, a.posizione, 3, accetta);
    expect(b.pagina.map((v) => v.id)).toEqual([4, 6]); // fino in fondo: 5 scartato, ne restano 2
    expect(b.posizione).toBe(7);
    expect(b.ricominciato).toBe(false);
  });
  it('arrivati in fondo senza niente di nuovo si ricomincia dall\'inizio, una volta sola', async () => {
    const c = await prossimiAnelli(lista, 7, 3, accetta);
    expect(c.ricominciato).toBe(true);
    expect(c.pagina.map((v) => v.id)).toEqual([0, 1, 3]);
    expect(c.posizione).toBe(4);
    // nessuna voce accettabile: non gira all'infinito
    const nulla = await prossimiAnelli(lista, 3, 3, async () => false);
    expect(nulla.pagina).toEqual([]);
    expect(nulla.ricominciato).toBe(true);
    expect(await prossimiAnelli([], 0, 3, accetta)).toMatchObject({ pagina: [], ricominciato: false });
  });
  it('accetta riceve la pagina in corso (per scartare i giri troppo simili)', async () => {
    const viste = [];
    await prossimiAnelli(lista, 0, 2, async (v, pagina) => (viste.push(pagina.length), v.buono));
    expect(viste).toEqual([0, 1]);
  });
});
