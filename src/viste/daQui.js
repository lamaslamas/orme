// Pulsante "Percorsi da qui": tocco un punto della mappa e vedo evidenziati i percorsi
// dell'archivio che ci passano (entro 100, 200 o 500 m), con un elenco sotto.
// Mentre si sceglie il punto, mappa.strumento = 'daqui': gli altri tocchi (punti del disegno,
// riquadri delle tracce, heatmap) aspettano.
import L from 'leaflet';
import { escapeHtml, codici, durata } from '../lib/formato.js';
import { percorsiDaQui, RAGGI_DA_QUI, RAGGIO_DA_QUI } from '../lib/daQui.js';
import { COLORI } from './colori.js';
import { ICONE } from './icone.js';
import { htmlFaunaBreve } from './faunaBreve.js';

const MOSTRATI = 10;
// segnaposto con un percorso che ci passa (diverso dal mirino del GPS)
const ICONA_DA_QUI =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20c4-1 6-6 10-7s6 3 10 1" stroke-dasharray="2 3"/><path d="M12 13s5-4.5 5-8a5 5 0 0 0-10 0c0 3.5 5 8 5 8z" fill="currentColor" fill-opacity=".2"/><circle cx="12" cy="5" r="1.6"/></svg>';
// colore dell'evidenziazione: arancio, non usato da nient'altro sulla mappa
const EVIDENZA = '#e8590c';

// leggiPercorsi(): [{ sentiero, traccia, misure }]; attenua: le altre tracce si fanno tenui
export function aggiungiDaQui(mappa, leggiPercorsi, { attenua = false } = {}) {
  if (!mappa.getPane('evidenza')) {
    mappa.createPane('evidenza');
    mappa.getPane('evidenza').style.zIndex = 445; // sopra le tracce, sotto i nomi dei luoghi
  }
  const livello = L.layerGroup().addTo(mappa);
  let scegliendo = false;
  let punto = null;
  let raggio = RAGGIO_DA_QUI;

  const barra = L.DomUtil.create('div', 'misura-barra barra-daqui');
  barra.hidden = true;
  mappa.getContainer().appendChild(barra);
  L.DomEvent.disableClickPropagation(barra);
  L.DomEvent.disableScrollPropagation(barra);

  const Controllo = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const div = L.DomUtil.create('div', 'leaflet-bar');
      const b = L.DomUtil.create('a', 'daqui-bottone', div);
      b.href = '#';
      b.setAttribute('role', 'button');
      b.title = 'Percorsi da qui: tocca un punto e vedi quali percorsi ci passano';
      b.setAttribute('aria-label', 'Percorsi da qui');
      b.innerHTML = `${ICONA_DA_QUI}<span>Da qui</span>`;
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.on(b, 'click', (e) => {
        L.DomEvent.preventDefault(e);
        scegliendo || punto ? chiudi() : scegli();
      });
      this.bottone = b;
      return div;
    },
  });
  const controllo = new Controllo().addTo(mappa);
  // in alto a destra, subito sotto "Fauna" (se c'è) e sopra il pulsante dei livelli
  const angolo = controllo.getContainer().parentNode;
  const fauna = angolo.querySelector('.heat-bottone')?.closest('.leaflet-bar');
  angolo.insertBefore(controllo.getContainer(), fauna ? fauna.nextSibling : angolo.firstChild);

  function scegli() {
    scegliendo = true;
    mappa.strumento = 'daqui';
    mappa.closePopup();
    controllo.bottone.classList.add('attivo');
    mappa.getContainer().classList.add('scegli-punto');
    barra.innerHTML = `<div class="daqui-testa"><b>Tocca un punto sulla mappa</b><button type="button" class="link" data-azione="chiudi">Annulla</button></div>`;
    barra.hidden = false;
  }

  function chiudi() {
    scegliendo = false;
    punto = null;
    if (mappa.strumento === 'daqui') mappa.strumento = null;
    livello.clearLayers();
    barra.hidden = true;
    controllo.bottone.classList.remove('attivo');
    mappa.getContainer().classList.remove('scegli-punto', 'con-daqui', 'con-elenco-daqui');
  }

  function mostra() {
    livello.clearLayers();
    const trovati = percorsiDaQui(leggiPercorsi() ?? [], punto, raggio);
    const centro = [punto[1], punto[0]];
    L.circle(centro, { pane: 'evidenza', radius: raggio, color: EVIDENZA, weight: 2, fillColor: EVIDENZA, fillOpacity: 0.12, interactive: false }).addTo(livello);
    const tracce = L.featureGroup().addTo(livello);
    for (const t of trovati) {
      // bordo bianco sotto, arancio sopra: si stacca da tutte le altre tracce
      L.geoJSON(t.traccia.geojson, { pane: 'evidenza', interactive: false, style: { color: '#fff', weight: 9, opacity: 0.95 } }).addTo(tracce);
      L.geoJSON(t.traccia.geojson, { pane: 'evidenza', interactive: false, style: { color: EVIDENZA, weight: 5, opacity: 1 } }).addTo(tracce);
    }
    L.marker(centro, {
      zIndexOffset: 2000, // sopra rifugi, acqua e animali
      interactive: false,
      keyboard: false,
      icon: L.divIcon({ className: 'spillo-daqui', html: '<span></span>', iconSize: [26, 34], iconAnchor: [13, 34] }),
    }).addTo(livello);
    // la mappa inquadra i percorsi trovati, lasciando sotto lo spazio per l'elenco
    if (trovati.length) {
      const altezzaBarra = Math.min(mappa.getSize().y * 0.46, 260);
      mappa.fitBounds(tracce.getBounds().extend(centro), { paddingTopLeft: [30, 30], paddingBottomRight: [30, altezzaBarra], maxZoom: 15 });
    }
    mappa.getContainer().classList.add('con-elenco-daqui');
    if (attenua) mappa.getContainer().classList.add('con-daqui');
    barra.innerHTML = `
      <div class="daqui-testa"><b>${trovati.length ? `Passano da qui: ${trovati.length}` : 'Nessun percorso passa da qui'}</b>
        <span><button type="button" class="link" data-azione="altro">Altro punto</button> · <button type="button" class="link" data-azione="chiudi">Chiudi</button></span></div>
      <div class="pillole daqui-raggi" role="group" aria-label="Distanza dal punto">${RAGGI_DA_QUI.map(
        (r) => `<button type="button" class="pillola ${r === raggio ? 'attiva' : ''}" data-raggio="${r}">entro ${r} m</button>`,
      ).join('')}</div>
      <ul class="daqui-elenco">${trovati
        .slice(0, MOSTRATI)
        .map(({ sentiero: s, misure, estremo }) => {
          const cod = codici(s);
          return `<li><a href="#/sentiero/${encodeURIComponent(s.id)}">
            <span class="nome">${cod ? `<span class="codice">${escapeHtml(cod)}</span> ` : ''}${escapeHtml(s.nome)}</span>
            <span class="dati tenue">${misure?.durataMin ? `${ICONE.orologio}${durata(misure.durataMin)}` : ''}${estremo ? `<span class="chip chip-daqui">${estremo === 'inizio' ? 'parte da qui' : 'arriva qui'}</span>` : ''}</span>
            ${htmlFaunaBreve(s)}</a></li>`;
        })
        .join('')}${trovati.length > MOSTRATI ? `<li class="tenue piccolo">e altri ${trovati.length - MOSTRATI}: riduci la distanza o avvicinati</li>` : ''}</ul>`;
    barra.hidden = false;
  }

  barra.addEventListener('click', (e) => {
    // il tocco resta alla barra; la barra si ridisegna dopo, altrimenti il pulsante sparirebbe
    // durante il tocco e la mappa lo prenderebbe per un tocco suo (es. apre la heatmap)
    e.stopPropagation();
    const r = e.target.closest('[data-raggio]')?.dataset.raggio;
    const azione = e.target.closest('[data-azione]')?.dataset.azione;
    setTimeout(() => {
      if (r) {
        raggio = Number(r);
        return mostra();
      }
      if (azione === 'chiudi') chiudi();
      if (azione === 'altro') {
        livello.clearLayers();
        mappa.getContainer().classList.remove('con-daqui');
        scegli();
      }
    }, 0);
  });

  mappa.on('click', (e) => {
    if (!scegliendo) return;
    scegliendo = false;
    controllo.bottone.classList.add('attivo');
    mappa.getContainer().classList.remove('scegli-punto');
    punto = [e.latlng.lng, e.latlng.lat];
    // gli altri gestori dello stesso tocco vedono ancora lo strumento attivo e lo ignorano
    setTimeout(() => {
      if (mappa.strumento === 'daqui') mappa.strumento = null;
    }, 0);
    mostra();
  });

  return { attiva: () => scegliendo || Boolean(punto), chiudi };
}
