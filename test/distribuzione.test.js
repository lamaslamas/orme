import { describe, it, expect } from 'vitest';
import { distribuzioneDaEsri, descriviZona, haDistribuzione } from '../src/lib/distribuzione.js';

const anello = [[13.8, 41.8], [13.9, 41.8], [13.9, 41.9], [13.8, 41.8]];
const f = (code, region, stato, trend = '+', maptype = 'Distribution') => ({
  attributes: { speciescode: code, region, conclusion_assessment_MS: stato, conclusion_assessment_trend_MS: trend, maptype },
  geometry: { rings: [anello] },
});

describe('distribuzione EEA (Art. 17)', () => {
  it('converte la risposta ArcGIS: specie note, [lat, lon], pezzi della stessa regione uniti', () => {
    const d = distribuzioneDaEsri({
      features: [f('1352', 'MED', 'FV'), f('1352', 'MED', 'FV'), f('1354', 'ALP', 'U1'), f('9999', 'MED', 'FV'), f('1355', 'ALP', null, null), f('1363', 'MED', 'FV', '+', 'Range')],
    });
    expect(Object.keys(d).sort()).toEqual(['lontra', 'lupo', 'orso']);
    expect(d.lupo).toHaveLength(1);
    expect(d.lupo[0].anelli).toHaveLength(2);
    expect(d.lupo[0].anelli[0][0]).toEqual([41.8, 13.8]);
    expect(d.lontra[0].stato).toBe('XX');
  });

  it('descrive stato e tendenza in italiano', () => {
    expect(descriviZona('orso', { regione: 'ALP', stato: 'U1', tendenza: '+' }, 'Orso')).toBe(
      'Orso — regione alpina: stato di conservazione inadeguato, in miglioramento',
    );
    expect(descriviZona('lontra', { regione: 'ALP', stato: 'XX', tendenza: null }, 'Lontra')).toBe(
      'Lontra — regione alpina: stato di conservazione sconosciuto o non valutato',
    );
  });

  it('gli uccelli non hanno dati Art. 17', () => {
    expect(haDistribuzione('lupo')).toBe(true);
    expect(haDistribuzione('aquila_reale')).toBe(false);
  });
});
