import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BEL_SENTIERO, linkBelSentiero, leggiPaginaBelSentiero } from '../src/lib/fonti/belSentiero.js';
import { controllaFonte, controllaCandidato } from '../src/lib/fonti/schema.js';
import { mesiDalTesto } from '../src/lib/stagioni.js';

const pagina = (p) => readFileSync(`test/fixtures/belsentiero-${p}.html`, 'utf8');
const url = (p) => `https://www.ilbelsentiero.it/${p}`;

describe('Il Bel Sentiero (PNALM)', () => {
  it('definizione completa, una volta a settimana', () => {
    expect(controllaFonte(BEL_SENTIERO)).toEqual([]);
    expect(BEL_SENTIERO.giorno).toBe(1);
  });
  it('dalla sitemap le pagine, senza contatti e prenotazioni', () => {
    const xml = `<urlset><url><loc>${url('cervi-abruzzo')}</loc></url><url><loc>${url('contatti')}</loc></url><url><loc>${url('copia-di-trekking-asini')}</loc></url><url><loc>https://altro.it/x</loc></url></urlset>`;
    expect(linkBelSentiero(xml)).toEqual([url('cervi-abruzzo')]);
    expect(linkBelSentiero(`<loc>${url('blank-2')}</loc>`)).toEqual([]);
  });
  it('bramito dei cervi: periodo, luoghi e sentieri del programma, niente misure ambigue', () => {
    const c = leggiPaginaBelSentiero(pagina('cervi-abruzzo'), url('cervi-abruzzo'));
    expect(controllaCandidato(c)).toEqual([]);
    expect(c).toMatchObject({ fonte: 'il-bel-sentiero', parco: 'pnalm', nome: 'Il Bramito dei Cervi in Abruzzo', periodo: 'Tra settembre e ottobre' });
    expect(c.animali).toContain('cervo');
    expect(c.testoLuoghi).toMatch(/^Sentieri L1, M1, L4\./);
    expect(c.partenza).toContain('Villetta Barrea');
    // due giorni con misure diverse: meglio nessun dato
    expect(c.lunghezzaKm).toBeUndefined();
    expect(c.dislivelloM).toBeUndefined();
    // niente contatti né crediti delle foto
    expect(JSON.stringify(c)).not.toMatch(/@|3330000000|Ph:/);
  });
  it('bearwatching: "da Aprile a Settembre" resta un intervallo', () => {
    const c = leggiPaginaBelSentiero(pagina('bearwatching-abruzzo'), url('bearwatching-abruzzo'));
    expect(c.periodo).toBe('da Aprile a Settembre');
    expect(mesiDalTesto(c.periodo)).toEqual([4, 5, 6, 7, 8, 9]);
    expect(c.animali[0]).toBe('orso');
  });
  it('gli articoli sulle località (senza scheda tecnica) non sono uscite', () => {
    expect(leggiPaginaBelSentiero(pagina('escursioni-val-fondillo'), url('escursioni-val-fondillo'))).toEqual({ segnaposto: true });
  });
});

import { uscitaSullaFauna } from '../src/lib/fonti/schema.js';
describe('solo le uscite sulla fauna', () => {
  it('animale nel titolo o osservazione nel testo; non un animale citato di passaggio', () => {
    expect(uscitaSullaFauna('Escursione a Monte Meta: il regno del camoscio', '')).toBe(true);
    expect(uscitaSullaFauna('Il tramonto nel Parco', 'Seguirà un appostamento per osservare i cervi')).toBe(true);
    expect(uscitaSullaFauna('Epifania a Pescasseroli: ciaspolata con pranzo', 'nel regno dell\'orso e del lupo')).toBe(false);
  });
});
