// Pulsante "Installa l'app": su Android/Chrome usa l'installazione del browser, su iPhone/iPad
// (dove Safari non la permette da una pagina) spiega i due passi. Nascosto se l'app è già
// installata o se l'invito è stato chiuso.
import { ICONE } from './icone.js';

const CHIAVE_CHIUSO = 'orme.installaChiuso';
let richiesta = null; // evento "beforeinstallprompt" conservato per dopo

export const installata = () =>
  globalThis.matchMedia?.('(display-mode: standalone)').matches || globalThis.navigator?.standalone === true;
const suIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const installabile = () => !installata() && (Boolean(richiesta) || suIos());

export function preparaInstallazione() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    richiesta = e;
    document.dispatchEvent(new CustomEvent('orme:installabile'));
  });
  window.addEventListener('appinstalled', () => {
    richiesta = null;
    document.querySelectorAll('.invito-installa').forEach((el) => el.remove());
  });
}

function chiuso() {
  try {
    return localStorage.getItem(CHIAVE_CHIUSO) === '1';
  } catch {
    return false;
  }
}

// Invito in pagina (home): compare solo quando si può installare
export function htmlInvitoInstalla() {
  return `<div class="invito-installa" hidden>
    <span class="invito-installa-icona">${ICONE.installa}</span>
    <span class="invito-installa-testo"><b>Installa Orme</b><span>Si apre come un'app e funziona anche offline</span></span>
    <button type="button" class="bottone primario" data-azione="installa">Installa</button>
    <button type="button" class="invito-installa-chiudi" data-azione="chiudi-invito" aria-label="Non mostrare più">✕</button>
  </div>`;
}

export async function installa() {
  if (richiesta) {
    richiesta.prompt();
    await richiesta.userChoice.catch(() => null);
    richiesta = null;
    return;
  }
  // iPhone e iPad: istruzioni
  let foglio = document.querySelector('#foglioInstalla');
  if (!foglio) {
    foglio = document.createElement('dialog');
    foglio.id = 'foglioInstalla';
    foglio.className = 'foglio';
    foglio.innerHTML = `<div class="foglio-maniglia"></div>
      <h2 class="foglio-titolo">Installa Orme su iPhone</h2>
      <ol class="passi-installa">
        <li>Tocca <b>Condividi</b> in Safari (il quadrato con la freccia verso l'alto).</li>
        <li>Scegli <b>Aggiungi alla schermata Home</b>.</li>
      </ol>
      <button type="button" class="bottone primario pieno-largo">Ho capito</button>`;
    foglio.addEventListener('click', (e) => {
      if (e.target === foglio || e.target.closest('button')) foglio.close();
    });
    document.body.appendChild(foglio);
  }
  foglio.showModal();
}

// Collega l'invito e i pulsanti "Installa" della pagina
export function collegaInstalla(contenitore) {
  const aggiorna = () => {
    for (const el of contenitore.querySelectorAll('.invito-installa')) el.hidden = !installabile() || chiuso();
    for (const el of contenitore.querySelectorAll('.voce-installa')) el.hidden = !installabile();
  };
  const alClic = (e) => {
    const azione = e.target.closest('[data-azione]')?.dataset.azione;
    if (azione === 'installa') installa();
    if (azione === 'chiudi-invito') {
      try {
        localStorage.setItem(CHIAVE_CHIUSO, '1');
      } catch {
        // memoria non disponibile: l'invito torna alla prossima visita
      }
      aggiorna();
    }
  };
  contenitore.addEventListener('click', alClic);
  document.addEventListener('orme:installabile', aggiorna);
  aggiorna();
  return () => document.removeEventListener('orme:installabile', aggiorna);
}
