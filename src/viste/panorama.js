// Indice panoramico nell'app: una riga nella scheda e il livello "Panoramicità" sulla mappa.
// L'indice è calcolato in anticipo (scripts/calcola-panorama.mjs) e arriva con l'archivio.
import L from 'leaflet';
import { escapeHtml } from '../lib/formato.js';
import { campionaPercorso, improntaTraccia } from '../lib/panorama.js';
import { ICONE } from './icone.js';
import { stato } from '../stato.js';

export const COLORI_PANORAMA = { limitata: '#8fa39a', intermedia: '#d8b26e', panoramica: '#e0811a' };
const NOMI_CLASSI = { limitata: 'Visuale limitata', intermedia: 'Intermedia', panoramica: 'Panoramica' };
const classe = (v) => (v < 35 ? 'limitata' : v < 65 ? 'intermedia' : 'panoramica');
const km = (n) => n.toFixed(1).replace('.', ',');

// L'indice vale per la traccia su cui è stato calcolato (quella dell'archivio)
export const panoramaPerTraccia = (s, traccia) => Boolean(s.panorama && traccia?.geojson && improntaTraccia(traccia.geojson) === s.panorama.impronta);

// Una riga sola: «Panoramico · tratto migliore km 3,2–4,2». Il dettaglio (criteri, belvedere, metodo) non c'è più nella scheda.
const ETICHETTA_RIGA = (punteggio) => (punteggio >= 75 ? 'Molto panoramico' : punteggio >= 55 ? 'Panoramico' : punteggio >= 35 ? 'Panoramicità moderata' : 'Visuale limitata');
export function htmlRigaPanorama(s, traccia, idUrl) {
  const p = s.panorama;
  if (!p) return '';
  const stessaTraccia = panoramaPerTraccia(s, traccia);
  const parti = [ETICHETTA_RIGA(p.punteggio)];
  if (p.migliore) parti.push(`tratto migliore km ${km(p.migliore.daKm)}–${km(p.migliore.aKm)}`);
  const vedi = stessaTraccia && p.migliore ? ` · <a href="#/sentiero/${idUrl}/mappa" data-azione="mostra-panorama">vedi sulla mappa</a>` : '';
  return `<p class="riga-panorama">${ICONE.sole ?? ''}<span>${escapeHtml(parti.join(' · '))}${vedi}</span></p>`;
}

// Il collegamento "vedi sulla mappa" accende il livello
export function collegaPanorama(contenitore) {
  contenitore.querySelector('[data-azione="mostra-panorama"]')?.addEventListener('click', () => stato.imposta({ livelli: { panoramicita: true } }));
}

// Livello sulla mappa del sentiero: tratti colorati ogni 100 m e il chilometro migliore
export function aggiungiLivelloPanorama(mappa, s, leggiTraccia) {
  const gruppo = L.layerGroup();
  function disegna() {
    gruppo.clearLayers();
    const traccia = leggiTraccia();
    if (!panoramaPerTraccia(s, traccia)) return;
    const punti = campionaPercorso(traccia.geojson);
    const v = s.panorama.visuale;
    let corrente = null;
    for (let i = 0; i < punti.length - 1; i++) {
      const c = classe(v[i] ?? 0);
      const a = [punti[i].lat, punti[i].lon];
      const b = [punti[i + 1].lat, punti[i + 1].lon];
      if (corrente?.classe === c) corrente.linea.push(b);
      else {
        if (corrente) gruppo.addLayer(L.polyline(corrente.linea, { color: COLORI_PANORAMA[corrente.classe], weight: 7, opacity: 0.95, interactive: false }));
        corrente = { classe: c, linea: [a, b] };
      }
    }
    if (corrente) gruppo.addLayer(L.polyline(corrente.linea, { color: COLORI_PANORAMA[corrente.classe], weight: 7, opacity: 0.95, interactive: false }));
    const m = s.panorama.migliore;
    if (m) {
      const tratto = punti.filter((p) => p.km >= m.daKm - 0.01 && p.km <= m.aKm + 0.01).map((p) => [p.lat, p.lon]);
      if (tratto.length > 1) {
        gruppo.addLayer(L.polyline(tratto, { color: '#fff', weight: 14, opacity: 0.7, interactive: false }));
        gruppo.addLayer(L.polyline(tratto, { color: COLORI_PANORAMA.panoramica, weight: 8, interactive: false }).bindTooltip('Tratto più panoramico', { permanent: false }));
      }
    }
  }
  mappa.vociLegenda?.push(() => {
    if (!stato.leggi().livelli.panoramicita) return '';
    if (!panoramaPerTraccia(s, leggiTraccia())) return '<p class="voce-legenda tenue">Panoramicità: non disponibile per questa traccia.</p>';
    return `<div class="voce-legenda"><b>Panoramicità stimata</b><ul class="legenda-stati">${Object.entries(NOMI_CLASSI)
      .map(([k, n]) => `<li><span class="campione" style="background:${COLORI_PANORAMA[k]}"></span>${n}</li>`)
      .join('')}</ul><p class="tenue piccolo">${s.panorama.metodo === 'viewshed' ? 'Visibilità calcolata sul terreno e sul bosco' : 'Stima preliminare dalla forma del terreno e dal bosco'}. In evidenza il chilometro più panoramico.</p></div>`;
  });
  mappa.suLivello('panoramicita', (acceso) => {
    if (acceso) {
      disegna();
      gruppo.addTo(mappa);
    } else gruppo.remove();
    mappa.aggiornaLegenda?.();
  });
  return { ridisegna: disegna };
}
