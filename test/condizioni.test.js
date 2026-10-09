import { describe, it, expect } from 'vitest';
import {
  puntoMeteo,
  urlPrevisioni,
  giorniDaRisposta,
  valutaFinestra,
  giudicaGiornata,
  durataConSoste,
  durataInBici,
  quotaFangosa,
  riassuntoParco,
  nellaDurata,
  mesiDaTesto,
  animaliDelMese,
  MAX_LUOGHI_RICHIESTA,
  datiPerMeteo,
  giornoAllaQuota,
  ordinaClassifica,
} from '../src/lib/condizioni.js';
import { profiloQuote } from '../src/lib/profiloQuote.js';

// Risposta Open-Meteo finta: 3 giorni passati + oggi + domani, valori uguali in ogni ora
// salvo quelli cambiati da modifica(ora, giornoIndice)
function risposta(base = {}, modifica = () => ({})) {
  const giorni = ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'];
  const time = [];
  const valori = {};
  const campi = {
    temperature_2m: 12,
    apparent_temperature: 10,
    precipitation_probability: 0,
    precipitation: 0,
    weather_code: 1,
    wind_gusts_10m: 15,
    snowfall: 0,
    snow_depth: 0,
    freezing_level_height: 3000,
    cloud_cover: 20,
    ...base,
  };
  for (const k of Object.keys(campi)) valori[k] = [];
  giorni.forEach((g, gi) => {
    for (let h = 0; h < 24; h++) {
      time.push(`${g}T${String(h).padStart(2, '0')}:00`);
      const m = modifica(h, gi);
      for (const k of Object.keys(campi)) valori[k].push(m[k] ?? campi[k]);
    }
  });
  return {
    hourly: { time, ...valori },
    daily: { time: giorni, sunrise: giorni.map((g) => `${g}T07:10`), sunset: giorni.map((g) => `${g}T18:40`) },
  };
}
const domani = (r) => giorniDaRisposta(r)['2026-10-10'];

describe('previsioni: punti e richieste', () => {
  it('raggruppa i punti vicini nella stessa cella', () => {
    expect(puntoMeteo(13.812, 41.79).chiave).toBe(puntoMeteo(13.79, 41.81).chiave);
    expect(puntoMeteo(13.812, 41.79)).toMatchObject({ lon: 13.8, lat: 41.8, chiave: '41.8,13.8' });
  });

  it('divide le richieste in gruppi', () => {
    const punti = Array.from({ length: MAX_LUOGHI_RICHIESTA + 3 }, (_, i) => ({ lon: 13 + i / 10, lat: 41 }));
    const r = urlPrevisioni(punti);
    expect(r).toHaveLength(2);
    expect(r[1].punti).toHaveLength(3);
    const u = new URL(r[0].url);
    expect(u.searchParams.get('elevation')).toBeNull();
    expect(u.searchParams.get('timezone')).toBe('Europe/Rome');
    expect(u.searchParams.get('past_days')).toBe('3');
  });

  it('porta le temperature alla quota del percorso', () => {
    const g = { ...giorniDaRisposta({ ...risposta(), elevation: 1000 })['2026-10-10'] };
    expect(g.quota).toBe(1000);
    const vetta = giornoAllaQuota(g, 2000);
    expect(vetta.ore[0].t).toBeCloseTo(12 - 6.5, 5);
    expect(vetta.ore[0].tp).toBeCloseTo(10 - 6.5, 5);
    expect(giornoAllaQuota(g, null)).toBe(g);
  });

  it('legge la risposta: ore del giorno, alba, tramonto e pioggia dei 3 giorni prima', () => {
    const g = giorniDaRisposta(risposta({}, (h, gi) => (gi === 0 && h === 10 ? { precipitation: 12 } : {})));
    expect(g['2026-10-10'].ore).toHaveLength(24);
    expect(g['2026-10-10'].alba).toBe(7 * 60 + 10);
    expect(g['2026-10-10'].tramonto).toBe(18 * 60 + 40);
    expect(g['2026-10-10'].pioggiaPrima).toBe(0); // il 6 ottobre è più di 72 ore prima del 10
    expect(g['2026-10-09'].pioggiaPrima).toBe(12);
    expect(giorniDaRisposta(null)).toEqual({});
  });
});

describe('valutazione della giornata', () => {
  const finestra = { inizio: 9 * 60, fine: 13 * 60 };

  it('bel tempo: nessun problema', () => {
    expect(valutaFinestra({ basso: domani(risposta()), ...finestra })).toEqual([]);
  });

  it('pioggia e temporali solo se cadono nelle ore di cammino', () => {
    const r = risposta({}, (h, gi) => (gi === 4 && h >= 15 ? { precipitation_probability: 90, precipitation: 3, weather_code: 95 } : {}));
    expect(valutaFinestra({ basso: domani(r), ...finestra })).toEqual([]);
    const tardi = valutaFinestra({ basso: domani(r), inizio: 13 * 60, fine: 17 * 60 });
    expect(tardi[0]).toMatchObject({ chiave: 'temporali', livello: 'sconsigliato' });
  });

  it('una pioggerella è "attenzione", a meno che la si accetti', () => {
    const r = risposta({}, (h) => (h === 11 ? { precipitation_probability: 55, precipitation: 0.5 } : {}));
    expect(valutaFinestra({ basso: domani(r), ...finestra })[0]).toMatchObject({ chiave: 'pioggia', livello: 'attenzione' });
    expect(valutaFinestra({ basso: domani(r), ...finestra, soglie: { pioggia: 'pioggerella' } })).toEqual([]);
  });

  it('il freddo si misura in quota e segue la soglia personale', () => {
    const basso = domani(risposta());
    const alto = domani(risposta({ temperature_2m: 3, apparent_temperature: -1 }));
    expect(valutaFinestra({ basso, alto, ...finestra })).toEqual([]);
    expect(valutaFinestra({ basso, alto, ...finestra, soglie: { freddo: 2 } })[0]).toMatchObject({ chiave: 'freddo', livello: 'attenzione' });
    const gelo = domani(risposta({ temperature_2m: -6, apparent_temperature: -12 }));
    const f = valutaFinestra({ basso, alto: gelo, ...finestra, percorso: { quotaMax: 2000 } });
    expect(f.find((x) => x.chiave === 'freddo').livello).toBe('sconsigliato');
    expect(f.some((x) => x.chiave === 'ghiaccio')).toBe(true);
  });

  it('il caldo tiene conto dell\'ombra del bosco', () => {
    const basso = domani(risposta({ temperature_2m: 29 }));
    expect(valutaFinestra({ basso, ...finestra })[0]).toMatchObject({ chiave: 'caldo', livello: 'attenzione' });
    expect(valutaFinestra({ basso, ...finestra, percorso: { boscoPercento: 80 } })).toEqual([]);
  });

  it('il vento pesa di più sui percorsi esposti', () => {
    const basso = domani(risposta({ wind_gusts_10m: 45 }));
    expect(valutaFinestra({ basso, ...finestra })).toEqual([]);
    expect(valutaFinestra({ basso, ...finestra, percorso: { apertura: 70 } })[0]).toMatchObject({ chiave: 'vento', livello: 'attenzione' });
  });

  it('neve al suolo: attenzione a piedi, sconsigliato in bici', () => {
    const alto = domani(risposta({ snow_depth: 0.15 }));
    const basso = domani(risposta());
    expect(valutaFinestra({ basso, alto, ...finestra })[0]).toMatchObject({ chiave: 'neve', livello: 'attenzione' });
    expect(valutaFinestra({ basso, alto, ...finestra, attivita: 'mtb' })[0]).toMatchObject({ chiave: 'neve', livello: 'sconsigliato' });
  });

  it('fango dopo la pioggia, solo su terreno di terra', () => {
    const r = risposta({}, (h, gi) => (gi === 3 && h < 10 ? { precipitation: 3 } : {}));
    const basso = domani(r);
    expect(basso.pioggiaPrima).toBe(30);
    expect(valutaFinestra({ basso, ...finestra, percorso: { quotaFangosa: 0.9 } })[0]).toMatchObject({ chiave: 'fango', livello: 'attenzione' });
    expect(valutaFinestra({ basso, ...finestra, percorso: { quotaFangosa: 0.9 }, attivita: 'mtb' })[0].livello).toBe('sconsigliato');
    expect(valutaFinestra({ basso, ...finestra, percorso: { quotaFangosa: 0.1 } })).toEqual([]);
  });

  it('panorama: una nota, non un problema', () => {
    const basso = domani(risposta({ cloud_cover: 95 }));
    expect(valutaFinestra({ basso, ...finestra, percorso: { panorama: 70 } })).toEqual([{ chiave: 'panorama', livello: 'info', testo: 'molto nuvoloso: panorama ridotto' }]);
  });
});

describe('giudizio e orario di partenza', () => {
  it('sceglie una partenza che evita la pioggia del pomeriggio', () => {
    const r = risposta({}, (h, gi) => (gi === 4 && h >= 14 ? { precipitation_probability: 85, precipitation: 2 } : {}));
    const g = giudicaGiornata({ basso: domani(r), durataMin: 180 });
    expect(g.giudizio).toBe('ok');
    expect(g.durataPrevista).toBe(207);
    expect(g.partenza.da).toBe('08:00'); // senza problemi si preferisce partire verso le 8
    // 3 h 27 di cammino: partendo alle 10:30 si arriva alle 13:57, prima della pioggia delle 14
    expect(g.partenza.entro).toBe('10:30');
    expect(g.partenza.poi).toMatch(/pioggia/);
  });

  it('troppo lungo per le ore di luce', () => {
    const g = giudicaGiornata({ basso: domani(risposta()), durataMin: 600 });
    expect(g.giudizio).toBe('sconsigliato');
    expect(g.fattori[0].chiave).toBe('luce');
  });

  it('oggi: non si propone una partenza già passata', () => {
    const g = giudicaGiornata({ basso: domani(risposta()), durataMin: 120, dopoMin: 11 * 60 + 10 });
    expect(g.partenza.da).toBe('11:30');
  });

  it('durata in bici', () => {
    expect(durataInBici(24, 500, 'mtb')).toBe(150); // 2 h in piano, 1 h di salita
    expect(durataInBici(24, 500, 'emtb')).toBeLessThan(120);
    expect(durataInBici(24, 500, 'trekking')).toBeNull();
  });

  it('passo lento e soste allungano la durata', () => {
    expect(durataConSoste(200, 'lento')).toBeCloseTo(288, -1);
    expect(durataConSoste(null)).toBeNull();
  });
});

describe('altri calcoli', () => {
  it('quota di terreno fangoso', () => {
    expect(
      quotaFangosa([
        { daM: 0, aM: 3000, tag: { highway: 'track', tracktype: 'grade3' } },
        { daM: 3000, aM: 4000, tag: { highway: 'track', surface: 'asphalt' } },
      ]),
    ).toBe(0.75);
    expect(quotaFangosa(null)).toBeNull();
  });

  it('riassunto di un parco', () => {
    const r = riassuntoParco([
      { giudizio: 'ok', fattori: [] },
      { giudizio: 'attenzione', fattori: [{ chiave: 'vento', livello: 'attenzione' }] },
      { giudizio: 'ok', fattori: [{ chiave: 'panorama', livello: 'info' }] },
      null,
    ]);
    expect(r).toMatchObject({ giudizio: 'ok', motivo: 'vento', totale: 3 });
  });

  it('durate della scelta rapida', () => {
    expect(nellaDurata(170, 'breve')).toBe(true);
    expect(nellaDurata(200, 'breve')).toBe(false);
    expect(nellaDurata(400, 'lunga')).toBe(true);
    expect(nellaDurata(null, 'breve')).toBe(true);
  });

  it('mesi e animali del mese', () => {
    expect([...mesiDaTesto('giu, ago–set')]).toEqual([6, 8, 9]);
    expect([...mesiDaTesto('nov–gen')]).toEqual([11, 12, 1]);
    expect(animaliDelMese({ specie: [{ animale: 'orso', mesi: 'ago–ott' }, { animale: 'lupo', mesi: 'gen' }] }, 10)).toEqual(['orso']);
  });
});

describe('profilo delle quote', () => {
  it('trova partenza, punto più alto e dislivello', () => {
    // linea verso est di circa 1,7 km che sale di 200 m e ridiscende di 100 m
    const g = { type: 'MultiLineString', coordinates: [[[13.8, 41.8], [13.81, 41.8], [13.82, 41.8]]] };
    const quota = (lon) => (lon <= 13.81 ? 1000 + (lon - 13.8) * 20000 : 1200 - (lon - 13.81) * 10000);
    const p = profiloQuote(g, quota);
    expect(p.partenza.quota).toBe(1000);
    expect(p.max).toBeCloseTo(1200, -1);
    expect(p.alto.lon).toBeCloseTo(13.81, 3);
    expect(Math.abs(p.salita - 200)).toBeLessThan(15); // campioni ogni 50 m: la cima esatta può cadere tra due
    expect(Math.abs(p.discesa - 100)).toBeLessThan(15);
  });

  it('niente profilo se mancano le quote', () => {
    expect(profiloQuote({ type: 'MultiLineString', coordinates: [[[13.8, 41.8], [13.81, 41.8]]] }, () => null)).toBeNull();
  });
});

describe('dai percorsi ai punti meteo', () => {
  const traccia = { geojson: { type: 'MultiLineString', coordinates: [[[13.81, 41.79], [13.85, 41.8]]] } };
  const sentiero = { id: 'a', panorama: { punteggio: 70, boscoPercento: 40, criteri: { apertura: 60 } } };

  it('usa partenza e punto più alto del profilo', () => {
    const quote = { partenza: { lon: 13.81, lat: 41.79, quota: 1100 }, alto: { lon: 13.95, lat: 41.85, quota: 2000 }, min: 1100, max: 2000, salita: 900 };
    const d = datiPerMeteo({ sentiero, traccia, misure: { durataMin: 300, km: 12 } }, 'trekking', quote);
    expect(d.basso).toMatchObject({ chiave: '41.8,13.8', quota: 1100 });
    expect(d.alto).toMatchObject({ quota: 2000, lon: 13.9 });
    expect(d.durataMin).toBe(300);
    expect(d.percorso).toMatchObject({ quotaMax: 2000, panorama: 70, apertura: 60 });
  });

  it('senza profilo: inizio della traccia e quota dal modello del terreno; bici con la sua durata', () => {
    const d = datiPerMeteo({ sentiero: { id: 'b' }, traccia, misure: { km: 24, salita: 500 } }, 'mtb');
    expect(d.basso).toMatchObject({ chiave: '41.8,13.8', quota: null });
    expect(d.alto).toBeNull();
    expect(d.durataMin).toBe(150);
    expect(datiPerMeteo({ sentiero: { id: 'c', partenza: {} }, traccia: null, misure: {} }, 'trekking')).toBeNull();
  });

  it('ordina: favorevoli, punteggio, panorama', () => {
    const v = (id, giudizio, punteggio, panorama) => ({ id, giudizio: { giudizio, punteggio }, panorama });
    const r = ordinaClassifica([v('a', 'attenzione', 85, 90), v('b', 'ok', 100, 10), v('c', 'ok', 100, 60), v('d', 'sconsigliato', 0, 99)]);
    expect(r.map((x) => x.id)).toEqual(['c', 'b', 'a', 'd']);
  });
});
