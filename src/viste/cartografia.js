// Sistema cartografico unico: mappe di base, sentieri di Waymarked Trails e pannello
// dei livelli, uguali in tutte le mappe dell'app. Le scelte stanno nello stato condiviso.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { stato } from '../stato.js';
import { creaBaseVettoriale } from './mappaVettoriale.js';

const CENTRO_PREDEFINITO = [41.79, 13.85];

// Etichette in primo piano: le basi "chiara" e "satellitare" hanno i nomi dei luoghi in un livello
// separato, sopra le tracce; così i percorsi non coprono mai nomi e punti d'interesse.
export const BASI = {
  chiara: {
    nome: 'Chiara (nomi in primo piano)',
    vettoriale: true, // MapLibre + OpenFreeMap, caricata solo quando serve
  },
  topo: {
    nome: 'Dettagliata (OpenStreetMap)',
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
    etichette: () =>
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        pane: 'etichette',
      }),
  },
};

// Nomi dei livelli che una mappa può offrire nel pannello
export const NOMI_LIVELLI = {
  heatmap: 'Heatmap fauna (iNaturalist)',
  percorsi: 'Percorsi in archivio',
  osservazione: 'Percorsi di osservazione',
  confini: 'Confini dei parchi',
  distribuzione: 'Distribuzione ufficiale (EEA)',
  panoramicita: 'Panoramicità del percorso',
  sentieriOsm: 'Sentieri escursionistici (Waymarked)',
  gps: 'Posizione GPS',
};

const ICONA_LIVELLI =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m3 13 9 5 9-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

// anteprima: mappa ferma, senza comandi. livelli: chiavi dei livelli offerti da questa mappa.
export function creaMappa(contenitore, { anteprima = false, livelli = [] } = {}) {
  const basi = Object.fromEntries(Object.entries(BASI).filter(([, b]) => b.crea).map(([k, b]) => [k, b.crea()]));
  // sentieri di Waymarked: tenui e solo da vicino (a scala regionale o nazionale fanno solo confusione)
  const sentieri = L.tileLayer('https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png', {
    maxZoom: 18,
    minZoom: 11,
    opacity: 0.55,
    attribution: '&copy; <a href="https://hiking.waymarkedtrails.org">Waymarked Trails</a> (CC-BY-SA)',
  });
  const ferma = anteprima
    ? { zoomControl: false, dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false }
    : { zoomControl: true };
  // canvas: molto più veloce con centinaia di tracce (i tocchi sulle linee funzionano lo stesso)
  const mappa = L.map(contenitore, { ...ferma, preferCanvas: true }).setView(CENTRO_PREDEFINITO, 11);
  // ordine dei livelli: base e sentieri Waymarked, poi heatmap e tracce, sopra i nomi dei luoghi
  // (non toccabili), sopra ancora pin e riquadri
  mappa.createPane('etichette');
  mappa.getPane('etichette').style.zIndex = 450;
  mappa.getPane('etichette').style.pointerEvents = 'none';
  const etichette = Object.fromEntries(Object.entries(BASI).filter(([, b]) => b.etichette).map(([k, b]) => [k, b.etichette()]));

  // base vettoriale: si crea alla prima richiesta; se non si può (offline, niente WebGL) si usa la dettagliata
  let vettoriale = null;
  const preparaVettoriale = () =>
    (vettoriale ??= creaBaseVettoriale()
      .then((v) => {
        basi.chiara = v.base;
        etichette.chiara = v.etichette;
        return true;
      })
      .catch((e) => {
        console.warn('Mappa vettoriale non disponibile', e);
        return false;
      }));

  let baseAttuale = null;
  let richiesta = 0;
  let rimossa = false;
  mappa.on('unload', () => (rimossa = true));
  async function applicaBase(chiave) {
    let k = BASI[chiave] ? chiave : 'chiara';
    const mia = ++richiesta;
    if (k === 'chiara' && !basi.chiara) {
      // intanto la dettagliata, così la mappa non resta vuota
      if (!baseAttuale) mostraBase('topo');
      if (!(await preparaVettoriale())) k = 'topo';
      if (mia !== richiesta || rimossa) return; // nel frattempo è cambiata la scelta o la mappa è chiusa
    }
    mostraBase(k);
  }
  function mostraBase(k) {
    if (baseAttuale === k) return;
    if (baseAttuale) {
      basi[baseAttuale]?.remove();
      etichette[baseAttuale]?.remove();
    }
    basi[k].addTo(mappa);
    basi[k].bringToBack?.();
    etichette[k]?.addTo(mappa);
    baseAttuale = k;
  }
  function applicaSentieri(visibili) {
    if (visibili) sentieri.addTo(mappa);
    else sentieri.remove();
  }
  applicaBase(stato.leggi().base);
  applicaSentieri(stato.leggi().livelli.sentieriOsm !== false);

  // i sentieri di Waymarked si attenuano quando si vuole far risaltare una traccia
  mappa.attenuaSentieri = (attenua) => sentieri.setOpacity(attenua ? 0.3 : 0.55);

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

  // ogni livello può aggiungere una voce alla legenda (funzione che restituisce HTML)
  mappa.vociLegenda = [];
  mappa.aggiornaLegenda = () => {};
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
      </fieldset>
      <fieldset class="legenda"><legend>Legenda</legend>
        ${mappa.vociLegenda.map((f) => f()).join('')}
        <p class="voce-legenda tenue">Idoneità dell'habitat: <b>non disponibile</b> (non esiste un modello aperto e affidabile per questi parchi).</p>
      </fieldset>`;
  }
  // la legenda segue le scelte (animale, livelli) mentre il pannello è aperto
  mappa.aggiornaLegenda = () => {
    if (!pannello.hidden) disegna();
  };

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
