// Collegamenti tra uscite e sentieri scelti sul telefono ("Esporta collegamenti" nella sezione
// Associazioni) e salvati in public/dati/collegamenti.json: a ogni giro l'uscita prende la traccia del
// sentiero scelto, così il collegamento arriva su tutti i telefoni. Una traccia propria dell'uscita
// non si tocca.
//   node scripts/applica-collegamenti.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { applicaCollegamenti } from '../src/lib/collegamenti.js';

const ARCHIVIO = 'public/dati/archivio.json';
const COLLEGAMENTI = 'public/dati/collegamenti.json';
if (!existsSync(COLLEGAMENTI)) {
  console.log('Nessun collegamento da applicare.');
  process.exit(0);
}
const archivio = JSON.parse(readFileSync(ARCHIVIO, 'utf8'));
const prima = JSON.stringify(archivio.percorsi);
const { collegate, nonValidi } = applicaCollegamenti(archivio.percorsi, JSON.parse(readFileSync(COLLEGAMENTI, 'utf8')));
if (JSON.stringify(archivio.percorsi) !== prima) writeFileSync(ARCHIVIO, JSON.stringify({ ...archivio, aggiornato: new Date().toISOString() }));
console.log(`Uscite collegate: ${collegate}.`);
if (nonValidi.length) console.warn(`Da guardare (uscita o sentiero non più in archivio): ${nonValidi.join(', ')}`);
