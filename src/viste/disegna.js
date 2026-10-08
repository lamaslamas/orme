// Disegno di un percorso: tocco i punti sulla mappa e BRouter li collega seguendo i sentieri.
import L from 'leaflet';
import { leggiPercorso, salvaPercorso } from '../db.js';
import { calcolaPercorso } from '../lib/brouter.js';
import { nuovoIdPercorso } from '../lib/percorso.js';
import { escapeHtml } from '../lib/formato.js';
import { creaMappa } from './mappa.js';
import { disegnaPercorso } from './disegnoTraccia.js';
import { aggiungiGps } from './gps.js';

export async function vistaDisegna(app, id = null) {
  const esistente = id ? await leggiPercorso(id) : null;
  let punti = esistente?.puntiControllo?.map((p) => [...p]) ?? [];
  let risultato = null;
  let richiesta = 0;

  document.body.classList.add('con-mappa');
  app.innerHTML = `
    <div class="mappa-barra"><a class="indietro" href="${esistente ? `#/percorso/${encodeURIComponent(esistente.id)}` : '#/pianifica'}">‹ Annulla</a></div>
    <div id="mappa" class="mappa mappa-alta"></div>
    <section class="pannello">
      <p class="messaggio" id="statoDisegno"></p>
      <div class="azioni-mappa">
        <button type="button" class="bottone" data-azione="annulla">Togli l'ultimo punto</button>
        <button type="button" class="bottone" data-azione="cancella">Ricomincia</button>
      </div>
      <label class="campo"><span>Nome del percorso</span><input id="nomePercorso" value="${escapeHtml(esistente?.nome ?? '')}" placeholder="es. Anello del Monte Marsicano" /></label>
      <button type="button" class="bottone primario pieno" data-azione="salva">Salva percorso</button>
      <p class="tenue">Il percorso segue i sentieri e le strade di OpenStreetMap (BRouter, profilo escursionistico). Serve la connessione.</p>
    </section>
  `;

  const mappa = creaMappa(app.querySelector('#mappa'));
  const fermaGps = aggiungiGps(mappa, () => null);
  const livelloPercorso = L.layerGroup().addTo(mappa);
  const livelloPunti = L.layerGroup().addTo(mappa);
  const stato = app.querySelector('#statoDisegno');

  function testoStato(messaggio) {
    if (messaggio) {
      stato.innerHTML = messaggio;
      return;
    }
    if (!punti.length) stato.textContent = 'Tocca la mappa per il punto di partenza.';
    else if (punti.length === 1) stato.textContent = 'Tocca il prossimo punto: il percorso seguirà i sentieri.';
    else if (risultato)
      stato.innerHTML = `<b>${(risultato.lunghezzaM / 1000).toFixed(2).replace('.', ',')} km</b>${
        risultato.salitaM ? ` · salita circa ${risultato.salitaM} m` : ''
      } · ${punti.length} punti`;
  }

  function disegnaPunti() {
    livelloPunti.clearLayers();
    punti.forEach(([lon, lat], i) =>
      L.circleMarker([lat, lon], { radius: 6, color: '#fff', weight: 2, fillColor: i === 0 ? '#16a34a' : '#2563eb', fillOpacity: 1 }).addTo(livelloPunti),
    );
  }

  async function ricalcola() {
    disegnaPunti();
    livelloPercorso.clearLayers();
    risultato = null;
    if (punti.length < 2) {
      testoStato();
      return;
    }
    const mia = ++richiesta;
    testoStato('Calcolo il percorso…');
    try {
      const r = await calcolaPercorso(punti);
      if (mia !== richiesta) return;
      risultato = r;
      disegnaPercorso({ type: 'MultiLineString', coordinates: [r.coordinate] }, { colore: '#2563eb' }).addTo(livelloPercorso);
      testoStato();
    } catch (e) {
      if (mia !== richiesta) return;
      testoStato(`<span class="errore">${escapeHtml(e.message)}</span>`);
    }
  }

  mappa.on('click', (e) => {
    punti.push([Number(e.latlng.lng.toFixed(6)), Number(e.latlng.lat.toFixed(6))]);
    ricalcola();
  });

  app.querySelector('.pannello').addEventListener('click', async (e) => {
    const azione = e.target.closest('[data-azione]')?.dataset.azione;
    if (azione === 'annulla') {
      punti.pop();
      ricalcola();
    }
    if (azione === 'cancella' && (punti.length < 3 || confirm('Cancellare tutti i punti?'))) {
      punti = [];
      ricalcola();
    }
    if (azione === 'salva') {
      if (!risultato) {
        testoStato('<span class="errore">Disegna almeno due punti collegati prima di salvare.</span>');
        return;
      }
      const nuovo = {
        ...(esistente ?? { id: nuovoIdPercorso(), note: '' }),
        nome: app.querySelector('#nomePercorso').value.trim() || 'Percorso senza nome',
        origine: 'disegnato',
        puntiControllo: punti,
        geojson: { type: 'MultiLineString', coordinates: [risultato.coordinate] },
        terreno: risultato.terreno,
        fonteTerreno: 'brouter',
        aggiornatoTerreno: new Date().toISOString(),
      };
      await salvaPercorso(nuovo);
      location.hash = `#/percorso/${encodeURIComponent(nuovo.id)}`;
    }
  });

  if (esistente?.geojson?.coordinates?.length) {
    const g = disegnaPercorso(esistente.geojson, { colore: '#2563eb' }).addTo(livelloPercorso);
    mappa.fitBounds(g.getBounds(), { padding: [30, 30] });
    risultato = { coordinate: esistente.geojson.coordinates.flat(), terreno: esistente.terreno, lunghezzaM: 0 };
    ricalcola();
  } else testoStato();
  requestAnimationFrame(() => mappa.invalidateSize());

  return () => {
    fermaGps();
    mappa.remove();
    document.body.classList.remove('con-mappa');
  };
}
