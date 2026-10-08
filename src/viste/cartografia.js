// Sistema cartografico unico: mappe di base, sentieri di Waymarked Trails e pannello
// dei livelli, uguali in tutte le mappe dell'app. Le scelte stanno nello stato condiviso.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { stato } from '../stato.js';

const CENTRO_PREDEFINITO = [41.79, 13.85];

export const BASI = {
  topo: {
    nome: 'Topografica',
    crea: () =>
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }),
  },
  curve: {
    nome: 'Curve di livello',
    crea: () =>
      L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
      }),
  },
  satellite: {
    nome: 'Satellitare',
    crea: () =>
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Immagini &copy; Esri, Maxar, Earthstar Geographics e comunità GIS',
      }),
  },
};

// Nomi dei livelli che una mappa può offrire nel pannello
export const NOMI_LIVELLI = {
  heatmap: 'Heatmap fauna (iNaturalist)',
  percorsi: 'Percorsi in archivio',
  osservazione: 'Percorsi di osservazione',
  confini: 'Confini dei parchi',
  sentieriOsm: 'Sentieri escursionistici (Waymarked)',
  gps: 'Posizione GPS',
};

const ICONA_LIVELLI =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m3 13 9 5 9-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

// anteprima: mappa ferma, senza comandi. livelli: chiavi dei livelli offerti da questa mappa.
export function creaMappa(contenitore, { anteprima = false, livelli = [] } = {}) {
  const basi = Object.fromEntries(Object.entries(BASI).map(([k, b]) => [k, b.crea()]));
  const sentieri = L.tileLayer('https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png', {
    maxZoom: 18,
    opacity: 0.8,
    attribution: '&copy; <a href="https://hiking.waymarkedtrails.org">Waymarked Trails</a> (CC-BY-SA)',
  });
  const ferma = anteprima
    ? { zoomControl: false, dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false }
    : { zoomControl: true };
  const mappa = L.map(contenitore, { ...ferma }).setView(CENTRO_PREDEFINITO, 11);

  let baseAttuale = null;
  function applicaBase(chiave) {
    const k = basi[chiave] ? chiave : 'topo';
    if (baseAttuale === k) return;
    if (baseAttuale) basi[baseAttuale].remove();
    basi[k].addTo(mappa);
    basi[k].bringToBack();
    baseAttuale = k;
  }
  function applicaSentieri(visibili) {
    if (visibili) sentieri.addTo(mappa);
    else sentieri.remove();
  }
  applicaBase(stato.leggi().base);
  applicaSentieri(stato.leggi().livelli.sentieriOsm !== false);

  // i sentieri di Waymarked si attenuano quando si vuole far risaltare una traccia
  mappa.attenuaSentieri = (attenua) => sentieri.setOpacity(attenua ? 0.45 : 0.8);

  // ogni vista può reagire a un livello: f(acceso) subito e a ogni cambio
  const scollegamenti = [];
  mappa.suLivello = (chiave, f) => {
    let ultimo = stato.leggi().livelli[chiave] !== false;
    f(ultimo);
    scollegamenti.push(
      stato.ascolta((s) => {
        const acceso = s.livelli[chiave] !== false;
        if (acceso !== ultimo) {
          ultimo = acceso;
          f(acceso);
        }
      }),
    );
  };
  scollegamenti.push(
    stato.ascolta((s) => {
      applicaBase(s.base);
      applicaSentieri(s.livelli.sentieriOsm !== false);
    }),
  );
  mappa.on('unload', () => scollegamenti.forEach((f) => f()));

  if (anteprima) return mappa;
  L.control.scale({ imperial: false }).addTo(mappa);
  aggiungiPannelloLivelli(mappa, ['sentieriOsm', ...livelli]);
  return mappa;
}

function aggiungiPannelloLivelli(mappa, livelli) {
  const pannello = L.DomUtil.create('div', 'pannello-livelli');
  pannello.hidden = true;
  mappa.getContainer().appendChild(pannello);
  L.DomEvent.disableClickPropagation(pannello);
  L.DomEvent.disableScrollPropagation(pannello);

  const Controllo = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const div = L.DomUtil.create('div', 'leaflet-bar');
      const b = L.DomUtil.create('a', 'livelli-bottone', div);
      b.href = '#';
      b.title = 'Livelli e mappa di base';
      b.setAttribute('role', 'button');
      b.setAttribute('aria-label', 'Livelli e mappa di base');
      b.setAttribute('aria-expanded', 'false');
      b.innerHTML = ICONA_LIVELLI;
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.on(b, 'click', (e) => {
        L.DomEvent.preventDefault(e);
        pannello.hidden = !pannello.hidden;
        b.setAttribute('aria-expanded', String(!pannello.hidden));
        if (!pannello.hidden) disegna();
      });
      return div;
    },
  });
  new Controllo().addTo(mappa);

  function disegna() {
    const s = stato.leggi();
    const gps = mappa.gps;
    pannello.innerHTML = `
      <fieldset><legend>Mappa di base</legend>
        ${Object.entries(BASI)
          .map(([k, b]) => `<label class="scelta"><input type="radio" name="base" value="${k}" ${s.base === k ? 'checked' : ''}/> ${b.nome}</label>`)
          .join('')}
      </fieldset>
      <fieldset><legend>Livelli</legend>
        ${livelli
          .map((k) => {
            const acceso = k === 'gps' ? Boolean(gps?.attivo()) : s.livelli[k] !== false;
            return `<label class="scelta"><input type="checkbox" name="livello" value="${k}" ${acceso ? 'checked' : ''}/> ${NOMI_LIVELLI[k]}</label>`;
          })
          .join('')}
      </fieldset>`;
  }

  pannello.addEventListener('change', (e) => {
    if (e.target.name === 'base') stato.imposta({ base: e.target.value });
    if (e.target.name === 'livello') {
      const k = e.target.value;
      if (k === 'gps') {
        if (e.target.checked) mappa.gps?.avvia();
        else mappa.gps?.ferma();
      } else stato.imposta({ livelli: { [k]: e.target.checked } });
    }
  });
}
