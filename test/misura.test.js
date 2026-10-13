import { describe, it, expect } from 'vitest';
import { cronometra, registra, tempiRegistrati, azzeraTempi, statisticheFotogrammi, righeTempi, riassuntoLunghi, riassuntoFotogrammiLunghi } from '../src/lib/misura.js';

describe('misuratore delle prestazioni', () => {
  it('spento: la funzione resta la stessa (nessun costo)', () => {
    const f = () => 1;
    expect(cronometra('x', f, false)).toBe(f);
  });
  it('acceso: misura e restituisce lo stesso risultato', () => {
    azzeraTempi();
    const f = cronometra('somma', (a, b) => a + b, true);
    expect(f(2, 3)).toBe(5);
    f(1, 1);
    const t = tempiRegistrati().get('somma');
    expect(t.volte).toBe(2);
    expect(t.totale).toBeGreaterThanOrEqual(0);
  });
  it('fotogrammi: fps, persi, peggiore', () => {
    const durate = [...Array(50).fill(16.7), 50, 100];
    const st = statisticheFotogrammi(durate, 1);
    expect(st.fotogrammi).toBe(52);
    expect(st.persi).toBe(2 + 5); // 50 ms = 3 fotogrammi (2 persi), 100 ms = 6 (5 persi)
    expect(st.peggiore).toBe(100);
    expect(st.mediana).toBe(17);
  });
  it('righe dei tempi dal più pesante', () => {
    azzeraTempi();
    registra('legenda', 5);
    registra('elenco', 120);
    registra('elenco', 30);
    expect(righeTempi(tempiRegistrati())).toEqual(['  elenco: 150 ms (2×, max 120 ms)', '  legenda: 5 ms (1×, max 5 ms)']);
  });
  it('compiti e fotogrammi lunghi', () => {
    expect(riassuntoLunghi([])).toBe('nessuno');
    expect(riassuntoLunghi([60, 1200])).toBe('2 (totale 1,3 s, max 1200 ms)');
    const r = riassuntoFotogrammiLunghi([
      { script: 80, stile: 20, altro: 30, origini: [{ origine: 'requestAnimationFrame', durata: 70 }, { origine: 'pointermove', durata: 10 }] },
      { script: 40, stile: 10, altro: 0, origini: [{ origine: 'pointermove', durata: 40 }] },
    ]);
    expect(r[0]).toBe('  in tutto 2 · script 120 ms · stile e impaginazione 30 ms · altro (disegno, GPU, attese) 30 ms');
    expect(r.slice(1)).toEqual(['  requestAnimationFrame: 70 ms', '  pointermove: 50 ms']);
  });
});
