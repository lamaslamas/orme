// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { urlBrouter, leggiTag, interpretaBrouter, calcolaPercorso } from '../src/lib/brouter.js';
import { creaGpx, nomeFileGpx } from '../src/lib/gpxScrittura.js';
import { leggiGpx } from '../src/lib/gpx.js';

const risposta = {
  features: [
    {
      geometry: { coordinates: [[13.85, 41.77, 1071], [13.851, 41.771, 1080], [13.852, 41.772, 1090]] },
      properties: {
        'track-length': '300',
        'filtered ascend': '19',
        messages: [
          ['Longitude', 'Latitude', 'Elevation', 'Distance', 'CostPerKm', 'WayTags'],
          ['13850000', '41770000', '1071', '0', '0', ''],
          ['13851000', '41771000', '1080', '120', '0', 'highway=track tracktype=grade2 surface=gravel'],
          ['13852000', '41772000', '1090', '180', '0', 'highway=path sac_scale=mountain_hiking'],
        ],
      },
    },
  ],
};

describe('BRouter', () => {
  it('costruisce l\'indirizzo con i punti e il profilo escursionistico', () => {
    const u = new URL(urlBrouter([[13.85, 41.77], [13.86, 41.78]]));
    expect(u.searchParams.get('lonlats')).toBe('13.850000,41.770000|13.860000,41.780000');
    expect(u.searchParams.get('profile')).toBe('hiking-mountain');
  });

  it('legge i tag e i tratti con le loro distanze', () => {
    expect(leggiTag('highway=path surface=ground')).toEqual({ highway: 'path', surface: 'ground' });
    const r = interpretaBrouter(risposta);
    expect(r.coordinate[0]).toEqual([13.85, 41.77, 1071]);
    expect(r.terreno).toEqual([
      { daM: 0, aM: 120, tag: { highway: 'track', tracktype: 'grade2', surface: 'gravel' } },
      { daM: 120, aM: 300, tag: { highway: 'path', sac_scale: 'mountain_hiking' } },
    ]);
    expect(r.lunghezzaM).toBe(300);
  });

  it('dà errori comprensibili', async () => {
    await expect(calcolaPercorso([[1, 1]])).rejects.toThrow('due punti');
    const lontano = vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'position not mapped in existing datafile' });
    await expect(calcolaPercorso([[1, 1], [2, 2]], { fetchFn: lontano })).rejects.toThrow('troppo lontano');
    expect(() => interpretaBrouter({ features: [] })).toThrow('non ha trovato');
  });
});

describe('esportazione GPX', () => {
  it('scrive un GPX che si rilegge uguale, con le quote', () => {
    const linee = [[[13.85, 41.77, 1071], [13.851, 41.771, 1080.25]], [[13.86, 41.78], [13.87, 41.79]]];
    const testo = creaGpx({ nome: 'Giro <prova> & co', linee });
    expect(testo).toContain('Giro &lt;prova&gt; &amp; co');
    const { geojson, nome } = leggiGpx(testo);
    expect(nome).toBe('Giro <prova> & co');
    expect(geojson.coordinates[0][1]).toEqual([13.851, 41.771, 1080.3]);
    expect(geojson.coordinates[1][0]).toEqual([13.86, 41.78]);
  });

  it('crea un nome di file pulito', () => {
    expect(nomeFileGpx('Anello di Città Sant’Angelo!')).toBe('anello-di-citta-sant-angelo.gpx');
    expect(nomeFileGpx('')).toBe('percorso.gpx');
  });
});
