// "Intorno a me": i percorsi segnati su OpenStreetMap attorno a un punto, scaricati dal telefono
// con le stesse regole dei parchi (nessuna traccia inventata, vie ferrate riconosciute, bici mai
// data per scontata). Il punto resta sul dispositivo: alle fonti va solo la zona da cercare.
import { candidatiSentieri } from './fonti/osmSentieri.js';
import { candidatiMtb, ritagliaESemplifica } from './fonti/osmMtb.js';
import { lunghezzaKm } from './geo.js';
import { nuovoRecord } from './importazione.js';
import { profiloQuote } from './profiloQuote.js';
import { improntaTraccia } from './panorama.js';
import { percorsiDaQui } from './daQui.js';
import { animaliPossibili } from './faunaPercorso.js';
import { urlOsservazioniGbif } from './gbif.js';
import { ID_INTORNO, INTORNO } from '../datiParchi.js';

export const RAGGI_INTORNO = [10, 25, 50];
// cambia quando cambia cosa si cerca: le zone scaricate prima si riscaricano da sole
// (2: anche itinerari ciclabili e percorsi a piedi non escursionistici)
export const VERSIONE_RICERCA = 3; // 3: anche i sentieri non segnati delle aree protette
export const RAGGIO_INTORNO = 25;

// Riquadro [sud, ovest, nord, est] che contiene il cerchio; centro: [lon, lat]
export function riquadroIntorno([lon, lat], km) {
  const dLat = km / 111;
  const dLon = dLat / Math.cos((lat * Math.PI) / 180);
  const r = (x) => Math.round(x * 1e4) / 1e4;
  return [r(lat - dLat), r(lon - dLon), r(lat + dLat), r(lon + dLon)];
}

// Sentieri (anche i percorsi a piedi) e itinerari in bici (MTB e ciclabili) che passano entro il raggio. La geometria si chiede solo dentro il
// riquadro: i cammini lunghi (Via Francigena, Sentiero Italia) restano leggeri.
export function queryIntorno(centro, km) {
  const [lon, lat] = centro;
  const intorno = `(around:${Math.round(km * 1000)},${lat.toFixed(4)},${lon.toFixed(4)})`;
  const [s, o, n, e] = riquadroIntorno(centro, km);
  // dopo un segnaposto, le aree protette con i loro sentieri (una sola richiesta: Overpass
  // rifiuta spesso due richieste pesanti di fila)
  return `[out:json][timeout:90];
(
  rel["route"~"^(hiking|foot|walking)$"]${intorno};
  rel["route"~"^(mtb|bicycle)$"]${intorno};
)->.percorsi;
.percorsi out geom(${s},${o},${n},${e});
way(r.percorsi)(${s},${o},${n},${e});
out tags;
${parteAreeProtette(centro, km)}`;
}

const A_PIEDI = new Set(['hiking', 'foot', 'walking']);

// Solo le relazioni a piedi (o solo quelle in bici), con tutti i tratti
function soloRelazioni(json, aPiedi) {
  return {
    elements: (json?.elements ?? []).filter((el) => el.type !== 'relation' || A_PIEDI.has(el.tags?.route) === aPiedi),
  };
}

// Risposta di Overpass → [{ sentiero, traccia }] pronti da salvare.
// esistenti: id dei percorsi già nell'archivio dei parchi (non si duplicano)
export function percorsiIntorno(json, centro, km, { esistenti = new Set(), oggi = new Date().toISOString().slice(0, 10) } = {}) {
  const area = { ...INTORNO, bbox: riquadroIntorno(centro, km) };
  const elementi = json?.elements ?? [];
  const fine = elementi.findIndex((el) => el.type === SEGNAPOSTO_AREE);
  json = { elements: fine >= 0 ? elementi.slice(0, fine) : elementi };
  const candidati = [
    ...candidatiSentieri(soloRelazioni(json, true), ID_INTORNO, area),
    ...candidatiMtb(soloRelazioni(json, false), ID_INTORNO, area, { cicloturistici: true }),
  ];
  return candidati
    .filter((c) => !esistenti.has(c.id))
    .map((c) => {
      const id = `intorno-${c.id}`;
      const { traccia, ...record } = nuovoRecord(c, oggi);
      return {
        sentiero: { ...record, id, accesso: { ...record.accesso, link: c.url }, bici: { ...record.bici, link: c.url } },
        traccia: { sentieroId: id, ...traccia, dettagli: { ...traccia.dettagli, intorno: true } },
      };
    });
}

// Percorsi (anche dei parchi) entro il raggio, dal più vicino. percorsi: [{ sentiero, traccia }]
export function nelRaggio(percorsi, centro, km) {
  return percorsiDaQui(percorsi, centro, km * 1000);
}

// ---- Quote (Open-Meteo, gratuito e senza chiavi) per dislivello e meteo in quota ----
// un punto ogni 200 m: Open-Meteo conta ogni punto come una richiesta (limite gratuito al minuto)
export const PASSO_QUOTE_M = 200;
const MAX_PER_RICHIESTA = 100;
const chiave = (lon, lat) => `${lon.toFixed(4)},${lat.toFixed(4)}`;

// Punti della traccia di cui serve la quota (senza doppioni)
export function puntiPerLeQuote(geojson) {
  const punti = new Map();
  profiloQuote(geojson, (lon, lat) => void punti.set(chiave(lon, lat), [lon, lat]) ?? null, PASSO_QUOTE_M);
  return [...punti.values()];
}

// Indirizzi di Open-Meteo, al massimo 100 punti per richiesta
export function urlQuote(punti) {
  const url = [];
  for (let i = 0; i < punti.length; i += MAX_PER_RICHIESTA) {
    const pezzo = punti.slice(i, i + MAX_PER_RICHIESTA);
    url.push({
      url: `https://api.open-meteo.com/v1/elevation?latitude=${pezzo.map(([, lat]) => lat.toFixed(4)).join(',')}&longitude=${pezzo.map(([lon]) => lon.toFixed(4)).join(',')}`,
      punti: pezzo,
    });
  }
  return url;
}

// Risposta { elevation: [...] } → quote nella memoria (chiave del punto → metri)
export function leggiQuote(risposta, punti, memoria = new Map()) {
  (risposta?.elevation ?? []).forEach((q, i) => {
    if (punti[i] && Number.isFinite(q)) memoria.set(chiave(...punti[i]), q);
  });
  return memoria;
}

// Profilo delle quote come quello del robot (con l'impronta della traccia), o null
export function profiloIntorno(geojson, memoria) {
  const r = profiloQuote(geojson, (lon, lat) => memoria.get(chiave(lon, lat)) ?? null, PASSO_QUOTE_M);
  return r && { ...r, impronta: improntaTraccia(geojson).split('-')[1] };
}

// Campi miei da conservare quando la zona si riscarica
export const haDatiMiei = (s) => Boolean(s.salvato || s.stato === 'fatto' || s.notePersonali || s.dataPercorso);

// Distanza dal punto scelto, in breve: "qui", "a 800 m", "a 3,2 km", "a 18 km"
export function testoDistanza(m) {
  if (m < 150) return 'qui';
  if (m < 1000) return `a ${Math.round(m / 100) * 100} m`;
  if (m < 10_000) return `a ${(m / 1000).toFixed(1).replace('.', ',')} km`;
  return `a ${Math.round(m / 1000)} km`;
}

// ---- Fauna (GBIF: iNaturalist, eBird, Observation.org…), con lo stesso metodo dei parchi ----
export const PAGINE_GBIF_MAX = 20; // al massimo 6000 osservazioni per zona
export const urlFaunaIntorno = (centro, km, pagina = 0) =>
  urlOsservazioniGbif(riquadroIntorno(centro, km), { specie: 'intorno' }, { limite: 300, scarto: pagina * 300 });

// La fauna di un percorso va ricalcolata se manca, se la traccia è cambiata o dopo un mese
export function faunaDaRicalcolare(s, geojson, oggi = new Date()) {
  const f = s.faunaInat;
  if (!f?.calcolato || f.impronta !== improntaTraccia(geojson).split('-')[1]) return true;
  return (oggi - new Date(f.calcolato)) / 86_400_000 >= 30;
}

// Gli animali della zona: quelli segnalati sul maggior numero di percorsi, al massimo "max"
export function animaliDellaZona(sentieri, max = 6) {
  const conta = new Map();
  for (const s of sentieri) for (const a of animaliPossibili(s)) conta.set(a, (conta.get(a) ?? 0) + 1);
  return [...conta]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([animale, percorsi]) => ({ animale, percorsi }));
}

// ---- Sentieri non segnati delle aree protette (riserve, parchi regionali) ----
// Su OSM molte riserve hanno sentieri e carrarecce disegnati come singole strade, senza un percorso
// segnato. Per ogni area si mostra la rete intera (la geometria è quella di OSM): il giro lo sceglie
// chi cammina. Se la rete è troppo fitta restano solo i sentieri; oltre RETE_MAX_KM si lascia perdere
// (di solito è un grande parco, già coperto dai suoi sentieri segnati).
export const RETE_MIN_KM = 1;
export const RETE_SOLO_SENTIERI_KM = 60;
export const RETE_MAX_KM = 80;

export const SEGNAPOSTO_AREE = 'areeprotette';
function parteAreeProtette(centro, km) {
  const [lon, lat] = centro;
  const intorno = `(around:${Math.round(km * 1000)},${lat.toFixed(4)},${lon.toFixed(4)})`;
  const r = riquadroIntorno(centro, km).join(',');
  return `make ${SEGNAPOSTO_AREE};
out;
(
  wr["leisure"="nature_reserve"]["name"]${intorno};
  wr["boundary"="protected_area"]["name"]${intorno};
)->.aree;
foreach.aree->.a(
  .a out tags;
  .a map_to_area->.z;
  way(area.z)["highway"~"^(path|footway|bridleway|track)$"]["access"!~"^(private|no)$"](${r});
  out geom(${r});
);`;
}
export const queryAreeProtette = (centro, km) => `[out:json][timeout:60];\n${parteAreeProtette(centro, km)}`;

// la geometria ritagliata ha dei buchi (null): ogni buco spezza la linea
function lineeDellaVia(el) {
  const linee = [[]];
  for (const p of el.geometry ?? []) {
    if (p && Number.isFinite(p.lat)) linee.at(-1).push([p.lon, p.lat]);
    else if (linee.at(-1).length) linee.push([]);
  }
  return linee.filter((l) => l.length > 1);
}

// Risposta (aree seguite dalle loro vie, in ordine) → [{ sentiero, traccia }]
export function retiAreeProtette(json, centro, km, { oggi = new Date().toISOString().slice(0, 10) } = {}) {
  const bbox = riquadroIntorno(centro, km);
  const aree = [];
  // nella risposta unica le aree vengono dopo il segnaposto (prima ci sono i percorsi segnati)
  const elementi = json?.elements ?? [];
  const dal = elementi.findIndex((el) => el.type === SEGNAPOSTO_AREE);
  for (const el of dal >= 0 ? elementi.slice(dal + 1) : elementi) {
    if (el.type === 'relation' || (el.type === 'way' && !el.geometry)) aree.push({ el, vie: [] });
    else if (el.type === 'way' && aree.length) aree.at(-1).vie.push(el);
  }
  // un'area dentro l'altra (riserva nel parco): ogni via una volta sola, nell'area più piccola
  aree.sort((a, b) => a.vie.length - b.vie.length);
  const usate = new Set();
  const risultati = [];
  for (const { el, vie } of aree) {
    const libere = vie.filter((v) => !usate.has(v.id));
    const misura = (lista) => lunghezzaKm({ coordinates: lista.flatMap(lineeDellaVia) });
    let scelte = libere;
    if (misura(scelte) > RETE_SOLO_SENTIERI_KM) scelte = libere.filter((v) => v.tags?.highway !== 'track');
    const totale = misura(scelte);
    if (totale < RETE_MIN_KM || totale > RETE_MAX_KM) continue;
    for (const v of scelte) usate.add(v.id);
    const { linee } = ritagliaESemplifica(scelte.flatMap(lineeDellaVia), bbox, 0);
    if (!linee.length) continue;
    const tipoOsm = el.type === 'relation' ? 'relation' : 'way';
    const url = `https://www.openstreetmap.org/${tipoOsm}/${el.id}`;
    const id = `intorno-rete-${tipoOsm[0]}${el.id}`;
    const kmRete = Math.round(lunghezzaKm({ coordinates: linee }) * 10) / 10;
    const nome = el.tags.name;
    risultati.push({
      sentiero: {
        id,
        parco: ID_INTORNO,
        parchi: [ID_INTORNO],
        codici: [],
        nome: `Sentieri · ${nome}`,
        zona: '',
        descrizione: `Rete di ${String(kmRete).replace('.', ',')} km di sentieri${scelte.some((v) => v.tags?.highway === 'track') ? ' e carrarecce' : ''} disegnati su OpenStreetMap nell'area protetta, senza un percorso segnato: scegli tu il giro sulla mappa. Rispetta le regole della riserva.`,
        animali: [],
        escursione: null,
        lunghezzaKm: kmRete,
        dislivelloM: null,
        durataMin: null,
        partenza: { paese: '', descrizione: '', lat: null, lon: null },
        accesso: { tipo: 'nessuno', nota: '', link: url },
        bici: { consentita: 'da_verificare', emtb: 'da_verificare', nota: '', link: url, pedalabilita: null, scalaMtb: null },
        daVerificare: true,
        difficolta: null,
        attivita: {
          trekking: { stato: 'percorribile', motivi: ["Sentieri in un'area protetta, non segnati come percorso"] },
          mtb: { stato: 'da_verificare', motivi: ["Area protetta: verifica se le bici sono ammesse"] },
          emtb: { stato: 'da_verificare', motivi: ["Area protetta: verifica se le bici sono ammesse"] },
        },
        tipoPercorso: 'rete_sentieri',
        osservazione: false,
        organizzatori: [],
        fonti: [{ url, titolo: 'OpenStreetMap (ODbL)', visto: oggi }],
        verifica: { stato: 'da_verificare', ultimoControllo: oggi },
        attivo: true,
      },
      traccia: { sentieroId: id, origine: 'osm', geojson: { type: 'MultiLineString', coordinates: linee }, dettagli: { fonte: url, rete: true, intorno: true } },
    });
  }
  return risultati;
}
