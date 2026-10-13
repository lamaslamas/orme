// Sentiero toccato sulla mappa (uno qualsiasi di OpenStreetMap, anche non segnato): la via più
// vicina al tocco, con nome, tipo, difficoltà CAI e se è segnata (fa parte di un percorso
// escursionistico o ha il segnavia). Una richiesta piccola a Overpass, solo al tocco.
import { difficoltaDaOsm, testoDifficolta } from './difficolta.js';
import { distanzaDallaTracciaM } from './geo.js';

export const RAGGIO_TOCCO_M = 25;
const TIPI_VIA = { path: 'Sentiero', footway: 'Sentiero', bridleway: 'Mulattiera', steps: 'Gradini', track: 'Carrareccia' };

export function queryViaVicina(lat, lon, raggioM = RAGGIO_TOCCO_M) {
  return `[out:json][timeout:20];
way(around:${raggioM},${lat.toFixed(6)},${lon.toFixed(6)})[highway~"^(path|footway|bridleway|track|steps)$"]->.vie;
.vie out tags geom;
rel(bw.vie)[route~"^(hiking|foot)$"];
out body;`;
}

const segnataDaTag = (t) => Boolean(t['osmc:symbol'] || t.trailblazed === 'yes' || t.marked_trail || t['marked_trail:symbol'] || t.ref);

// Risposta → la via più vicina a [lon, lat] (o null): { id, nome, tipo, difficolta, segnata, percorsi, tag }
export function viaDallaRisposta(json, [lon, lat]) {
  const elementi = json?.elements ?? [];
  const vie = elementi.filter((e) => e.type === 'way' && e.geometry?.length > 1);
  if (!vie.length) return null;
  const distanza = (v) => distanzaDallaTracciaM([lon, lat], { type: 'MultiLineString', coordinates: [v.geometry.map((g) => [g.lon, g.lat])] });
  const via = vie.map((v) => ({ v, d: distanza(v) })).sort((a, b) => a.d - b.d)[0].v;
  const t = via.tags ?? {};
  const percorsi = elementi
    .filter((e) => e.type === 'relation' && (e.members ?? []).some((m) => m.type === 'way' && m.ref === via.id))
    .map((r) => ({ id: r.id, nome: r.tags?.name ?? null, ref: r.tags?.ref ?? null, rete: r.tags?.network ?? null }));
  const difficolta = difficoltaDaOsm(t) ?? percorsi.map((p) => difficoltaDaOsm(elementi.find((e) => e.id === p.id)?.tags ?? {})).find(Boolean) ?? null;
  return {
    id: via.id,
    nome: t.name ?? percorsi.find((p) => p.nome)?.nome ?? null,
    tipo: TIPI_VIA[t.highway] ?? 'Sentiero',
    difficolta,
    testoDifficolta: testoDifficolta(difficolta),
    segnata: percorsi.length > 0 || segnataDaTag(t),
    percorsi,
    linea: via.geometry.map((g) => [g.lon, g.lat]),
    tag: { highway: t.highway, surface: t.surface ?? null, trail_visibility: t.trail_visibility ?? null, access: t.access ?? null, foot: t.foot ?? null },
  };
}

// Accesso vietato o privato secondo OSM
export const viaVietata = (via) => ['no', 'private'].includes(via?.tag?.access) || via?.tag?.foot === 'no';
