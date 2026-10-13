import { describe, it, expect } from 'vitest';
import { creaCoda } from '../src/lib/codaMovimento.js';

describe('lavori di fine movimento in coda', () => {
  const senzaAttesa = () => Promise.resolve();
  it('in ordine di priorità, saltando i non visibili', async () => {
    const fatti = [];
    const coda = creaCoda({ fotogramma: senzaAttesa });
    coda.aggiungi('legenda', () => fatti.push('legenda'), { priorita: 8 });
    coda.aggiungi('elenco', () => fatti.push('elenco'), { priorita: 1 });
    coda.aggiungi('specie', () => fatti.push('specie'), { priorita: 4, visibile: () => false });
    await coda.esegui();
    expect(fatti).toEqual(['elenco', 'legenda']);
  });
  it('si ferma se la mappa riparte', async () => {
    const fatti = [];
    let riparti;
    const coda = creaCoda({ fotogramma: () => new Promise((r) => (riparti = r)) });
    coda.aggiungi('a', () => fatti.push('a'), { priorita: 1 });
    coda.aggiungi('b', () => fatti.push('b'), { priorita: 2 });
    const corsa = coda.esegui();
    coda.inizio(); // la mappa si muove di nuovo
    riparti();
    await corsa;
    expect(fatti).toEqual(['a']);
  });
  it('un lavoro tolto non si esegue più; un errore non blocca gli altri', async () => {
    const fatti = [];
    const coda = creaCoda({ fotogramma: senzaAttesa, avviso: () => {} });
    const togli = coda.aggiungi('tolto', () => fatti.push('tolto'), { priorita: 0 });
    togli();
    coda.aggiungi('rotto', () => {
      throw new Error('x');
    }, { priorita: 1 });
    coda.aggiungi('ok', () => fatti.push('ok'));
    await coda.esegui();
    expect(fatti).toEqual(['ok']);
  });
  it('parte solo dopo il ritardo dall\'ultimo movimento', () => {
    const timers = [];
    const coda = creaCoda({ fotogramma: senzaAttesa, timer: (f, ms) => timers.push({ f, ms }) && timers.length, ferma: () => {} });
    coda.fine();
    expect(timers[0].ms).toBe(250);
  });
});
