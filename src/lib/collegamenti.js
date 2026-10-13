// Uscite delle associazioni collegate a un sentiero dell'archivio ("È questo" tra i Sentieri probabili).
// Le uscite con lo stesso ritrovo propongono per primo il sentiero già scelto per un'altra; i
// collegamenti si possono esportare in public/dati/collegamenti.json, che il robot applica all'archivio.
import { normalizza } from './filtri.js';
import { distanzaKm } from './geo.js';

export const RITROVO_VICINO_M = 1000;

// punti del ritrovo: le coordinate di partenza o i luoghi trovati sulla mappa
const puntiRitrovo = (s) => [
  ...(s?.partenza?.lat != null && s?.partenza?.lon != null ? [[s.partenza.lon, s.partenza.lat]] : []),
  ...(s?.luoghi?.punti ?? []).map((l) => [l.lon, l.lat]),
];

// stesso ritrovo: stesso paese di partenza, oppure un luogo a meno di 1 km
export function stessoRitrovo(a, b) {
  const pa = normalizza(a?.partenza?.paese ?? '');
  if (pa && pa === normalizza(b?.partenza?.paese ?? '')) return true;
  const qb = puntiRitrovo(b);
  return puntiRitrovo(a).some((p) => qb.some((q) => distanzaKm(p, q) * 1000 <= RITROVO_VICINO_M));
}

// Collegamento di un'uscita, se c'è: dalla traccia scelta tra i probabili (sul telefono o nell'archivio)
export function collegamentoDi(uscita, traccia) {
  const c = traccia?.dettagli?.conferma;
  if (c?.sentiero) return { uscita: uscita.id, sentiero: c.sentiero, nome: c.nome, data: c.data };
  return null;
}

// Candidati di un'uscita con in testa i sentieri scelti per le uscite con lo stesso ritrovo.
// collegati: [{ uscita, sentiero: { id, nome, codici } }]
export function conStessoRitrovo(uscita, candidati, collegati) {
  const risultato = candidati.map((c) => ({ ...c, motivi: [...c.motivi] }));
  for (const { uscita: altra, sentiero } of collegati) {
    if (altra.id === uscita.id || !stessoRitrovo(uscita, altra)) continue;
    const motivo = `stesso ritrovo di «${altra.escursione?.nomeUscita || altra.nome}»`;
    const i = risultato.findIndex((c) => c.id === sentiero.id);
    const c = i >= 0 ? risultato.splice(i, 1)[0] : { id: sentiero.id, nome: sentiero.nome, codici: sentiero.codici ?? [], motivi: [] };
    if (!c.motivi.some((m) => m.startsWith('stesso ritrovo'))) c.motivi.unshift(motivo);
    risultato.unshift(c);
  }
  return risultato;
}

// Riepilogo: uscite da collegare (senza traccia e senza "nessuno"), collegate, senza sentiero adatto
export function statoCollegamenti(uscite, tracce) {
  const da = [];
  const collegate = [];
  const nessuno = [];
  for (const s of uscite) {
    const t = tracce.get(s.id);
    if (t) collegate.push(s);
    else if (s.collegamento?.nessuno) nessuno.push(s);
    else da.push(s);
  }
  return { daCollegare: da, collegate, nessuno };
}

// File da mettere nel repository: i collegamenti di prima più quelli nuovi del telefono (questi
// vincono); "nessuno" vale solo finché non c'è un sentiero. Ordinati per uscita, così il diff è leggibile.
export function fileCollegamenti(prima, nuovi, oggi = new Date().toISOString().slice(0, 10)) {
  const per = new Map((prima?.collegamenti ?? []).map((c) => [c.uscita, c]));
  for (const c of nuovi) {
    const vecchio = per.get(c.uscita);
    if (vecchio && !c.sentiero && vecchio.sentiero) continue;
    per.set(c.uscita, c.sentiero ? { uscita: c.uscita, sentiero: c.sentiero, nome: c.nome, data: c.data ?? oggi } : { uscita: c.uscita, nessuno: true, data: c.data ?? oggi });
  }
  return { descrizione: 'Uscite delle associazioni collegate a un sentiero dell\'archivio (Orme, "Esporta collegamenti")', aggiornato: oggi, collegamenti: [...per.values()].sort((a, b) => a.uscita.localeCompare(b.uscita)) };
}

// Robot: applica i collegamenti all'archivio. L'uscita prende la traccia del sentiero scelto (se ne
// ha già una sua, resta la sua). Restituisce quante uscite ha collegato e i collegamenti non validi.
export function applicaCollegamenti(percorsi, file) {
  const perId = new Map(percorsi.map((p) => [p.id, p]));
  let collegate = 0;
  const nonValidi = [];
  for (const c of file?.collegamenti ?? []) {
    const uscita = perId.get(c.uscita);
    if (!c.sentiero) {
      // "nessun sentiero adatto": vale anche sugli altri telefoni, finché l'uscita non ha una traccia
      if (uscita && !uscita.traccia) uscita.collegamento = { nessuno: true, data: c.data };
      else if (!uscita) nonValidi.push(c.uscita);
      continue;
    }
    const sentiero = perId.get(c.sentiero);
    if (!uscita || !sentiero?.traccia?.geojson) {
      nonValidi.push(c.uscita);
      continue;
    }
    if (uscita.traccia && !uscita.traccia.dettagli?.conferma) continue; // traccia propria dell'uscita
    uscita.traccia = { origine: sentiero.traccia.origine ?? 'osm', geojson: sentiero.traccia.geojson, dettagli: { conferma: { sentiero: sentiero.id, nome: sentiero.nome, data: c.data } } };
    delete uscita.collegamento;
    collegate++;
  }
  return { collegate, nonValidi };
}

// Sentieri delle uscite per il livello della mappa: un elemento per sentiero (più uscite possono
// usare lo stesso), con la traccia e le uscite che lo usano. Le uscite con una traccia propria
// sono un elemento a sé.
export function sentieriDelleUscite(uscite, tracce) {
  const per = new Map();
  for (const u of uscite) {
    const t = tracce.get(u.id);
    if (!t?.geojson) continue;
    const c = t.dettagli?.conferma;
    const chiave = c?.sentiero ?? u.id;
    const voce = per.get(chiave) ?? { chiave, sentiero: c?.sentiero ?? null, nome: c?.nome ?? u.nome, geojson: t.geojson, uscite: [] };
    voce.uscite.push(u);
    per.set(chiave, voce);
  }
  return [...per.values()];
}

// Collegamenti scelti su questo telefono (non quelli già arrivati dall'archivio comune)
export function collegamentiDelTelefono(uscite, tracce) {
  const r = [];
  for (const u of uscite) {
    const t = tracce.get(u.id);
    const c = collegamentoDi(u, t);
    if (c && !t.dettagli?.archivio) r.push(c);
    else if (!t && u.collegamento?.nessuno) r.push({ uscita: u.id, nessuno: true, data: u.collegamento.data });
  }
  return r;
}

// Testo del file con un collegamento per riga: le modifiche su GitHub restano leggibili
export function testoFileCollegamenti(file) {
  const righe = file.collegamenti.map((c) => `    ${JSON.stringify(c)}`).join(',\n');
  const elenco = righe ? `[\n${righe}\n  ]` : '[]';
  return `{\n  "descrizione": ${JSON.stringify(file.descrizione)},\n  "aggiornato": ${JSON.stringify(file.aggiornato)},\n  "collegamenti": ${elenco}\n}\n`;
}

// file già uguale a quello del repository (niente da esportare)
export const stessiCollegamenti = (a, b) => JSON.stringify(a?.collegamenti ?? []) === JSON.stringify(b?.collegamenti ?? []);

// Punti di ritrovo per la mappa delle uscite: le uscite con lo stesso paese (o, senza paese, a meno
// di 1 km da un altro punto) diventano un punto solo. Coordinate: la partenza, il luogo che ha il nome del
// paese, il primo luogo trovato, l'inizio della traccia. Senza nessuna di queste l'uscita non va in mappa.
export function puntiDiRitrovo(uscite, tracce = new Map()) {
  const per = new Map();
  const senzaPosto = [];
  // prima quelle con il paese: le altre si uniscono al punto più vicino entro 1 km
  const ordinate = [...uscite].sort((a, b) => Number(!a.partenza?.paese?.trim()) - Number(!b.partenza?.paese?.trim()));
  for (const u of ordinate) {
    const paese = u.partenza?.paese?.trim() ?? '';
    const luoghi = u.luoghi?.punti ?? [];
    const delPaese = paese && luoghi.find((l) => normalizza(l.nome) === normalizza(paese));
    const inizio = primoPunto(tracce.get(u.id)?.geojson);
    const p =
      u.partenza?.lat != null && u.partenza?.lon != null
        ? { lat: u.partenza.lat, lon: u.partenza.lon, nome: paese || u.partenza.descrizione || '' }
        : delPaese
          ? { lat: delPaese.lat, lon: delPaese.lon, nome: paese }
          : luoghi[0]
            ? { lat: luoghi[0].lat, lon: luoghi[0].lon, nome: paese || luoghi[0].nome }
            : inizio
              ? { lat: inizio[1], lon: inizio[0], nome: paese || u.zona || '' }
              : null;
    if (!p) {
      // senza coordinate: si unisce a un'uscita dello stesso paese, se ce n'è una
      if (paese) senzaPosto.push([normalizza(paese), u]);
      continue;
    }
    const vicino = !paese && [...per.values()].find((v) => distanzaKm([v.lon, v.lat], [p.lon, p.lat]) * 1000 <= RITROVO_VICINO_M);
    const chiave = vicino ? vicino.chiave : paese ? normalizza(paese) : `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
    const voce = per.get(chiave) ?? { chiave, nome: p.nome, lat: p.lat, lon: p.lon, uscite: [] };
    voce.uscite.push(u);
    per.set(chiave, voce);
  }
  for (const [chiave, u] of senzaPosto) per.get(chiave)?.uscite.push(u);
  return [...per.values()].sort((a, b) => b.uscite.length - a.uscite.length);
}

function primoPunto(g) {
  if (!g) return null;
  if (g.type === 'LineString') return g.coordinates[0] ?? null;
  if (g.type === 'MultiLineString') return g.coordinates[0]?.[0] ?? null;
  if (g.type === 'FeatureCollection') return primoPunto(g.features?.[0]?.geometry);
  if (g.type === 'Feature') return primoPunto(g.geometry);
  return null;
}
