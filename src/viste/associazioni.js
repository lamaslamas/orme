// "Associazioni": le uscite delle associazioni e delle guide (Ecotur, Wolf Howling del Parco…), separate
// dalla mappa. Stessi filtri e card di sempre, con nome dell'uscita, chi la organizza e periodo;
// le uscite senza traccia hanno nella scheda i "Sentieri probabili".
import { tuttiISentieri, tutteLeTracce } from '../db.js';
import { eUscita } from '../lib/filtri.js';
import { montaElenco } from './lista.js';

export async function vistaAssociazioni(app) {
  const [tutti, tracce] = await Promise.all([tuttiISentieri(), tutteLeTracce()]);
  const uscite = tutti.filter(eUscita);
  app.innerHTML = `
    <h1 class="titolo-pagina">Associazioni</h1>
    <p class="tenue">Uscite guidate di associazioni e guide nei parchi. Prenota sempre dal loro sito: le date cambiano.</p>
    ${uscite.length ? '<div id="elenco"></div>' : '<p class="vuoto">Nessuna uscita in archivio per ora.</p>'}`;
  if (!uscite.length) return;
  const elenco = montaElenco(app.querySelector('#elenco'), uscite, tracce, { rigaUscita: true });
  return () => elenco.scollega();
}
