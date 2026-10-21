// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scaricaPrevisioni, previsioneDi, TEMPO_MASSIMO_MS } from '../src/viste/previsioni.js';
import { puntoMeteo } from '../src/lib/condizioni.js';

const risposta = (n) => Array.from({ length: n }, () => ({ hourly: { time: [], temperature_2m: [] }, daily: { time: [], sunrise: [], sunset: [] } }));
const ok = (n) => ({ ok: true, status: 200, json: async () => risposta(n) });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('scaricaPrevisioni', () => {
  it('una sola chiamata per molte celle e niente chiamate ripetute (cache)', async () => {
    const f = vi.fn(async () => ok(3));
    vi.stubGlobal('fetch', f);
    const punti = [puntoMeteo(13.1, 41.1), puntoMeteo(13.5, 41.5), puntoMeteo(14.1, 41.9)];
    await scaricaPrevisioni(punti, { giorni: 2 });
    await scaricaPrevisioni(punti, { giorni: 2 });
    expect(f).toHaveBeenCalledTimes(1);
    expect(previsioneDi(punti[0].chiave, '2000-01-01')).toBeUndefined();
  });
  it('coordinate vicine finiscono nella stessa cella', () => {
    expect(puntoMeteo(13.101, 41.098).chiave).toBe(puntoMeteo(13.12, 41.1).chiave);
  });
  it('429: aspetta e riprova una volta', async () => {
    const f = vi.fn().mockResolvedValueOnce({ ok: false, status: 429 }).mockResolvedValueOnce(ok(1));
    vi.stubGlobal('fetch', f);
    const p = scaricaPrevisioni([puntoMeteo(10.1, 40.1)], { giorni: 2 });
    await vi.advanceTimersByTimeAsync(5000);
    await p;
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('429 due volte: errore, non si insiste', async () => {
    const f = vi.fn(async () => ({ ok: false, status: 429 }));
    vi.stubGlobal('fetch', f);
    const p = scaricaPrevisioni([puntoMeteo(10.3, 40.3)], { giorni: 2 }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await p).toBeInstanceOf(Error);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('senza risposta entro 10 secondi la richiesta cade', async () => {
    vi.stubGlobal('fetch', (url, { signal }) => new Promise((_, no) => signal.addEventListener('abort', () => no(new Error('annullata')))));
    const p = scaricaPrevisioni([puntoMeteo(11.1, 42.1)], { giorni: 2 }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(TEMPO_MASSIMO_MS + 100);
    expect(await p).toBeInstanceOf(Error);
  });
});
