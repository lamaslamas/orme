// Scheda "Da vedere": foto di Wikimedia Commons lungo il sentiero (striscia che scorre) e luoghi
// con una voce su Wikipedia, uno per riga. Calcolati dal robot in dati/da-vedere.json, un file a
// parte che si scarica solo quando si apre la scheda di un sentiero.
import { escapeHtml } from '../lib/formato.js';
import { improntaTraccia } from '../lib/panorama.js';
import { riassuntoDaVedere, urlVoce } from '../lib/daVedere.js';

let inCorso = null;
let caricati = null; // dati già arrivati, per le copertine sincrone delle schede in lista
export function carica() {
  inCorso ??= fetch(`${import.meta.env.BASE_URL}dati/da-vedere.json`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((d) => {
      if (!d) inCorso = null; // si riprova la prossima volta
      else caricati = d;
      return d;
    });
  return inCorso;
}

// Foto di copertina di un percorso per le schede in lista (la prima di "Da vedere"), se già caricata.
// Con una traccia mia (GPX) non si usa: potrebbe essere di un altro posto.
export function copertina(s, traccia) {
  if (!caricati || traccia?.origine === 'gpx') return null;
  return caricati.percorsi?.[s.id]?.foto?.[0] ?? null;
}
export const copertineCaricate = () => Boolean(caricati);

// valido solo se calcolato su questa traccia (un GPX mio lo rende superato)
export async function daVedereDellaTraccia(s, traccia) {
  if (!traccia?.geojson) return null;
  const d = (await carica())?.percorsi?.[s.id];
  if (!d || improntaTraccia(traccia.geojson).split('-')[1] !== d.impronta) return null;
  return d.luoghi?.length || d.foto?.length ? d : null;
}

export const riassuntoScheda = (d) => escapeHtml(riassuntoDaVedere(d));

const distanza = (m) => (m < 50 ? 'sul percorso' : `a ${m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`}`);

export function htmlDaVedere(d) {
  if (!d) return '';
  const foto = (d.foto ?? [])
    .map(
      (f) => `<li><button type="button" class="foto-apri" data-foto="${escapeHtml(JSON.stringify({ url: f.url, autore: f.autore, licenza: f.licenza, pagina: f.pagina, titolo: `km ${String(f.km).replace('.', ',')}` }))}">
        <img src="${escapeHtml(f.url)}" alt="Foto lungo il sentiero, km ${String(f.km).replace('.', ',')}" loading="lazy" decoding="async" />
        <span class="km">km ${String(f.km).replace('.', ',')}</span></button></li>`,
    )
    .join('');
  const luoghi = (d.luoghi ?? [])
    .map((l) => `<li><a href="${escapeHtml(urlVoce(l.titolo))}" target="_blank" rel="noopener">${escapeHtml(l.titolo)}</a> <span class="tenue">· ${distanza(l.distanzaM)}</span></li>`)
    .join('');
  return `${foto ? `<ul class="striscia-foto">${foto}</ul>` : ''}
    ${luoghi ? `<ul class="luoghi-vicini">${luoghi}</ul>` : ''}
    <p class="tenue piccolo">Foto Wikimedia Commons · luoghi da Wikipedia</p>`;
}
