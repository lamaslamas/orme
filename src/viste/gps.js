import L from 'leaflet';
import { distanzaDallaTracciaM } from '../lib/geo.js';

const SOGLIA_FUORI_TRACCIA_M = 50;

function messaggioErrore(errore) {
  if (errore.code === 1) return 'Permesso di posizione negato: abilitalo nelle impostazioni del browser.';
  if (errore.code === 2) return 'Posizione non disponibile: controlla che il GPS sia attivo.';
  if (errore.code === 3) return 'Il GPS non risponde: riprova all’aperto.';
  return 'Posizione non disponibile.';
}

function formattaMetri(m) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

// Aggiunge alla mappa il pulsante "La mia posizione".
// leggiTraccia() restituisce la traccia attuale (o nulla) per calcolare la distanza.
export function aggiungiGps(mappa, leggiTraccia) {
  let idWatch = null;
  let segui = true;
  let wakeLock = null;
  let punto = null;
  let cerchio = null;

  const stato = L.DomUtil.create('div', 'gps-stato');
  stato.hidden = true;
  mappa.getContainer().appendChild(stato);

  const Controllo = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const div = L.DomUtil.create('div', 'leaflet-bar');
      const bottone = L.DomUtil.create('a', 'gps-bottone', div);
      bottone.href = '#';
      bottone.setAttribute('role', 'button');
      bottone.title = 'La mia posizione';
      bottone.setAttribute('aria-label', 'La mia posizione');
      bottone.innerHTML =
        '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor"/><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4" stroke="currentColor" stroke-width="2"/></svg>';
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.on(bottone, 'click', (e) => {
        L.DomEvent.preventDefault(e);
        if (idWatch === null) avvia();
        else if (!segui) {
          segui = true;
          if (punto) mappa.setView(punto.getLatLng(), Math.max(mappa.getZoom(), 15));
          aggiornaBottone();
        } else ferma();
      });
      this.bottone = bottone;
      return div;
    },
  });
  const controllo = new Controllo().addTo(mappa);

  function aggiornaBottone() {
    controllo.bottone.classList.toggle('attivo', idWatch !== null);
    controllo.bottone.classList.toggle('segue', idWatch !== null && segui);
    controllo.bottone.title =
      idWatch === null ? 'La mia posizione' : segui ? 'Spegni il GPS' : 'Torna alla mia posizione';
  }

  function mostraStato(html, classe = '') {
    stato.innerHTML = html;
    stato.className = `gps-stato ${classe}`;
    stato.hidden = false;
  }

  async function tieniSchermoAcceso() {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch {
      // non disponibile: pazienza
    }
  }

  function alRitornoInPrimoPiano() {
    if (idWatch !== null && document.visibilityState === 'visible') tieniSchermoAcceso();
  }

  function aggiorna(pos) {
    const { latitude, longitude, accuracy } = pos.coords;
    const latlng = [latitude, longitude];
    if (!punto) {
      cerchio = L.circle(latlng, { radius: accuracy, color: '#2563eb', weight: 1, fillOpacity: 0.12 }).addTo(mappa);
      punto = L.circleMarker(latlng, {
        radius: 8,
        color: '#fff',
        weight: 3,
        fillColor: '#2563eb',
        fillOpacity: 1,
      }).addTo(mappa);
      mappa.setView(latlng, Math.max(mappa.getZoom(), 15));
    } else {
      punto.setLatLng(latlng);
      cerchio.setLatLng(latlng).setRadius(accuracy);
      if (segui) mappa.panTo(latlng);
    }

    const precisione = `precisione ± ${formattaMetri(accuracy)}`;
    const traccia = leggiTraccia();
    if (!traccia) {
      mostraStato(precisione);
      return;
    }
    const distanza = distanzaDallaTracciaM([longitude, latitude], traccia.geojson);
    // la precisione del GPS conta: si è "fuori" solo se la distanza supera anche l'errore
    const fuori = distanza > Math.max(SOGLIA_FUORI_TRACCIA_M, accuracy);
    mostraStato(
      fuori
        ? `<b>Sei a ${formattaMetri(distanza)} dalla traccia</b> · ${precisione}`
        : `Sulla traccia · ${precisione}`,
      fuori ? 'fuori' : 'sulla',
    );
  }

  function avvia() {
    if (!navigator.geolocation) {
      mostraStato('Questo dispositivo non fornisce la posizione.', 'fuori');
      return;
    }
    segui = true;
    mostraStato('Cerco la posizione…');
    idWatch = navigator.geolocation.watchPosition(aggiorna, (e) => mostraStato(messaggioErrore(e), 'fuori'), {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 30000,
    });
    tieniSchermoAcceso();
    document.addEventListener('visibilitychange', alRitornoInPrimoPiano);
    aggiornaBottone();
  }

  function ferma() {
    if (idWatch !== null) navigator.geolocation.clearWatch(idWatch);
    idWatch = null;
    wakeLock?.release().catch(() => {});
    wakeLock = null;
    document.removeEventListener('visibilitychange', alRitornoInPrimoPiano);
    punto?.remove();
    cerchio?.remove();
    punto = cerchio = null;
    stato.hidden = true;
    aggiornaBottone();
  }

  // Se sposto la mappa a mano smette di seguirmi
  mappa.on('dragstart', () => {
    if (idWatch !== null && segui) {
      segui = false;
      aggiornaBottone();
    }
  });

  // il pannello dei livelli può accendere e spegnere il GPS
  mappa.gps = { avvia, ferma, attivo: () => idWatch !== null };
  return ferma;
}
