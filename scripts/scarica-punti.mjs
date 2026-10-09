// Scarica da OpenStreetMap rifugi, bivacchi, sorgenti e fontanelle dei parchi in
// public/dati/punti.json, così l'app li mostra senza interrogare Overpass.
// Gira con l'aggiornamento automatico; ogni parco si rinnova al massimo una volta a settimana.
// Se Overpass non risponde si tengono i punti già salvati.
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { PARCHI } from '../src/datiParchi.js';
import { interrogaOverpass } from '../src/lib/overpass.js';
import { queryPuntiParco, puntiDallaRisposta } from '../src/lib/puntiUtili.js';

const FILE = 'public/dati/punti.json';
const CONFINI = 'public/dati/confini.json';
const RINNOVA_GIORNI = 7;
const AGENTE = 'Orme/0.6 (https://lamaslamas.github.io/orme/)';
const fetchFn = (url, o) => fetch(url, { ...o, headers: { ...o.headers, 'User-Agent': AGENTE } });

const oggi = new Date().toISOString().slice(0, 10);
const giorniDa = (data) => (Date.parse(oggi) - Date.parse(data)) / 86_400_000;
const salvati = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { parchi: {} };
const confini = existsSync(CONFINI) ? JSON.parse(readFileSync(CONFINI, 'utf8')).confini : {};
const forza = process.argv.includes('--forza');

const parchi = { ...salvati.parchi };
for (const p of PARCHI) {
  const prima = parchi[p.id];
  if (!forza && prima && giorniDa(prima.aggiornato) < RINNOVA_GIORNI) {
    console.log(`${p.id}: aggiornato il ${prima.aggiornato}, salto`);
    continue;
  }
  for (let tentativo = 1; tentativo <= 3; tentativo++) {
    try {
      const json = await interrogaOverpass(queryPuntiParco(p), { fetchFn, timeoutMs: 150_000 });
      const punti = puntiDallaRisposta(json, confini[p.id]);
      // freno: un crollo improvviso è quasi sempre una risposta incompleta, non punti spariti
      if (prima && punti.length < prima.punti.length / 2) throw new Error(`solo ${punti.length} punti contro ${prima.punti.length}`);
      parchi[p.id] = { aggiornato: oggi, punti };
      console.log(`${p.id}: ${punti.length} punti`);
      break;
    } catch (e) {
      console.warn(`${p.id}: tentativo ${tentativo} non riuscito (${e.message})`);
      await new Promise((r) => setTimeout(r, 20_000));
    }
  }
  await new Promise((r) => setTimeout(r, 5000));
}
writeFileSync(FILE, JSON.stringify({ fonte: '© OpenStreetMap (ODbL)', parchi }));
process.exit(0);
