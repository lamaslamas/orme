import { describe, it, expect, afterEach } from 'vitest';
import { nascoste } from '../src/lib/specieNascoste.js';
import { possibilitaFauna, animaliPossibili, puntiSpecie, conFaunaLungoIlPercorso } from '../src/lib/faunaPercorso.js';
import { trattoSenzaNascoste, trattiFauna, specieDelNome } from '../src/lib/trattoFauna.js';
import { specieDelPercorso } from '../src/lib/risultatiSuggerisci.js';
import { parametriInat } from '../src/lib/inaturalist.js';
import { urlSpecieDellaZona, specieDellaZona, ricercheSpecieDellaZona } from '../src/lib/intorno.js';
import { specieDellaZonaPerOsservatori } from '../src/lib/specieZona.js';
import { testoGruppi } from '../src/lib/gruppiFauna.js';

afterEach(() => nascoste.rimettiTutte());

const specie = (animale, osservazioni, livello = 'percorso') => ({ animale, livello, osservazioni, persone: 5, mesi: 'mag', perMese: [0, 0, 0, 0, osservazioni, 0, 0, 0, 0, 0, 0, 0] });
const sentiero = { lunghezzaKm: 10, faunaInat: { km: 10, specie: [specie('cervo', 20), specie('volpe', 6)] } };

describe('specie nascoste: percorsi e fauna', () => {
  it('«Ricco di fauna» e le specie dette non contano le specie nascoste', () => {
    expect(possibilitaFauna(sentiero)).toMatchObject({ livello: 'frequenti', specie: ['cervo', 'volpe'] });
    nascoste.nascondi({ animale: 'cervo' });
    const r = possibilitaFauna(sentiero);
    expect(r.specie).toEqual(['volpe']);
    expect(r.livello).not.toBe('frequenti'); // restano 6 osservazioni: sotto il minimo
    nascoste.nascondi({ animale: 'volpe' });
    expect(possibilitaFauna(sentiero)).toBeNull();
    expect(animaliPossibili(sentiero)).toEqual([]);
    expect(conFaunaLungoIlPercorso(sentiero)).toBe(false);
  });
  it('le specie cercate in Suggerisci e quelle nascoste', () => {
    expect(puntiSpecie(sentiero, 'cervo', 5)?.punti).toBeGreaterThan(0);
    nascoste.nascondi({ animale: 'cervo' });
    expect(puntiSpecie(sentiero, 'cervo', 5)).toBeNull();
    expect(puntiSpecie({ animali: ['cervo'] }, 'cervo', 5)).toBeNull(); // nemmeno dalle uscite delle associazioni
  });
  it('le specie del percorso (nelle card) senza le nascoste', () => {
    expect(specieDelPercorso(sentiero, { migliore: { specie: ['volpe', 'poiana'] } })).toEqual(['volpe', 'poiana', 'cervo']);
    nascoste.nascondi({ animale: 'volpe' });
    nascoste.nascondi({ scientifico: 'Buteo buteo', nome: 'Poiana' });
    expect(specieDelPercorso(sentiero, { migliore: { specie: ['volpe', 'poiana'] } })).toEqual(['cervo']);
  });
  it('le specie della zona (Suggerisci, «Più segnalate»)', () => {
    const oss = Array.from({ length: 4 }, (_, i) => ({ nomeScientifico: 'Egretta garzetta', specie: 'Garzetta', data: '2026-05-10', osservatore: i, animale: null }));
    expect(specieDellaZonaPerOsservatori(oss, 5).map((x) => x.chiave)).toEqual(['Egretta garzetta']);
    nascoste.nascondi({ scientifico: 'Egretta garzetta', nome: 'Garzetta' });
    expect(specieDellaZonaPerOsservatori(oss, 5)).toEqual([]);
  });
});

describe('specie nascoste: tratto con più fauna', () => {
  // 5 km: nel km 0-1 molti osservatori del cervo, nel km 3-4 della volpe
  const tratti = { km: 5, perKm: [4, 4, 0, 3, 3], perKmSpecie: [{ cervo: 4 }, { cervo: 4 }, {}, { volpe: 3 }, { volpe: 3 }], migliore: { daKm: 0, aKm: 2, persone: 8, specie: ['cervo'] } };
  it('senza specie nascoste è il tratto di prima', () => {
    expect(trattoSenzaNascoste(tratti)).toBe(tratti.migliore);
  });
  it('con una specie nascosta il tratto si rifà sulle altre', () => {
    nascoste.nascondi({ animale: 'cervo' });
    expect(trattoSenzaNascoste(tratti)).toEqual({ daKm: 3, aKm: 5, persone: 6, specie: ['volpe'] });
    nascoste.nascondi({ animale: 'volpe' });
    expect(trattoSenzaNascoste(tratti)).toBeNull();
  });
  it('dati di prima (senza i conti per specie): il tratto resta se gli resta una specie', () => {
    const vecchi = { km: 5, perKm: [2], migliore: { daKm: 0, aKm: 2, persone: 4, specie: ['cervo', 'volpe', 'poiana'] } };
    nascoste.nascondi({ animale: 'cervo' });
    expect(trattoSenzaNascoste(vecchi).specie).toEqual(['volpe', 'poiana']);
    nascoste.nascondi({ animale: 'volpe' });
    nascoste.nascondi({ scientifico: 'Buteo buteo' });
    expect(trattoSenzaNascoste(vecchi)).toBeNull();
    expect(specieDelNome('poiana')).toEqual({ scientifico: 'Buteo buteo' });
    expect(specieDelNome('lupo')).toEqual({ animale: 'lupo' });
  });
  it('trattiFauna salva anche i conti per specie', () => {
    const pezzi = [[[13, 41], [13, 41.06]]]; // ~6,7 km
    const o = (osservatore, lat) => ({ animale: 'lupo', lat, lon: 13, osservatore, data: '2026-05-01' });
    const r = trattiFauna([o(1, 41.001), o(2, 41.002), o(3, 41.003)], pezzi);
    expect(r.perKmSpecie[0]).toEqual({ lupo: 3 });
    expect(r.perKmSpecie.length).toBe(r.perKm.length);
  });
});

describe('specie nascoste: heatmap e «Cosa vedere qui»', () => {
  it('la heatmap di iNaturalist lascia fuori i taxon nascosti, insieme alle altre esclusioni', () => {
    const p = parametriInat({ specie: 'notevoli', escludiInat: [42048, 204113] });
    expect(p.get('without_taxon_id')).toBe('42048,204113');
    const rare = parametriInat({ specie: 'notevoli', gruppi: ['rare'], escludiInat: [42048] });
    expect(rare.get('without_taxon_id').split(',')).toContain('42048');
    expect(rare.get('without_taxon_id').split(',').length).toBeGreaterThan(1); // più gli esclusi delle rare
    expect(parametriInat({ specie: 'notevoli' }).has('without_taxon_id')).toBe(false);
  });
  it('«Cosa vedere qui»: la ricerca chiede senza i nascosti e la lista non li ha, nemmeno da una risposta di prima', () => {
    expect(urlSpecieDellaZona([13, 41], 10, ['selvatici'], { escludiInat: [42048] })).toContain('without_taxon_id=42048');
    nascoste.nascondi({ animale: 'lupo' });
    expect(ricercheSpecieDellaZona([13, 41], 10, ['selvatici'])[0]).toContain('without_taxon_id=42048');
    const risposta = { results: [{ count: 9, taxon: { id: 42048, name: 'Canis lupus', preferred_common_name: 'lupo' } }, { count: 3, taxon: { id: 42069, name: 'Vulpes vulpes', preferred_common_name: 'volpe' } }] };
    expect(specieDellaZona([risposta]).map((x) => x.scientifico)).toEqual(['Vulpes vulpes']);
  });
  it('la barra della Fauna dice quante sono nascoste', () => {
    expect(testoGruppi(['selvatici'], 0)).toBe('Tutti gli animali');
    expect(testoGruppi(['selvatici'], 5)).toBe('Tutti gli animali · 5 nascoste');
    expect(testoGruppi(['rare'], 1)).toBe('Solo rare · 1 nascosta');
  });
});
