// Luoghi delle uscite senza traccia (per i "Sentieri probabili"): i nomi di luogo nel testo
// dell'uscita cercati su OpenStreetMap (Nominatim) solo dentro il riquadro del parco, per evitare
// omonimi. Una richiesta al secondo, come chiede la policy di Nominatim; ogni uscita si rifà
// solo se il testo cambia. Il punto di ritrovo non si usa se è l'ufficio dell'associazione.
//   node scripts/luoghi-uscite.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { eUscita } from '../src/lib/filtri.js';
import { luoghiNelTesto, testoDellUscita } from '../src/lib/sentieriProbabili.js';
import { PARCHI } from '../src/datiParchi.js';

const FILE = 'public/dati/archivio.json';
const AGENTE = 'Orme/0.6 (archivio personale di sentieri; https://lamaslamas.github.io/orme/)';
const MAX_LUOGHI = 8; // per uscita
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));
const impronta = (t) => createHash('sha1').update(t).digest('hex').slice(0, 12);

async function cerca(nome, [s, o, n, e]) {
  const u = new URL('https://nominatim.openstreetmap.org/search');
  Object.entries({ q: nome, format: 'jsonv2', limit: '1', bounded: '1', viewbox: `${o},${n},${e},${s}`, countrycodes: 'it' }).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { headers: { 'User-Agent': AGENTE, 'Accept-Language': 'it' }, signal: AbortSignal.timeout(30_000) });
  if (r.status === 429) throw new Error('troppe richieste');
  if (!r.ok) throw new Error(`risposta ${r.status}`);
  const [p] = await r.json();
  return p ? { nome, lat: Math.round(Number(p.lat) * 1e5) / 1e5, lon: Math.round(Number(p.lon) * 1e5) / 1e5 } : null;
}

const archivio = JSON.parse(readFileSync(FILE, 'utf8'));
let cambiati = 0;
for (const s of archivio.percorsi) {
  if (s.traccia || !eUscita(s)) continue;
  const testo = testoDellUscita(s);
  const firma = impronta(testo);
  if (s.luoghi?.impronta === firma) continue;
  const riquadri = (s.parchi ?? [s.parco]).map((id) => PARCHI.find((p) => p.id === id)?.bbox).filter(Boolean);
  if (!riquadri.length) continue;
  const punti = [];
  try {
    for (const nome of luoghiNelTesto(testo).slice(0, MAX_LUOGHI)) {
      for (const bbox of riquadri) {
        await attendi(1100);
        const p = await cerca(nome, bbox);
        if (p) {
          punti.push(p);
          break;
        }
      }
    }
  } catch (e) {
    console.warn(`  ${s.id}: ${e.message}, riprovo al prossimo giro`);
    continue;
  }
  s.luoghi = { impronta: firma, punti };
  cambiati++;
  console.log(`  ${s.id}: ${punti.map((p) => p.nome).join(', ') || 'nessun luogo trovato'}`);
}
if (cambiati) writeFileSync(FILE, JSON.stringify(archivio));
console.log(`Uscite con i luoghi aggiornati: ${cambiati}`);
