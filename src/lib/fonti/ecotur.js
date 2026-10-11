// Ecotur (Pescasseroli, PNALM): elenco delle escursioni di un giorno e pagina di ciascuna.
// Le pagine non hanno GPX: si importano come uscite guidate senza traccia.
import { righeDaHtml, periodoDalTesto } from '../importazione.js';
import { candidatoUscita } from './schema.js';

export const ECOTUR = {
  fonte: 'ecotur',
  organizzatore: 'Ecotur',
  elenco: 'https://www.ecotur.org/en/excursions.xhtml',
  parco: 'pnalm',
  attesaMs: 10_000, // robots.txt: Crawl-delay 10
};

// Link alle pagine delle escursioni, come indirizzi completi e senza doppioni
export function linkEscursioni(html, base = ECOTUR.elenco) {
  const link = new Set();
  for (const m of String(html ?? '').matchAll(/href="([^"]*\/excursions\/[^"]+\.xhtml)"/gi)) {
    try {
      link.add(new URL(m[1].replace(/&amp;/g, '&'), base).href);
    } catch {
      // indirizzo non valido: si salta
    }
  }
  return [...link];
}

function sezione(righe, titolo, fine) {
  const i = righe.findIndex((r) => r.toLowerCase() === titolo);
  if (i < 0) return [];
  const resto = righe.slice(i + 1);
  const j = resto.findIndex((r) => fine.includes(r.toLowerCase()));
  return j < 0 ? resto.slice(0, 3) : resto.slice(0, j);
}

const FINE_SEZIONE = ['equipment', 'meeting', 'how the reach us', 'how to reach us', 'when', 'dates', 'show the calendar', 'difficulties', 'interest', 'cost', 'book online now!', 'reserve / get information'];

// Candidato da una pagina di escursione; null se la pagina non ha la forma attesa,
// { segnaposto: true } se l'escursione è elencata ma la pagina non è ancora scritta
export function leggiPaginaEcotur(html, url) {
  const righe = righeDaHtml(html);
  const h1 = String(html ?? '').match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const titolo = h1 ? righeDaHtml(h1[1]).join(' ') : '';
  const inizio = righe.findIndex((r, i) => r === 'Excursions' && (!titolo || righe[i + 1] === titolo));
  if (inizio < 0) return null;
  const nome = titolo || righe[inizio + 1];
  const fine = righe.findIndex((r, i) => i > inizio && /^(watch our videos|our proposals for educational trips)/i.test(r));
  const contenuto = righe.slice(inizio + 2, fine < 0 ? undefined : fine);
  const testo = contenuto.join('\n');
  const descrizione = contenuto.filter((r) => !FINE_SEZIONE.includes(r.toLowerCase()) && r.length > 60).slice(0, 2).join(' ');
  // pagina ancora da scrivere sul sito: non è un'escursione da importare
  if (!descrizione || /work in progress/i.test(testo)) return { segnaposto: true };
  const ritrovo = sezione(contenuto, 'meeting', FINE_SEZIONE)
    .join(' ')
    .replace(/^at\s+/i, '')
    .replace(/\s+(at|alle|ore)\s+\d{1,2}[.:]\d{2}.*$/i, '')
    .replace(/\s+(by|with)\s+(own\s+)?car.*$/i, '')
    .replace(/\s+\d{1,2}[.:]\d{2}\s*[ap]\.?m\.?.*$/i, '')
    .replace(/[,\s]+$/, '');
  const date = sezione(contenuto, 'dates', FINE_SEZIONE).join(' ');
  return candidatoUscita(ECOTUR, { url, nome, descrizione, testo, partenza: ritrovo, periodo: periodoDalTesto(date) });
}

// Versione italiana della pagina (link con hreflang="it"): ha il "Programma" con i nomi dei luoghi,
// che quella inglese spesso non ha. Serve solo per i "Sentieri probabili".
export function linkItaliano(html, base) {
  const m = String(html ?? '').match(/<a\b[^>]*href="([^"]+)"[^>]*hreflang="it"|<a\b[^>]*hreflang="it"[^>]*href="([^"]+)"/i);
  const href = m?.[1] ?? m?.[2];
  if (!href || !/\/it\/escursioni\//.test(href)) return null;
  try {
    return new URL(href.replace(/&amp;/g, '&'), base).href;
  } catch {
    return null;
  }
}

// Titoli delle sezioni italiane: si tengono solo la presentazione e il "Programma"
// (mai ritrovo, come raggiungerci, prezzi: il ritrovo è l'ufficio di Ecotur)
const SEZIONI_IT = ['programma', 'equipaggiamento', 'ritrovo', 'come raggiungerci', 'quando', 'partenza', 'rientro', 'date', 'vedi il calendario', 'difficoltà', 'grado', 'interesse', 'quota', 'la quota comprende', 'la quota non comprende', 'prenota / chiedi informazioni', 'prenota online ora!'];
export function testoItalianoEcotur(html) {
  const righe = righeDaHtml(html);
  const inizio = righe.findIndex((r) => r === 'Escursioni');
  if (inizio < 0) return '';
  const tenute = [];
  let sezione = 'presentazione';
  for (const r of righe.slice(inizio + 1)) {
    if (/^guarda i nostri video/i.test(r)) break;
    const t = r.toLowerCase();
    if (SEZIONI_IT.includes(t)) {
      sezione = t;
      continue;
    }
    if (sezione === 'presentazione' || sezione === 'programma') tenute.push({ sezione, r });
  }
  // prima il programma (è lì che ci sono i luoghi), poi la presentazione: il testo salvato è breve
  return [...tenute.filter((x) => x.sezione === 'programma'), ...tenute.filter((x) => x.sezione !== 'programma')].map((x) => x.r).join('\n');
}

// Ecotur come fonte "elenco + pagine" (schema comune: ./schema.js)
ECOTUR.link = linkEscursioni;
ECOTUR.leggi = leggiPaginaEcotur;
ECOTUR.traduzione = { link: linkItaliano, testo: testoItalianoEcotur };
