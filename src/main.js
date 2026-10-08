import '@fontsource-variable/manrope';
import './stile.css';
import { caricaDatiIniziali } from './db.js';
import { vistaLista } from './viste/lista.js';
import { vistaScheda } from './viste/scheda.js';
import { vistaModifica } from './viste/modifica.js';
import { vistaMappa } from './viste/mappa.js';
import { vistaBackup } from './viste/backup.js';
import { vistaMappaGenerale } from './viste/mappaGenerale.js';
import { vistaGiri, vistaGiro } from './viste/giri.js';
import { vistaModificaGiro } from './viste/modificaGiro.js';
import { vistaMappaGiro } from './viste/mappaGiro.js';
import { vistaAltro } from './viste/altro.js';
import { vistaPianifica } from './viste/pianifica.js';
import { vistaPercorso } from './viste/percorso.js';
import { vistaDisegna } from './viste/disegna.js';
import { vistaParco } from './viste/parco.js';
import { vistaImporta } from './viste/importa.js';
import { vistaElencoAvvistamenti, vistaModificaAvvistamento } from './viste/avvistamenti.js';
import { impostaBanner } from './viste/banner.js';
import { escapeHtml } from './lib/formato.js';
import { sezioneDi } from './lib/sezioni.js';

const app = document.getElementById('app');

// Ogni percorso dopo il "#" corrisponde a una schermata
const percorsi = [
  [/^\/?$/, vistaLista],
  [/^\/sentiero\/([^/]+)\/?$/, vistaScheda],
  [/^\/sentiero\/([^/]+)\/modifica\/?$/, vistaModifica],
  [/^\/sentiero\/([^/]+)\/mappa\/?$/, vistaMappa],
  [/^\/nuovo(?:\?parco=([^&]+))?$/, (app, parco) => vistaModifica(app, null, parco)],
  [/^\/parco\/([^/]+)\/?$/, vistaParco],
  [/^\/parco\/([^/]+)\/importa\/?$/, vistaImporta],
  [/^\/backup\/?$/, vistaBackup],
  [/^\/altro\/?$/, vistaAltro],
  [/^\/pianifica\/?$/, vistaPianifica],
  [/^\/percorso-nuovo\/?$/, (app) => vistaDisegna(app, null)],
  [/^\/percorso\/([^/]+)\/?$/, vistaPercorso],
  [/^\/percorso\/([^/]+)\/disegna\/?$/, vistaDisegna],
  [/^\/avvistamenti\/?$/, vistaElencoAvvistamenti],
  [/^\/avvistamento\/([^/]+)\/?$/, vistaModificaAvvistamento],
  [/^\/mappa\/?$/, vistaMappaGenerale],
  [/^\/giri\/?$/, vistaGiri],
  [/^\/giro-nuovo\/?$/, (app) => vistaModificaGiro(app, null)],
  [/^\/giro\/([^/]+)\/?$/, vistaGiro],
  [/^\/giro\/([^/]+)\/modifica\/?$/, vistaModificaGiro],
  [/^\/giro\/([^/]+)\/mappa\/?$/, vistaMappaGiro],
];

let pulisciVistaPrecedente = null;

function aggiornaBarraSchede(percorso) {
  const sezione = sezioneDi(percorso);
  for (const a of document.querySelectorAll('.barra-schede a')) {
    const attiva = a.dataset.sezione === sezione;
    a.classList.toggle('attiva', attiva);
    if (attiva) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

async function mostra() {
  const percorso = location.hash.replace(/^#/, '') || '/';
  aggiornaBarraSchede(percorso);
  // ogni schermata legata a un parco imposta poi le sue regole
  impostaBanner(null);
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

// Archivio bloccato da un'altra finestra di Orme con una versione vecchia
window.addEventListener('orme-archivio-bloccato', () => {
  app.innerHTML = `<section class="riquadro" style="margin-top:24px">
    <h2>Orme è aperta anche in un'altra finestra</h2>
    <p>Un'altra scheda o la finestra dell'app installata usa ancora la versione precedente e blocca l'aggiornamento dei dati.</p>
    <p><b>Chiudi le altre finestre di Orme</b>: questa pagina ripartirà da sola. Se non succede, ricaricala.</p>
    <button type="button" class="bottone primario" onclick="location.reload()">Ricarica</button>
  </section>`;
});

// Un'altra finestra ha aggiornato Orme: questa va ricaricata per usare la versione nuova
window.addEventListener('orme-aggiornata-altrove', () => {
  app.innerHTML = `<section class="riquadro" style="margin-top:24px">
    <h2>Orme è stata aggiornata</h2>
    <p>In un'altra finestra è partita la versione nuova. Ricarica questa pagina per continuare.</p>
    <button type="button" class="bottone primario" onclick="location.reload()">Ricarica</button>
  </section>`;
});

caricaDatiIniziali()
  .catch((errore) => console.error('Dati iniziali non caricati', errore))
  .finally(mostra);
