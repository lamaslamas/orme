// "Dove vado domani?": giudizio di una giornata per un percorso, a partire dalle previsioni
// orarie di Open-Meteo (gratuito, senza chiavi) alla quota di partenza e al punto più alto.
// Il giudizio non dice mai "sicuro": dice se le previsioni sono favorevoli, con i motivi.

export const URL_PREVISIONI = 'https://api.open-meteo.com/v1/forecast';
const ORARIE = [
  'temperature_2m',
  'apparent_temperature',
  'precipitation_probability',
  'precipitation',
  'weather_code',
  'wind_gusts_10m',
  'snowfall',
  'snow_depth',
  'freezing_level_height',
  'cloud_cover',
];
export const MAX_LUOGHI_RICHIESTA = 50;
export const GRIGLIA_GRADI = 0.1; // celle di circa 8-11 km: il dettaglio dei modelli meteo
export const FASCIA_QUOTA_M = 100;

export const SOGLIE_PREDEFINITE = {
  freddo: -2, // temperatura percepita minima al punto più alto (°C)
  caldo: 28, // temperatura massima alla partenza nelle ore di cammino (°C)
  raffiche: 50, // km/h
  pioggia: 'niente', // 'niente' | 'pioggerella'
  passo: 'medio', // 'lento' | 'medio' | 'veloce'
};
export const FATTORE_PASSO = { lento: 1.25, medio: 1, veloce: 0.85 };
export const SOSTE = 1.15; // le stime CAI non comprendono le soste
const MARGINE_LUCE_MIN = 30;

export const LIVELLI = { ok: 0, info: 0, attenzione: 1, sconsigliato: 2 };
export const GIUDIZI = {
  ok: { simbolo: '✅', nome: 'Favorevole' },
  attenzione: { simbolo: '⚠️', nome: 'Con attenzione' },
  sconsigliato: { simbolo: '⛔', nome: 'Sconsigliato' },
};

// ---------- punti e richieste ----------

// Punto meteo arrotondato: percorsi vicini e a quote simili condividono la stessa previsione
export function puntoMeteo(lon, lat, quota = null) {
  const g = (x) => Math.round(x / GRIGLIA_GRADI) * GRIGLIA_GRADI;
  const q = Number.isFinite(quota) ? Math.round(quota / FASCIA_QUOTA_M) * FASCIA_QUOTA_M : null;
  const p = { lon: Number(g(lon).toFixed(2)), lat: Number(g(lat).toFixed(2)), quota: q };
  return { ...p, chiave: `${p.lat},${p.lon},${q ?? 'dem'}` };
}

// Divide i punti in richieste da MAX_LUOGHI_RICHIESTA. Quota mancante: "nan" = modello del terreno
export function urlPrevisioni(punti, { pastDays = 3, giorni = 2 } = {}) {
  const urls = [];
  for (let i = 0; i < punti.length; i += MAX_LUOGHI_RICHIESTA) {
    const gruppo = punti.slice(i, i + MAX_LUOGHI_RICHIESTA);
    const q = new URLSearchParams({
      latitude: gruppo.map((p) => p.lat).join(','),
      longitude: gruppo.map((p) => p.lon).join(','),
      elevation: gruppo.map((p) => (p.quota == null ? 'nan' : p.quota)).join(','),
      hourly: ORARIE.join(','),
      daily: 'sunrise,sunset',
      timezone: 'Europe/Rome',
      past_days: String(pastDays),
      forecast_days: String(giorni),
      wind_speed_unit: 'kmh',
    });
    urls.push({ url: `${URL_PREVISIONI}?${q}`, punti: gruppo });
  }
  return urls;
}

const minutiDa = (iso) => {
  const [h, m] = iso.slice(11, 16).split(':').map(Number);
  return h * 60 + m;
};

// Risposta Open-Meteo di un luogo → { [data]: { ore: [...24], alba, tramonto, pioggiaPrima } }
// pioggiaPrima: mm caduti nelle 72 ore prima di quel giorno (per il fango)
export function giorniDaRisposta(r) {
  const h = r?.hourly;
  if (!h?.time?.length) return {};
  const ore = h.time.map((t, i) => ({
    data: t.slice(0, 10),
    ora: Number(t.slice(11, 13)),
    t: h.temperature_2m?.[i],
    tp: h.apparent_temperature?.[i],
    pp: h.precipitation_probability?.[i] ?? 0,
    mm: h.precipitation?.[i] ?? 0,
    codice: h.weather_code?.[i] ?? 0,
    raffiche: h.wind_gusts_10m?.[i] ?? 0,
    neve: h.snowfall?.[i] ?? 0, // cm nell'ora
    neveSuolo: h.snow_depth?.[i] ?? 0, // metri
    zero: h.freezing_level_height?.[i],
    nuvole: h.cloud_cover?.[i] ?? 0,
  }));
  const giorni = {};
  (r.daily?.time ?? []).forEach((data, i) => {
    const indice = ore.findIndex((o) => o.data === data);
    if (indice < 0) return;
    const prima = ore.slice(Math.max(0, indice - 72), indice);
    giorni[data] = {
      ore: ore.slice(indice, indice + 24),
      alba: minutiDa(r.daily.sunrise[i]),
      tramonto: minutiDa(r.daily.sunset[i]),
      pioggiaPrima: prima.length >= 48 ? Math.round(prima.reduce((s, o) => s + (o.mm || 0), 0) * 10) / 10 : null,
    };
  });
  return giorni;
}

// ---------- fattori ----------

const max = (xs) => Math.max(...xs);
const min = (xs) => Math.min(...xs);
const oraTesto = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
const TEMPORALE = (c) => c >= 95;

// Superfici che con la pioggia diventano fango (tag OSM surface). Senza surface: sentieri e
// carrarecce sono di solito di terra, tranne le carrarecce compatte (tracktype=grade1).
const FANGOSE = new Set(['ground', 'dirt', 'earth', 'mud', 'grass', 'unpaved', 'compacted', 'fine_gravel', 'gravel', 'woodchips']);
export function trattoFangoso(tag = {}) {
  if (tag.surface) return FANGOSE.has(tag.surface);
  if (tag.highway === 'track') return tag.tracktype !== 'grade1';
  return ['path', 'footway', 'bridleway'].includes(tag.highway);
}
// Quota del percorso (0-1) su terreno che può infangarsi; tratti dal campo traccia.dettagli.terreno
export function quotaFangosa(terreno) {
  if (!terreno?.length) return null;
  let fangosi = 0;
  let totale = 0;
  for (const t of terreno) {
    const m = (t.aM ?? 0) - (t.daM ?? 0);
    if (m <= 0) continue;
    totale += m;
    if (trattoFangoso(t.tag)) fangosi += m;
  }
  return totale ? Math.round((fangosi / totale) * 100) / 100 : null;
}

// Durata prevista in minuti, con soste e passo personale
export function durataConSoste(durataMin, passo = 'medio') {
  if (!Number.isFinite(durataMin)) return null;
  return Math.round(durataMin * SOSTE * (FATTORE_PASSO[passo] ?? 1));
}

// Durata in bici (minuti, senza soste), con lo stesso schema della stima CAI:
// il maggiore tra tempo in piano e tempo per il dislivello più metà del minore.
// MTB: 12 km/h e 500 m/h in salita; e-MTB: 15 km/h e 900 m/h. La discesa è veloce, non si conta.
export const BICI = { mtb: { kmh: 12, salitaMh: 500 }, emtb: { kmh: 15, salitaMh: 900 } };
export function durataInBici(km, salita, attivita) {
  const b = BICI[attivita];
  if (!b || !Number.isFinite(km)) return null;
  const piano = km / b.kmh;
  const su = (salita ?? 0) / b.salitaMh;
  return Math.round((Math.max(piano, su) + Math.min(piano, su) / 2) * 60);
}

// Valuta i fattori nelle ore [inizio, fine) (minuti dalla mezzanotte).
// basso/alto: giorni di previsione alla partenza e al punto più alto (alto può mancare).
export function valutaFinestra({ basso, alto = null, inizio, fine, percorso = {}, soglie = SOGLIE_PREDEFINITE, attivita = 'trekking' }) {
  const s = { ...SOGLIE_PREDEFINITE, ...soglie };
  const ore = (g) => (g?.ore ?? []).filter((o) => o.ora * 60 + 59 >= inizio && o.ora * 60 < fine);
  const oreBasso = ore(basso);
  const oreAlto = alto ? ore(alto) : oreBasso;
  if (!oreBasso.length) return null;
  const tutte = [...oreBasso, ...oreAlto];
  const fattori = [];
  const aggiungi = (chiave, livello, testo) => fattori.push({ chiave, livello, testo });
  const bici = attivita !== 'trekking';

  // temporali e pioggia
  const temporali = tutte.filter((o) => TEMPORALE(o.codice) || (o.codice >= 80 && o.pp >= 60 && o.mm >= 3));
  if (temporali.some((o) => TEMPORALE(o.codice))) aggiungi('temporali', 'sconsigliato', `temporali previsti verso le ${temporali[0].ora}`);
  const mmTotali = oreBasso.reduce((x, o) => x + o.mm, 0);
  const ppMax = max(tutte.map((o) => o.pp));
  const piovose = oreBasso.filter((o) => o.pp >= 50 && o.mm >= 0.3);
  if (!fattori.some((f) => f.chiave === 'temporali')) {
    if (ppMax >= 70 && mmTotali >= 3) aggiungi('pioggia', 'sconsigliato', `pioggia probabile (${Math.round(mmTotali)} mm)`);
    else if (piovose.length && (s.pioggia === 'niente' || mmTotali >= 2)) aggiungi('pioggia', 'attenzione', `possibile pioggia verso le ${piovose[0].ora} (${ppMax}%)`);
  }

  // freddo in vetta (temperatura percepita, vento compreso)
  const percepita = min(oreAlto.map((o) => o.tp ?? o.t));
  if (percepita <= s.freddo - 8) aggiungi('freddo', 'sconsigliato', `molto freddo in quota: percepiti ${Math.round(percepita)} °C`);
  else if (percepita <= s.freddo) aggiungi('freddo', 'attenzione', `freddo in quota: percepiti ${Math.round(percepita)} °C`);

  // caldo alla partenza: il bosco fa ombra, quindi la soglia sale un po'
  const ombra = (percorso.boscoPercento ?? 0) >= 60 ? 2 : 0;
  const caldo = max(oreBasso.map((o) => o.t));
  if (caldo >= s.caldo + ombra + 5) aggiungi('caldo', 'sconsigliato', `molto caldo: ${Math.round(caldo)} °C`);
  else if (caldo >= s.caldo + ombra) aggiungi('caldo', 'attenzione', `caldo: ${Math.round(caldo)} °C${ombra ? ' (in parte all\'ombra del bosco)' : ''}`);

  // vento in quota: sulle creste e i tratti aperti pesa di più
  const raffiche = max(oreAlto.map((o) => o.raffiche));
  const esposto = (percorso.apertura ?? 0) >= 50;
  const soglia = s.raffiche - (esposto ? 10 : 0);
  if (raffiche >= soglia + 25) aggiungi('vento', 'sconsigliato', `raffiche fino a ${Math.round(raffiche)} km/h${esposto ? ' su tratti esposti' : ''}`);
  else if (raffiche >= soglia) aggiungi('vento', 'attenzione', `raffiche fino a ${Math.round(raffiche)} km/h${esposto ? ' su tratti esposti' : ''}`);

  // neve e ghiaccio
  const neveSuolo = max(oreAlto.map((o) => o.neveSuolo));
  const nevicata = oreAlto.reduce((x, o) => x + o.neve, 0);
  if (nevicata >= 2) aggiungi('neve', bici ? 'sconsigliato' : 'attenzione', `nevicata prevista (${Math.round(nevicata)} cm)`);
  if (neveSuolo >= 0.1) aggiungi('neve', bici || neveSuolo >= 0.4 ? 'sconsigliato' : 'attenzione', `neve al suolo in quota (circa ${Math.round(neveSuolo * 100)} cm)`);
  else if (min(oreAlto.map((o) => o.t)) <= 0 && Number.isFinite(percorso.quotaMax)) {
    aggiungi('ghiaccio', 'attenzione', 'temperature sotto zero in quota: possibile ghiaccio');
  }

  // fango: pioggia dei giorni prima su terreno di terra o erba
  const fangosa = percorso.quotaFangosa ?? 0.5;
  const prima = basso.pioggiaPrima;
  if (Number.isFinite(prima) && fangosa >= 0.3) {
    if (prima >= 25) aggiungi('fango', bici ? 'sconsigliato' : 'attenzione', `fango probabile: ${Math.round(prima)} mm nei 3 giorni prima`);
    else if (prima >= 10) aggiungi('fango', 'attenzione', `terreno forse fangoso: ${Math.round(prima)} mm nei 3 giorni prima`);
  }

  // panorama: con le nuvole basse un percorso panoramico rende meno
  if ((percorso.panorama ?? 0) >= 50) {
    const nuvole = oreAlto.reduce((x, o) => x + o.nuvole, 0) / oreAlto.length;
    if (nuvole >= 80) aggiungi('panorama', 'info', 'molto nuvoloso: panorama ridotto');
    else if (nuvole <= 30) aggiungi('panorama', 'info', 'cielo sereno: buona giornata per il panorama');
  }
  return fattori;
}

const peggiore = (fattori) =>
  fattori.reduce((g, f) => (LIVELLI[f.livello] > LIVELLI[g] ? f.livello : g), 'ok');
const penalita = (fattori) => fattori.reduce((x, f) => x + (f.livello === 'sconsigliato' ? 10 : f.livello === 'attenzione' ? 3 : 0), 0);

// Giudizio della giornata: prova le ore di partenza e sceglie la migliore.
// dopoMin: non prima di quest'ora (per "oggi": adesso più il viaggio)
export function giudicaGiornata({ basso, alto = null, durataMin, percorso = {}, soglie = SOGLIE_PREDEFINITE, attivita = 'trekking', dopoMin = 0 }) {
  if (!basso?.ore?.length) return null;
  const s = { ...SOGLIE_PREDEFINITE, ...soglie };
  const durata = durataConSoste(durataMin, s.passo) ?? 240;
  const primaPartenza = Math.max(basso.alba, 6 * 60, Math.ceil(dopoMin / 30) * 30);
  const ultimaPartenza = basso.tramonto - MARGINE_LUCE_MIN - durata;
  const base = { durataPrevista: durata, alba: oraTesto(basso.alba), tramonto: oraTesto(basso.tramonto) };
  if (ultimaPartenza < primaPartenza) {
    return {
      ...base,
      giudizio: 'sconsigliato',
      fattori: [{ chiave: 'luce', livello: 'sconsigliato', testo: `troppo lungo per le ore di luce (${Math.round(durata / 60)} h, tramonto alle ${oraTesto(basso.tramonto)})` }],
      partenza: null,
    };
  }
  let migliore = null;
  for (let inizio = Math.ceil(primaPartenza / 30) * 30; inizio <= ultimaPartenza; inizio += 30) {
    const fattori = valutaFinestra({ basso, alto, inizio, fine: inizio + durata, percorso, soglie: s, attivita });
    if (!fattori) continue;
    // a parità si preferisce partire presto (più margine di luce), ma non prima delle 7
    const costo = penalita(fattori) + Math.abs(inizio - 8 * 60) / 600;
    if (!migliore || costo < migliore.costo) migliore = { inizio, fattori, costo };
  }
  if (!migliore) return null;
  // fino a che ora si può partire con lo stesso giudizio
  let entro = migliore.inizio;
  let poi = null; // cosa cambia partendo più tardi (il motivo per cui la finestra si chiude)
  for (let t = migliore.inizio + 30; t <= ultimaPartenza; t += 30) {
    const f = valutaFinestra({ basso, alto, inizio: t, fine: t + durata, percorso, soglie: s, attivita });
    if (!f) break;
    if (penalita(f) > penalita(migliore.fattori)) {
      const gia = new Set(migliore.fattori.map((x) => `${x.chiave}:${x.livello}`));
      poi = f.filter((x) => LIVELLI[x.livello] > 0 && !gia.has(`${x.chiave}:${x.livello}`)).map((x) => x.testo)[0] ?? null;
      break;
    }
    entro = t;
  }
  if (!poi && entro === ultimaPartenza && entro > migliore.inizio) poi = 'dopo non c\'è abbastanza luce per finire';
  const fattori = migliore.fattori.sort((a, b) => LIVELLI[b.livello] - LIVELLI[a.livello]);
  return {
    ...base,
    giudizio: peggiore(fattori),
    punteggio: Math.max(0, 100 - penalita(fattori) * 5),
    fattori,
    partenza: { da: oraTesto(migliore.inizio), entro: oraTesto(entro), arrivo: oraTesto(migliore.inizio + durata), poi },
  };
}

// Riassunto di un parco: il giudizio più frequente tra i suoi percorsi e il motivo più comune
export function riassuntoParco(giudizi) {
  const validi = giudizi.filter(Boolean);
  if (!validi.length) return null;
  const conta = { ok: 0, attenzione: 0, sconsigliato: 0 };
  for (const g of validi) conta[g.giudizio]++;
  const motivi = new Map();
  for (const g of validi) for (const f of g.fattori.filter((x) => LIVELLI[x.livello] > 0)) motivi.set(f.chiave, (motivi.get(f.chiave) ?? 0) + 1);
  const motivo = [...motivi.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const giudizio = conta.ok >= validi.length / 2 ? 'ok' : conta.sconsigliato > validi.length / 2 ? 'sconsigliato' : 'attenzione';
  return { giudizio, conta, motivo, motivi: Object.fromEntries(motivi), totale: validi.length };
}

export const NOMI_FATTORI = {
  temporali: 'temporali',
  pioggia: 'pioggia',
  freddo: 'freddo',
  caldo: 'caldo',
  vento: 'vento',
  neve: 'neve',
  ghiaccio: 'ghiaccio',
  fango: 'fango',
  luce: 'poca luce',
  panorama: 'panorama',
};

// Intervalli di durata della scelta rapida (minuti di cammino, soste comprese)
export const DURATE = {
  breve: { nome: 'Fino a 3 h', max: 180 },
  media: { nome: '3–5 h', min: 150, max: 300 },
  lunga: { nome: 'Giornata', min: 240, max: 540 },
};
export function nellaDurata(durataPrevista, chiave) {
  const d = DURATE[chiave];
  if (!d || !Number.isFinite(durataPrevista)) return true;
  return (d.min == null || durataPrevista >= d.min) && durataPrevista <= d.max;
}

// Mesi di un testo tipo "giu, ago–set" → numeri 1-12
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
export function mesiDaTesto(testo) {
  const mesi = new Set();
  for (const parte of String(testo ?? '').split(',')) {
    const [a, b] = parte.trim().split(/[–-]/).map((x) => MESI.indexOf(x.trim()) + 1);
    if (!a) continue;
    if (!b) mesi.add(a);
    else for (let m = a; ; m = (m % 12) + 1) {
      mesi.add(m);
      if (m === b) break;
    }
  }
  return mesi;
}

// Animali osservati di solito in quel mese lungo il percorso o nella zona (da iNaturalist)
export function animaliDelMese(faunaInat, mese) {
  return (faunaInat?.specie ?? []).filter((x) => mesiDaTesto(x.mesi).has(mese)).map((x) => x.animale);
}

// ---------- dai percorsi dell'app ai punti meteo ----------

// prep: { sentiero, traccia, misure } (da preparaPercorsi). quote: profilo valido per la traccia o null.
// Restituisce null se il percorso non si può collocare (niente traccia né partenza).
export function datiPerMeteo({ sentiero: s, traccia, misure }, attivita, quote = null) {
  const primo = traccia?.geojson?.coordinates?.[0]?.[0];
  const partenza = quote?.partenza ?? (primo ? { lon: primo[0], lat: primo[1], quota: null } : Number.isFinite(s.partenza?.lat) ? { lon: s.partenza.lon, lat: s.partenza.lat, quota: null } : null);
  if (!partenza) return null;
  const basso = puntoMeteo(partenza.lon, partenza.lat, partenza.quota);
  const alto = quote?.alto && quote.max - (partenza.quota ?? quote.min) >= 150 ? puntoMeteo(quote.alto.lon, quote.alto.lat, quote.alto.quota) : null;
  const durataMin = attivita === 'trekking' ? misure?.durataMin : durataInBici(misure?.km, misure?.salita ?? quote?.salita, attivita);
  return {
    basso,
    alto: alto && alto.chiave !== basso.chiave ? alto : null,
    durataMin: durataMin ?? null,
    percorso: {
      quotaMax: quote?.max ?? null,
      boscoPercento: s.panorama?.boscoPercento ?? null,
      apertura: s.panorama?.criteri?.apertura ?? null,
      panorama: s.panorama?.punteggio ?? null,
      quotaFangosa: quotaFangosa(traccia?.dettagli?.terreno),
    },
  };
}

// Ordine della classifica: prima i favorevoli, poi il punteggio meteo, poi il panorama
export function ordinaClassifica(voci) {
  return [...voci].sort(
    (a, b) =>
      LIVELLI[a.giudizio.giudizio] - LIVELLI[b.giudizio.giudizio] ||
      (b.giudizio.punteggio ?? 0) - (a.giudizio.punteggio ?? 0) ||
      (b.panorama ?? 0) - (a.panorama ?? 0),
  );
}
