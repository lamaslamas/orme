import { describe, it, expect, beforeEach } from 'vitest';
import { salvaRisultati, riprendiRisultati, dimenticaRisultati } from '../src/lib/memoriaRisultati.js';
import { migliaia, suUnaRiga, titoloConBadge } from '../src/lib/formato.js';

beforeEach(() => dimenticaRisultati());

describe('ritorno alla lista di Suggerisci', () => {
  it('ritrova la stessa pagina di risultati, lo scorrimento e il sentiero aperto, senza ricalcolare', () => {
    const classifica = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }, { id: 'f' }];
    salvaRisultati({ chiave: 'sabato|giornata', classifica, da: 3, scroll: 240, idAperto: 'e', posizioneTendina: 'meta' });
    const r = riprendiRisultati('sabato|giornata');
    expect(r).toMatchObject({ da: 3, scroll: 240, idAperto: 'e', posizioneTendina: 'meta' });
    expect(r.classifica).toBe(classifica); // gli stessi risultati, non ricalcolati
    expect(riprendiRisultati('sabato|giornata')).toBeNull(); // una volta sola
  });
  it('se le scelte sono cambiate non si riprende niente', () => {
    salvaRisultati({ chiave: 'sabato|giornata', classifica: [], da: 0 });
    expect(riprendiRisultati('domenica|giornata')).toBeNull();
  });
});

describe('altitudine e titoli nella lista', () => {
  it('il punto per le migliaia, durate su una riga', () => {
    expect(migliaia(1240)).toBe('1.240');
    expect(migliaia(962)).toBe('962');
    expect(suUnaRiga('1 h 02')).toBe('1 h 02');
  });
  it('il titolo non ripete il badge', () => {
    expect(titoloConBadge({ codici: ['503A'], nome: 'Sentiero 503A: Fontana Brecce – Percorso 534A' })).toEqual({ badge: '503A', titolo: 'Fontana Brecce – Percorso 534A' });
    expect(titoloConBadge({ codici: ['717'], nome: 'Sentiero 717' })).toEqual({ badge: null, titolo: 'Sentiero 717' });
    expect(titoloConBadge({ codici: ['F1'], nome: 'Monte Amaro' })).toEqual({ badge: 'F1', titolo: 'Monte Amaro' });
    expect(titoloConBadge({ codici: [], nome: 'Altopiano della Cicerana' })).toEqual({ badge: null, titolo: 'Altopiano della Cicerana' });
  });
});
