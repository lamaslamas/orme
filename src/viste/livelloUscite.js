// Livello "Sentieri delle uscite": i sentieri già collegati alle uscite delle associazioni (e le uscite
// con una traccia propria), in terracotta tratteggiato sopra le altre tracce. Il livello si guarda e
// basta: toccando il sentiero, il suo foglio dice quali uscite lo usano (usciteDi).
import L from 'leaflet';
import { eUscita } from '../lib/filtri.js';
import { sentieriDelleUscite } from '../lib/collegamenti.js';
import { temaUscita, mesiUscita, testoMesi } from '../lib/stagioni.js';
import { escapeHtml } from '../lib/formato.js';
import { COLORI } from './colori.js';

const riga = (u) => {
  const chi = u.escursione?.associazione || u.organizzatori?.[0] || '';
  const quando = [temaUscita(u).nome, testoMesi(mesiUscita(u))].filter(Boolean).join(' · ');
  return `<li><a href="#/sentiero/${encodeURIComponent(u.id)}">${escapeHtml(u.escursione?.nomeUscita || u.nome)}</a><br><span class="tenue piccolo">${escapeHtml([quando, chi].filter(Boolean).join(' · '))}</span></li>`;
};

// righe per il foglio del sentiero: le uscite che lo usano (vuoto se nessuna)
export function htmlUsciteDelSentiero(uscite) {
  if (!uscite.length) return '';
  return `<div class="uscite-sentiero"><p class="tenue piccolo">${uscite.length === 1 ? 'Lo usa un\'uscita' : `Lo usano ${uscite.length} uscite`} delle associazioni:</p><ul>${uscite.map(riga).join('')}</ul></div>`;
}

// colore del bordo secondo la base (chiaro sulle basi chiare, scuro su satellite e scura)
export function creaLivelloUscite(mappa, { coloreBordo }) {
  if (!mappa.getPane('uscite')) {
    mappa.createPane('uscite');
    mappa.getPane('uscite').style.zIndex = 405; // sopra le tracce (400), sotto i nomi dei luoghi
  }
  const tela = L.canvas({ pane: 'uscite' });
  mappa.getPane('uscite').style.pointerEvents = 'none';
  const gruppo = L.layerGroup();
  let voci = [];
  function disegna() {
    gruppo.clearLayers();
    for (const v of voci) {
      L.geoJSON(v.geojson, { renderer: tela, pane: 'uscite', style: { color: coloreBordo(), weight: 7, opacity: 0.9 }, interactive: false }).addTo(gruppo);
      L.geoJSON(v.geojson, { renderer: tela, pane: 'uscite', style: { color: COLORI.uscita, weight: 4, opacity: 0.95, dashArray: '8 5' }, interactive: false }).addTo(gruppo);
    }
  }
  return {
    gruppo,
    // sentieri: tutti quelli sul telefono; tracce: Map id → traccia
    aggiorna(sentieri, tracce) {
      voci = sentieriDelleUscite(sentieri.filter(eUscita), tracce);
      disegna();
    },
    ridisegna: disegna, // per il cambio di base (colore del bordo)
    // uscite che usano un sentiero dell'archivio (non l'uscita stessa)
    usciteDi: (id) => voci.find((v) => v.sentiero === id)?.uscite ?? [],
  };
}
