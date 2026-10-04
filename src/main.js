import './stile.css';
import { caricaDatiIniziali } from './db.js';
import { vistaLista } from './viste/lista.js';
import { vistaScheda } from './viste/scheda.js';
import { vistaModifica } from './viste/modifica.js';
import { vistaMappa } from './viste/mappa.js';
import { vistaBackup } from './viste/backup.js';
import { escapeHtml } from './lib/formato.js';

const app = document.getElementById('app');

// Ogni percorso dopo il "#" corrisponde a una schermata
const percorsi = [
  [/^\/?$/, vistaLista],
  [/^\/sentiero\/([^/]+)\/?$/, vistaScheda],
  [/^\/sentiero\/([^/]+)\/modifica\/?$/, vistaModifica],
  [/^\/sentiero\/([^/]+)\/mappa\/?$/, vistaMappa],
  [/^\/nuovo\/?$/, (app) => vistaModifica(app, null)],
  [/^\/backup\/?$/, vistaBackup],
];

let pulisciVistaPrecedente = null;

async function mostra() {
  const percorso = location.hash.replace(/^#/, '') || '/';
  if (typeof pulisciVistaPrecedente === 'function') pulisciVistaPrecedente();
  pulisciVistaPrecedente = null;
  for (const [regola, vista] of percorsi) {
    const trovato = percorso.match(regola);
    if (trovato) {
      try {
        pulisciVistaPrecedente = await vista(app, ...trovato.slice(1).map(decodeURIComponent));
      } catch (errore) {
        console.error(errore);
        app.innerHTML = `<p class="errore">Qualcosa è andato storto: ${escapeHtml(errore.message)}</p>`;
      }
      return;
    }
  }
  app.innerHTML = '<p class="vuoto">Pagina non trovata. <a href="#/">Torna alla lista</a></p>';
}

window.addEventListener('hashchange', () => {
  mostra();
  window.scrollTo(0, 0);
});

// Chiede al browser di non cancellare i dati quando lo spazio scarseggia
navigator.storage?.persist?.().catch(() => {});

caricaDatiIniziali()
  .catch((errore) => console.error('Dati iniziali non caricati', errore))
  .finally(mostra);
