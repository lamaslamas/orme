// Traduce le origini del misuratore (?misura), es. «index:1:812345», nel codice sorgente.
// Costruisce l'app con le mappe dei sorgenti in .cache/build-origine (stesso commit del riepilogo, altrimenti le
// posizioni non coincidono) e cerca ogni posizione file:riga:colonna.
//   node scripts/origine.mjs index:1:812345 maplibre-gl:1:99
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { SourceMapConsumer } from 'source-map';

const USCITA = '.cache/build-origine';
execSync(`npx vite build --sourcemap --outDir ${USCITA} --emptyOutDir`, { stdio: 'ignore' });
const file = readdirSync(`${USCITA}/assets`).filter((f) => f.endsWith('.js.map'));
for (const voce of process.argv.slice(2)) {
  const [nome, riga, colonna] = voce.split(':');
  const mappa = file.find((f) => f.startsWith(`${nome}-`));
  if (!mappa) {
    console.log(`${voce}: nessun file «${nome}» nella build`);
    continue;
  }
  const consumatore = await new SourceMapConsumer(JSON.parse(readFileSync(`${USCITA}/assets/${mappa}`, 'utf8')));
  const o = consumatore.originalPositionFor({ line: Number(riga), column: Number(colonna) - 1 });
  console.log(`${voce}: ${o.source ? `${o.source.replace(/^.*\/(src\/)/, '$1')}:${o.line}${o.name ? ` (${o.name})` : ''}` : 'sconosciuta'}`);
  consumatore.destroy?.();
}
