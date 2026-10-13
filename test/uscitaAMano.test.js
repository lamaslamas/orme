import { describe, it, expect } from 'vitest';
import { uscitaAMano, urlLuogoNelParco } from '../src/lib/uscitaAMano.js';
import { eUscita } from '../src/lib/filtri.js';
import { mesiUscita, temaUscita } from '../src/lib/stagioni.js';

const campi = {
  titolo: 'Bramito al Piano Ruggio',
  associazione: 'Guide del Pollino',
  animale: 'cervo',
  periodo: 'settembre – ottobre',
  parco: 'pollino',
  ritrovo: 'Colle Impiso',
  link: 'https://esempio.it/programma',
  testo: 'Partenza da Colle Impiso verso Piano Ruggio. Info: guida.pollino@esempio.it, tel 333 1234567. Guida: Mario Rossi.',
};

describe('uscita aggiunta a mano', () => {
  it('diventa un\'uscita come quelle importate, con stagione e tema', () => {
    const { errori, sentiero: s } = uscitaAMano(campi, { oggi: '2026-10-13', caso: () => 0.5 });
    expect(errori).toEqual([]);
    expect(s.id).toMatch(/^mano-bramito-al-piano-ruggio-/);
    expect(s).toMatchObject({ parco: 'pollino', parchi: ['pollino'], tipoPercorso: 'uscita_guidata', manuale: { data: '2026-10-13' }, animali: ['cervo'] });
    expect(s.escursione).toMatchObject({ associazione: 'Guide del Pollino', nomeUscita: 'Bramito al Piano Ruggio', periodo: 'settembre – ottobre', url: 'https://esempio.it/programma' });
    expect(s.partenza.paese).toBe('Colle Impiso');
    expect(eUscita(s)).toBe(true);
    expect(mesiUscita(s)).toEqual([9, 10]);
    expect(temaUscita(s).nome).toBe('Bramito del cervo');
  });
  it('niente email, telefoni o nomi delle guide nel testo', () => {
    const { sentiero: s } = uscitaAMano(campi);
    expect(s.descrizione).not.toMatch(/@|333|Mario/);
    expect(s.descrizione).toContain('Piano Ruggio');
  });
  it('controlla i campi obbligatori e il link', () => {
    expect(uscitaAMano({ ...campi, titolo: ' ', parco: '' }).errori).toEqual(["Scrivi il titolo dell'uscita.", 'Scegli il parco.']);
    expect(uscitaAMano({ ...campi, link: 'esempio.it' }).errori).toEqual(['Il link deve iniziare con http:// o https://.']);
  });
  it('cerca i luoghi solo nel riquadro del parco', () => {
    const u = new URL(urlLuogoNelParco('Colle Impiso', [39.8, 15.9, 40.1, 16.4]));
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ q: 'Colle Impiso', bounded: '1', viewbox: '15.9,40.1,16.4,39.8' });
  });
});
