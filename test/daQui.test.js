import { describe, it, expect } from 'vitest';
import { percorsiDaQui } from '../src/lib/daQui.js';

const p = (id, coordinate) => ({ sentiero: { id }, traccia: { geojson: { type: 'MultiLineString', coordinates: [coordinate] } } });
// tre percorsi: uno verso est che passa dal punto, uno che parte dal punto, uno lontano
const percorsi = [
  p('attraversa', [[13.79, 41.8], [13.81, 41.8]]),
  p('parte', [[13.8, 41.8005], [13.8, 41.83]]),
  p('lontano', [[13.9, 41.9], [13.95, 41.9]]),
  { sentiero: { id: 'senza traccia' }, traccia: null },
];

describe('percorsi da qui', () => {
  it('trova i percorsi che passano entro il raggio, dal più vicino', () => {
    const r = percorsiDaQui(percorsi, [13.8, 41.8001], 200);
    expect(r.map((x) => x.sentiero.id)).toEqual(['attraversa', 'parte']);
    expect(r[0].distanzaM).toBeLessThan(20);
  });

  it('segna quando il punto è all\'inizio o alla fine del percorso', () => {
    const r = percorsiDaQui(percorsi, [13.8, 41.8001], 200);
    expect(r.find((x) => x.sentiero.id === 'parte').estremo).toBe('inizio');
    expect(r.find((x) => x.sentiero.id === 'attraversa').estremo).toBeNull();
    expect(percorsiDaQui(percorsi, [13.81, 41.8], 100)[0]).toMatchObject({ sentiero: { id: 'attraversa' }, estremo: 'fine' });
  });

  it('il raggio conta', () => {
    expect(percorsiDaQui(percorsi, [13.8, 41.803], 100).map((x) => x.sentiero.id)).toEqual(['parte']);
    expect(percorsiDaQui(percorsi, [13.8, 41.803], 500).map((x) => x.sentiero.id)).toEqual(['parte', 'attraversa']);
    expect(percorsiDaQui(percorsi, [12, 40])).toEqual([]);
  });
});
