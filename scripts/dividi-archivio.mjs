// Divide public/dati/archivio.json in un file per parco (public/dati/archivio/<parco>.json) più l'indice
// (public/dati/archivio/indice.json). Si lancia dopo gli altri script dell'archivio: un file si riscrive solo se
// il contenuto è cambiato, così le impronte restano stabili e l'app scarica solo i parchi cambiati.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { PARCHI } from '../src/datiParchi.js';
import { dividiArchivio, controllaIndice } from '../src/lib/parchiArchivio.js';

const ARCHIVIO = 'public/dati/archivio.json';
const CONFINI = 'public/dati/confini.json';
const CARTELLA = 'public/dati/archivio';

const archivio = JSON.parse(readFileSync(ARCHIVIO, 'utf8'));
const confini = existsSync(CONFINI) ? (JSON.parse(readFileSync(CONFINI, 'utf8')).confini ?? {}) : {};
const veri = PARCHI.filter((p) => !p.zona);
const { indice, file } = dividiArchivio(archivio, {
  nomi: Object.fromEntries(veri.map((p) => [p.id, p.nomeBreve ?? p.nome])),
  confini,
  parchi: veri.map((p) => p.id),
  firma: (testo) => createHash('sha1').update(testo).digest('hex').slice(0, 16),
});
controllaIndice(indice);

mkdirSync(CARTELLA, { recursive: true });
const scrivi = (nome, contenuto) => {
  const percorso = `${CARTELLA}/${nome}`;
  const testo = JSON.stringify(contenuto);
  if (existsSync(percorso) && readFileSync(percorso, 'utf8') === testo) return false;
  writeFileSync(percorso, testo);
  return true;
};
let scritti = 0;
for (const [id, corpo] of file) if (scrivi(`${id}.json`, corpo)) scritti++;
// l'indice porta la data dell'archivio solo se è cambiato qualcosa: altrimenti resta com'è
const precedente = existsSync(`${CARTELLA}/indice.json`) ? JSON.parse(readFileSync(`${CARTELLA}/indice.json`, 'utf8')) : null;
if (precedente && JSON.stringify({ ...precedente, aggiornato: 0 }) === JSON.stringify({ ...indice, aggiornato: 0 })) indice.aggiornato = precedente.aggiornato;
if (scrivi('indice.json', indice)) scritti++;
// file di parchi che non ci sono più
for (const nome of readdirSync(CARTELLA)) if (nome !== 'indice.json' && !file.has(nome.replace(/\.json$/, ''))) rmSync(`${CARTELLA}/${nome}`);

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`Archivio diviso: ${indice.parchi.map((p) => `${p.id} ${p.sentieri} (${kb(p.byte)})`).join(' · ')}`);
console.log(`File riscritti: ${scritti} · indice ${kb(JSON.stringify(indice).length)}`);
