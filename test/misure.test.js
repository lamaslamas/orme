import { describe, it, expect } from 'vitest';
import {
  misuraLineaAria,
  puntoSullaLinea,
  lineaPiuVicina,
  trattoLungoLinea,
  testoDistanza,
} from '../src/lib/misure.js';

// 0,001° di latitudine ≈ 111,2 m
const p = (n, q) => (q == null ? [13.8, 41.7 + n * 0.001] : [13.8, 41.7 + n * 0.001, q]);

describe('misura in linea d\'aria', () => {
  it('calcola parziali e totale', () => {
    const r = misuraLineaAria([p(0), p(1), p(3)]);
    expect(r.parziali[0]).toBeCloseTo(111.2, 0);
    expect(r.parziali[1]).toBeCloseTo(222.4, 0);
    expect(r.totaleM).toBeCloseTo(333.6, 0);
    expect(misuraLineaAria([p(0)]).totaleM).toBe(0);
  });

  it('scrive le distanze in modo leggibile', () => {
    expect(testoDistanza(320.4)).toBe('320 m');
    expect(testoDistanza(1234)).toBe('1,23 km');
  });
});

describe('misura lungo la traccia', () => {
  // una "L": 3 punti verso nord, poi verso est
  const linea = [p(0, 1000), p(1, 1050), p(2, 1100), [13.802, 41.702, 1080]];

  it('aggancia un punto vicino alla traccia', () => {
    const s = puntoSullaLinea(linea, [13.8001, 41.7005]);
    expect(s.indice).toBe(0);
    expect(s.t).toBeCloseTo(0.5, 2);
    expect(s.daInizioM).toBeCloseTo(55.6, 0);
    expect(s.distanzaDallaLineaM).toBeCloseTo(8.3, 0);
    expect(s.punto[2]).toBeCloseTo(1025, 0);
  });

  it('misura la distanza percorrendo la traccia, non in linea d\'aria', () => {
    const a = puntoSullaLinea(linea, p(0));
    const b = puntoSullaLinea(linea, [13.802, 41.702]);
    const t = trattoLungoLinea(linea, a, b);
    // 222 m verso nord + ~166 m verso est
    expect(t.distanzaM).toBeCloseTo(222.4 + 166.2, -1);
    const aria = misuraLineaAria([p(0), [13.802, 41.702]]).totaleM;
    expect(t.distanzaM).toBeGreaterThan(aria);
  });

  it('calcola il dislivello del tratto se ci sono le quote', () => {
    const a = puntoSullaLinea(linea, p(0));
    const b = puntoSullaLinea(linea, [13.802, 41.702]);
    expect(trattoLungoLinea(linea, a, b).dislivello).toEqual({ salita: 100, discesa: 20 });
    // al contrario: salita e discesa si scambiano
    const inverso = trattoLungoLinea(linea, b, a);
    expect(inverso.alContrario).toBe(true);
    expect(inverso.distanzaM).toBeCloseTo(trattoLungoLinea(linea, a, b).distanzaM, 6);
    expect(inverso.dislivello).toEqual({ salita: 20, discesa: 100 });
  });

  it('senza quote il dislivello è null', () => {
    const senza = [p(0), p(1), p(2)];
    const t = trattoLungoLinea(senza, puntoSullaLinea(senza, p(0)), puntoSullaLinea(senza, p(2)));
    expect(t.dislivello).toBeNull();
    expect(t.distanzaM).toBeCloseTo(222.4, 0);
  });

  it('sceglie la traccia più vicina', () => {
    const lontana = [[13.9, 41.7], [13.9, 41.71]];
    const r = lineaPiuVicina([lontana, linea], [13.8002, 41.7012]);
    expect(r.indice).toBe(1);
    expect(lineaPiuVicina([], p(0))).toBeNull();
  });
});
