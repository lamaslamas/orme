import { describe, it, expect } from 'vitest';
import { candidatoUscita, controllaCandidato, controllaFonte, attesaTraLePagine } from '../src/lib/fonti/schema.js';
import { ASSOCIAZIONI } from '../src/lib/fonti/associazioni.js';

const def = { fonte: 'prova', organizzatore: 'Guide del Parco', parco: 'pnalm', elenco: 'https://esempio.it/uscite', link: () => [], leggi: () => null };

describe('schema comune delle fonti', () => {
  it('candidato completo dalle sole informazioni della pagina, senza dati personali', () => {
    const c = candidatoUscita(def, {
      url: 'https://esempio.it/uscite/lupi',
      nome: 'Sulle tracce del lupo',
      descrizione: 'Escursione al tramonto. Info: mario@esempio.it, 333 1234567',
      testo: 'Ottobre e novembre. 8 km, dislivello 300 m. Lupo e cervo.',
      partenza: 'Piazza del paese',
    });
    expect(c).toMatchObject({ fonte: 'prova', tipo: 'uscita_guidata', id: 'prova-sulle-tracce-del-lupo', organizzatore: 'Guide del Parco', parco: 'pnalm', partenza: 'Piazza del paese' });
    expect(c.descrizione).not.toMatch(/mario|333/);
    expect(c.animali).toEqual(expect.arrayContaining(['lupo', 'cervo']));
    expect(c.periodo).toMatch(/Ottobre/);
    expect(controllaCandidato(c)).toEqual([]);
  });

  it('segnala campi mancanti e dati personali', () => {
    expect(controllaCandidato({ nome: 'x' })).toContain('manca url');
    const c = candidatoUscita(def, { url: 'https://esempio.it/a', nome: 'A' });
    expect(controllaCandidato({ ...c, partenza: 'chiama 333 1234567' })).toContain('contiene email o telefoni');
  });

  it('definizioni delle fonti complete e attesa minima tra le pagine', () => {
    for (const d of ASSOCIAZIONI) expect(controllaFonte(d)).toEqual([]);
    expect(controllaFonte({ fonte: 'x' })).toEqual(expect.arrayContaining(['elenco', 'link', 'leggi']));
    expect(attesaTraLePagine(def)).toBe(5000);
    expect(attesaTraLePagine({ attesaMs: 10_000 }, 20_000)).toBe(20_000);
  });
});
