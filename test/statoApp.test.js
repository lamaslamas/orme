import { describe, it, expect } from 'vitest';
import { creaStato, filtriAttiviStato, STATO_INIZIALE } from '../src/lib/statoApp.js';

const memoria = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};

describe('stato condiviso', () => {
  it('unisce le modifiche annidate e avvisa chi ascolta', () => {
    const s = creaStato(memoria());
    const ricevuti = [];
    s.ascolta((nuovo, vecchio) => ricevuti.push([vecchio.specie, nuovo.specie]));
    s.imposta({ specie: 'cervo', filtri: { stato: 'fatto' } });
    expect(s.leggi().filtri).toEqual({ ...STATO_INIZIALE.filtri, stato: 'fatto' });
    expect(ricevuti).toEqual([['', 'cervo']]);
  });

  it('si conserva tra una schermata e l\'altra', () => {
    const m = memoria();
    creaStato(m).imposta({ parco: 'pnalm', heatmap: { stagione: 'autunno' } });
    const di_nuovo = creaStato(m).leggi();
    expect(di_nuovo.parco).toBe('pnalm');
    expect(di_nuovo.heatmap).toEqual({ ...STATO_INIZIALE.heatmap, stagione: 'autunno' });
  });

  it('azzera i filtri e conta quelli attivi', () => {
    const s = creaStato(memoria());
    s.imposta({ parco: 'pnalm', specie: 'lupo', filtri: { stato: 'fatto' } });
    expect(filtriAttiviStato(s.leggi())).toBe(3);
    expect(filtriAttiviStato(s.leggi(), { contaParco: false })).toBe(2);
    s.azzeraFiltri();
    expect(filtriAttiviStato(s.leggi())).toBe(1);
  });

  it('funziona anche senza memoria o con memoria rotta', () => {
    expect(creaStato(null).leggi().attivita).toBe('trekking');
    expect(creaStato({ getItem: () => '{rotto', setItem: () => {} }).leggi().specie).toBe('');
  });
});

import { parametriInat } from '../src/lib/inaturalist.js';
import { STATO_INIZIALE as S } from '../src/lib/statoApp.js';

describe('heatmap e stato', () => {
  it('le impostazioni della heatmap nello stato non vengono scambiate per un gruppo iNaturalist', () => {
    const p = parametriInat({ ...S.heatmap, specie: 'lupo' });
    expect(p.get('taxon_id')).toBe('42048');
    expect(p.has('iconic_taxa')).toBe(false);
  });
});
