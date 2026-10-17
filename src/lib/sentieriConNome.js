// Sentieri con nome da OpenStreetMap che non sono un itinerario segnato (relazione route=hiking…): tratti
// con lo stesso nome e collegati tra loro, lunghi almeno 1 km, solo se il nome sembra quello di un sentiero.
// Entrano in "Cerca percorsi qui" come percorsi normali. Qui solo i calcoli, senza rete.
import { lunghezzaKm } from './geo.js';
import { nuovoRecord } from './importazione.js';
import { ID_INTORNO } from '../datiParchi.js';

export const MINIMO_KM_NOME = 1;
const VIE_DA_SENTIERO = new Set(['path', 'footway', 'bridleway']);
const VIE_AMMESSE = new Set(['path', 'footway', 'bridleway', 'track']);

// "Via Roma", "Strada Vicinale Tramacere", "SP 358": strade, non sentieri
const STRADA = /^(via|viale|vico|vicolo|corso|piazza|piazzale|contrada|c\.da|strada|str\.|vicinale|provinciale|comunale|statale|litoranea|sp|sr|ss|sc)( |\.|$)/i;
// parole da sentiero nel nome, o un codice di rete ("PNR COL N08 …", "AB12 …")
const PAROLA_SENTIERO = /(sentiero|cammino|percorso|itinerario|mulattiera|trekking|escursion)/i;
const CODICE_RETE = /^(PNR|PNA|RNR|RNO|CAI|SI)( |$)|^[A-Z]{2,5}( [A-Z]{2,5})* [A-Z]?\d{1,3}( |$)/;

// highway: il tipo della via OSM (path, footway, bridleway, track…)
export function nomeDaSentiero(nome, highway = '') {
  const n = String(nome ?? '').trim();
  if (!n || STRADA.test(n)) return false;
  return VIE_DA_SENTIERO.has(highway) || PAROLA_SENTIERO.test(n) || CODICE_RETE.test(n);
}

// Indirizzi Overpass: solo le vie con nome che potrebbero essere sentieri (path, footway, bridleway, e le
// carrarecce con una parola da sentiero o un codice), senza i nomi da strada
const NO_STRADA = '["name"!~"^(Via|Viale|Vico|Vicolo|Corso|Piazza|Piazzale|Contrada|C\\\\.da|Strada|Str\\\\.|Vicinale|Provinciale|Comunale|Statale|Litoranea)( |\\\\.|$)",i]["access"!~"^(private|no)$"]';
export const queryVieConNome = (bbox) => {
  const b = bbox.join(',');
  return `way["name"]["highway"~"^(path|footway|bridleway)$"]${NO_STRADA}(${b});
way["name"~"sentiero|cammino|percorso|itinerario|mulattiera|trekking|^(PNR|PNA|RNR|CAI) ",i]["highway"="track"]${NO_STRADA}(${b});
out body geom(${b});`;
};

const lineeDellaVia = (el) => {
  const linee = [[]];
  for (const p of el.geometry ?? []) {
    if (p && Number.isFinite(p.lat)) linee.at(-1).push([p.lon, p.lat]);
    else if (linee.at(-1).length) linee.push([]);
  }
  return linee.filter((l) => l.length > 1);
};

// Vie → gruppi di vie con lo stesso nome e collegate (nodi in comune)
function gruppiCollegati(vie) {
  const gruppi = [];
  const perNome = new Map();
  for (const v of vie) perNome.set(v.tags.name, [...(perNome.get(v.tags.name) ?? []), v]);
  for (const lista of perNome.values()) {
    const padre = lista.map((_, i) => i);
    const radice = (i) => (padre[i] === i ? i : (padre[i] = radice(padre[i])));
    const nodo = new Map();
    lista.forEach((v, i) => {
      for (const n of v.nodes ?? []) {
        if (nodo.has(n)) padre[radice(i)] = radice(nodo.get(n));
        else nodo.set(n, i);
      }
    });
    const per = new Map();
    lista.forEach((v, i) => per.set(radice(i), [...(per.get(radice(i)) ?? []), v]));
    gruppi.push(...per.values());
  }
  return gruppi;
}

// Risposta Overpass (vie con la geometria; le relazioni a piedi o in bici, se ci sono, escludono i loro tratti)
// → [{ sentiero, traccia }] pronti da salvare, come quelli di percorsiIntorno
export function sentieriConNome(json, { esistenti = new Set(), oggi = new Date().toISOString().slice(0, 10) } = {}) {
  const elementi = json?.elements ?? [];
  const inRelazione = new Set(elementi.filter((e) => e.type === 'relation').flatMap((e) => (e.members ?? []).filter((m) => m.type === 'way').map((m) => m.ref)));
  const vie = elementi.filter(
    (e) => e.type === 'way' && e.geometry?.length > 1 && VIE_AMMESSE.has(e.tags?.highway) && !/^(private|no)$/.test(e.tags?.access ?? '') && nomeDaSentiero(e.tags?.name, e.tags?.highway) && !inRelazione.has(e.id),
  );
  const risultati = [];
  for (const gruppo of gruppiCollegati(vie)) {
    const linee = gruppo.flatMap(lineeDellaVia);
    const km = Math.round(lunghezzaKm({ coordinates: linee }) * 10) / 10;
    if (km < MINIMO_KM_NOME) continue;
    const nome = gruppo[0].tags.name.trim();
    const primo = Math.min(...gruppo.map((v) => v.id));
    const id = `osm-nome-${primo}`;
    if (esistenti.has(id)) continue;
    const url = `https://www.openstreetmap.org/way/${primo}`;
    const { traccia, ...record } = nuovoRecord(
      {
        fonte: 'osm-nomi:intorno',
        tipo: 'sentiero',
        chiave: `intorno:${primo}`,
        id,
        url,
        nome,
        zona: '',
        codici: [],
        difficolta: null,
        titoloFonte: 'OpenStreetMap (ODbL)',
        parco: ID_INTORNO,
        descrizione: 'Sentiero con nome su OpenStreetMap, non segnato come itinerario: controlla il percorso sulla mappa e rispetta le regole del luogo.',
        animali: [],
        lunghezzaKm: km,
        attivita: { trekking: { stato: 'percorribile', motivi: ['Sentiero con nome su OpenStreetMap (non segnato come itinerario)'] } },
        traccia: { origine: 'osm', geojson: { type: 'MultiLineString', coordinates: linee }, dettagli: { codici: [], fonte: url, nomeOsm: true } },
      },
      oggi,
    );
    const idRecord = `intorno-${id}`;
    risultati.push({
      sentiero: { ...record, id: idRecord, accesso: { ...record.accesso, link: url }, bici: { ...record.bici, link: url } },
      traccia: { sentieroId: idRecord, ...traccia, dettagli: { ...traccia.dettagli, intorno: true } },
    });
  }
  // lo stesso nome su due tratti staccati: si distinguono con un numero (il più lungo è il primo)
  const conta = new Map();
  for (const r of risultati) conta.set(r.sentiero.nome, (conta.get(r.sentiero.nome) ?? 0) + 1);
  const numero = new Map();
  risultati.sort((a, b) => b.sentiero.lunghezzaKm - a.sentiero.lunghezzaKm);
  for (const r of risultati) {
    if (conta.get(r.sentiero.nome) < 2) continue;
    const k = (numero.get(r.sentiero.nome) ?? 0) + 1;
    numero.set(r.sentiero.nome, k);
    r.sentiero.nome = `${r.sentiero.nome} (${k})`;
  }
  return risultati;
}
