// La mappa grande di un mio percorso (da file GPX/KML o disegnato): centrata sulla traccia, con la mia posizione.
// Il disegno (modifica) si apre solo dal pulsante «Modifica traccia».
import L from 'leaflet';
import { leggiPercorso } from '../db.js';
import { escapeHtml } from '../lib/formato.js';
import { creaMappa } from './mappa.js';
import { aggiungiGps } from './gps.js';
import { disegnaPercorso } from './disegnoTraccia.js';
import { aggiungiHeatmap } from './heatmap.js';
import { segnaTrattoFauna } from './trattoMappa.js';
import { trattoDelMioPercorso } from './trattoProprio.js';
import { percorsoSentiero, invertiGeojson, invertiPercorso } from '../lib/tracce.js';
import { versoDi } from '../lib/verso.js';
import { testoTratto } from '../lib/trattoFauna.js';
import { ICONE } from './icone.js';

export async function vistaMappaPercorso(app, id) {
  const p = await leggiPercorso(id);
  if (!p) {
    app.innerHTML = '<p class="vuoto">Percorso non trovato. <a href="#/miei?scheda=percorsi">Torna ai miei percorsi</a></p>';
    return;
  }
  const idUrl = encodeURIComponent(p.id);
  document.body.classList.add('con-mappa', 'percorso-mappa');
  app.innerHTML = `
    <div id="mappa" class="mappa mappa-percorso"></div>
    <div class="percorso-mappa-sopra"><a class="pill-mappa" href="#/percorso/${idUrl}">${ICONE.indietro}<span>${escapeHtml(p.nome || 'Percorso')}</span></a></div>
    <div class="percorso-mappa-sotto"><a class="pill-mappa" href="#/percorso/${idUrl}/disegna">${ICONE.matita}<span>Modifica traccia</span></a></div>`;
  const mappa = creaMappa(app.querySelector('#mappa'), { livelli: ['heatmap', 'gps'] });
  // Fauna: lo stesso pulsante, gli stessi gruppi e le stesse icone della mappa principale
  const heat = aggiungiHeatmap(mappa);
  const fermaGps = aggiungiGps(mappa, () => ({ geojson: p.geojson }));
  // nel verso scelto con «Inverti senso» (partenza, arrivo e frecce)
  const invertito = versoDi({ id: p.id });
  const gruppo = disegnaPercorso(invertito ? invertiGeojson(p.geojson) : p.geojson, { colore: '#2563eb', frecce: true }).addTo(mappa);
  // il tratto con più fauna, se c'è (dalle osservazioni attorno alla traccia)
  let chiusa = false;
  const pezzi = invertito ? invertiPercorso(percorsoSentiero(p.geojson)).pezzi : percorsoSentiero(p.geojson).pezzi;
  trattoDelMioPercorso(pezzi, { annullata: () => chiusa }).then((tratto) => {
    if (chiusa || !tratto || !mappa._container?.isConnected) return;
    segnaTrattoFauna(mappa, pezzi, tratto);
    const sotto = app.querySelector('.percorso-mappa-sotto');
    sotto?.insertAdjacentHTML('afterbegin', `<span class="pill-mappa tratto-fauna-pill">Più fauna: ${testoTratto(tratto)}</span>`);
  });
  requestAnimationFrame(() => {
    mappa.invalidateSize();
    mappa.sbloccaInquadrature?.();
    mappa.fitBounds(gruppo.getBounds(), { paddingTopLeft: [30, 70], paddingBottomRight: [30, 90], maxZoom: 16 });
  });
  return () => {
    chiusa = true;
    heat.rimuovi();
    fermaGps();
    mappa.remove();
    document.body.classList.remove('con-mappa', 'percorso-mappa');
  };
}
