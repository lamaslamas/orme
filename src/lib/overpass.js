import { BBOX_PNALM } from './costanti.js';

// Confine del PNALM su OpenStreetMap (relazione 8426003 → area 3600000000 + id)
export const AREA_PNALM = 3608426003;

export const SERVER_OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Cerca le relazioni route=hiking con quei codici dentro il confine del Parco.
// Se il confine non viene trovato, ripiega sul riquadro del Parco.
export function costruisciQuery(codici) {
  const lista = codici.map((c) => escapeRegex(c.trim())).filter(Boolean);
  if (!lista.length) throw new Error('Il sentiero non ha codici da cercare.');
  const ref = `^(PNALM[ -]?)?(${lista.join('|')})$`;
  const [s, o, n, e] = BBOX_PNALM;
  return `[out:json][timeout:60];
area(id:${AREA_PNALM})->.parco;
rel["route"="hiking"]["ref"~"${ref}",i](area.parco)->.dentro;
(.dentro;rel["route"="hiking"]["ref"~"${ref}",i](${s},${o},${n},${e})(if:dentro.count(relations)==0););
out geom;`;
}

export function normalizzaCodice(ref) {
  return String(ref ?? '')
    .toUpperCase()
    .replace(/^PNALM[ -]?/, '')
    .trim();
}

// Trasforma la risposta di Overpass in un elenco di candidati
export function interpretaRisposta(json) {
  const candidati = [];
  for (const el of json?.elements ?? []) {
    if (el.type !== 'relation') continue;
    const linee = [];
    for (const membro of el.members ?? []) {
      if (membro.type !== 'way' || !Array.isArray(membro.geometry)) continue;
      const linea = membro.geometry
        .filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon))
        .map((p) => [p.lon, p.lat]);
      if (linea.length > 1) linee.push(linea);
    }
    if (!linee.length) continue;
    const t = el.tags ?? {};
    candidati.push({
      idOsm: el.id,
      codice: normalizzaCodice(t.ref),
      nome: t.name ?? '',
      da: t.from ?? '',
      a: t.to ?? '',
      linee,
    });
  }
  return candidati;
}

// Raggruppa i candidati per codice richiesto
export function raggruppaPerCodice(codici, candidati) {
  const gruppi = {};
  for (const c of codici) gruppi[c.toUpperCase()] = [];
  for (const c of candidati) gruppi[c.codice]?.push(c);
  return gruppi;
}

// Unisce le relazioni scelte in un'unica traccia
export function combinaTraccia(scelti) {
  return {
    origine: 'osm',
    geojson: { type: 'MultiLineString', coordinates: scelti.flatMap((c) => c.linee) },
    dettagli: { relazioniOsm: scelti.map((c) => c.idOsm), codici: scelti.map((c) => c.codice) },
  };
}

// Prova i server uno dopo l'altro: Overpass a volte è sovraccarico
export async function interrogaOverpass(query, { server = SERVER_OVERPASS, fetchFn = fetch, timeoutMs = 45000 } = {}) {
  let ultimoErrore;
  for (const url of server) {
    const controllo = new AbortController();
    const timer = setTimeout(() => controllo.abort(), timeoutMs);
    try {
      const risposta = await fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: controllo.signal,
      });
      if (!risposta.ok) throw new Error(`il server ha risposto ${risposta.status}`);
      return await risposta.json();
    } catch (e) {
      ultimoErrore = e;
    } finally {
      clearTimeout(timer);
    }
  }
  const motivo = ultimoErrore?.name === 'AbortError' ? 'tempo scaduto' : ultimoErrore?.message;
  throw new Error(`OpenStreetMap non risponde (${motivo}). Riprova tra qualche minuto o importa un GPX.`);
}

export async function cercaSuOsm(codici, opzioni) {
  const json = await interrogaOverpass(costruisciQuery(codici), opzioni);
  return raggruppaPerCodice(codici, interpretaRisposta(json));
}
