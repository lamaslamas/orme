// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { versoInvertito, impostaVerso, invertiQuote, specchiaTratto, probabilmenteInvertito } from '../src/lib/verso.js';
import { invertiPercorso, percorsoSentiero } from '../src/lib/tracce.js';
import { baseAndata, misureAR } from '../src/lib/andataRitorno.js';
import { serieDaProfilo } from '../src/lib/profiloCampionato.js';

beforeEach(() => localStorage.clear());

// dalla cima (1810 m) alla sorgente (962 m), come il Sentiero 502 registrato al contrario
const pezzi = [[[15.8, 40.4, 1810], [15.81, 40.4, 1500], [15.82, 40.4, 1200], [15.83, 40.4, 962]]];
const quote = { partenza: { lon: 15.8, lat: 40.4, quota: 1810 }, max: 1810, min: 962, salita: 0, discesa: 848, profilo: [1810, 1500, 1200, 962], impronta: 'x', fonte: 'tinitaly' };

describe('inverti senso', () => {
  it('si ricorda per quel sentiero', () => {
    expect(versoInvertito('s502')).toBe(false);
    impostaVerso('s502', true);
    expect(versoInvertito('s502')).toBe(true);
    impostaVerso('s502', false);
    expect(versoInvertito('s502')).toBe(false);
  });
  it('profilo, salita e discesa, tempi di andata e ritorno si ricalcolano nel verso giusto', () => {
    const prima = misureAR(baseAndata(pezzi));
    const dopo = misureAR(baseAndata(invertiPercorso({ pezzi, salti: [] }).pezzi));
    expect(prima.andata).toMatchObject({ salita: 0, discesa: 848 });
    expect(dopo.andata).toMatchObject({ salita: 848, discesa: 0 }); // ora l'andata sale
    expect(dopo.andata.durataMin).toBeGreaterThan(prima.andata.durataMin); // e ci vuole di più
    expect(dopo.ritorno.durataMin).toBe(prima.andata.durataMin);
    const q = invertiQuote(quote);
    expect(q).toMatchObject({ salita: 848, discesa: 0, profilo: [962, 1200, 1500, 1810] });
    expect(q.partenza.quota).toBe(962);
    // il profilo del robot sui pezzi capovolti parte dal basso
    const grezzi = invertiPercorso(percorsoSentiero({ type: 'MultiLineString', coordinates: pezzi.map((l) => l.map(([x, y]) => [x, y])) })).pezzi;
    expect(serieDaProfilo(grezzi, q.profilo)[0].z).toBe(962);
  });
  it('i tratti in km si vedono dall\'altro capo', () => {
    expect(specchiaTratto({ daKm: 1, aKm: 3, persone: 4 }, 10)).toEqual({ daKm: 7, aKm: 9, persone: 4 });
  });
});

describe('probabilmente invertito', () => {
  it('nome che finisce in cima, traccia che parte dal punto più alto e scende', () => {
    expect(probabilmenteInvertito('Sentiero 502: Sorgente Copone – Monte Volturino', quote)).toEqual({ partenzaQuota: 1810, arrivoQuota: 962, cima: 'Monte Volturino' });
  });
  it('non segnala se la traccia sale, se il nome non va in cima o se mancano le quote', () => {
    expect(probabilmenteInvertito('Sorgente Copone – Monte Volturino', invertiQuote(quote))).toBeNull();
    expect(probabilmenteInvertito('Monte Volturino – Sorgente Copone', quote)).toBeNull();
    expect(probabilmenteInvertito('Valle Prato Rosso', quote)).toBeNull();
    // "da … a …": parte dalla cima e lo dice il nome
    expect(probabilmenteInvertito('Sentiero 00 – da Monte Falco a Passo della Calla', quote)).toBeNull();
    expect(probabilmenteInvertito('Sentiero 4 – da Molino di Bucchio a Monte Falterona', quote)).not.toBeNull();
    expect(probabilmenteInvertito('Sorgente – Monte Volturino', null)).toBeNull();
  });
});
