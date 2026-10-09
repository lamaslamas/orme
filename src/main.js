import '@fontsource-variable/manrope';
import '@fontsource-variable/inter';
import './stile.css';
import { caricaDatiIniziali, sincronizzaArchivio } from './db.js';
import { vistaHome } from './viste/home.js';
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
import { vistaDoveVado } from './viste/doveVado.js';
import { vistaPercorso } from './viste/percorso.js';
import { vistaDisegna } from './viste/disegna.js';
import { vistaParco } from './viste/parco.js';
import { vistaImporta } from './viste/importa.js';
import { vistaElencoAvvistamenti, vistaModificaAvvistamento } from './viste/avvistamenti.js';
import { impostaBanner } from './viste/banner.js';
import { preparaLibreria } from './viste/mappaVettoriale.js';
import { collegaVisore } from './viste/visore.js';
import { stato } from './stato.js';
import { escapeHtml } from './lib/formato.js';
import { sezioneDi } from './lib/sezioni.js';

const app = document.getElementById('app');
collegaVisore();

// Ogni percorso dopo il "#" corrisponde a una schermata
const percorsi = [
  [/^\/?$/, vistaHome],
  [/^\/sentiero\/([^/]+)\/?$/, vistaScheda],
  [/^\/sentiero\/([^/]+)\/modifica\/?$/, vistaModifica],
  [/^\/sentiero\/([^/]+)\/mappa\/?$/, vistaMappa],
  [/^\/nuovo(?:\?parco=([^&]+))?$/, (app, parco) => vistaModifica(app, null, parco)],
  [/^\/parco\/([^/]+)\/?$/, vistaParco],
  [/^\/parco\/([^/]+)\/importa\/?$/, vistaImporta],
  [/^\/backup\/?$/, vistaBackup],
  [/^\/altro\/?$/, vistaAltro],
  [/^\/pianifica\/?$/, vistaPianifica],
  [/^\/domani\/?$/, vistaDoveVado],
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

// Ingresso morbido della nuova schermata (spento se il sistema chiede meno movimento)
function animaIngresso() {
  app.classList.remove('entra');
  void app.offsetWidth; // riparte l'animazione
  app.classList.add('entra');
}

// Altezza della testata (logo e avviso): serve al layout desktop delle mappe
function misuraTestata() {
  const cima = document.querySelector('.cima');
  if (cima) document.documentElement.style.setProperty('--altezza-cima', `${cima.offsetHeight}px`);
}
window.addEventListener('resize', misuraTestata);
new ResizeObserver(misuraTestata).observe(document.querySelector('.cima'));

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
        animaIngresso();
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

// Archivio pubblico: si scarica all'avvio (se non c'è rete si usa la copia salvata).
// Se arriva tardi, la schermata viene ridisegnata con i dati aggiornati.
async function aggiornaArchivio() {
  const controllo = new AbortController();
  // l'archivio si scarica in background: anche su reti lente si aspetta fino a 30 secondi
  const limite = setTimeout(() => controllo.abort(), 30000);
  try {
    const risposta = await fetch(`${import.meta.env.BASE_URL}dati/archivio.json`, { signal: controllo.signal });
    if (!risposta.ok) return false;
    const esito = await sincronizzaArchivio(await risposta.json());
    return esito.sentieri + esito.tracce > 0;
  } catch (e) {
    console.warn('Archivio non aggiornato', e);
    return false;
  } finally {
    clearTimeout(limite);
  }
}

globalThis.__ormeFase = 'avvio';
caricaDatiIniziali()
  .then(() => {
    globalThis.__ormeFase = 'archivio';
    const download = aggiornaArchivio();
    // al massimo 2,5 secondi di attesa; poi si mostra la pagina e si aggiorna quando arriva
    // (il download va incartato in un oggetto, altrimenti la gara lo aspetterebbe comunque)
    return Promise.race([download.then(() => 'fatto'), new Promise((r) => setTimeout(() => r({ download }), 2500))]);
  })
  .then((archivio) => {
    if (archivio !== 'fatto') archivio.download.then((cambiato) => cambiato && mostra());
    globalThis.__ormeFase = 'dati pronti';
    return mostra();
  })
  .then(() => {
    globalThis.__ormeFase = 'pagina mostrata';
    // la mappa vettoriale si scarica a riposo, così le mappe non aspettano (né mostrano ripieghi)
    if (stato.leggi().base === 'chiara') (globalThis.requestIdleCallback ?? setTimeout)(() => preparaLibreria().catch(() => {}));
  })
  .catch((errore) => {
    console.error('Avvio non riuscito', errore);
    app.innerHTML = `<section class="riquadro" style="margin-top:24px">
      <h2>${errore.codice === 'archivio-non-risponde' ? "L'archivio dei dati non risponde" : 'Orme non è riuscita a caricare i dati'}</h2>
      <p>Succede quando un'altra finestra di Orme (anche l'app installata o una scheda in sospensione) tiene occupato l'archivio, oppure quando il browser ha un problema con i dati del sito.</p>
      <ol>
        <li>Chiudi tutte le schede di Orme e la finestra dell'app installata, poi ricarica.</li>
        <li>Se non basta, chiudi e riapri il browser.</li>
      </ol>
      <button type="button" class="bottone primario" onclick="location.reload()">Ricarica</button>
      <p class="tenue piccolo">Dettagli: ${escapeHtml(errore.name ?? '')} ${escapeHtml(errore.message ?? String(errore))}</p>
    </section>`;
  });
