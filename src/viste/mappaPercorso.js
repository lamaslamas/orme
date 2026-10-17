// La mappa grande di un mio percorso (da file GPX/KML o disegnato): centrata sulla traccia, con la mia posizione.
// Il disegno (modifica) si apre solo dal pulsante «Modifica traccia».
import L from 'leaflet';
import { leggiPercorso } from '../db.js';
import { escapeHtml } from '../lib/formato.js';
import { creaMappa } from './mappa.js';
import { aggiungiGps } from './gps.js';
import { disegnaPercorso } from './disegnoTraccia.js';
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
  const mappa = creaMappa(app.querySelector('#mappa'), { livelli: ['gps'] });
  const fermaGps = aggiungiGps(mappa, () => ({ geojson: p.geojson }));
  const gruppo = disegnaPercorso(p.geojson, { colore: '#2563eb', frecce: true }).addTo(mappa);
  requestAnimationFrame(() => {
    mappa.invalidateSize();
    mappa.sbloccaInquadrature?.();
    mappa.fitBounds(gruppo.getBounds(), { paddingTopLeft: [30, 70], paddingBottomRight: [30, 90], maxZoom: 16 });
  });
  return () => {
    fermaGps();
    mappa.remove();
    document.body.classList.remove('con-mappa', 'percorso-mappa');
  };
}
