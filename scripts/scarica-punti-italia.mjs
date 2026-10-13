// Rifugi, bivacchi, ripari, sorgenti e fontanelle di tutta Italia, a quadrati di 0,5° (src/lib/puntiItalia.js):
// ogni notte qualche quadrato, dal più vecchio (prima i parchi del Sud e quelli dell'archivio), con una
// pausa tra le richieste e la rotazione dei server Overpass. Un file per quadrato in public/dati/punti/,
// riscritto solo se i punti sono cambiati, più indice.json. Quadrati vuoti (mare, estero): nessun file.
//   node scripts/scarica-punti-italia.mjs                  (i prossimi 20 quadrati)
//   node scripts/scarica-punti-italia.mjs --max 5
//   node scripts/scarica-punti-italia.mjs --quadrati 83_27,81_24 --cartella /tmp/prova
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { interrogaOverpass } from '../src/lib/overpass.js';
import { puntiDallaRisposta } from '../src/lib/puntiUtili.js';
import { quadratiDaFare, queryQuadrato, riquadroQuadrato, quartiDi, PESO_MASSIMO, abitatiNellaRisposta } from '../src/lib/puntiItalia.js';

const arg = (nome, base) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i > 0 ? process.argv[i + 1] : base;
};
const CARTELLA = arg('cartella', 'public/dati/punti');
const MAX = Number(arg('max', 20));
const SCELTI = arg('quadrati', '')?.split(',').filter(Boolean);
const PAUSA_MS = Number(arg('pausa', 10_000));
const AGENTE = 'Orme/0.6 (archivio personale di sentieri; https://lamaslamas.github.io/orme/)';
const fetchFn = (url, o) => fetch(url, { ...o, headers: { ...o.headers, 'User-Agent': AGENTE } });
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));
const oggi = new Date().toISOString().slice(0, 10);

mkdirSync(CARTELLA, { recursive: true });
const FILE_INDICE = join(CARTELLA, 'indice.json');
const indice = existsSync(FILE_INDICE) ? JSON.parse(readFileSync(FILE_INDICE, 'utf8')) : { fonte: '© OpenStreetMap (ODbL)', quadrati: {} };

// scrive il file solo se i punti sono diversi da quelli che c'erano: niente commit inutili
function scrivi(id, punti) {
  const file = join(CARTELLA, `${id}.json`);
  const testo = JSON.stringify({ quadrato: id, fonte: '© OpenStreetMap (ODbL)', punti });
  const prima = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).punti : null;
  if (JSON.stringify(prima) !== JSON.stringify(punti)) writeFileSync(file, testo);
  return testo.length;
}
const togli = (id) => existsSync(join(CARTELLA, `${id}.json`)) && rmSync(join(CARTELLA, `${id}.json`));
const dentro = (p, [s, o, n, e]) => p.lat >= s && p.lat < n && p.lon >= o && p.lon < e;

const daFare = SCELTI.length ? SCELTI : quadratiDaFare(indice.quadrati, oggi, MAX);
console.log(`Quadrati: ${daFare.join(', ')}`);
for (const [i, id] of daFare.entries()) {
  if (i) await attendi(PAUSA_MS);
  try {
    const json = await interrogaOverpass(queryQuadrato(riquadroQuadrato(id)), { fetchFn, timeoutMs: 200_000 });
    const punti = puntiDallaRisposta(json);
    // paesi ma nessun punto: risposta incompleta, non un quadrato vuoto (si riprova)
    if (!punti.length && abitatiNellaRisposta(json) > 0) throw new Error(`${abitatiNellaRisposta(json)} abitati ma nessun punto: risposta incompleta`);
    let byte = 0;
    let quarti = false;
    if (!punti.length) {
      togli(id);
      quartiDi(id).forEach(togli);
    } else {
      const intero = JSON.stringify({ quadrato: id, punti }).length;
      if (intero > PESO_MASSIMO) {
        // troppo pesante: quattro file, dagli stessi punti (nessuna richiesta in più)
        quarti = true;
        togli(id);
        for (const q of quartiDi(id)) {
          const suoi = punti.filter((p) => dentro(p, riquadroQuadrato(q)));
          if (suoi.length) byte += scrivi(q, suoi);
          else togli(q);
        }
      } else {
        quartiDi(id).forEach(togli);
        byte = scrivi(id, punti);
      }
    }
    indice.quadrati[id] = { aggiornato: oggi, n: punti.length, byte, ...(quarti ? { quarti: true } : {}) };
    console.log(`${id}: ${punti.length} punti, ${(byte / 1024).toFixed(1)} KB${quarti ? ' (diviso in quattro)' : ''}`);
  } catch (e) {
    console.warn(`${id}: non scaricato (${e.message}), si riprova al prossimo giro`);
  }
  // l'indice si salva a ogni quadrato: se il robot si ferma, il lavoro fatto resta
  writeFileSync(FILE_INDICE, JSON.stringify({ ...indice, aggiornato: oggi }));
}
const pieni = Object.values(indice.quadrati).filter((x) => x.n);
const totale = pieni.reduce((s, x) => s + x.byte, 0);
console.log(`Indice: ${Object.keys(indice.quadrati).length} quadrati (${pieni.length} con punti), ${(totale / 1024 / 1024).toFixed(2)} MB in tutto.`);
process.exit(0);
