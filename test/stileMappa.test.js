import { describe, it, expect } from 'vitest';
import { stileUnico, LIVELLI_SENTIERI, COLORI_SENTIERI } from '../src/lib/stileMappa.js';

const originale = {
  version: 8,
  sources: { openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } },
  layers: [
    { id: 'sfondo', type: 'background' },
    { id: 'strade', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation' },
    { id: 'nomi-paesi', type: 'symbol', source: 'openmaptiles', layout: { 'text-field': ['get', 'name_en'] } },
    { id: 'acqua', type: 'fill', source: 'openmaptiles' },
  ],
};

describe('una sola mappa MapLibre: base, sentieri, scritte', () => {
  it('ordine: base, poi i sentieri, poi le scritte (in italiano)', () => {
    const s = stileUnico(originale);
    const ids = s.layers.map((l) => l.id);
    expect(ids.slice(0, 3)).toEqual(['sfondo', 'strade', 'acqua']);
    expect(ids.slice(3, 3 + LIVELLI_SENTIERI.length).sort()).toEqual([...LIVELLI_SENTIERI].sort());
    expect(ids.at(-1)).toBe('nomi-paesi');
    expect(s.layers.at(-1).layout['text-field']).toEqual(['coalesce', ['get', 'name:it'], ['get', 'name']]);
    expect(s.sources).toBe(originale.sources);
  });
  it('sentieri accesi o spenti con la visibilità, colori per le basi scure', () => {
    const spento = stileUnico(originale, { sentieri: false });
    expect(spento.layers.filter((l) => LIVELLI_SENTIERI.includes(l.id)).every((l) => l.layout.visibility === 'none')).toBe(true);
    const scuro = stileUnico(originale, { scuro: true });
    expect(scuro.layers.find((l) => l.id === 'orme-sentieri').paint['line-color']).toBe(COLORI_SENTIERI.scuro.linea);
    expect(stileUnico(originale).layers.find((l) => l.id === 'orme-sentieri').layout.visibility).toBe('visible');
  });
});
