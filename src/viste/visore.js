// Foto a schermo pieno con i crediti sovrimpressi (autore, licenza, link alla pagina).
// Le anteprime restano pulite: solo un piccolo "©" nell'angolo che apre questa vista,
// così le licenze CC BY / BY-SA (che chiedono di citare l'autore) sono sempre rispettate.
import { escapeHtml } from '../lib/formato.js';

// Versione più grande di una miniatura di Wikimedia Commons (…/500px-Nome.jpg → …/1280px-Nome.jpg)
export const fotoGrande = (url = '') =>
  url.replace(/\/(\d+)px-([^/]+)$/, '/1280px-$2').replace(/\/(square|small|medium)\.(jpe?g|png)/i, '/large.$2');

// HTML del pulsante "©" da mettere dentro il contenitore (posizionato) di un'anteprima
export function htmlPulsanteCrediti({ url, autore, licenza, pagina, titolo = '' }) {
  if (!url) return '';
  const dati = escapeHtml(JSON.stringify({ url, autore, licenza, pagina, titolo }));
  return `<button type="button" class="pulsante-crediti" data-foto="${dati}" aria-label="Apri la foto con i crediti">©</button>`;
}

let dialogo = null;
export function apriFoto({ url, autore, licenza, pagina, titolo = '' }) {
  if (!dialogo) {
    dialogo = document.createElement('dialog');
    dialogo.className = 'visore';
    document.body.appendChild(dialogo);
    dialogo.addEventListener('click', (e) => {
      if (!e.target.closest('a')) dialogo.close();
    });
  }
  dialogo.innerHTML = `
    <img src="${escapeHtml(fotoGrande(url))}" alt="${escapeHtml(titolo || 'Foto')}" />
    <div class="visore-crediti">
      ${titolo ? `<b>${escapeHtml(titolo)}</b> · ` : ''}Foto: ${escapeHtml(autore || 'autore su Wikimedia Commons')}${licenza ? ` · ${escapeHtml(licenza)}` : ''}
      ${pagina ? ` · <a href="${escapeHtml(pagina)}" target="_blank" rel="noopener">fonte ↗</a>` : ''}
    </div>
    <button type="button" class="visore-chiudi" aria-label="Chiudi">✕</button>`;
  dialogo.showModal();
}

// Un solo ascoltatore per tutta l'app: i pulsanti "©" (e le foto con data-foto) aprono il visore
let collegato = false;
export function collegaVisore() {
  if (collegato) return;
  collegato = true;
  document.addEventListener(
    'click',
    (e) => {
      const b = e.target.closest('[data-foto]');
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        apriFoto(JSON.parse(b.dataset.foto));
      } catch {
        // dati della foto non leggibili: niente visore
      }
    },
    true,
  );
}
