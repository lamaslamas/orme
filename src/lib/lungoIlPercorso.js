// Rifugi e acqua lungo un percorso di Pianifica (che può passare ovunque, non solo nei parchi).
// I punti scaricati dal robot coprono i parchi (dentro il confine) e la zona di "Intorno a me":
// se il percorso esce da queste zone servono i punti della sua zona, chiesti a OpenStreetMap.
import { puntoNelPoligono } from './confini.js';
import { distanzaKm, distanzaDallaTracciaM, lunghezzaKm } from './geo.js';
import { VELOCITA_PIANO_KMH, SALITA_MH, DISCESA_MH, stimaDurataMin } from './durata.js';
import { dislivello, SOGLIA_RUMORE_M } from './quote.js';

export const PASSO_COPERTURA_M = 500;
export const MARGINE_RIQUADRO_M = 1000;

// Punti della traccia ogni passoM (più il primo e l'ultimo di ogni pezzo)
export function campionaPezzi(pezzi, passoM = PASSO_COPERTURA_M) {
  const punti = [];
  for (const linea of pezzi ?? []) {
    let dopo = Infinity;
    for (let i = 0; i < linea.length; i++) {
      if (i > 0) dopo += distanzaKm(linea[i - 1], linea[i]) * 1000;
      if (dopo >= passoM || i === linea.length - 1) {
        punti.push(linea[i]);
        dopo = 0;
      }
    }
  }
  return punti;
}

// zone: [{ anelli }] (confine) o [{ bbox: [sud, ovest, nord, est] }]
const nellaZona = ([lon, lat], z) =>
  z.anelli?.length ? puntoNelPoligono([lon, lat], z.anelli) : z.bbox ? lat >= z.bbox[0] && lat <= z.bbox[2] && lon >= z.bbox[1] && lon <= z.bbox[3] : false;

// true se tutto il percorso è dentro le zone di cui si hanno già i punti
export function percorsoCoperto(pezzi, zone) {
  const punti = campionaPezzi(pezzi);
  return punti.length > 0 && punti.every((p) => zone.some((z) => nellaZona(p, z)));
}

// Riquadro [sud, ovest, nord, est] della traccia, allargato di margineM (per i punti poco fuori)
export function riquadroDeiPezzi(pezzi, margineM = MARGINE_RIQUADRO_M) {
  let [s, o, n, e] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const linea of pezzi ?? []) {
    for (const [lon, lat] of linea) {
      s = Math.min(s, lat);
      n = Math.max(n, lat);
      o = Math.min(o, lon);
      e = Math.max(e, lon);
    }
  }
  if (!Number.isFinite(s)) return null;
  const dLat = margineM / 111_000;
  const dLon = dLat / Math.cos((((s + n) / 2) * Math.PI) / 180);
  const r = (x) => Math.round(x * 1e4) / 1e4;
  return [r(s - dLat), r(o - dLon), r(n + dLat), r(e + dLon)];
}

// Distanza in metri tra due punti vicini (piano locale: basta per proiettare sulla traccia)
function proiezione([x, y], [ax, ay], [bx, by]) {
  const k = Math.cos((y * Math.PI) / 180);
  const dx = (bx - ax) * k;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, (((x - ax) * k) * dx + (y - ay) * dy) / l2)) : 0;
  const px = ax + (bx - ax) * t;
  const py = ay + (by - ay) * t;
  return { t, distanzaM: distanzaKm([x, y], [px, py]) * 1000 };
}

// Dove cade un punto lungo la traccia, nell'ordine di percorrenza: km dalla partenza del punto
// della traccia più vicino (i pezzi si sommano uno dopo l'altro)
export function kmLungoLaTraccia(punto, pezzi) {
  let migliore = { distanzaM: Infinity, km: null };
  let fatti = 0;
  for (const linea of pezzi ?? []) {
    for (let i = 1; i < linea.length; i++) {
      const tratto = distanzaKm(linea[i - 1], linea[i]);
      const p = proiezione(punto, linea[i - 1], linea[i]);
      if (p.distanzaM < migliore.distanzaM) migliore = { distanzaM: p.distanzaM, km: fatti + tratto * p.t };
      fatti += tratto;
    }
  }
  return migliore.km;
}

export function lunghezzaDeiPezzi(pezzi) {
  let km = 0;
  for (const linea of pezzi ?? []) for (let i = 1; i < linea.length; i++) km += distanzaKm(linea[i - 1], linea[i]);
  return km;
}

// Il tratto più lungo senza nessuno dei punti dati (km lungo la traccia), partenza e arrivo compresi
export function trattoPiuLungoSenza(kmPunti, totaleKm) {
  const tappe = [0, ...kmPunti.filter((k) => Number.isFinite(k)).sort((a, b) => a - b), totaleKm];
  let tratto = { da: 0, a: totaleKm, km: -1 };
  for (let i = 1; i < tappe.length; i++) {
    if (tappe[i] - tappe[i - 1] > tratto.km) tratto = { da: tappe[i - 1], a: tappe[i], km: tappe[i] - tappe[i - 1] };
  }
  return tratto;
}

// "12,4"
export const km1 = (x) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');

// --- Percorsi su più giorni ---


// Km e minuti progressivi a ogni punto della traccia, con il metodo CAI (src/lib/durata.js)
// applicato ai valori progressivi. Salite e discese si contano come in dislivello() (stessa
// soglia, ogni pezzo per conto suo, resto finale compreso): l'ultimo punto dà la stessa durata
// di misureDeiPezzi, quella in alto nella pagina.
// Senza quote su tutti i punti il tempo è proporzionale ai km (4 km/h).
export function profiloTempi(pezzi) {
  const punti = (pezzi ?? []).flat();
  const conQuote = punti.length > 1 && punti.every((p) => Number.isFinite(p[2]));
  const km = [];
  const min = [];
  let fatti = 0;
  let salita = 0;
  let discesa = 0;
  const tempo = () => {
    const orePiano = fatti / VELOCITA_PIANO_KMH;
    const oreDisl = conQuote ? salita / SALITA_MH + discesa / DISCESA_MH : 0;
    return (Math.max(orePiano, oreDisl) + Math.min(orePiano, oreDisl) / 2) * 60;
  };
  for (const linea of pezzi ?? []) {
    let rif = conQuote ? linea[0]?.[2] : 0;
    for (let j = 0; j < linea.length; j++) {
      if (j > 0) fatti += distanzaKm(linea[j - 1], linea[j]);
      if (conQuote) {
        const d = linea[j][2] - rif;
        if (d >= SOGLIA_RUMORE_M) (salita += d), (rif = linea[j][2]);
        else if (d <= -SOGLIA_RUMORE_M) (discesa -= d), (rif = linea[j][2]);
        // fine del pezzo: il resto sotto soglia conta comunque, come in dislivello()
        if (j === linea.length - 1) {
          const resto = linea[j][2] - rif;
          if (resto > 0) salita += resto;
          else discesa -= resto;
        }
      }
      km.push(fatti);
      min.push(tempo());
    }
  }
  return { punti, km, min, conQuote };
}

// Numeri della pagina di un percorso di Pianifica (km, dislivello, durata) dai pezzi:
// lo stesso calcolo di "Su più giorni"
export function misureDeiPezzi(pezzi) {
  const km = lunghezzaKm({ coordinates: pezzi });
  const disl = dislivello(pezzi);
  return { km, salita: disl?.salita ?? null, discesa: disl?.discesa ?? null, durataMin: stimaDurataMin(km, disl), durataStimata: true, conQuote: Boolean(disl) };
}

// Dove si arriva dopo "minuti" di cammino: km e punto, interpolando tra due punti della traccia
function alMinuto(serie, minuti) {
  const { punti, km, min } = serie;
  const i = min.findIndex((m) => m >= minuti);
  if (i <= 0) return i === 0 ? { km: 0, punto: punti[0] } : null;
  const f = (minuti - min[i - 1]) / (min[i] - min[i - 1] || 1);
  const [a, b] = [punti[i - 1], punti[i]];
  return { km: km[i - 1] + (km[i] - km[i - 1]) * f, punto: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f] };
}

const RESTO_MIN = 30; // meno di mezz'ora rimasta: si arriva in giornata

// Fine di ogni giornata con "ore" di cammino al giorno (l'ultima giornata finisce all'arrivo)
export function finiGiornata(serie, ore) {
  const totale = serie.min.at(-1) ?? 0;
  const fini = [];
  for (let g = 1; g * ore * 60 < totale - RESTO_MIN; g++) fini.push({ giorno: g, minuti: g * ore * 60, ...alMinuto(serie, g * ore * 60) });
  return fini;
}

// Rifugi e bivacchi per la notte vicino a un punto di fine giornata ({ km, punto }): entro raggioM
// dalla traccia e a non più di finestraKm (lungo la traccia) dal punto, dal più vicino
export function rifugiPerLaNotte(punti, pezzi, fine, { raggioM = 1000, finestraKm = 3, perLaNotte = () => true } = {}) {
  const geojson = { type: 'MultiLineString', coordinates: pezzi };
  const vicino = (finestraKm * 1000 + raggioM) / 1000; // in linea d'aria, per scartare subito i lontani
  return punti
    .filter((p) => perLaNotte(p) && distanzaKm([p.lon, p.lat], fine.punto) <= vicino)
    .map((p) => ({ ...p, km: kmLungoLaTraccia([p.lon, p.lat], pezzi), distanzaM: Math.round(distanzaDallaTracciaM([p.lon, p.lat], geojson)) }))
    .filter((p) => p.km != null && Math.abs(p.km - fine.km) <= finestraKm && p.distanzaM <= raggioM)
    .sort((a, b) => Math.abs(a.km - fine.km) - Math.abs(b.km - fine.km));
}
