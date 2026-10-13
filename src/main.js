import '@fontsource-variable/manrope';
import '@fontsource-variable/inter';
import './stile.css';
import { caricaDatiIniziali, sincronizzaArchivio, infoArchivio } from './db.js';
import { vistaHome } from './viste/home.js';
import { vistaScheda } from './viste/scheda.js';
import { vistaModifica } from './viste/modifica.js';
import { vistaMappa } from './viste/mappa.js';
import { vistaBackup } from './viste/backup.js';
import { vistaMappaGenerale } from './viste/mappaGenerale.js';
import { vistaGiro } from './viste/giri.js';
import { vistaModificaGiro } from './viste/modificaGiro.js';
import { vistaMappaGiro } from './viste/mappaGiro.js';
import { vistaAltro } from './viste/altro.js';
import { vistaMiei } from './viste/miei.js';
import { vistaAssociazioni } from './viste/associazioni.js';
import { vistaUscitaAMano } from './viste/uscitaAMano.js';
import { vistaDoveVado } from './viste/doveVado.js';
import { vistaPercorso } from './viste/percorso.js';
import { vistaDisegna } from './viste/disegna.js';
import { vistaParco } from './viste/parco.js';
import { vistaImporta } from './viste/importa.js';
import { vistaElencoAvvistamenti, vistaModificaAvvistamento } from './viste/avvistamenti.js';
import { impostaBanner } from './viste/banner.js';
import { preparaLibreria } from './viste/mappaVettoriale.js';
import { collegaVisore } from './viste/visore.js';
import { preparaInstallazione } from './viste/installa.js';
import { preparaTema } from './viste/tema.js';
import { stato } from './stato.js';
import { escapeHtml } from './lib/formato.js';
import { sezioneDi, reindirizza } from './lib/sezioni.js';

const app = document.getElementById('app');
collegaVisore();
preparaInstallazione();
preparaTema();
// quando arriva una versione nuova dell'app (il service worker prende il controllo), la pagina si
// ricarica una volta: altrimenti resterebbe la grafica vecchia fino alla prossima apertura
if (navigator.serviceWorker?.controller) {
  let ricaricata = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (ricaricata) return;
    ricaricata = true;
    location.reload();
  });
}

// Ogni percorso dopo il "#" corrisponde a una schermata
const percorsi = [
  // la mappa è la pagina iniziale; l'elenco dei parchi è in Altro
  [/^\/?(?:\?parco=([^&]+))?$/, vistaMappaGenerale],
  [/^\/parchi\/?$/, vistaHome],
  [/^\/miei(?:\?scheda=([a-z]+))?$/, vistaMiei],
  [/^\/associazioni\/?$/, vistaAssociazioni],
  [/^\/associazioni\/nuova\/?$/, vistaUscitaAMano],
  [/^\/sentiero\/([^/]+)\/?$/, vistaScheda],
  [/^\/sentiero\/([^/]+)\/modifica\/?$/, vistaModifica],
  [/^\/sentiero\/([^/]+)\/mappa\/?$/, vistaMappa],
  [/^\/nuovo(?:\?parco=([^&]+))?$/, (app, parco) => vistaModifica(app, null, parco)],
  [/^\/parco\/([^/]+)\/?$/, vistaParco],
  [/^\/parco\/([^/]+)\/importa\/?$/, vistaImporta],
  [/^\/backup\/?$/, vistaBackup],
  [/^\/altro\/?$/, vistaAltro],
  [/^\/domani(?:\?zona=([^&]+))?$/, vistaDoveVado],
  [/^\/percorso-nuovo\/?$/, (app) => vistaDisegna(app, null)],
  [/^\/percorso\/([^/]+)\/?$/, vistaPercorso],
  [/^\/percorso\/([^/]+)\/disegna\/?$/, vistaDisegna],
  [/^\/avvistamenti\/?$/, vistaElencoAvvistamenti],
  [/^\/avvistamento\/([^/]+)\/?$/, vistaModificaAvvistamento],
  [/^\/giro-nuovo\/?$/, (app) => vistaModificaGiro(app, null)],
  [/^\/giro\/([^/]+)\/?$/, vistaGiro],
  [/^\/giro\/([^/]+)\/modifica\/?$/, vistaModificaGiro],
  [/^\/giro\/([^/]+)\/mappa\/?$/, vistaMappaGiro],
];

let pulisciVistaPrecedente = null;

// le schede dei sentieri si aprono da più sezioni: resta evidenziata quella da cui si arriva
let sezionePrecedente = 'mappa';
function aggiornaBarraSchede(percorso) {
  const sezione = /^\/sentiero\//.test(percorso) ? sezionePrecedente : sezioneDi(percorso);
  sezionePrecedente = sezione;
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

// Posizione della pagina per ogni schermata: tornando indietro si ritrova il punto della lista
const posizioni = new Map();
let percorsoMostrato = null;
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

async function mostra() {
  const percorso = location.hash.replace(/^#/, '') || '/';
  // indirizzi delle sezioni di prima (Intorno, Pianifica, Salvati, Giri): la schermata nuova
  const nuovo = reindirizza(percorso);
  if (nuovo) return location.replace(`#${nuovo}`);
  // stessa schermata ridisegnata (es. archivio arrivato dopo): si resta dove si è
  const stessa = percorsoMostrato === percorso;
  const yAttuale = window.scrollY;
  if (percorsoMostrato != null && !stessa) posizioni.set(percorsoMostrato, yAttuale);
  percorsoMostrato = percorso;
  aggiornaBarraSchede(percorso);
  // ogni schermata legata a un parco imposta poi le sue regole
  impostaBanner(null);
  if (typeof pulisciVistaPrecedente === 'function') pulisciVistaPrecedente();
  pulisciVistaPrecedente = null;
  for (const [regola, vista] of percorsi) {
    const trovato = percorso.match(regola);
    if (trovato) {
      try {
        // un gruppo facoltativo assente resta undefined (non la parola "undefined")
        pulisciVistaPrecedente = await vista(app, ...trovato.slice(1).map((x) => (x == null ? x : decodeURIComponent(x))));
        animaIngresso();
        // la schermata già vista torna dov'era; una nuova parte dall'inizio
        const y = stessa ? yAttuale : posizioni.get(percorso) ?? 0;
        requestAnimationFrame(() => window.scrollTo(0, y));
      } catch (errore) {
        console.error(errore);
        app.innerHTML = `<p class="errore">Qualcosa è andato storto: ${escapeHtml(errore.message)}</p>`;
      }
      return;
    }
  }
  app.innerHTML = '<p class="vuoto">Pagina non trovata. <a href="#/">Torna alla lista</a></p>';
}

window.addEventListener('hashchange', () => mostra());
// "‹ Indietro": torna alla schermata da cui si è arrivati (mappa, associazioni, i miei percorsi…);
// se la scheda è stata aperta da un link esterno, va all'indirizzo del link
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-indietro]');
  if (!a || history.length <= 1) return;
  e.preventDefault();
  history.back();
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
  const url = `${import.meta.env.BASE_URL}dati/archivio.json`;
  try {
    // prima solo l'impronta del file (pochi byte): se è quella dell'ultima volta, niente da scaricare
    const [info, testa] = await Promise.all([infoArchivio(), fetch(url, { method: 'HEAD', cache: 'no-store', signal: controllo.signal }).catch(() => null)]);
    const firma = testa?.ok ? (testa.headers.get('etag') ?? testa.headers.get('last-modified')) : null;
    if (firma && info?.firma === firma) return false;
    const risposta = await fetch(url, { signal: controllo.signal });
    if (!risposta.ok) return false;
    const esito = await sincronizzaArchivio(await risposta.json(), { firma });
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
    // archivio già sul telefono: la pagina si mostra subito e si aggiorna se arriva qualcosa di nuovo;
    // la prima volta si aspetta al massimo 2,5 secondi
    // (il download va incartato in un oggetto, altrimenti la gara lo aspetterebbe comunque)
    return infoArchivio()
      .catch(() => null)
      .then((info) => Promise.race([download.then(() => 'fatto'), new Promise((r) => setTimeout(() => r({ download }), info ? 0 : 2500))]));
  })
  .then((archivio) => {
    if (archivio !== 'fatto') archivio.download.then((cambiato) => cambiato && mostra());
    globalThis.__ormeFase = 'dati pronti';
    return mostra();
  })
  .then(() => {
    globalThis.__ormeFase = 'pagina mostrata';
    // la mappa vettoriale si scarica a riposo, così le mappe non aspettano (né mostrano ripieghi)
    const base = stato.leggi().base;
    if (base === 'chiara' || base === 'scura') (globalThis.requestIdleCallback ?? setTimeout)(() => preparaLibreria(base === 'scura' ? 'scuro' : 'chiaro').catch(() => {}));
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
