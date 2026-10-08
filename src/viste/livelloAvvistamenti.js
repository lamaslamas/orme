// Controllo "Avvistamenti" per le mappe: mostra/nasconde i miei avvistamenti
// (sempre spento all'apertura) e permette di aggiungerne uno.
import L from 'leaflet';
import { tuttiGliAvvistamenti } from '../db.js';
import { ANIMALI } from '../lib/costanti.js';
import { escapeHtml } from '../lib/formato.js';
import { coloreAnimale, testoDataOra, nuovoAvvistamentoDa } from './avvistamenti.js';

const OCCHIO =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>';
const PIU =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

// filtro(a) decide quali avvistamenti mostrare (es. solo di un parco)
export function aggiungiAvvistamenti(mappa, { filtro = () => true } = {}) {
  const livello = L.layerGroup();
  let visibile = false;
  let scelta = false;

  const barra = L.DomUtil.create('div', 'misura-barra');
  barra.hidden = true;
  mappa.getContainer().appendChild(barra);
  L.DomEvent.disableClickPropagation(barra);

  const Controllo = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const div = L.DomUtil.create('div', 'leaflet-bar');
      const occhio = L.DomUtil.create('a', 'avv-bottone', div);
      occhio.href = '#';
      occhio.title = 'Mostra i miei avvistamenti';
      occhio.setAttribute('role', 'button');
      occhio.setAttribute('aria-label', 'Mostra i miei avvistamenti');
      occhio.innerHTML = OCCHIO;
      const piu = L.DomUtil.create('a', 'avv-bottone', div);
      piu.href = '#';
      piu.title = 'Aggiungi un avvistamento';
      piu.setAttribute('role', 'button');
      piu.setAttribute('aria-label', 'Aggiungi un avvistamento');
      piu.innerHTML = PIU;
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.on(occhio, 'click', (e) => {
        L.DomEvent.preventDefault(e);
        visibile ? nascondi() : mostra();
        occhio.classList.toggle('attivo', visibile);
        occhio.setAttribute('aria-pressed', String(visibile));
      });
      L.DomEvent.on(piu, 'click', (e) => {
        L.DomEvent.preventDefault(e);
        avviaScelta();
      });
      return div;
    },
  });
  new Controllo().addTo(mappa);

  async function mostra() {
    visibile = true;
    livello.clearLayers();
    for (const a of (await tuttiGliAvvistamenti()).filter(filtro)) {
      if (!Number.isFinite(a.punto?.lat)) continue;
      L.circleMarker([a.punto.lat, a.punto.lon], {
        radius: 8,
        color: '#fff',
        weight: 2,
        fillColor: coloreAnimale(a.animale),
        fillOpacity: 1,
      })
        .bindPopup(
          `<b>${ANIMALI[a.animale] ?? 'Altro'}${a.individui ? ` × ${a.individui}` : ''}</b><br>${escapeHtml(testoDataOra(a.dataOra))}${
            a.note ? `<br>${escapeHtml(a.note)}` : ''
          }<br><a href="#/avvistamento/${encodeURIComponent(a.id)}">Apri</a>`,
        )
        .addTo(livello);
    }
    livello.addTo(mappa);
  }

  function nascondi() {
    visibile = false;
    livello.remove();
  }

  function avviaScelta() {
    scelta = true;
    mappa.getContainer().classList.add('misurando');
    barra.innerHTML = `
      <p class="misura-testo"><b>Nuovo avvistamento:</b> tocca la mappa nel punto in cui hai visto l'animale, oppure usa la tua posizione.</p>
      <div class="misura-comandi">
        <button type="button" data-azione="gps">Usa il GPS</button>
        <button type="button" data-azione="annulla">Annulla</button>
      </div>`;
    barra.hidden = false;
  }

  function fineScelta() {
    scelta = false;
    barra.hidden = true;
    mappa.getContainer().classList.remove('misurando');
  }

  barra.addEventListener('click', (e) => {
    e.stopPropagation();
    const azione = e.target.closest('[data-azione]')?.dataset.azione;
    if (azione === 'annulla') fineScelta();
    if (azione === 'gps') {
      const testo = barra.querySelector('.misura-testo');
      if (!navigator.geolocation) {
        testo.innerHTML = '<span class="errore">Questo dispositivo non fornisce la posizione.</span>';
        return;
      }
      testo.textContent = 'Cerco la posizione…';
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          fineScelta();
          nuovoAvvistamentoDa({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            precisioneM: pos.coords.accuracy,
            origine: 'gps',
          });
        },
        () => (testo.innerHTML = '<span class="errore">Posizione non disponibile: tocca la mappa.</span>'),
        { enableHighAccuracy: true, timeout: 20000 },
      );
    }
  });

  mappa.on('click', (e) => {
    if (!scelta) return;
    fineScelta();
    nuovoAvvistamentoDa({ lat: e.latlng.lat, lon: e.latlng.lng, precisioneM: null, origine: 'mappa' });
  });

  return { attiva: () => scelta };
}
