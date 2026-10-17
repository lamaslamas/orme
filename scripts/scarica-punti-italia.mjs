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
import { quadratiDaFare, queryQuadrato, riquadroQuadrato, quartiDi, PESO_MASSIMO, abitatiNellaRisposta, valutaCalo, soloInItalia, quadratiItalia } from '../src/lib/puntiItalia.js';

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
// confine nazionale (scripts/scarica-confine-italia.mjs): la richiesta è per il solo rettangolo
const { anelli: CONFINE } = JSON.parse(readFileSync('scripts/dati/confine-italia.json', 'utf8'));
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

// quadrati fuori dall'Italia (mare aperto, Nord Africa, altri paesi) già nell'indice: via dall'indice e dai file
const italiani = new Set(quadratiItalia(CONFINE));
const fuori = Object.keys(indice.quadrati).filter((id) => !italiani.has(id.split('-')[0]));
for (const id of fuori) {
  delete indice.quadrati[id];
  togli(id);
  quartiDi(id).forEach(togli);
}
if (fuori.length) console.log(`Tolti dall'indice ${fuori.length} quadrati fuori dall'Italia: ${fuori.join(', ')}`);

const segnalati = []; // per il riepilogo: cali trattenuti o accettati, errori
const daFare = SCELTI.length ? SCELTI : quadratiDaFare(indice.quadrati, oggi, MAX, CONFINE);
console.log(`Quadrati: ${daFare.join(', ')}`);
for (const [i, id] of daFare.entries()) {
  if (i) await attendi(PAUSA_MS);
  try {
    // HTTP diverso da 200: interrogaOverpass prova gli altri server e alla fine lancia un errore
    const json = await interrogaOverpass(queryQuadrato(riquadroQuadrato(id)), { fetchFn, timeoutMs: 200_000 });
    // qualunque "remark" (timeout, errore di runtime): risposta da non usare
    if (json?.remark) throw new Error(`risposta con avviso di Overpass (${String(json.remark).slice(0, 80)})`);
    const tutti = puntiDallaRisposta(json);
    // paesi ma nessun punto (Italia o estero): risposta incompleta, non un quadrato vuoto (si riprova)
    if (!tutti.length && abitatiNellaRisposta(json) > 0) throw new Error(`${abitatiNellaRisposta(json)} abitati ma nessun punto: risposta incompleta`);
    // poi solo quelli in Italia
    const punti = soloInItalia(tutti, CONFINE);
    // più del 30% di punti in meno rispetto al file salvato: si tiene il vecchio (3 notti di fila: si accetta)
    const prima = indice.quadrati[id];
    const v = valutaCalo(prima?.n ?? 0, punti.length, prima?.calo, oggi);
    if (!v.accetta) {
      indice.quadrati[id] = { ...prima, calo: v.calo };
      segnalati.push(`${id}: ${prima.n} → ${punti.length} punti (notte ${v.calo.volte} di 3), tenuto il file di prima`);
      console.warn(`${id}: calo sospetto ${prima.n} → ${punti.length}, tenuto il file di prima`);
      writeFileSync(FILE_INDICE, JSON.stringify({ ...indice, aggiornato: oggi }));
      continue;
    }
    if (v.accettato) segnalati.push(`${id}: ${prima.n} → ${punti.length} punti, calo accettato dopo 3 notti`);
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
    // il file di prima resta; la notte dopo questo quadrato passa avanti
    indice.quadrati[id] = { ...(indice.quadrati[id] ?? {}), errore: oggi };
    segnalati.push(`${id}: non aggiornato (${e.message})`);
  }
  // l'indice si salva a ogni quadrato: se il robot si ferma, il lavoro fatto resta
  writeFileSync(FILE_INDICE, JSON.stringify({ ...indice, aggiornato: oggi }));
}
const restano = [...italiani].filter((id) => !indice.quadrati[id] || indice.quadrati[id].errore === oggi || indice.quadrati[id].calo);
console.log(`Quadrati italiani: ${italiani.size} in tutto, ${restano.length} ancora da fare o da riprovare, circa ${Math.ceil(restano.length / MAX)} notti a ${MAX} per notte.`);
const pieni = Object.values(indice.quadrati).filter((x) => x.n);
const totale = pieni.reduce((s, x) => s + x.byte, 0);
console.log(segnalati.length ? `\nDa guardare:\n  ${segnalati.join('\n  ')}` : '\nNessun calo sospetto né errore.');
console.log(`Indice: ${Object.keys(indice.quadrati).length} quadrati (${pieni.length} con punti), ${(totale / 1024 / 1024).toFixed(2)} MB in tutto.`);
process.exit(0);
