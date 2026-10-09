// Scheda "Da vedere": foto di Wikimedia Commons lungo il sentiero (striscia che scorre) e luoghi
// con una voce su Wikipedia, uno per riga. Calcolati dal robot (campo daVedere dell'archivio).
import { escapeHtml } from '../lib/formato.js';
import { improntaTraccia } from '../lib/panorama.js';
import { riassuntoDaVedere } from '../lib/daVedere.js';

// valido solo se calcolato su questa traccia (un GPX mio lo rende superato)
export function daVedereDellaTraccia(s, traccia) {
  const d = s?.daVedere;
  if (!d || !traccia?.geojson) return null;
  if (improntaTraccia(traccia.geojson).split('-')[1] !== d.impronta) return null;
  return d.luoghi?.length || d.foto?.length ? d : null;
}

export const riassuntoScheda = (d) => escapeHtml(riassuntoDaVedere(d));

const distanza = (m) => (m < 50 ? 'sul percorso' : `a ${m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`}`);

export function htmlDaVedere(d) {
  if (!d) return '';
  const foto = (d.foto ?? [])
    .map(
      (f) => `<li><a href="${escapeHtml(f.pagina)}" target="_blank" rel="noopener" title="Foto: ${escapeHtml(f.autore)} · ${escapeHtml(f.licenza)}">
        <img src="${escapeHtml(f.url)}" alt="Foto lungo il sentiero, km ${String(f.km).replace('.', ',')}" loading="lazy" decoding="async" />
        <span class="km">km ${String(f.km).replace('.', ',')}</span></a>
        <span class="credito">${escapeHtml(f.autore)} · ${escapeHtml(f.licenza)}</span></li>`,
    )
    .join('');
  const luoghi = (d.luoghi ?? [])
    .map((l) => `<li><a href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.titolo)}</a> <span class="tenue">· ${distanza(l.distanzaM)}</span></li>`)
    .join('');
  return `${foto ? `<ul class="striscia-foto">${foto}</ul>` : ''}
    ${luoghi ? `<ul class="luoghi-vicini">${luoghi}</ul>` : ''}
    <p class="tenue piccolo">Foto Wikimedia Commons (licenze libere, autore su ogni foto) · luoghi da Wikipedia, entro 1 km dalla traccia.</p>`;
}
