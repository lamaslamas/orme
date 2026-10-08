// Sezione "Pianifica": i miei percorsi, caricati da GPX o disegnati seguendo i sentieri.
import { tuttiIPercorsi, salvaPercorso } from '../db.js';
import { leggiGpx } from '../lib/gpx.js';
import { lunghezzaKm } from '../lib/geo.js';
import { dislivello } from '../lib/quote.js';
import { percorsoSentiero } from '../lib/tracce.js';
import { nuovoIdPercorso } from '../lib/percorso.js';
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
    <div class="azioni">
      <a class="bottone primario" href="#/percorso-nuovo">Disegna un percorso</a>
      <button type="button" class="bottone" id="caricaGpx">Carica un GPX</button>
    </div>
    <input type="file" id="fileGpx" accept=".gpx,application/gpx+xml,application/xml,text/xml" hidden />
    <p class="errore" id="errore" hidden></p>
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
                    <div class="carta-dati">${p.origine === 'disegnato' ? 'Disegnato sulla mappa' : 'Da file GPX'}</div>
                    <div class="numeri"><b>${km.toFixed(1).replace('.', ',')}</b> km${disl ? `<span class="sep">·</span><b>+${disl.salita}</b> m` : ''}</div>
                  </div>
                </a></li>`;
              })
              .join('')
          : '<li class="vuoto">Nessun percorso. Disegnane uno o carica un GPX.</li>'
      }
    </ul>
  `;

  const file = app.querySelector('#fileGpx');
  app.querySelector('#caricaGpx').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    try {
      const { geojson, nome } = leggiGpx(await f.text());
      const id = nuovoIdPercorso();
      await salvaPercorso({ id, nome: nome || f.name.replace(/\.gpx$/i, ''), origine: 'gpx', geojson, note: '' });
      location.hash = `#/percorso/${encodeURIComponent(id)}`;
    } catch (e) {
      const errore = app.querySelector('#errore');
      errore.textContent = e.message;
      errore.hidden = false;
    }
  });
}
