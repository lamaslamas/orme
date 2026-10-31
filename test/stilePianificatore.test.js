import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/stile.css', import.meta.url), 'utf8');
const regole = (selettore) => [...css.matchAll(/(^|\n)([^{}\n]*)\{([^{}]*)\}/g)].filter((m) => m[2].split(',').some((s) => s.trim() === selettore)).map((m) => m[3]);

describe('stile del pianificatore', () => {
  it('i marcatori delle tappe non cambiano position (MapLibre li posiziona: con relative si impilano lontano dalla linea)', () => {
    const r = regole('.pian-tappa');
    expect(r.length).toBeGreaterThan(0);
    for (const corpo of r) expect(corpo).not.toMatch(/(^|[;\s])position\s*:/);
  });
});
