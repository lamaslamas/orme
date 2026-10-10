// Percorsi toccabili sulle mappe (parco, Intorno a me, mappa principale): un tocco sulla traccia
// la evidenzia con partenza, arrivo e verso e apre un riquadro con i dati essenziali e
// "Apri la scheda". Sotto ogni traccia c'è una linea invisibile larga, facile da prendere col dito.
import L from 'leaflet';
import { escapeHtml, codici, durata } from '../lib/formato.js';
import { misureSentiero } from '../lib/riassunto.js';
import { disegnaTraccia } from './mappa.js';
import { disegnaPercorso } from './disegnoTraccia.js';
import { htmlFaunaBreve } from './faunaBreve.js';
import { ICONE } from './icone.js';

const TOLLERANZA_PX = 24;

export function riquadroSentiero(s, traccia) {
  const id = encodeURIComponent(s.id);
  const m = misureSentiero(s, traccia);
  const dati = [
    m.km != null ? `<span>${ICONE.percorso}${m.km.toFixed(1).replace('.', ',')} km</span>` : '',
    m.salita != null ? `<span>${ICONE.salita}${m.salita} m</span>` : '',
    m.durataMin != null ? `<span>${ICONE.orologio}${m.durataStimata ? '~' : ''}${durata(m.durataMin)}</span>` : '',
  ].join('');
  return `
    <div class="popup-sentiero">
      <div class="popup-sentiero-nome">${s.codici?.length ? `<span class="codice">${escapeHtml(codici(s))}</span> ` : ''}<b>${escapeHtml(s.nome)}</b></div>
      ${dati ? `<span class="dati-icone">${dati}</span>` : ''}
      ${htmlFaunaBreve(s, { compatta: true })}
      <a class="bottone primario popup-apri" href="#/sentiero/${id}">Apri la scheda ›</a>
    </div>`;
}

// occupata(): true mentre uno strumento (misura, avvistamento…) usa i tocchi sulla mappa
// inquadra: la traccia toccata viene inquadrata (mappa principale)
export function percorsiToccabili(mappa, { occupata = () => false, inquadra = false, primaDiInquadrare = () => {}, dopoInquadrare = () => {} } = {}) {
  const selezione = L.layerGroup().addTo(mappa);
  // le aree toccabili stanno in un livello SVG sopra le tracce e i pallini di rifugi e acqua (su
  // canvas, che altrimenti prenderebbero il tocco): in SVG rispondono solo vicino alla linea
  if (!mappa.getPane('toccoPercorsi')) {
    mappa.createPane('toccoPercorsi');
    mappa.getPane('toccoPercorsi').style.zIndex = 445;
  }
  const renderer = L.svg({ pane: 'toccoPercorsi' });
  // un tocco vicino a una traccia (anche non esattamente sopra) la sceglie: la più vicina entro
  // TOLLERANZA_PX. Anche la heatmap lo chiede, per non aprire le osservazioni al suo posto.
  const aree = new Set();
  mappa.percorsoVicino = (latlng) => {
    const p = mappa.latLngToLayerPoint(latlng);
    let migliore = null;
    for (const area of aree) {
      if (!mappa.hasLayer(area)) continue;
      const d = area.closestLayerPoint(p)?.distance ?? Infinity;
      if (d <= TOLLERANZA_PX && (!migliore || d < migliore.d)) migliore = { area, d };
    }
    return migliore?.area ?? null;
  };
  mappa.on('click', (e) => {
    if (occupata()) return;
    mappa.percorsoVicino(e.latlng)?.fire('click', { latlng: e.latlng });
  });
  return {
    // disegna la traccia nel livello indicato; restituisce { linea, area }
    // colore: quello dell'evidenziazione (se la linea è disegnata discreta, in grigio)
    disegna(livello, sentiero, traccia, stile, colore = stile.color) {
      const linea = disegnaTraccia(traccia.geojson, { ...stile, interactive: false }).addTo(livello);
      // bubblingMouseEvents: il tocco sulla traccia non arriva alla mappa (niente elenco della heatmap)
      const area = disegnaTraccia(traccia.geojson, { color: colore, weight: 22, opacity: 0, renderer, pane: 'toccoPercorsi', bubblingMouseEvents: false }).addTo(livello);
      aree.add(area);
      area.on('remove', () => aree.delete(area)).on('add', () => aree.add(area));
      // il riquadro si apre a mano (non con bindPopup, che fermerebbe il tocco agli strumenti)
      area.on('click', (e) => {
        if (occupata()) return;
        selezione.clearLayers();
        // una rete di sentieri non ha partenza, arrivo né verso
        const rete = traccia.dettagli?.rete;
        const evidenziata = disegnaPercorso(traccia.geojson, { colore, spessore: 6, ...(rete ? { frecce: false, estremi: false } : {}) }).addTo(selezione);
        let punto = e.latlng;
        if (inquadra) {
          primaDiInquadrare();
          mappa.fitBounds(evidenziata.getBounds(), { paddingTopLeft: [40, 150], paddingBottomRight: [40, 30], maxZoom: 15, animate: false });
          dopoInquadrare(); // senza animazione lo spostamento è già avvenuto
          const b = evidenziata.getBounds();
          punto = [b.getNorth(), b.getCenter().lng];
        }
        L.popup({ autoPan: !inquadra, className: 'popup-percorso' })
          .setLatLng(punto)
          .setContent(riquadroSentiero(sentiero, traccia))
          .on('remove', () => selezione.clearLayers())
          .openOn(mappa);
      });
      return { linea, area };
    },
    pulisci() {
      selezione.clearLayers();
    },
  };
}
