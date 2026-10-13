import { describe, it, expect } from 'vitest';
import { partiDaSvg } from '../src/lib/tracciati.js';

describe('tracciati SVG per la tela', () => {
  it('legge d, riempimento e contorno', () => {
    const svg = '<path d="M3 11 12 4l9 7v9H3z" fill="currentColor"/><path d="M5 11v9M19 11v9" stroke="currentColor" stroke-width="3"/><path d="M1 1"/>';
    expect(partiDaSvg(svg)).toEqual([
      { d: 'M3 11 12 4l9 7v9H3z', fill: 'currentColor', stroke: null, larghezza: 2 },
      { d: 'M5 11v9M19 11v9', fill: 'none', stroke: 'currentColor', larghezza: 3 },
      { d: 'M1 1', fill: 'currentColor', stroke: null, larghezza: 2 },
    ]);
  });
});
