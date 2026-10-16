import { describe, it, expect } from 'vitest';
import { eDomestico } from '../src/lib/domestici.js';
import { specieDellaZona, urlSpecieDellaZona } from '../src/lib/intorno.js';
import { parametriInat } from '../src/lib/inaturalist.js';

describe('animali domestici', () => {
  it('cane, gatto, galline, cavalli… sì; lupo, muflone, cinghiale, capra selvatica no', () => {
    for (const s of ['Canis lupus familiaris', 'Canis familiaris', 'Felis catus', 'Gallus gallus domesticus', 'Equus caballus', 'Equus asinus', 'Bos taurus', 'Ovis aries', 'Capra hircus', 'Sus scrofa domesticus', 'Anas platyrhynchos domesticus']) expect(eDomestico({ scientifico: s })).toBe(true);
    for (const s of ['Canis lupus', 'Canis lupus italicus', 'Felis silvestris', 'Ovis aries musimon', 'Sus scrofa', 'Capra ibex', 'Capra aegagrus', 'Anas platyrhynchos', 'Rupicapra pyrenaica', 'Vulpes vulpes']) expect(eDomestico({ scientifico: s })).toBe(false);
  });
  it('anche dal nome comune in italiano', () => {
    expect(eDomestico({ nome: 'Cane' })).toBe(true);
    expect(eDomestico({ nome: ' Gatto domestico ' })).toBe(true);
    expect(eDomestico({ nome: 'Lupo' })).toBe(false);
    expect(eDomestico({})).toBe(false);
  });
});

describe('"Cosa vedere qui" senza domestici', () => {
  const taxon = (id, name, comune) => ({ count: 100 - id, taxon: { id, name, preferred_common_name: comune, ancestor_ids: [3], iconic_taxon_name: 'Mammalia' } });
  it('il cane non compare tra le specie della zona', () => {
    const s = specieDellaZona([{ results: [taxon(1, 'Canis lupus familiaris', 'cane'), taxon(2, 'Vulpes vulpes', 'volpe rossa'), taxon(3, 'Felis catus', 'gatto domestico')] }]);
    expect(s.map((x) => x.scientifico)).toEqual(['Vulpes vulpes']);
  });
  it('le ricerche chiedono solo osservazioni in natura (captive=false)', () => {
    expect(new URL(urlSpecieDellaZona([18, 40], 25, ['mammiferi'])).searchParams.get('captive')).toBe('false');
    expect(parametriInat({ specie: 'lupo' }).get('captive')).toBe('false');
  });
});
