import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { conRitardo, RITARDO_RICERCA_MS } from '../src/lib/ritardo.js';
import { testoConteggio } from '../src/lib/suggerimenti.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('ritardo di 400 ms', () => {
  it('il ritardo è di 400 ms', () => {
    expect(RITARDO_RICERCA_MS).toBe(400);
  });
  it('una scelta: parte dopo 400 ms, non prima', () => {
    const f = vi.fn();
    const r = conRitardo(f);
    r();
    vi.advanceTimersByTime(399);
    expect(f).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('più scelte di fila: parte una sola ricerca, dopo l\'ultima', () => {
    const f = vi.fn();
    const r = conRitardo(f);
    r();
    vi.advanceTimersByTime(300);
    r();
    vi.advanceTimersByTime(300);
    r();
    expect(f).not.toHaveBeenCalled();
    vi.advanceTimersByTime(399);
    expect(f).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(f).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('si può annullare, e dopo una ricerca se ne può chiedere un\'altra', () => {
    const f = vi.fn();
    const r = conRitardo(f);
    r();
    expect(r.inAttesa()).toBe(true);
    r.annulla();
    vi.advanceTimersByTime(1000);
    expect(f).not.toHaveBeenCalled();
    r();
    vi.advanceTimersByTime(400);
    r();
    vi.advanceTimersByTime(400);
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe('numero di percorsi sul pulsante', () => {
  it('i testi', () => {
    expect(testoConteggio(23)).toBe('Mostra 23 percorsi');
    expect(testoConteggio(1)).toBe('Mostra 1 percorso');
    expect(testoConteggio(0)).toBe('Nessun percorso: tocca per vedere perché');
    expect(testoConteggio(null)).toBe('Suggerisci');
    expect(testoConteggio(undefined)).toBe('Suggerisci');
  });
});
