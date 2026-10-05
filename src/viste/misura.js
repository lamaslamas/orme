import L from 'leaflet';
import { misuraLineaAria, lineaPiuVicina, puntoSullaLinea, trattoLungoLinea, testoDistanza } from '../lib/misure.js';
import { percorsoSentiero } from '../lib/tracce.js';

// oltre questa distanza dal tocco, il punto non viene agganciato alla traccia
const MAX_AGGANCIO_M = 150;

const lonlat = (ll) => [ll.lng, ll.lat];
const latlng = (p) => [p[1], p[0]];

// Aggiunge il pulsante "Misura" alla mappa.
// leggiLinee() restituisce le tracce visibili come elenco di geojson (per la misura lungo la traccia).
// Le misure restano solo sullo schermo: non vengono mai salvate.
export function aggiungiMisura(mappa, leggiTracce) {
  let attiva = false;
  let modo = 'aria';
  let punti = []; // modo "aria": [lon, lat]
  let agganci = []; // modo "traccia": { linea, aggancio }
  const livello = L.layerGroup().addTo(mappa);

  const barra = L.DomUtil.create('div', 'misura-barra');
  barra.hidden = true;
  mappa.getContainer().appendChild(barra);
  L.DomEvent.disableClickPropagation(barra);
  L.DomEvent.disableScrollPropagation(barra);

  const Controllo = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const div = L.DomUtil.create('div', 'leaflet-bar');
      const bottone = L.DomUtil.create('a', 'misura-bottone', div);
      bottone.href = '#';
      bottone.setAttribute('role', 'button');
      bottone.title = 'Misura';
      bottone.setAttribute('aria-label', 'Misura');
      bottone.innerHTML =
        '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M3 17 17 3l4 4L7 21z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2" stroke="currentColor" stroke-width="2"/></svg>';
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.on(bottone, 'click', (e) => {
        L.DomEvent.preventDefault(e);
        attiva ? chiudi() : apri();
      });
      this.bottone = bottone;
      return div;
    },
  });
  const controllo = new Controllo().addTo(mappa);

  function lineeDisponibili() {
    return (leggiTracce() ?? []).flatMap((g) => percorsoSentiero(g).pezzi);
  }

  function apri() {
    attiva = true;
    modo = 'aria';
    azzera();
    controllo.bottone.classList.add('attivo');
    mappa.getContainer().classList.add('misurando');
    mappa.closePopup();
  }

  function chiudi() {
    attiva = false;
    azzera();
    barra.hidden = true;
    controllo.bottone.classList.remove('attivo');
    mappa.getContainer().classList.remove('misurando');
  }

  function azzera() {
    punti = [];
    agganci = [];
    livello.clearLayers();
    aggiornaBarra();
  }

  function marcatore(p) {
    return L.circleMarker(latlng(p), { radius: 6, color: '#fff', weight: 2, fillColor: '#111827', fillOpacity: 1 });
  }

  function disegna() {
    livello.clearLayers();
    if (modo === 'aria') {
      if (punti.length > 1) {
        L.polyline(punti.map(latlng), { color: '#111827', weight: 3, dashArray: '6 6' }).addTo(livello);
      }
      punti.forEach((p) => marcatore(p).addTo(livello));
    } else {
      if (agganci.length === 2) {
        const t = trattoLungoLinea(agganci[0].linea, agganci[0].aggancio, agganci[1].aggancio);
        L.polyline(t.linea.map(latlng), { color: '#facc15', weight: 9, opacity: 0.85 }).addTo(livello);
      }
      if (agganci.length === 1) {
        L.polyline(agganci[0].linea.map(latlng), { color: '#facc15', weight: 7, opacity: 0.5 }).addTo(livello);
      }
      agganci.forEach((a) => marcatore(a.aggancio.punto).addTo(livello));
    }
  }

  function aggiornaBarra() {
    if (!attiva) return;
    const haTracce = lineeDisponibili().length > 0;
    let testo;
    if (modo === 'aria') {
      const m = misuraLineaAria(punti);
      testo = punti.length < 2
        ? 'Tocca la mappa per aggiungere punti.'
        : `Ultimo tratto: <b>${testoDistanza(m.parziali[m.parziali.length - 1])}</b> · Totale: <b>${testoDistanza(m.totaleM)}</b> <span class="tenue">in linea d'aria</span>`;
    } else if (agganci.length < 2) {
      testo = agganci.length ? 'Tocca il secondo punto sulla stessa traccia.' : 'Tocca un punto su una traccia.';
    } else {
      const t = trattoLungoLinea(agganci[0].linea, agganci[0].aggancio, agganci[1].aggancio);
      testo = `Lungo la traccia: <b>${testoDistanza(t.distanzaM)}</b>${
        t.dislivello ? ` · <b>+${t.dislivello.salita} m / −${t.dislivello.discesa} m</b>` : ' · dislivello non disponibile'
      }`;
    }
    barra.innerHTML = `
      <div class="misura-modi" role="group" aria-label="Tipo di misura">
        <button type="button" data-modo="aria" class="${modo === 'aria' ? 'scelto' : ''}">Linea d'aria</button>
        <button type="button" data-modo="traccia" class="${modo === 'traccia' ? 'scelto' : ''}" ${haTracce ? '' : 'disabled'}>Lungo la traccia</button>
      </div>
      <p class="misura-testo" aria-live="polite">${testo}</p>
      <div class="misura-comandi">
        ${modo === 'aria' ? '<button type="button" data-azione="ultimo">Annulla ultimo</button>' : ''}
        <button type="button" data-azione="azzera">Ricomincia</button>
        <button type="button" data-azione="chiudi">Chiudi</button>
      </div>
      <p class="misura-nota">Le misure non vengono salvate.</p>`;
    barra.hidden = false;
  }

  barra.addEventListener('click', (e) => {
    // la barra viene ridisegnata subito dopo: senza fermare qui il tocco,
    // Leaflet lo considererebbe un tocco sulla mappa e aggiungerebbe un punto
    e.stopPropagation();
    const nuovoModo = e.target.closest('[data-modo]')?.dataset.modo;
    const azione = e.target.closest('[data-azione]')?.dataset.azione;
    if (nuovoModo && nuovoModo !== modo) {
      modo = nuovoModo;
      azzera();
    }
    if (azione === 'ultimo') {
      punti.pop();
      disegna();
      aggiornaBarra();
    }
    if (azione === 'azzera') azzera();
    if (azione === 'chiudi') chiudi();
  });

  function tocca(e) {
    if (!attiva) return;
    mappa.closePopup();
    const p = lonlat(e.latlng);
    if (modo === 'aria') {
      punti.push(p);
    } else {
      if (agganci.length === 2) agganci = [];
      if (agganci.length === 0) {
        const vicina = lineaPiuVicina(lineeDisponibili(), p);
        if (!vicina || vicina.aggancio.distanzaDallaLineaM > MAX_AGGANCIO_M) {
          barra.querySelector('.misura-testo').innerHTML = '<span class="errore">Tocca più vicino a una traccia.</span>';
          return;
        }
        agganci.push({ linea: vicina.linea, aggancio: vicina.aggancio });
      } else {
        // il secondo punto va sulla stessa traccia del primo
        const linea = agganci[0].linea;
        const aggancio = puntoSullaLinea(linea, p);
        if (aggancio.distanzaDallaLineaM > MAX_AGGANCIO_M) {
          barra.querySelector('.misura-testo').innerHTML = '<span class="errore">Il secondo punto deve stare sullo stesso tratto continuo del primo (evidenziato).</span>';
          return;
        }
        agganci.push({ linea, aggancio });
      }
    }
    disegna();
    aggiornaBarra();
  }

  mappa.on('click', tocca);
  // durante la misura i riquadri delle tracce non si aprono
  mappa.on('popupopen', () => attiva && mappa.closePopup());

  return { chiudi, attiva: () => attiva };
}
