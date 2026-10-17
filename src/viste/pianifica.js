// Sezione "Pianifica": i miei percorsi, caricati da GPX o disegnati seguendo i sentieri.
import { tuttiIPercorsi } from '../db.js';
import { avviaImportazione } from './importaFile.js';
import { lunghezzaKm } from '../lib/geo.js';
import { dislivello } from '../lib/quote.js';
import { percorsoSentiero } from '../lib/tracce.js';
import { sagomaSvg } from '../lib/sagoma.js';
import { escapeHtml } from '../lib/formato.js';

export function numeriPercorso(p) {
  const pezzi = percorsoSentiero(p.geojson).pezzi;
  return { km: lunghezzaKm({ coordinates: pezzi }), disl: dislivello(pezzi) };
}

export async function vistaPianifica(app) {
  const percorsi = (await tuttiIPercorsi()).sort((a, b) => String(b.modificato).localeCompare(String(a.modificato)));
  app.innerHTML = `
    <h1 class="titolo-pagina">Pianifica</h1>
    <a class="invito-meteo" href="#/domani"><span class="icona-meteo" aria-hidden="true">⛅</span><span><b>Dove vado domani?</b><span class="tenue piccolo">I percorsi migliori secondo il meteo, la durata e le tue preferenze</span></span></a>
    <div class="azioni">
      <a class="bottone primario" href="#/percorso-nuovo">Disegna un percorso</a>
      <button type="button" class="bottone" id="caricaGpx">Importa file (GPX, KML, zip)</button>
    </div>
    <ul class="lista">
      ${
        percorsi.length
          ? percorsi
              .map((p) => {
                const { km, disl } = numeriPercorso(p);
                const d = sagomaSvg(p.geojson, 88, 88, 12);
                return `<li><a class="carta carta-sentiero" href="#/percorso/${encodeURIComponent(p.id)}">
                  ${d ? `<svg class="miniatura" viewBox="0 0 88 88" aria-hidden="true"><path d="${d}" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#2563eb" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>` : '<div class="miniatura vuota"></div>'}
                  <div class="carta-corpo">
                    <div class="nome">${escapeHtml(p.nome || 'Percorso senza nome')}</div>
                    <div class="carta-dati">${p.origine === 'disegnato' ? 'Disegnato sulla mappa' : p.origine === 'kml' ? 'Da file KML' : 'Da file GPX'}</div>
                    <div class="numeri"><b>${km.toFixed(1).replace('.', ',')}</b> km${disl ? `<span class="sep">·</span><b>+${disl.salita}</b> m` : ''}</div>
                  </div>
                </a></li>`;
              })
              .join('')
          : '<li class="vuoto">Nessun percorso. Disegnane uno o importa file GPX, KML o zip.</li>'
      }
    </ul>
  `;

  app.querySelector('#caricaGpx').addEventListener('click', () => avviaImportazione());
}
