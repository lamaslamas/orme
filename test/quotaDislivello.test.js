// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { intervalloDi, testoIntervallo, testoValore, testoQuota, testoSalita, passaQuotaDislivello, qdAttivo, leggiQd, salvaQd, CHIAVE_QD_ELENCHI, QD_VUOTO } from '../src/lib/quotaDislivello.js';
import { preparaPercorsi, filtraPercorsi } from '../src/lib/motore.js';
import { FILTRI_VUOTI } from '../src/lib/filtri.js';
import { valuta, SCELTE_PREDEFINITE, spiegaNessunRisultato } from '../src/lib/suggerimenti.js';

const memoria = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};

describe('intervalli', () => {
  it('estremi: spento', () => {
    expect(testoIntervallo(0, 3000, 'quota')).toBe('');
    expect(testoIntervallo(0, 2000, 'salita')).toBe('');
    expect(qdAttivo({ quota: testoIntervallo(0, 1200, 'quota'), salita: '' })).toBe(true);
    expect(qdAttivo({ quota: '', salita: '' })).toBe(false);
  });
  it('lettura e scambio dei cursori', () => {
    expect(intervalloDi('', 'quota')).toEqual([0, 3000]);
    expect(intervalloDi('1800-3000', 'quota')).toEqual([1800, 3000]);
    expect(testoIntervallo(800, 300, 'salita')).toBe('300-800');
  });
  it('il valore in chiaro', () => {
    expect(testoQuota({ quota: '0-1200' })).toBe('Quota massima: fino a 1.200 m');
    expect(testoQuota({ quota: '1800-3000' })).toBe('Quota massima: da 1.800 m');
    expect(testoQuota({ quota: '' })).toBe('Quota massima: qualsiasi');
    expect(testoSalita({ salita: '300-800' })).toBe('Dislivello: 300–800 m');
    expect(testoValore('1000-2000', 'quota')).toBe('1.000–2.000 m');
  });
});

describe('filtro', () => {
  it('quota massima: il punto più alto nell\'intervallo, estremi compresi', () => {
    const c = { quota: '0-1200' };
    expect(passaQuotaDislivello(c, { quotaMax: 1200 })).toBe(true);
    expect(passaQuotaDislivello(c, { quotaMax: 1250 })).toBe(false);
    expect(passaQuotaDislivello({ quota: '1800-3000' }, { quotaMax: 1800 })).toBe(true);
    expect(passaQuotaDislivello({ quota: '1800-3000' }, { quotaMax: 1750 })).toBe(false);
  });
  it('dislivello in salita', () => {
    const c = { salita: '300-800' };
    expect(passaQuotaDislivello(c, { salita: 500 })).toBe(true);
    expect(passaQuotaDislivello(c, { salita: 100 })).toBe(false);
    expect(passaQuotaDislivello(c, { salita: 900 })).toBe(false);
  });
  it('senza dati: esclusi se il filtro è acceso, inclusi con la scelta; spento non esclude nessuno', () => {
    expect(passaQuotaDislivello({ quota: '0-1200' }, { quotaMax: null })).toBe(false);
    expect(passaQuotaDislivello({ quota: '0-1200', senzaQuote: 'si' }, { quotaMax: null })).toBe(true);
    expect(passaQuotaDislivello({ quota: '', salita: '' }, {})).toBe(true);
    expect(passaQuotaDislivello({ quota: '', salita: '300-800' }, { quotaMax: null, salita: 400 })).toBe(true);
  });
  it('negli elenchi (motore)', () => {
    const sentieri = [
      { id: 'a', nome: 'A', dislivelloM: 200, bici: { consentita: 'si' } },
      { id: 'b', nome: 'B', dislivelloM: 900, bici: { consentita: 'si' } },
      { id: 'c', nome: 'C', bici: { consentita: 'si' } },
    ];
    const p = preparaPercorsi(sentieri, new Map()).map((x) => ({ ...x, misure: { ...x.misure, quotaMax: { a: 1100, b: 1900, c: null }[x.sentiero.id] } }));
    const ids = (f) => filtraPercorsi(p, { ...FILTRI_VUOTI, ...f }).map((x) => x.sentiero.id);
    expect(ids({ quota: '0-1200' })).toEqual(['a']);
    expect(ids({ quota: '1800-3000' })).toEqual(['b']);
    expect(ids({ quota: '0-1200', senzaQuote: 'si' })).toEqual(['a', 'c']);
    expect(ids({ salita: '300-1000' })).toEqual(['b']);
    expect(ids({})).toEqual(['a', 'b', 'c']);
  });
});

describe('memoria separata', () => {
  it('elenchi e Suggerisci non si mescolano', () => {
    const m = memoria();
    salvaQd(CHIAVE_QD_ELENCHI, { quota: '0-1200', salita: '', senzaQuote: 'si' }, m);
    expect(leggiQd(CHIAVE_QD_ELENCHI, m)).toEqual({ quota: '0-1200', salita: '', senzaQuote: 'si' });
    expect(leggiQd('orme.suggerisci.quotaDislivello', m)).toEqual(QD_VUOTO);
    expect(leggiQd('x', { getItem: () => '{rotto' })).toEqual(QD_VUOTO);
  });
});

describe('Suggerisci', () => {
  const c = { misure: { km: 8, salita: 450, durataMin: 200 }, anello: false, difficolta: 'E', quotaMax: 1300, auto: { lineaKm: 30, minuti: 45 } };
  it('esclude per quota e dislivello', () => {
    expect(valuta(c, SCELTE_PREDEFINITE)).not.toBeNull();
    expect(valuta(c, { ...SCELTE_PREDEFINITE, quota: '0-1200' })).toBeNull();
    expect(valuta(c, { ...SCELTE_PREDEFINITE, quota: '0-1400' })).not.toBeNull();
    expect(valuta(c, { ...SCELTE_PREDEFINITE, salita: '500-1000' })).toBeNull();
    expect(valuta({ ...c, quotaMax: null }, { ...SCELTE_PREDEFINITE, quota: '0-1400' })).toBeNull();
    expect(valuta({ ...c, quotaMax: null }, { ...SCELTE_PREDEFINITE, quota: '0-1400', senzaQuote: 'si' })).not.toBeNull();
  });
  it('nessun risultato: il filtro di quota è il motivo e si può allargare', () => {
    const r = spiegaNessunRisultato('mezza giornata', [
      { chiave: 'quota', etichetta: 'Senza il limite di quota', n: 9, motivo: 'la quota massima scelta (fino a 1.200 m) li esclude', variante: { quota: '' } },
      { chiave: 'fatica', etichetta: 'Con qualsiasi fatica', n: 2, motivo: 'x' },
    ]);
    expect(r.testo).toBe('Nessun percorso con mezza giornata: la quota massima scelta (fino a 1.200 m) li esclude.');
    expect(r.alternative[0].testo).toBe('Senza il limite di quota ne trovo 9');
    expect(r.alternative[0].variante).toEqual({ quota: '' });
  });
});
