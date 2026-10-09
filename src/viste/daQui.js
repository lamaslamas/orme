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
const MIRINO =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>';

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
    options: { position: 'topleft' },
    onAdd() {
      const div = L.DomUtil.create('div', 'leaflet-bar');
      const b = L.DomUtil.create('a', 'daqui-bottone', div);
      b.href = '#';
      b.setAttribute('role', 'button');
      b.title = 'Percorsi da qui: tocca un punto e vedi quali percorsi ci passano';
      b.setAttribute('aria-label', 'Percorsi da qui');
      b.innerHTML = MIRINO;
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
    mappa.getContainer().classList.remove('scegli-punto', 'con-daqui');
  }

  function mostra() {
    livello.clearLayers();
    const trovati = percorsiDaQui(leggiPercorsi() ?? [], punto, raggio);
    L.circle([punto[1], punto[0]], { pane: 'evidenza', radius: raggio, color: COLORI.traccia, weight: 1.5, dashArray: '4 4', fillOpacity: 0.06, interactive: false }).addTo(livello);
    for (const t of trovati) {
      L.geoJSON(t.traccia.geojson, { pane: 'evidenza', interactive: false, style: { color: COLORI.traccia, weight: 5, opacity: 0.95 } }).addTo(livello);
    }
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
