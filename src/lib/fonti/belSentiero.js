// Il Bel Sentiero (Pescasseroli, PNALM): guide con osservazioni faunistiche (cervi al bramito, orso,
// lupo). Le pagine delle uscite sono nella sitemap del sito; si tengono solo quelle con la scheda
// tecnica (PERIODO, DISTANZA…) e un tema sulla fauna. I testi nominano i sentieri del Parco (L1, M1…),
// utili ai Sentieri probabili. Niente GPX: entrano come uscite senza traccia.
import { righeDaHtml, periodoDalTesto } from '../importazione.js';
import { candidatoUscita, testoLuoghi, uscitaSullaFauna } from './schema.js';
import { codiciNelTesto } from '../sentieriProbabili.js';

export const BEL_SENTIERO = {
  fonte: 'il-bel-sentiero',
  organizzatore: 'Il Bel Sentiero',
  elenco: 'https://www.ilbelsentiero.it/pages-sitemap.xml',
  parco: 'pnalm',
  attesaMs: 6_000,
  giorno: 1, // una volta a settimana (lunedì): sono una novantina di pagine, il programma cambia poco
};

// pagine che non sono uscite (contatti, prenotazioni, regolamenti, copie di lavoro del sito)
const NON_USCITE = /\/(nuova-pagina|blank(-\d+)?|contatti|chi-siamo|chi-sono|regolamento|rimborsi|prenota-ora|reservations|dove-trovarci|experiences|elementi|dettagli-dell-esperienza|il-territorio|copia-di-[^/]*)$/;

export function linkBelSentiero(xml) {
  const link = new Set();
  for (const m of String(xml ?? '').matchAll(/<loc>\s*(https:\/\/www\.ilbelsentiero\.it\/[^<\s]+)\s*<\/loc>/g)) {
    if (!NON_USCITE.test(m[1])) link.add(m[1]);
  }
  return [...link];
}

// etichette della scheda tecnica (tutte maiuscole sul sito: "DIFFICOLTà", "LOCALITà")
const ETICHETTE = ['periodo', 'date in programma', 'orari', 'orario', 'difficoltà', 'dislivello', 'località', 'posizione', 'distanza', 'gruppo', 'durata'];
const FINE_SCHEDA = /^(informazioni utili|cosa portare|prezzi|opzioni e quote|informative)/i;
const eEtichetta = (r) => ETICHETTE.includes(r.toLowerCase());
// righe da non tenere: crediti delle foto (nomi di persone), nomi dei file delle immagini, contatori
const RUMORE = /^(ph\s*:|foto\s*:|_?\d{5,}|dsc_|img_|\d+\/\d+$|​$)/i;

function scheda(righe) {
  const i = righe.findIndex((r) => /^caratteristiche/i.test(r));
  if (i < 0) return null;
  const valori = {};
  let attuale = null;
  for (const r of righe.slice(i + 1)) {
    if (FINE_SCHEDA.test(r)) break;
    if (eEtichetta(r)) {
      attuale = r.toLowerCase();
      valori[attuale] = [];
    } else if (attuale && !RUMORE.test(r)) valori[attuale].push(r.replace(/[​\s]+$/g, ''));
  }
  return { inizio: i, valori: Object.fromEntries(Object.entries(valori).map(([k, v]) => [k, v.join(' ').trim()])) };
}

// un solo numero ("6 km", "800 m"); con più giorni o "6/10 km" meglio nessun dato che uno sbagliato
function unNumero(testo, unita) {
  const m = [...String(testo ?? '').matchAll(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${unita}\\b`, 'gi'))];
  if (m.length !== 1 || /\d\s*\/\s*\d/.test(testo)) return null;
  return Number(m[0][1].replace(',', '.'));
}

export function leggiPaginaBelSentiero(html, url) {
  const righe = righeDaHtml(html);
  const titolo = String(html ?? '').match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '';
  const nome = righeDaHtml(titolo).join(' ').split(/\s+[-|–]\s+/)[0].trim();
  const s = scheda(righe);
  // senza scheda tecnica è un articolo (es. una località); "Nuova pagina" è una bozza del sito
  if (!nome || !s || /^nuova pagina$/i.test(nome)) return { segnaposto: true };
  // il testo dell'uscita: dopo il menu del sito (che finisce con "Recensioni") e prima della scheda
  const dopoMenu = righe.lastIndexOf('Recensioni', s.inizio);
  const corpo = righe.slice(dopoMenu >= 0 ? dopoMenu + 1 : 0, s.inizio).filter((r) => !RUMORE.test(r));
  const testo = corpo.join('\n');
  // solo le uscite sulla fauna
  if (!uscitaSullaFauna(nome, testo)) return { segnaposto: true };
  const descrizione = corpo.filter((r) => r.length > 80).slice(0, 2).join(' ');
  const luogo = s.valori['località'] || s.valori.posizione || '';
  const c = candidatoUscita(BEL_SENTIERO, {
    url,
    nome,
    descrizione,
    testo,
    partenza: luogo,
    // il periodo com'è scritto ("da Aprile a Settembre"): è un intervallo, non due mesi
    periodo: (periodoDalTesto(s.valori.periodo ?? '') && s.valori.periodo.length <= 60 ? s.valori.periodo : periodoDalTesto(s.valori['date in programma'] ?? '')) || null,
  });
  // misure solo dalla scheda e solo se è una (niente "Giorno 1: 6 km / Giorno 2: 13 km")
  const km = unNumero(s.valori.distanza, 'km');
  const dislivello = unNumero(s.valori.dislivello, 'm');
  delete c.lunghezzaKm;
  delete c.dislivelloM;
  delete c.durataMin;
  if (km) c.lunghezzaKm = km;
  if (dislivello) c.dislivelloM = dislivello;
  // il programma per intero (nomi dei luoghi e dei sentieri), solo per i Sentieri probabili
  const programma = corpo.findIndex((r) => /programma|giorno 1|itinerario|percorso/i.test(r) && r.length < 60);
  // in testa i codici dei sentieri nominati (L1, M1…): il testo salvato è breve e potrebbero restare fuori
  const codici = [...new Set(codiciNelTesto(testo))];
  const perLuoghi = testoLuoghi([codici.length ? `Sentieri ${codici.join(', ')}.` : '', ...(programma >= 0 ? corpo.slice(programma) : corpo)].filter(Boolean).join('\n'));
  if (perLuoghi) c.testoLuoghi = perLuoghi;
  return c;
}

BEL_SENTIERO.link = linkBelSentiero;
BEL_SENTIERO.leggi = leggiPaginaBelSentiero;
