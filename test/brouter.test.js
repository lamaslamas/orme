import { describe, it, expect } from 'vitest';

describe('profilo secondo l\'attività', () => {
  it('trekking: escursionistico; MTB: il profilo mtb, senza il parametro dei segnati', async () => {
    const { profiloPer, urlBrouter, PROFILO_MTB } = await import('../src/lib/brouter.js');
    expect(profiloPer('trekking')).toBe('hiking-mountain');
    expect(profiloPer('mtb')).toBe(PROFILO_MTB);
    const trek = urlBrouter([[13, 41], [13.1, 41.1]], profiloPer('trekking'), { preferenzaSegnati: 0.6 });
    expect(trek).toContain('profile=hiking-mountain');
    expect(trek).toContain('hiking_routes_preference=0.6');
    const mtb = urlBrouter([[13, 41], [13.1, 41.1]], profiloPer('mtb'), { preferenzaSegnati: 0.6 });
    expect(mtb).toContain('profile=mtb');
    expect(mtb).not.toContain('hiking_routes_preference');
  });
});

describe('alternative di BRouter', () => {
  it('di base il percorso migliore, a richiesta un\'alternativa', async () => {
    const { urlBrouter } = await import('../src/lib/brouter.js');
    expect(urlBrouter([[13.8, 41.8], [13.81, 41.8]])).toContain('alternativeidx=0');
    expect(urlBrouter([[13.8, 41.8], [13.81, 41.8]], undefined, { alternativa: 2 })).toContain('alternativeidx=2');
  });
});
