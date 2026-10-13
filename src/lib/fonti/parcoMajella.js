// Ente Parco Nazionale della Majella: il calendario degli eventi nella pagina iniziale, una pagina
// per evento con "dove:", le date, il comune, il programma e la scheda tecnica. Si tengono solo gli
// eventi sulla fauna (lupi, cervi al bramito, orso…). Niente GPX: entrano come uscite senza traccia.
import { righeDaHtml, slug } from '../importazione.js';
import { candidatoUscita, testoLuoghi, uscitaSullaFauna } from './schema.js';
import { codiciNelTesto } from '../sentieriProbabili.js';

export const PARCO_MAJELLA = {
  fonte: 'parco-majella',
  organizzatore: 'Parco Nazionale della Majella',
  elenco: 'https://www.parcomajella.it/',
  parco: 'majella',
  attesaMs: 5_000, // robots.txt: Crawl-delay 3 (si aspetta comunque almeno 5 s)
};

// eventi del calendario del mese e del riquadro "eventi" della pagina iniziale
export function linkEventiMajella(html, base = PARCO_MAJELLA.elenco) {
  const link = new Set();
  const h = String(html ?? '');
  const re = /<a\s+href="([^"]+\.htm)"[^>]*class="(?:calendario-giorno-evento-singolo|titololinkato)"/g;
  for (const m of h.matchAll(re)) {
    try {
      const u = new URL(m[1].replace(/&amp;/g, '&'), base);
      if (u.hostname === 'www.parcomajella.it') link.add(u.href);
    } catch {
      // indirizzo non valido: si salta
    }
  }
  return [...link];
}

const FINE_CORPO = /^(cosa è incluso|informazioni pratiche|prenota subito|<< precedente|iscriviti ai canali)/i;
const DATA = /^(\d{2})-(\d{2})-(\d{4})$/;

export function leggiEventoMajella(html, url) {
  const righe = righeDaHtml(html);
  const i = righe.findIndex((r) => /^percorso:\s*home\s*>\s*eventi/i.test(r));
  if (i < 0) return null;
  const nome = righe[i + 1];
  if (!nome) return null;
  // la riga dopo il nome è la data con le categorie dell'evento (a volte con nomi di persone): non si tiene
  const resto = righe.slice(i + 3);
  const valore = (re) => resto.find((r) => re.test(r))?.replace(re, '').trim() ?? '';
  const dove = valore(/^dove:\s*/i);
  const comune = valore(/^comune:\s*/i);
  const incontro = valore(/^punto d'incontro:\s*/i);
  // date di svolgimento (gg-mm-aaaa) → aaaa-mm-gg
  const date = [...new Set(resto.map((r) => r.match(DATA)).filter(Boolean).map(([, g, m, a]) => `${a}-${m}-${g}`))].sort();
  // il testo dell'evento: dalla presentazione alla scheda tecnica, senza i contatti
  const inizio = resto.findIndex((r) => /^dove:/i.test(r) || /^orario:/i.test(r));
  const fine = resto.findIndex((r) => FINE_CORPO.test(r));
  const corpo = resto
    .slice(Math.max(0, inizio), fine < 0 ? undefined : fine)
    .filter((r) => !DATA.test(r) && r !== nome && !/^(data|note|x close|keyboard_arrow_\w+|\[ \]|date di svolgimento.*|dati geografici|nazione:.*|regione:.*|provincia:.*|ottieni indicazioni:.*)$/i.test(r) && !/^>"/.test(r));
  const testo = corpo.join('\n');
  // solo gli eventi sulla fauna
  if (!uscitaSullaFauna(nome, testo)) return { segnaposto: true };
  const descrizione = corpo.filter((r) => r.length > 80).slice(0, 2).join(' ');
  const c = candidatoUscita(PARCO_MAJELLA, {
    url,
    // lo stesso evento ripetuto ("…-1.htm") resta un'uscita sola, con tutte le date
    id: `${PARCO_MAJELLA.fonte}-${slug(nome)}`,
    nome,
    descrizione,
    testo,
    partenza: incontro || dove,
    paese: comune,
    date,
  });
  // misure solo dalla scheda tecnica, e la lunghezza solo in km (le aree faunistiche sono di pochi metri)
  delete c.lunghezzaKm;
  delete c.dislivelloM;
  delete c.durataMin;
  const km = testo.match(/lunghezza:\s*(\d+(?:[.,]\d+)?)\s*km\b/i);
  const salita = testo.match(/dislivello:\s*\+?\s*(\d+)\s*m\b/i);
  if (km) c.lunghezzaKm = Number(km[1].replace(',', '.'));
  if (salita && Number(salita[1]) > 0) c.dislivelloM = Number(salita[1]);
  const difficolta = testo.match(/difficoltà:[^(]*\((T|E|EE|EEA)\)/i)?.[1]?.toUpperCase();
  if (difficolta) c.difficolta = difficolta;
  const codici = [...new Set(codiciNelTesto(testo))];
  const perLuoghi = testoLuoghi([codici.length ? `Sentieri ${codici.join(', ')}.` : '', dove, ...corpo.filter((r) => r !== dove)].filter(Boolean).join('\n'));
  if (perLuoghi) c.testoLuoghi = perLuoghi;
  return c;
}

PARCO_MAJELLA.link = linkEventiMajella;
PARCO_MAJELLA.leggi = leggiEventoMajella;
