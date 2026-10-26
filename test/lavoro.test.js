// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { inPezzi, interagendo, aspettaQuiete, azzeraInterazioni, collegaMappaAlLavoro, ascoltaInterazioni } from '../src/lib/lavoro.js';

beforeEach(() => azzeraInterazioni());

describe('lavoro a pezzi', () => {
  it('dà gli stessi risultati nello stesso ordine e cede il passo tra un pezzo e l\'altro', async () => {
    let ceduti = 0;
    const originale = globalThis.setTimeout;
    const conta = vi.spyOn(globalThis, 'setTimeout').mockImplementation((f, ms, ...a) => {
      if (ms === 0) ceduti++;
      return originale(f, ms, ...a);
    });
    const scheduler = globalThis.scheduler;
    globalThis.scheduler = undefined;
    const ri = globalThis.requestIdleCallback;
    globalThis.requestIdleCallback = undefined;
    // ogni elemento «costa» 12 ms (attesa attiva), budget 20 ms: si cede dopo due elementi
    const r = await inPezzi([1, 2, 3, 4, 5], (x) => {
      const t = performance.now();
      while (performance.now() - t < 12);
      return x * 10;
    }, { budgetMs: 20 });
    conta.mockRestore();
    globalThis.scheduler = scheduler;
    globalThis.requestIdleCallback = ri;
    expect(r).toEqual([10, 20, 30, 40, 50]);
    expect(ceduti).toBeGreaterThanOrEqual(2);
  });
  it('mentre la mappa si muove il lavoro aspetta; a movimento finito riprende dopo un attimo di quiete', async () => {
    const eventi = {};
    const mappa = { on: (nomi, f) => nomi.split(' ').forEach((n) => (eventi[n] = f)) };
    collegaMappaAlLavoro(mappa);
    eventi.movestart();
    expect(interagendo()).toBe(true);
    eventi.moveend();
    expect(interagendo(250)).toBe(true); // appena finito: ancora in quiete da aspettare
    expect(interagendo(0)).toBe(false);
  });
  it('non aspetta per sempre: dopo il massimo riparte anche se si continua a toccare', async () => {
    const eventi = {};
    collegaMappaAlLavoro({ on: (nomi, f) => nomi.split(' ').forEach((n) => (eventi[n] = f)) });
    eventi.movestart(); // la mappa «resta in movimento»
    const t = performance.now();
    await aspettaQuiete({ massimoMs: 150 });
    expect(performance.now() - t).toBeGreaterThanOrEqual(140);
    expect(performance.now() - t).toBeLessThan(600);
  });
  it('un tocco mette in pausa il lavoro', () => {
    const scollega = ascoltaInterazioni(document);
    document.dispatchEvent(new Event('pointerdown'));
    expect(interagendo(250)).toBe(true);
    scollega();
  });
});
