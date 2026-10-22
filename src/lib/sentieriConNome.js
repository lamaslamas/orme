// Sentieri con nome da OpenStreetMap che non sono un itinerario segnato (relazione route=hiking…): tratti
// con lo stesso nome e collegati tra loro, lunghi almeno 1 km, solo se il nome sembra quello di un sentiero.
// Entrano in "Cerca percorsi qui" come percorsi normali. Qui solo i calcoli, senza rete.
import { lunghezzaKm } from './geo.js';
import { nuovoRecord } from './importazione.js';
import { ID_INTORNO } from '../datiParchi.js';
import { dentroIlParco } from './overpass.js';

export const MINIMO_KM_NOME = 1;
const VIE_DA_SENTIERO = new Set(['path', 'footway', 'bridleway']);
const VIE_AMMESSE = new Set(['path', 'footway', 'bridleway', 'track']);

// "Via Roma", "Strada Vicinale Tramacere", "SP 358": strade, non sentieri
const STRADA = /^(via|viale|vico|vicolo|corso|piazza|piazzale|contrada|c\.da|strada|str\.|vicinale|provinciale|comunale|statale|litoranea|sp|sr|ss|sc)( |\.|$)/i;
// parole da sentiero nel nome, o un codice di rete ("PNR COL N08 …", "AB12 …")
const PAROLA_SENTIERO = /(sentiero|cammino|percorso|itinerario|mulattiera|trekking|escursion)/i;
const CODICE_RETE = /^(PNR|PNA|RNR|RNO|CAI|SI)( |$)|^[A-Z]{2,5}( [A-Z]{2,5})* [A-Z]?\d{1,3}( |$)/;

// ferrovie e piste ciclabili o ciclopedonali: hanno highway=path ma non sono sentieri
const NON_SENTIERO = /(ferrovia|ciclabile|ciclopedonale|ciclovia|tramvia|metropolitana)/i;

// highway: il tipo della via OSM (path, footway, bridleway, track…)
export function nomeDaSentiero(nome, highway = '') {
  const n = String(nome ?? '').trim();
  if (!n || STRADA.test(n) || NON_SENTIERO.test(n)) return false;
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

// Come queryVieConNome, ma dentro un parco (area OSM): in più le relazioni a piedi o in bici, per escluderne i tratti
export function queryVieConNomeParco(parco) {
  const { prima, filtro } = dentroIlParco(parco);
  return `[out:json][timeout:180];
${prima}rel["route"~"^(hiking|foot|bicycle|mtb)$"]${filtro};
out body;
(
way["name"]["highway"~"^(path|footway|bridleway)$"]${NO_STRADA}${filtro};
way["name"~"sentiero|cammino|percorso|itinerario|mulattiera|trekking|^(PNR|PNA|RNR|CAI) ",i]["highway"="track"]${NO_STRADA}${filtro};
);
out body geom;`;
}

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

// Risposta Overpass → gruppi di vie con lo stesso nome, collegate, di almeno 1 km: [{ nome, linee, km, primo }].
// ritaglia(linee) → linee: per tenere solo il tratto dentro un'area (prima di contare i km)
function gruppiSentieri(json, { ritaglia = null } = {}) {
  const elementi = json?.elements ?? [];
  const inRelazione = new Set(elementi.filter((e) => e.type === 'relation').flatMap((e) => (e.members ?? []).filter((m) => m.type === 'way').map((m) => m.ref)));
  const vie = elementi.filter(
    (e) =>
      e.type === 'way' && e.geometry?.length > 1 && VIE_AMMESSE.has(e.tags?.highway) && !e.tags?.railway && !/^(private|no)$/.test(e.tags?.access ?? '') && nomeDaSentiero(e.tags?.name, e.tags?.highway) && !inRelazione.has(e.id),
  );
  const gruppi = [];
  for (const gruppo of gruppiCollegati(vie)) {
    const linee = ritaglia ? ritaglia(gruppo.flatMap(lineeDellaVia)) : gruppo.flatMap(lineeDellaVia);
    if (!linee.length) continue;
    const km = Math.round(lunghezzaKm({ coordinates: linee }) * 10) / 10;
    if (km < MINIMO_KM_NOME) continue;
    gruppi.push({ nome: gruppo[0].tags.name.trim(), linee, km, primo: Math.min(...gruppo.map((v) => v.id)) });
  }
  return gruppi;
}

// lo stesso nome su due tratti staccati: si distinguono con un numero (il più lungo è il primo)
function distinguiNomi(elementi, nomeDi, assegna) {
  const conta = new Map();
  for (const r of elementi) conta.set(nomeDi(r), (conta.get(nomeDi(r)) ?? 0) + 1);
  const numero = new Map();
  elementi.sort((a, b) => b.km - a.km);
  for (const r of elementi) {
    if (conta.get(nomeDi(r)) < 2) continue;
    const k = (numero.get(nomeDi(r)) ?? 0) + 1;
    numero.set(nomeDi(r), k);
    assegna(r, `${nomeDi(r)} (${k})`);
  }
}

const DESCRIZIONE = 'Sentiero con nome su OpenStreetMap, non segnato come itinerario: controlla il percorso sulla mappa e rispetta le regole del luogo.';

// Risposta Overpass (vie con la geometria; le relazioni a piedi o in bici, se ci sono, escludono i loro tratti)
// → [{ sentiero, traccia }] pronti da salvare, come quelli di percorsiIntorno
export function sentieriConNome(json, { esistenti = new Set(), oggi = new Date().toISOString().slice(0, 10) } = {}) {
  const risultati = [];
  for (const { nome, linee, km, primo } of gruppiSentieri(json)) {
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
        descrizione: DESCRIZIONE,
        animali: [],
        lunghezzaKm: km,
        attivita: { trekking: { stato: 'percorribile', motivi: ['Sentiero con nome su OpenStreetMap (non segnato come itinerario)'] } },
        traccia: { origine: 'osm', geojson: { type: 'MultiLineString', coordinates: linee }, dettagli: { codici: [], fonte: url, nomeOsm: true } },
      },
      oggi,
    );
    const idRecord = `intorno-${id}`;
    risultati.push({
      km,
      sentiero: { ...record, id: idRecord, accesso: { ...record.accesso, link: url }, bici: { ...record.bici, link: url } },
      traccia: { sentieroId: idRecord, ...traccia, dettagli: { ...traccia.dettagli, intorno: true } },
    });
  }
  distinguiNomi(risultati, (r) => r.sentiero.nome, (r, n) => (r.sentiero.nome = n));
  return risultati.map(({ km, ...r }) => r);
}

// Gli stessi sentieri con nome di un parco, come candidati per l'archivio (robot). ritaglia: solo il tratto nel parco
export function candidatiSentieriConNome(json, idParco, { ritaglia = null } = {}) {
  const candidati = [];
  for (const { nome, linee, km, primo } of gruppiSentieri(json, { ritaglia })) {
    const url = `https://www.openstreetmap.org/way/${primo}`;
    candidati.push({
      fonte: `osm-nomi:${idParco}`,
      tipo: 'sentiero',
      chiave: `${idParco}:${primo}`,
      id: `osm-nome-${primo}`,
      url,
      nome,
      zona: '',
      codici: [],
      difficolta: null,
      titoloFonte: 'OpenStreetMap (ODbL)',
      parco: idParco,
      descrizione: DESCRIZIONE,
      animali: [],
      lunghezzaKm: km,
      attivita: { trekking: { stato: 'percorribile', motivi: ['Sentiero con nome su OpenStreetMap (non segnato come itinerario)'] } },
      traccia: { origine: 'osm', geojson: { type: 'MultiLineString', coordinates: linee }, dettagli: { codici: [], fonte: url, nomeOsm: true } },
      km,
    });
  }
  distinguiNomi(candidati, (c) => c.nome, (c, n) => (c.nome = n));
  return candidati.map(({ km, ...c }) => c);
}
