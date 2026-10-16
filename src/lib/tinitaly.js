// Quote dal modello del terreno TINITALY dell'INGV (10 m, CC BY 4.0): un servizio WCS gratuito, che
// risponde anche alle pagine web. Si chiedono quadrati di 1 km nella sua proiezione (UTM 32N, celle
// esatte di 10 m: in gradi il servizio le deforma e due quadrati vicini non combaciano), in formato
// testo (ASCII grid); si tengono sul telefono e la quota di ogni punto si ricava dalle quattro vicine.
// Se TINITALY non risponde (o il punto è in mare / fuori dall'Italia) si usa Open-Meteo.
import { distanzaKm } from './geo.js';
import { percorsoSentiero } from './tracce.js';
import { campionaPercorso } from './panorama.js';
import { profiloQuote, PASSO_PROFILO_M } from './profiloQuote.js';

export const URL_TINITALY = 'https://tinitaly.pi.ingv.it/TINItaly_1_1/wcs';
export const CREDITO_TINITALY = 'Quote TINITALY 10 m (INGV, CC BY 4.0)';
export const LATO_CELLA_M = 1000;
export const RIPROVE = 2;
export const ATTESA_RIPROVA_MS = 1500;
export const TEMPO_MAX_CELLA_MS = 30_000;
// margine attorno alla cella (due celle di griglia): l'interpolazione sul bordo ha i vicini
const MARGINE_M = 20;
export const PASSO_QUOTE_M = 25;

// WGS84 → UTM fuso 32 nord (EPSG:32632), la proiezione di TINITALY per tutta l'Italia
export function utm32([lon, lat]) {
  const a = 6378137;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const φ = (lat * Math.PI) / 180;
  const λ = ((lon - 9) * Math.PI) / 180;
  const N = a / Math.sqrt(1 - e2 * Math.sin(φ) ** 2);
  const T = Math.tan(φ) ** 2;
  const C = ep2 * Math.cos(φ) ** 2;
  const A = Math.cos(φ) * λ;
  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * φ -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * φ) +
      ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * φ) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * φ));
  const E = k0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5) / 120) + 500000;
  const Nn = k0 * (M + N * Math.tan(φ) * (A ** 2 / 2 + ((5 - T + 9 * C + 4 * C ** 2) * A ** 4) / 24 + ((61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6) / 720));
  return [E, Nn];
}

export function chiaveCella(lon, lat) {
  const [e, n] = utm32([lon, lat]);
  return `${Math.floor(n / LATO_CELLA_M)}:${Math.floor(e / LATO_CELLA_M)}`;
}

export function urlCella(chiave) {
  const [kn, ke] = chiave.split(':').map(Number);
  const [e0, n0] = [ke * LATO_CELLA_M - MARGINE_M, kn * LATO_CELLA_M - MARGINE_M];
  const [e1, n1] = [(ke + 1) * LATO_CELLA_M + MARGINE_M, (kn + 1) * LATO_CELLA_M + MARGINE_M];
  return `${URL_TINITALY}?service=WCS&version=2.0.1&request=GetCoverage&coverageId=TINItaly_1_1__tinitaly_dem&format=text/plain&subset=E(${e0},${e1})&subset=N(${n0},${n1})`;
}

// Testo ASCII grid → { ncol, nrig, ovest, sud, passo, valori } in metri UTM (prima riga = la più a
// nord; null = vuoto)
export function leggiGriglia(testo) {
  const righe = String(testo ?? '').split('\n');
  const intest = {};
  let i = 0;
  for (; i < righe.length; i++) {
    const m = righe[i].trim().match(/^([A-Z_]+)\s+(-?[\d.eE+-]+)$/i);
    if (!m) break;
    intest[m[1].toUpperCase()] = Number(m[2]);
  }
  const { NCOLS: ncol, NROWS: nrig, XLLCORNER: ovest, YLLCORNER: sud, CELLSIZE: passo } = intest;
  if (![ncol, nrig, ovest, sud, passo].every(Number.isFinite)) return null;
  const vuoto = intest.NODATA_VALUE ?? -9999;
  const valori = [];
  for (; i < righe.length && valori.length < ncol * nrig; i++) {
    for (const v of righe[i].trim().split(/\s+/)) {
      if (v === '') continue;
      const x = Number(v);
      valori.push(!Number.isFinite(x) || x === vuoto || x < -500 ? null : Math.round(x * 10) / 10);
    }
  }
  return valori.length === ncol * nrig ? { ncol, nrig, ovest, sud, passo, valori } : null;
}

// Quota nel punto [est, nord] (metri UTM 32N), interpolata tra i quattro valori della griglia attorno
// (null se manca)
export function quotaNellaGriglia(g, lon, lat) {
  if (!g) return null;
  // centri delle celle: colonna c a ovest + (c + 0,5) passi; riga r (dall'alto) a nord - (r + 0,5) passi
  let x = (lon - g.ovest) / g.passo - 0.5;
  let y = (g.sud + g.nrig * g.passo - lat) / g.passo - 0.5;
  // fuori dalla griglia: niente; nella mezza cella sul bordo: il valore del bordo
  if (x < -0.5 || y < -0.5 || x > g.ncol - 0.5 || y > g.nrig - 0.5 || g.ncol < 2 || g.nrig < 2) return null;
  x = Math.min(Math.max(x, 0), g.ncol - 1.000001);
  y = Math.min(Math.max(y, 0), g.nrig - 1.000001);
  const c0 = Math.floor(x);
  const r0 = Math.floor(y);
  const v = (r, c) => g.valori[r * g.ncol + c];
  const [a, b, c, d] = [v(r0, c0), v(r0, c0 + 1), v(r0 + 1, c0), v(r0 + 1, c0 + 1)];
  if ([a, b, c, d].some((q) => q == null)) return [a, b, c, d].find((q) => q != null) ?? null;
  const fx = x - c0;
  const fy = y - r0;
  return Math.round(((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy) * 10) / 10;
}

// Pezzi della traccia con un punto almeno ogni passoM (quelli in più sulla linea), senza quote
export function infittisci(pezzi, passoM = PASSO_QUOTE_M) {
  return pezzi.map((linea) => {
    const nuova = [];
    for (let i = 0; i < linea.length; i++) {
      if (i > 0) {
        const [a, b] = [linea[i - 1], linea[i]];
        const n = Math.floor((distanzaKm(a, b) * 1000) / passoM);
        for (let k = 1; k <= n; k++) {
          const t = k / (n + 1);
          nuova.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
      }
      nuova.push([linea[i][0], linea[i][1]]);
    }
    return nuova;
  });
}

// Lettore con cache: leggiCella(chiave) → griglia salvata o null; salvaCella(chiave, griglia)
export function creaLettoreTinitaly({ fetchFn = fetch, leggiCella = async () => null, salvaCella = async () => {}, parallele = 4, attesaMs = ATTESA_RIPROVA_MS } = {}) {
  const inCorso = new Map();
  // Il servizio INGV è lento (8–15 s per quadrato) e a volte risponde 500 o chiude la connessione:
  // gli errori non portano l'intestazione CORS e al browser sembrano "bloccati". Si riprova qualche volta,
  // con un tempo massimo per ogni richiesta
  async function scaricaCella(chiave) {
    let ultimo;
    for (let tentativo = 0; tentativo <= RIPROVE; tentativo++) {
      if (tentativo) await new Promise((r) => setTimeout(r, attesaMs * tentativo));
      try {
        const r = await fetchFn(urlCella(chiave), { signal: AbortSignal.timeout(TEMPO_MAX_CELLA_MS) });
        if (!r.ok) throw new Error(`TINITALY ha risposto ${r.status}`);
        const g = leggiGriglia(await r.text());
        if (!g) throw new Error('TINITALY: risposta non leggibile');
        return g;
      } catch (e) {
        ultimo = e;
      }
    }
    throw ultimo;
  }
  function cella(chiave) {
    if (!inCorso.has(chiave)) {
      inCorso.set(
        chiave,
        (async () => {
          const salvata = await leggiCella(chiave).catch(() => null);
          if (salvata) return salvata;
          const g = await scaricaCella(chiave);
          await salvaCella(chiave, g).catch(() => {});
          return g;
        })().catch((e) => {
          inCorso.delete(chiave); // si riprova la prossima volta
          throw e;
        }),
      );
    }
    return inCorso.get(chiave);
  }

  // punti [[lon, lat]…] → quote (null dove manca); le celle si scaricano poche alla volta
  async function quote(punti) {
    const chiavi = [...new Set(punti.map(([lon, lat]) => chiaveCella(lon, lat)))];
    const griglie = new Map();
    for (let i = 0; i < chiavi.length; i += parallele) {
      const gruppo = chiavi.slice(i, i + parallele);
      const fatte = await Promise.all(gruppo.map((k) => cella(k)));
      gruppo.forEach((k, j) => griglie.set(k, fatte[j]));
    }
    return punti.map(([lon, lat]) => {
      const [e, n] = utm32([lon, lat]);
      return quotaNellaGriglia(griglie.get(chiaveCella(lon, lat)), e, n);
    });
  }
  return { quote, cella };
}

// Pezzi con le quote: TINITALY ogni 25 m; se manca più del 10% dei punti (mare, fuori Italia) o il
// servizio non risponde, riserva(pezzi) (Open-Meteo). → { pezzi, fonte: 'tinitaly' | 'open-meteo' }
// fitti: false per lasciare la traccia com'è (es. la traccia di un sentiero: cambiarla cambierebbe
// la sua impronta), con le quote solo nei suoi punti
export async function pezziConQuoteTinitaly(pezzi, lettore, riserva, { fitti: infittire = true } = {}) {
  const fitti = infittire ? infittisci(pezzi) : pezzi.map((l) => l.map(([lon, lat]) => [lon, lat]));
  try {
    const tutti = fitti.flat();
    const q = await lettore.quote(tutti);
    const mancanti = q.filter((x) => x == null).length;
    if (mancanti <= tutti.length * 0.1) {
      // i pochi punti senza quota prendono quella del vicino
      let k = 0;
      let ultima = q.find((x) => x != null);
      const conQuote = fitti.map((linea) =>
        linea.map(([lon, lat]) => {
          const z = q[k++];
          if (z != null) ultima = z;
          return [lon, lat, z ?? ultima];
        }),
      );
      return { pezzi: conQuote, fonte: 'tinitaly' };
    }
  } catch (e) {
    console.warn('TINITALY non disponibile', e);
  }
  return { pezzi: await riserva(pezzi), fonte: 'open-meteo' };
}

// Profilo della traccia (partenza, minima, massima, dislivello) come quello del robot, ma con le quote
// TINITALY: prima si scaricano le celle per i punti campionati, poi lo stesso calcolo di profiloQuote.
// null se mancano troppe quote (fuori Italia, servizio giù).
export async function profiloTinitaly(geojson, lettore, passoM = PASSO_PROFILO_M) {
  const { pezzi } = percorsoSentiero(geojson);
  const punti = pezzi.flatMap((pezzo) => campionaPercorso({ type: 'MultiLineString', coordinates: [pezzo] }, passoM).map((p) => [p.lon, p.lat]));
  if (!punti.length) return null;
  const quote = await lettore.quote(punti);
  const memoria = new Map(punti.map(([lon, lat], i) => [`${lon.toFixed(6)},${lat.toFixed(6)}`, quote[i]]));
  return profiloQuote(geojson, (lon, lat) => memoria.get(`${lon.toFixed(6)},${lat.toFixed(6)}`) ?? null, passoM);
}
