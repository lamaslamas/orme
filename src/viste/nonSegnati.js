// Livello "Sentieri non segnati": spento di base. Acceso, da vicino compare "Cerca sentieri qui",
// che chiede a OpenStreetMap solo la zona inquadrata; le zone già cercate restano finché la mappa
// è aperta. Tratteggio marrone sottile, diverso dalle tracce viola dei percorsi segnati.
import L from 'leaflet';
import { interrogaOverpass } from '../lib/overpass.js';
import { queryNonSegnati, sentieriNonSegnati, testoDifficoltaSac, ZOOM_NON_SEGNATI } from '../lib/nonSegnati.js';
import { escapeHtml } from '../lib/formato.js';
import { stato } from '../stato.js';

const COLORE = '#8a5a2b';

function popup(s) {
  const dettagli = [s.tipo, s.km >= 0.1 ? `${String(s.km.toFixed(1)).replace('.', ',')} km` : '', testoDifficoltaSac(s.difficolta)].filter(Boolean).join(' · ');
  return `<div class="popup-non-segnato">
    <b>${escapeHtml(s.nome ?? 'Sentiero non segnato')}</b>
    <span class="tenue">${escapeHtml(s.nome ? `Non segnato · ${dettagli}` : dettagli)}</span>
    <span class="tenue piccolo">Disegnato su OpenStreetMap, senza segnavia: verifica sul posto. <a href="https://www.openstreetmap.org/way/${s.id}" target="_blank" rel="noopener">OSM ↗</a></span>
  </div>`;
}

export function aggiungiNonSegnati(mappa) {
  if (!mappa.getPane('nonSegnati')) {
    mappa.createPane('nonSegnati');
    mappa.getPane('nonSegnati').style.zIndex = 380; // sopra la heatmap, sotto le tracce dei percorsi
  }
  const livello = L.layerGroup();
  const visti = new Set(); // vie già disegnate
  const cercate = []; // zone già cercate (L.LatLngBounds)
  let acceso = false;
  let inCorso = false;

  const bottone = L.DomUtil.create('button', 'cerca-qui');
  bottone.type = 'button';
  bottone.hidden = true;
  mappa.getContainer().appendChild(bottone);
  L.DomEvent.disableClickPropagation(bottone);

  function aggiornaBottone() {
    const vicino = mappa.getZoom() >= ZOOM_NON_SEGNATI;
    const giaCercata = cercate.some((b) => b.contains(mappa.getBounds()));
    bottone.hidden = !acceso || (vicino && giaCercata && !inCorso);
    bottone.disabled = !vicino || inCorso;
    bottone.textContent = inCorso ? 'Cerco i sentieri…' : vicino ? 'Cerca sentieri qui' : 'Avvicinati per cercare i sentieri';
  }

  async function cerca() {
    if (inCorso || mappa.getZoom() < ZOOM_NON_SEGNATI) return;
    inCorso = true;
    aggiornaBottone();
    const b = mappa.getBounds().pad(0.1);
    try {
      const json = await interrogaOverpass(queryNonSegnati([b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]), { timeoutMs: 60000 });
      for (const s of sentieriNonSegnati(json)) {
        if (visti.has(s.id)) continue;
        visti.add(s.id);
        L.polyline(
          s.linea.map(([lon, lat]) => [lat, lon]),
          { pane: 'nonSegnati', color: COLORE, weight: s.tipo === 'Carrareccia' ? 2 : 2.5, opacity: 0.9, dashArray: s.tipo === 'Carrareccia' ? '2 5' : '6 5', bubblingMouseEvents: false },
        )
          .bindPopup(() => popup(s))
          .addTo(livello);
      }
      cercate.push(b);
    } catch (e) {
      bottone.textContent = 'OpenStreetMap non risponde, riprova';
      console.warn('Sentieri non segnati', e);
      inCorso = false;
      bottone.disabled = false;
      return;
    }
    inCorso = false;
    aggiornaBottone();
  }

  bottone.addEventListener('click', cerca);
  mappa.on('moveend zoomend', aggiornaBottone);
  mappa.suLivello?.('nonSegnati', (si) => {
    acceso = si;
    if (si) livello.addTo(mappa);
    else livello.remove();
    aggiornaBottone();
  });
  // da fuori (es. "Intorno a me"): accende il livello e cerca subito nella zona inquadrata
  mappa.cercaNonSegnati = () => {
    if (!stato.leggi().livelli.nonSegnati) stato.imposta({ livelli: { nonSegnati: true } });
    return cerca();
  };
}
