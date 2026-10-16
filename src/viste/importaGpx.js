// Importa un file GPX come percorso mio (Disegna e pagina iniziale): resta sul telefono. Restituisce l'id.
import { leggiGpx } from '../lib/gpx.js';
import { nuovoIdPercorso } from '../lib/percorso.js';
import { salvaPercorso } from '../db.js';

export async function importaGpxComePercorso(file) {
  const { geojson, nome } = leggiGpx(await file.text());
  const nuovo = { id: nuovoIdPercorso(), nome: nome || file.name.replace(/\.gpx$/i, ''), origine: 'gpx', geojson, note: '' };
  await salvaPercorso(nuovo);
  return nuovo.id;
}
