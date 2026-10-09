import { describe, it, expect } from 'vitest';
import { parametriInat, urlTileHeatmap, urlOsservazioni, interpretaOsservazioni, SPECIE_RARE, FILTRI_INAT_PREDEFINITI } from '../src/lib/inaturalist.js';
import { TAXON_INATURALIST } from '../src/lib/costanti.js';

const oggi = new Date('2026-10-08');

describe('parametri iNaturalist', () => {
  it('specie rare: tutti gli id della lista curata, solo verificate', () => {
    const p = parametriInat(FILTRI_INAT_PREDEFINITI, oggi);
    expect(p.get('taxon_id').split(',')).toHaveLength(SPECIE_RARE.length);
    expect(p.get('taxon_id')).toContain(String(TAXON_INATURALIST.orso.id));
    expect(p.get('quality_grade')).toBe('research');
    expect(p.has('month')).toBe(false);
  });

  it('una specie, stagione e ultimi anni', () => {
    const p = parametriInat({ specie: 'lupo', stagione: 'inverno', anni: 5, soloVerificate: false }, oggi);
    expect(p.get('taxon_id')).toBe('42048');
    expect(p.get('month')).toBe('12,1,2');
    expect(p.get('d1')).toBe('2021-01-01');
    expect(p.has('quality_grade')).toBe(false);
  });

  it('specie minacciate usa il filtro di iNaturalist', () => {
    const p = parametriInat({ ...FILTRI_INAT_PREDEFINITI, specie: 'minacciate' }, oggi);
    expect(p.get('threatened')).toBe('true');
    expect(p.has('taxon_id')).toBe(false);
  });

  it('costruisce gli indirizzi di tile e ricerche', () => {
    expect(urlTileHeatmap(FILTRI_INAT_PREDEFINITI, oggi)).toMatch(/^https:\/\/api\.inaturalist\.org\/v1\/heatmap\/\{z\}\/\{x\}\/\{y\}\.png\?/);
    const u = new URL(urlOsservazioni([41.7, 13.8, 41.8, 13.9], FILTRI_INAT_PREDEFINITI, { oggi }));
    expect(u.searchParams.get('swlat')).toBe('41.70000');
    expect(u.searchParams.get('nelng')).toBe('13.90000');
    expect(u.searchParams.get('per_page')).toBe('30');
  });
});

describe('osservazioni', () => {
  it('legge specie (in italiano se nella lista), data, foto, posizione sfumata e link', () => {
    const [o] = interpretaOsservazioni({
      results: [
        {
          id: 9,
          location: '41.75,13.85',
          observed_on: '2026-08-21',
          obscured: true,
          quality_grade: 'research',
          license_code: 'cc-by-nc',
          uri: 'https://www.inaturalist.org/observations/9',
          taxon: { id: 333549, name: 'Canis lupus italicus', ancestor_ids: [1, 42048, 333549] },
          photos: [{ url: 'https://x/square.jpg', attribution: '(c) Persona, some rights reserved (CC BY-NC)', license_code: 'cc-by-nc' }],
          user: { login: 'persona' },
        },
      ],
    });
    expect(o).toMatchObject({ id: 9, animale: 'lupo', specie: 'Lupo', data: '2026-08-21', sfumata: true, lat: 41.75, verificata: true });
    expect(o.foto.attribuzione).toContain('CC BY-NC');
    expect(JSON.stringify(o)).not.toContain('persona"');
  });
});

describe('foto', () => {
  it('mostra solo foto con licenza Creative Commons', () => {
    const [con, senza] = interpretaOsservazioni({
      results: [
        { id: 1, taxon: {}, photos: [{ url: 'a', attribution: '(c) A', license_code: 'cc-by' }] },
        { id: 2, taxon: {}, photos: [{ url: 'b', attribution: '(c) B, all rights reserved', license_code: null }] },
      ],
    });
    expect(con.foto.url).toBe('a');
    expect(senza.foto).toBeNull();
  });
});
