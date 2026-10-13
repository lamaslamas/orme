import { describe, it, expect } from 'vitest';
import { mesiDalTesto, mesiUscita, testoMesi, temaUscita, gruppiPerStagione } from '../src/lib/stagioni.js';

const uscita = (animali, periodo, date = []) => ({ animali, escursione: { nomeUscita: 'x', associazione: 'y', periodo, date } });

describe('uscite per animale e periodo dell\'anno', () => {
  it('legge intervalli ed elenchi di mesi', () => {
    expect(mesiDalTesto('Novembre – gennaio')).toEqual([1, 11, 12]);
    expect(mesiDalTesto('da settembre a ottobre')).toEqual([9, 10]);
    expect(mesiDalTesto('Settembre (calendario Ecotur)')).toEqual([9]);
    expect(mesiDalTesto('Luglio, Settembre')).toEqual([7, 9]);
    expect(mesiDalTesto('')).toEqual([]);
  });
  it('unisce periodo e date di qualsiasi anno', () => {
    expect(mesiUscita(uscita(['lupo'], 'Novembre', ['2026-12-05', '2027-01-02']))).toEqual([1, 11, 12]);
  });
  it('scrive i mesi consecutivi come intervallo, anche a cavallo dell\'anno', () => {
    expect(testoMesi([1, 11, 12])).toBe('nov–gen');
    expect(testoMesi([9])).toBe('set');
    expect(testoMesi([7, 9, 10])).toBe('lug, set–ott');
    expect(testoMesi([])).toBe('');
    expect(testoMesi([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe("tutto l'anno");
  });
  it('il cervo in autunno è il bramito; senza animali è natura', () => {
    expect(temaUscita(uscita(['cervo'], 'Settembre – ottobre')).nome).toBe('Bramito del cervo');
    expect(temaUscita(uscita(['cervo'], 'Maggio')).nome).toBe('Cervo');
    expect(temaUscita(uscita(['lupo', 'volpe'], 'Luglio')).nome).toBe('Lupo');
    expect(temaUscita(uscita([], 'Luglio')).nome).toBe('Natura');
  });
  it('gruppi con il periodo di tutte le uscite, prima quello che arriva', () => {
    const g = gruppiPerStagione(
      [uscita(['lupo'], 'Novembre – gennaio'), uscita(['lupo'], 'Settembre'), uscita(['orso'], 'Ottobre'), uscita(['cervo'], 'Settembre'), uscita([], 'Luglio')],
      10,
    );
    expect(g.map((x) => x.titolo)).toEqual(['Orso · ott', 'Lupo · set, nov–gen', 'Bramito del cervo · set', 'Natura · lug']);
    expect(g[1].uscite).toHaveLength(2);
  });
});

describe('tema dal titolo', () => {
  it('vale l\'animale nominato nel titolo', () => {
    const s = { nome: 'Il Bramito dei Cervi in Abruzzo', animali: ['camoscio', 'cervo'], escursione: { nomeUscita: 'Il Bramito dei Cervi in Abruzzo', periodo: 'Tra settembre e ottobre' } };
    expect(temaUscita(s).nome).toBe('Bramito del cervo');
  });
});

describe('bramito dal titolo', () => {
  it('anche senza periodo', () => {
    expect(temaUscita({ nome: 'Il bramito dei cervi su richiesta', animali: ['cervo'], escursione: { nomeUscita: 'Il bramito dei cervi su richiesta' } }).nome).toBe('Bramito del cervo');
  });
});
