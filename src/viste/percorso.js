// Scheda di un percorso della sezione Pianifica
import { leggiPercorso, salvaPercorso, eliminaPercorso } from '../db.js';
import { percorsoSentiero, estremiTraccia } from '../lib/tracce.js';
import { lunghezzaKm } from '../lib/geo.js';
import { dislivello } from '../lib/quote.js';
import { stimaDurataMin } from '../lib/durata.js';
import { creaGpx, nomeFileGpx } from '../lib/gpxScrittura.js';
import { escapeHtml } from '../lib/formato.js';
import { creaMappa } from './mappa.js';
import { disegnaPercorso } from './disegnoTraccia.js';
import { numeriGrandi, htmlPortamiAllaPartenza } from './scheda.js';
import { htmlProfiloPendenze } from './profilo.js';

export async function vistaPercorso(app, id) {
  const p = await leggiPercorso(id);
  if (!p) {
    app.innerHTML = '<p class="vuoto">Percorso non trovato. <a href="#/pianifica">Torna a Pianifica</a></p>';
    return;
  }
  const pezzi = percorsoSentiero(p.geojson).pezzi;
  const km = lunghezzaKm({ coordinates: pezzi });
  const disl = dislivello(pezzi);
  const misure = { km, salita: disl?.salita ?? null, durataMin: stimaDurataMin(km, disl), durataStimata: true };
  const e = estremiTraccia(p.geojson);
  const idUrl = encodeURIComponent(p.id);

  app.innerHTML = `
    <a class="indietro" href="#/pianifica">‹ Pianifica</a>
    <article class="scheda">
      <a class="anteprima-mappa" href="#/percorso/${idUrl}/disegna" aria-label="Apri la mappa del percorso"><div id="miniMappa"></div></a>
      <h1>${escapeHtml(p.nome || 'Percorso senza nome')}</h1>
      <p class="zona">${p.origine === 'disegnato' ? 'Disegnato sulla mappa (BRouter)' : 'Da file GPX'}</p>
      ${numeriGrandi(misure)}
      ${disl ? '' : '<p class="tenue">Dislivello non disponibile: il percorso non ha le quote.</p>'}
      ${htmlProfiloPendenze(pezzi)}
      ${e ? htmlPortamiAllaPartenza({ lat: e.inizio[1], lon: e.inizio[0], fonte: 'traccia' }) : ''}
      <section class="riquadro">
        <h2>Note</h2>
        <form class="modulo" id="moduloPercorso">
          <label class="campo"><span>Nome</span><input name="nome" value="${escapeHtml(p.nome)}" /></label>
          <label class="campo"><span>Note</span><textarea name="note" rows="3">${escapeHtml(p.note)}</textarea></label>
          <button type="submit" class="bottone">Salva</button> <span class="salvato" id="salvato" hidden>Salvato</span>
        </form>
      </section>
      <div class="barra-azioni">
        <button type="button" class="bottone primario" id="esporta">Esporta GPX</button>
        ${p.origine === 'disegnato' ? `<a class="bottone" href="#/percorso/${idUrl}/disegna">Modifica</a>` : ''}
      </div>
      <button type="button" class="bottone pericolo pieno" id="elimina">Elimina percorso</button>
    </article>
  `;

  app.querySelector('#moduloPercorso').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    await salvaPercorso({ ...p, nome: f.elements.nome.value.trim(), note: f.elements.note.value.trim() });
    app.querySelector('#salvato').hidden = false;
  });

  app.querySelector('#esporta').addEventListener('click', async () => {
    const file = new File([creaGpx({ nome: p.nome || 'Percorso', linee: pezzi })], nomeFileGpx(p.nome), { type: 'application/gpx+xml' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: p.nome });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(file);
    const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });

  app.querySelector('#elimina').addEventListener('click', async () => {
    if (!confirm(`Eliminare il percorso "${p.nome}"?`)) return;
    await eliminaPercorso(p.id);
    location.hash = '#/pianifica';
  });

  const contenitore = app.querySelector('#miniMappa');
  if (!pezzi.length) return;
  const mini = creaMappa(contenitore, { anteprima: true });
  const g = disegnaPercorso(p.geojson, { colore: '#2563eb', frecce: false }).addTo(mini);
  mini.attenuaSentieri(true);
  requestAnimationFrame(() => {
    mini.invalidateSize();
    mini.fitBounds(g.getBounds(), { padding: [28, 28] });
  });
  return () => mini.remove();
}
