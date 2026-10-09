import { describe, it, expect } from 'vitest';
import { cercaParchiESpecie, riepilogoSpecie, osservazionePerParco, diOsservazione, specieDaMostrare } from '../src/lib/home.js';
import { filtraSentieri, FILTRI_VUOTI } from '../src/lib/filtri.js';

const sentieri = [
  { id: 'a', nome: 'Val Fondillo', parco: 'pnalm', animali: ['lupo', 'orso'], osservazione: true },
  { id: 'b', nome: 'Tramazzo', parco: 'foreste-casentinesi', animali: ['lupo'], organizzatori: ['Romagna Selvatica'] },
  { id: 'c', nome: 'Coppa (MTB)', parco: 'pnalm', animali: [], osservazione: false },
  { id: 'd', nome: 'Senza flag', parco: 'pnalm', animali: ['camoscio'] },
];

describe('ricerca', () => {
  it('trova parchi e animali da qualunque parola', () => {
    expect(cercaParchiESpecie('lupo casentinesi')).toEqual({ parchi: ['foreste-casentinesi'], specie: ['lupo'] });
    expect(cercaParchiESpecie('abruzzo')).toEqual({ parchi: ['pnalm', 'majella'], specie: [] });
    expect(cercaParchiESpecie('  ')).toEqual({ parchi: [], specie: [] });
  });

  it('nei percorsi cerca anche parco, animali e organizzatori, parole in qualunque ordine', () => {
    const cerca = (testo) => filtraSentieri(sentieri, { ...FILTRI_VUOTI, testo }).map((s) => s.id);
    expect(cerca('casentinesi lupo')).toEqual(['b']);
    expect(cerca('selvatica')).toEqual(['b']);
    expect(cerca('orso')).toEqual(['a']);
    expect(cerca('pnalm camoscio')).toEqual(['d']);
  });
});

describe('osservazione', () => {
  it('un percorso è di osservazione per il flag o, se manca, per gli animali', () => {
    expect(sentieri.map(diOsservazione)).toEqual([true, true, false, true]);
  });

  it('conta i percorsi per animale e li divide per parco', () => {
    const lupo = riepilogoSpecie(sentieri).find((r) => r.animale === 'lupo');
    expect(lupo).toMatchObject({ nome: 'Lupo', percorsi: 2 });
    expect(lupo.parchi).toContain('foreste-casentinesi');
    expect(osservazionePerParco(sentieri, 'lupo').map((g) => [g.parco, g.percorsi.map((s) => s.id)])).toEqual([
      ['pnalm', ['a']],
      ['foreste-casentinesi', ['b']],
    ]);
    expect(osservazionePerParco(sentieri).find((g) => g.parco === 'pnalm').percorsi.map((s) => s.id)).toEqual(['a', 'd']);
  });
});

describe('animali da mostrare', () => {
  it('nasconde quelli senza percorsi, salvo quelli scelti o cercati', () => {
    const r = [
      { animale: 'lupo', percorsi: 3 },
      { animale: 'gufo_reale', percorsi: 0 },
      { animale: 'lontra', percorsi: 0 },
    ];
    expect(specieDaMostrare(r).map((x) => x.animale)).toEqual(['lupo']);
    expect(specieDaMostrare(r, ['lontra']).map((x) => x.animale)).toEqual(['lupo', 'lontra']);
  });
});

describe('filtro valore panoramico', () => {
  it('tiene solo i percorsi con indice almeno uguale alla soglia', () => {
    const lista = [
      { id: 'a', nome: 'A', panorama: { punteggio: 80 } },
      { id: 'b', nome: 'B', panorama: { punteggio: 45 } },
      { id: 'c', nome: 'C' },
    ];
    expect(filtraSentieri(lista, { ...FILTRI_VUOTI, panorama: '50' }).map((s) => s.id)).toEqual(['a']);
    expect(filtraSentieri(lista, { ...FILTRI_VUOTI, panorama: '' }).map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });
});
