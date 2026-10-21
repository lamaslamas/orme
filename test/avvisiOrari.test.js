import { describe, it, expect } from 'vitest';
import { avvisiOrari, giornoOraIniziali } from '../src/lib/quandoAndare.js';

describe('avvisi sugli orari', () => {
  it('partenza già passata: solo quel messaggio', () => {
    expect(avvisiOrari({ oggi: true, partenzaMin: 720, adessoMin: 800, fineMin: 900, tramontoMin: 1092 })).toEqual(['Le 12:00 di oggi sono già passate']);
  });
  it('rientro dopo il tramonto: solo quel messaggio', () => {
    expect(avvisiOrari({ oggi: false, partenzaMin: 720, fineMin: 20 * 60 + 47, tramontoMin: 18 * 60 + 12, conRientro: true })).toEqual(['Rientro alle 20:47, dopo il tramonto (18:12)']);
    expect(avvisiOrari({ partenzaMin: 600, fineMin: 18 * 60, tramontoMin: 18 * 60 + 12 })).toEqual(["Arrivo alle 18:00, a meno di mezz'ora dal tramonto (18:12)"]);
  });
  it('entrambe: tutti e due i messaggi; nessun problema: nessun avviso', () => {
    expect(avvisiOrari({ oggi: true, partenzaMin: 720, adessoMin: 800, fineMin: 1250, tramontoMin: 1092, conRientro: true })).toHaveLength(2);
    expect(avvisiOrari({ oggi: true, partenzaMin: 540, adessoMin: 480, fineMin: 900, tramontoMin: 1092, conRientro: true })).toEqual([]);
  });
});

describe('giorno e ora iniziali della pagina del sentiero', () => {
  const base = { oggi: '2026-10-20', domani: '2026-10-21', oraSolita: '09:00', durataMin: 300, tramontoOggiMin: 18 * 60 + 12 };
  it('da Suggerisci: il giorno e l\'ora scelti lì', () => {
    expect(giornoOraIniziali({ ...base, adessoMin: 600, daSuggerisci: { giorno: '2026-10-24', ora: '15:00' } })).toMatchObject({ giorno: '2026-10-24', ora: '15:00' });
  });
  it('ora solita già passata o senza luce per finire: domani alle 8:00', () => {
    expect(giornoOraIniziali({ ...base, adessoMin: 600 })).toMatchObject({ giorno: '2026-10-21', ora: '08:00', motivo: 'passata' });
    expect(giornoOraIniziali({ ...base, adessoMin: 400, durataMin: 600 })).toMatchObject({ giorno: '2026-10-21', ora: '08:00', motivo: 'luce' });
  });
  it('altrimenti oggi all\'ora solita', () => {
    expect(giornoOraIniziali({ ...base, adessoMin: 400 })).toMatchObject({ giorno: '2026-10-20', ora: '09:00' });
  });
});

describe('«parti entro»: un solo orario, il più restrittivo, con il motivo', () => {
  it('la pioggia chiude prima della luce: vince il meteo', async () => {
    const { partiEntro } = await import('../src/lib/quandoAndare.js');
    const r = partiEntro({ luceMin: 16 * 60 + 21, meteo: { entroMin: 16 * 60, poi: 'è probabile la pioggia' }, tramontoMin: 18 * 60 + 8 });
    expect(r).toMatchObject({ entroMin: 960, motivo: 'meteo' });
    expect(r.testo).toBe('Parti entro le 16:00: dopo è probabile la pioggia (tramonto alle 18:08)');
  });
  it('la luce è più restrittiva: vince la luce', async () => {
    const { partiEntro } = await import('../src/lib/quandoAndare.js');
    const r = partiEntro({ luceMin: 15 * 60 + 33, meteo: { entroMin: 16 * 60, poi: 'è probabile la pioggia' }, tramontoMin: 17 * 60 + 2 });
    expect(r).toMatchObject({ entroMin: 933, motivo: 'luce' });
    expect(r.testo).toBe('Parti entro le 15:33: dopo non finisci con la luce (tramonto alle 17:02, con 30 minuti di margine)');
  });
  it('senza meteo o con il meteo che parla già di luce: la luce', async () => {
    const { partiEntro } = await import('../src/lib/quandoAndare.js');
    expect(partiEntro({ luceMin: 900, meteo: null, tramontoMin: 1080 }).motivo).toBe('luce');
    expect(partiEntro({ luceMin: 900, meteo: { entroMin: 870, poi: "non c'è abbastanza luce per finire" }, tramontoMin: 1080 })).toMatchObject({ motivo: 'luce', entroMin: 870 });
  });
});
