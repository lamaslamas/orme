// I miei sentieri salvati: lo stesso elenco con filtri (parco, animale, durata…) di tutta l'app,
// solo sui sentieri salvati. Il salvataggio è un dato personale: resta sul dispositivo.
import { tuttiISentieri, tutteLeTracce } from '../db.js';
import { montaElenco } from './lista.js';
import { htmlSelettoreAttivita, collegaSelettoreAttivita } from './attivita.js';

export async function vistaSalvati(app) {
  const [tutti, tracce] = await Promise.all([tuttiISentieri(), tutteLeTracce()]);
  const salvati = tutti.filter((s) => s.salvato).sort((a, b) => String(b.salvato).localeCompare(String(a.salvato)));
  app.innerHTML = `
    <h1 class="titolo-pagina">Salvati</h1>
    ${
      salvati.length
        ? `${htmlSelettoreAttivita({ titolo: false })}<div id="elenco"></div>`
        : `<p class="vuoto">Nessun sentiero salvato. Apri un sentiero e tocca <b>Salva</b> nella barra in fondo: lo ritrovi qui.</p>
           <a class="bottone primario" href="#/">Esplora i sentieri</a>`
    }`;
  if (!salvati.length) return;
  const elenco = montaElenco(app.querySelector('#elenco'), salvati, tracce);
  const scollegaAttivita = collegaSelettoreAttivita(app);
  return () => {
    elenco.scollega();
    scollegaAttivita();
  };
}
