// Importazione automatica nell'archivio pubblico (public/dati/archivio.json).
// La esegue ogni giorno GitHub Actions (.github/workflows/archivio.yml); si può lanciare anche a mano:
//   node scripts/importa-archivio.mjs            (tutte le fonti)
//   node scripts/importa-archivio.mjs ecotur     (solo alcune: ecotur, wolf-howling, osm-mtb)
// Ogni fonte è indipendente: se una non risponde, le altre si aggiornano lo stesso.
import { readFileSync, writeFileSync } from 'node:fs';
import { unisciImportazione } from '../src/lib/importazione.js';
import { ECOTUR, linkEscursioni, leggiPaginaEcotur } from '../src/lib/fonti/ecotur.js';
import { WOLF_HOWLING, linkNotizieWolfHowling, linkPdfWolfHowling, righeTabella, candidatiWolfHowling } from '../src/lib/fonti/wolfHowling.js';
import { OSM_MTB, queryMtbParco, candidatiMtb } from '../src/lib/fonti/osmMtb.js';
import { interrogaOverpass } from '../src/lib/overpass.js';
import { controllaArchivio } from '../src/lib/archivio.js';
import { PARCHI } from '../src/datiParchi.js';

const FILE = 'public/dati/archivio.json';
const AGENTE = 'Orme/0.6 (archivio personale di sentieri; https://lamaslamas.github.io/orme/)';
const oggi = new Date().toISOString().slice(0, 10);
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

async function scarica(url, { tipo = 'text', timeoutMs = 60_000 } = {}) {
  const risposta = await fetch(url, { headers: { 'User-Agent': AGENTE }, signal: AbortSignal.timeout(timeoutMs) });
  if (!risposta.ok) throw new Error(`${url}: risposta ${risposta.status}`);
  return tipo === 'bytes' ? new Uint8Array(await risposta.arrayBuffer()) : risposta.text();
}

// robots.txt: rispetta Disallow e Crawl-delay per tutti gli agenti (*)
async function regoleRobots(origine) {
  try {
    const testo = await scarica(`${origine}/robots.txt`, { timeoutMs: 20_000 });
    let perTutti = false;
    const vietati = [];
    let attesaS = 0;
    for (const riga of testo.split('\n').map((r) => r.replace(/#.*/, '').trim())) {
      const [k, ...v] = riga.split(':');
      const valore = v.join(':').trim();
      if (/^user-agent$/i.test(k)) perTutti = valore === '*';
      else if (perTutti && /^disallow$/i.test(k) && valore) vietati.push(valore);
      else if (perTutti && /^crawl-delay$/i.test(k)) attesaS = Number(valore) || 0;
    }
    return { consentito: (url) => !vietati.some((p) => new URL(url).pathname.startsWith(p)), attesaMs: attesaS * 1000 };
  } catch {
    return { consentito: () => true, attesaMs: 0 }; // robots.txt assente
  }
}

async function importaEcotur() {
  const robots = await regoleRobots(new URL(ECOTUR.elenco).origin);
  const attesa = Math.max(ECOTUR.attesaMs, robots.attesaMs);
  if (!robots.consentito(ECOTUR.elenco)) throw new Error('robots.txt non consente la lettura');
  const elenco = await scarica(ECOTUR.elenco);
  const link = linkEscursioni(elenco);
  if (!link.length) {
    const titolo = elenco.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '';
    throw new Error(`nessuna escursione nell'elenco (pagina "${titolo.slice(0, 80)}", ${elenco.length} caratteri: ${elenco.replace(/\s+/g, " ").slice(0, 200)})`);
  }
  const candidati = [];
  let completo = true;
  for (const url of link) {
    if (!robots.consentito(url)) continue;
    await attendi(attesa);
    try {
      const c = leggiPaginaEcotur(await scarica(url), url);
      if (!c) completo = false; // pagina cambiata: non si segna nulla come sparito
      else if (!c.segnaposto) candidati.push(c);
    } catch (e) {
      console.warn(`  ecotur: ${e.message}`);
      completo = false;
    }
  }
  return { candidati, completo };
}

async function testoPdf(bytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, verbosity: 0 }).promise;
  const pagine = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const contenuto = await (await doc.getPage(n)).getTextContent();
    pagine.push(contenuto.items.filter((i) => i.str?.trim()).map((i) => ({ x: Math.round(i.transform[4]), y: Math.round(i.transform[5]), s: i.str })));
  }
  return pagine;
}

async function importaWolfHowling() {
  const notizie = new Set([WOLF_HOWLING.notiziaNota]);
  try {
    for (const l of linkNotizieWolfHowling(await scarica(WOLF_HOWLING.notizie))) notizie.add(l);
  } catch (e) {
    console.warn(`  wolf howling: elenco notizie non raggiungibile (${e.message})`);
  }
  const pdf = new Set();
  for (const n of notizie) {
    try {
      for (const l of linkPdfWolfHowling(await scarica(n), n)) pdf.add(l);
    } catch (e) {
      console.warn(`  wolf howling: ${e.message}`);
    }
  }
  const candidati = [];
  for (const url of pdf) {
    const righe = righeTabella(await testoPdf(await scarica(url, { tipo: 'bytes' })));
    console.log(`  ${decodeURI(url)}: ${righe.length} uscite in calendario`);
    candidati.push(...candidatiWolfHowling(righe, url));
  }
  // nessun calendario leggibile: meglio non toccare l'archivio
  if (!candidati.length) throw new Error('nessun calendario leggibile');
  return { candidati, completo: true };
}

async function importaMtb(parco) {
  const fetchConAgente = (url, opzioni) => fetch(url, { ...opzioni, headers: { ...opzioni.headers, 'User-Agent': AGENTE } });
  let ultimo;
  for (let tentativo = 1; tentativo <= 3; tentativo++) {
    try {
      const json = await interrogaOverpass(queryMtbParco(parco.id), { fetchFn: fetchConAgente, timeoutMs: 200_000 });
      return { candidati: candidatiMtb(json, parco.id), completo: true };
    } catch (e) {
      ultimo = e;
      console.warn(`  osm-mtb ${parco.id}: tentativo ${tentativo} fallito (${e.message})`);
      await attendi(30_000 * tentativo);
    }
  }
  throw ultimo;
}

const FONTI = [
  { fonte: ECOTUR.fonte, gruppo: 'ecotur', esegui: importaEcotur },
  { fonte: WOLF_HOWLING.fonte, gruppo: 'wolf-howling', esegui: importaWolfHowling },
  ...PARCHI.map((p) => ({ fonte: `${OSM_MTB.fonte}:${p.id}`, gruppo: 'osm-mtb', esegui: () => importaMtb(p) })),
];

const scelte = process.argv.slice(2);
const risultati = [];
for (const f of FONTI.filter((f) => !scelte.length || scelte.includes(f.gruppo) || scelte.includes(f.fonte))) {
  console.log(`> ${f.fonte}`);
  try {
    const { candidati, completo } = await f.esegui();
    console.log(`  ${candidati.length} percorsi${completo ? '' : ' (lettura parziale)'}`);
    risultati.push({ fonte: f.fonte, ok: true, completo, candidati });
  } catch (e) {
    console.warn(`  non raggiunta: ${e.message}`);
    risultati.push({ fonte: f.fonte, ok: false });
  }
}

const prima = JSON.parse(readFileSync(FILE, 'utf8'));
const { archivio, resoconto } = unisciImportazione(prima, risultati, oggi);
controllaArchivio(archivio);
const cambiato = JSON.stringify(archivio.percorsi) !== JSON.stringify(prima.percorsi);
if (cambiato) {
  writeFileSync(FILE, JSON.stringify({ ...archivio, aggiornato: new Date().toISOString() }));
}
console.log(
  `\nNuovi: ${resoconto.nuovi.length} · aggiornati: ${resoconto.aggiornati.length} · non più verificabili: ${resoconto.nonPiuVerificabili.length}` +
    ` · fonti non raggiunte: ${resoconto.fontiNonRaggiunte.join(', ') || 'nessuna'}` +
    (resoconto.fontiSospette.length ? ` · fonti con molti percorsi in meno (nessuno segnato come sparito): ${resoconto.fontiSospette.join(', ')}` : '') +
    `\nArchivio ${cambiato ? 'aggiornato' : 'invariato'}: ${archivio.percorsi.length} percorsi.`,
);
for (const id of resoconto.nuovi) console.log(`  + ${id}`);
