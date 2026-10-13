import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PARCO_MAJELLA, linkEventiMajella, leggiEventoMajella } from '../src/lib/fonti/parcoMajella.js';
import { controllaFonte, controllaCandidato } from '../src/lib/fonti/schema.js';
import { mesiUscita } from '../src/lib/stagioni.js';

const pagina = (p) => readFileSync(`test/fixtures/majella-${p}.html`, 'utf8');

describe('Ente Parco Majella', () => {
  it('definizione completa', () => {
    expect(controllaFonte(PARCO_MAJELLA)).toEqual([]);
  });
  it('gli eventi del calendario, senza le altre pagine', () => {
    const link = linkEventiMajella(pagina('home'));
    expect(link.length).toBeGreaterThan(3);
    expect(link.every((u) => u.startsWith('https://www.parcomajella.it/') && u.endsWith('.htm'))).toBe(true);
    expect(link.some((u) => /Contatti/.test(u))).toBe(false);
  });
  it('lupi a Pretoro: date, comune, punto d\'incontro, difficoltà; niente categorie né telefoni', () => {
    const u = 'https://www.parcomajella.it/con-i-lupi-del-geoparco-unesco-della-maiella.htm';
    const c = leggiEventoMajella(pagina('lupi'), u);
    expect(controllaCandidato(c)).toEqual([]);
    expect(c).toMatchObject({ fonte: 'parco-majella', parco: 'majella', nome: 'Con i Lupi del Geoparco Unesco della Maiella', paese: 'Pretoro', difficolta: 'T', animali: ['lupo'] });
    expect(c.date).toEqual(['2026-09-24', '2026-09-30', '2026-10-03', '2026-10-10', '2026-10-24', '2026-10-31']);
    expect(c.partenza).toContain('Pretoro');
    expect(c.lunghezzaKm).toBeUndefined(); // 42 m nell'area faunistica: non è un percorso in km
    expect(JSON.stringify(c)).not.toMatch(/NOME COGNOME|333 000|WhatsApp/);
    // il periodo viene dalle date
    expect(mesiUscita({ escursione: { periodo: c.periodo, date: c.date } })).toEqual([9, 10]);
  });
  it('lo stesso evento ripetuto ("-1.htm") ha lo stesso id', () => {
    const a = leggiEventoMajella(pagina('lupi'), 'https://www.parcomajella.it/con-i-lupi-del-geoparco-unesco-della-maiella.htm');
    const b = leggiEventoMajella(pagina('lupi'), 'https://www.parcomajella.it/con-i-lupi-del-geoparco-unesco-della-maiella-1.htm');
    expect(a.id).toBe(b.id);
  });
  it('gli eventi senza fauna si saltano', () => {
    expect(leggiEventoMajella(pagina('vallone'), 'https://www.parcomajella.it/x.htm')).toEqual({ segnaposto: true });
  });
});
