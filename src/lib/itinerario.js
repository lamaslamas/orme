// "Scarica questo itinerario": toccando un sentiero segnato che non è nell'archivio, l'intera relazione
// route=hiking di OpenStreetMap a cui appartiene il tratto diventa un percorso sul telefono, come quelli
// di "Cerca percorsi qui" (stessa conversione), ma intero (niente ritaglio) e anche dentro i parchi.
import { candidatiSentieri } from './fonti/osmSentieri.js';
import { nuovoRecord } from './importazione.js';

// tutta la relazione con la geometria dei tratti, più i tag dei tratti (vie ferrate)
export const queryItinerario = (idRelazione) => `[out:json][timeout:60];
rel(${Number(idRelazione)});
out geom;
way(r);
out tags;`;

// solo i tag della relazione (pochi byte): per sapere se OpenStreetMap la dà come anello (roundtrip=yes)
export const queryTagRelazione = (idRelazione) => `[out:json][timeout:25];\nrel(${Number(idRelazione)});\nout tags;`;
export const eRoundtrip = (json) => (json?.elements ?? []).some((e) => e.type === 'relation' && e.tags?.roundtrip === 'yes');

const TUTTO = [-90, -180, 90, 180];

// Risposta → { sentiero, traccia } (o null se la relazione non c'è o è troppo corta).
// idParco: il parco in cui parte l'itinerario, oppure "intorno" fuori dai parchi.
export function itinerarioDallaRisposta(json, idRelazione, idParco, oggi = new Date().toISOString().slice(0, 10)) {
  const c = candidatiSentieri(json, idParco, { id: idParco, bbox: TUTTO }).find((x) => x.idOsm === Number(idRelazione));
  if (!c) return null;
  const { traccia, ...record } = nuovoRecord(c, oggi);
  const id = idItinerario(idRelazione);
  return {
    // "scaricato": resta anche quando si cerca un'altra zona (non è un percorso della zona)
    sentiero: { ...record, id, parco: idParco, parchi: [idParco], scaricato: { data: oggi }, accesso: { ...record.accesso, link: c.url }, bici: { ...record.bici, link: c.url } },
    traccia: { sentieroId: id, ...traccia, dettagli: { ...traccia.dettagli, relazioniOsm: [Number(idRelazione)], scaricato: true } },
  };
}

// stesso id dei sentieri OSM dell'archivio: se poi l'itinerario entra nell'archivio non si raddoppia
export const idItinerario = (idRelazione) => `osm-sentiero-${Number(idRelazione)}`;

// L'itinerario è già sul telefono? Restituisce l'id del percorso (archivio, zona o scaricato) o null.
// tracce: Map id → traccia (per i sentieri dell'archivio scritti a mano con la relazione nella traccia)
export function itinerarioPresente(idRelazione, ids, tracce = new Map()) {
  const r = Number(idRelazione);
  for (const id of [idItinerario(r), `intorno-${idItinerario(r)}`]) if (ids.has(id)) return id;
  for (const [id, t] of tracce) {
    if ((t?.dettagli?.relazioniOsm ?? []).includes(r) || String(t?.dettagli?.fonte ?? '').endsWith(`/relation/${r}`)) return id;
  }
  return null;
}

// Riga per scegliere tra più itinerari: "SI · Sentiero Italia CAI (nwn)"
export function testoItinerario(p) {
  const RETI = { iwn: 'internazionale', nwn: 'nazionale', rwn: 'regionale', lwn: 'locale' };
  return [p.ref, p.nome, RETI[p.rete] ? `rete ${RETI[p.rete]}` : ''].filter(Boolean).join(' · ') || `Itinerario ${p.id}`;
}

// raggio (km) della ricerca della fauna intorno alla traccia: metà diagonale del suo riquadro più 1 km
export function zonaDellaTraccia(geojson) {
  const punti = (geojson?.type === 'LineString' ? [geojson.coordinates] : geojson?.coordinates ?? []).flat();
  if (!punti.length) return null;
  let [o, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of punti) [o, s, e, n] = [Math.min(o, x), Math.min(s, y), Math.max(e, x), Math.max(n, y)];
  const centro = [(o + e) / 2, (s + n) / 2];
  const kmLon = (e - o) * 111.32 * Math.cos((centro[1] * Math.PI) / 180);
  const kmLat = (n - s) * 110.57;
  return { centro, km: Math.min(25, Math.ceil(Math.hypot(kmLon, kmLat) / 2 + 1)) };
}
