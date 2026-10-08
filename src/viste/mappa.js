import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { leggiSentiero, leggiTraccia, salvaTraccia, eliminaTraccia } from '../db.js';
import { cercaSuOsm, combinaTraccia } from '../lib/overpass.js';
import { leggiGpx } from '../lib/gpx.js';
import { lunghezzaKm } from '../lib/geo.js';
import { dislivello } from '../lib/quote.js';
import { percorsoSentiero, invertiGeojson } from '../lib/tracce.js';
import { aggiungiQuote } from '../lib/openMeteo.js';
import { aggiungiGps } from './gps.js';
import { aggiungiMisura } from './misura.js';
import { aggiungiAvvistamenti } from './livelloAvvistamenti.js';
import { disegnaPercorso } from './disegnoTraccia.js';
import { impostaBanner } from './banner.js';
import { parcoDa } from '../datiParchi.js';
import { descriviSuggerimento, haInformazioniBici } from '../lib/bici.js';
import { escapeHtml, codici, km } from '../lib/formato.js';

const CENTRO_PNALM = [41.79, 13.85];

const COLORE_TRACCIA = '#c2410c';
const COLORE_ANTEPRIMA = '#2563eb';

// con anteprima: true la mappa è ferma (niente comandi, trascinamento o zoom)
export function creaMappa(contenitore, { anteprima = false } = {}) {
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  });
  const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
  });
  const sentieri = L.tileLayer('https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png', {
    maxZoom: 18,
    opacity: 0.8,
    attribution: '&copy; <a href="https://hiking.waymarkedtrails.org">Waymarked Trails</a> (CC-BY-SA)',
  });

  const ferma = anteprima
    ? { zoomControl: false, dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, attributionControl: true }
    : { zoomControl: true };
  const mappa = L.map(contenitore, { layers: [osm, sentieri], ...ferma }).setView(CENTRO_PNALM, 11);
  mappa.attenuaSentieri = (attenua) => sentieri.setOpacity(attenua ? 0.45 : 0.8);
  if (anteprima) return mappa;
  L.control
    .layers({ OpenStreetMap: osm, 'OpenTopoMap (curve di livello)': topo }, { 'Sentieri escursionistici': sentieri })
    .addTo(mappa);
  L.control.scale({ imperial: false }).addTo(mappa);
  // i sentieri di Waymarked si attenuano quando si vuole far risaltare una traccia
  return mappa;
}

// GeoJSON usa [lon, lat], Leaflet [lat, lon]
export function disegnaTraccia(geojson, stile) {
  const linee = geojson.coordinates.map((linea) => linea.map(([lon, lat]) => [lat, lon]));
  return L.polyline(linee, { weight: 5, opacity: 0.9, ...stile });
}

export async function vistaMappa(app, id) {
  const sentiero = await leggiSentiero(id);
  if (!sentiero) {
    app.innerHTML = '<p class="vuoto">Sentiero non trovato. <a href="#/">Torna alla lista</a></p>';
    return;
  }
  let traccia = await leggiTraccia(id);
  const parco = parcoDa(sentiero.parco);
  impostaBanner(sentiero.parco);

  document.body.classList.add('con-mappa');
  app.innerHTML = `
    <div class="mappa-barra">
      <a class="indietro" href="#/sentiero/${encodeURIComponent(id)}">‹ ${
        sentiero.codici?.length ? `<b>${escapeHtml(codici(sentiero))}</b> ` : ''
      }${escapeHtml(sentiero.nome)}</a>
    </div>
    <div id="mappa" class="mappa"></div>
    <section class="pannello" id="pannello" aria-live="polite"></section>
    <input type="file" id="fileGpx" accept=".gpx,application/gpx+xml,application/xml,text/xml" hidden />
  `;

  const mappa = creaMappa(app.querySelector('#mappa'));
  if (parco) mappa.setView(parco.centro, 11);
  const pannello = app.querySelector('#pannello');
  const avviso = L.DomUtil.create('div', 'avviso-mappa', app.querySelector('#mappa'));
  const fileGpx = app.querySelector('#fileGpx');
  const livelloTraccia = L.layerGroup().addTo(mappa);
  const livelloAnteprima = L.layerGroup().addTo(mappa);
  let risultati = null; // risultati della ricerca OSM in corso di scelta
  const fermaGps = aggiungiGps(mappa, () => traccia);
  aggiungiMisura(mappa, () => (traccia ? [traccia.geojson] : []));
  aggiungiAvvistamenti(mappa);

  const p = sentiero.partenza ?? {};
  if (Number.isFinite(p.lat) && Number.isFinite(p.lon)) {
    L.circleMarker([p.lat, p.lon], { radius: 8, color: '#fff', weight: 2, fillColor: '#326752', fillOpacity: 1 })
      .bindTooltip('Partenza')
      .addTo(mappa);
    if (!traccia) mappa.setView([p.lat, p.lon], 14);
  }

  function mostraTracciaSalvata({ inquadra = true } = {}) {
    livelloTraccia.clearLayers();
    mappa.attenuaSentieri(Boolean(traccia));
    avviso.hidden = Boolean(traccia);
    avviso.textContent = 'Questo sentiero non ha ancora una traccia: i sentieri sulla mappa sono tutti quelli della zona.';
    if (!traccia) return;
    const gruppo = disegnaPercorso(traccia.geojson, { colore: COLORE_TRACCIA }).addTo(livelloTraccia);
    if (inquadra) mappa.fitBounds(gruppo.getBounds(), { padding: [36, 36] });
  }

  function dislivelloTraccia() {
    return dislivello(percorsoSentiero(traccia.geojson).pezzi);
  }

  function descriviTraccia() {
    const d = dislivelloTraccia();
    const lunghezza =
      km(lunghezzaKm(traccia.geojson).toFixed(1)) +
      (d ? `, dislivello +${d.salita} m / −${d.discesa} m${traccia.dettagli?.quote === 'open-meteo' ? ' stimato da Open-Meteo' : ''}` : '');
    if (traccia.origine === 'osm') {
      const rel = traccia.dettagli?.relazioniOsm ?? [];
      const link = rel
        .map((r) => `<a href="https://www.openstreetmap.org/relation/${r}" target="_blank" rel="noopener">${r}</a>`)
        .join(', ');
      return `Traccia da OpenStreetMap (${lunghezza}). Relazioni: ${link}`;
    }
    const nome = traccia.dettagli?.nomeFile ? ` “${escapeHtml(traccia.dettagli.nomeFile)}”` : '';
    return `Traccia dal file GPX${nome} (${lunghezza}).`;
  }

  function pannelloBase(messaggio = '') {
    risultati = null;
    livelloAnteprima.clearLayers();
    const haCodici = sentiero.codici?.length > 0;
    pannello.innerHTML = `
      ${messaggio ? `<p class="messaggio">${messaggio}</p>` : ''}
      <p>${traccia ? descriviTraccia() : 'Nessuna traccia salvata per questo sentiero.'}</p>
      <div class="azioni-mappa">
        ${
          haCodici
            ? `<button class="bottone ${traccia ? '' : 'primario'}" data-azione="osm">${traccia ? 'Cerca di nuovo su OSM' : 'Cerca su OpenStreetMap'}</button>`
            : ''
        }
        <button class="bottone ${traccia || haCodici ? '' : 'primario'}" data-azione="gpx">Importa file GPX</button>
        ${traccia ? '<button class="bottone" data-azione="inverti">Inverti partenza e arrivo</button>' : ''}
        ${traccia && !dislivelloTraccia() ? '<button class="bottone" data-azione="quote">Aggiungi le quote</button>' : ''}
        ${traccia ? '<button class="bottone pericolo" data-azione="elimina">Elimina traccia</button>' : ''}
      </div>
      ${
        traccia && !dislivelloTraccia()
          ? '<p class="tenue">La traccia non ha le quote. "Aggiungi le quote" le chiede al servizio gratuito Open-Meteo (modello del terreno, precisione circa 90 m): vengono inviate solo le coordinate del sentiero.</p>'
          : ''
      }
      ${haCodici ? '' : '<p class="tenue">Senza codice ufficiale non è possibile cercare su OpenStreetMap: importa un GPX.</p>'}
    `;
  }

  async function cercaOsm() {
    const elenco = sentiero.codici.map((c) => c.toUpperCase());
    pannello.innerHTML = `<p class="messaggio">Cerco ${escapeHtml(elenco.join(', '))} su OpenStreetMap…</p>`;
    let gruppi;
    try {
      gruppi = await cercaSuOsm(elenco, { parco: sentiero.parco });
    } catch (e) {
      pannelloBase(`<span class="errore">${escapeHtml(e.message)}</span>`);
      return;
    }
    mostraRisultati(elenco, gruppi);
  }

  function mostraRisultati(elenco, gruppi) {
    const trovati = elenco.filter((c) => gruppi[c].length);
    if (!trovati.length) {
      pannelloBase(
        `<span class="errore">Nessun sentiero ${escapeHtml(elenco.join(', '))} trovato su OpenStreetMap nel parco ${escapeHtml(parco?.nomeBreve ?? '')}.</span> Puoi importare un file GPX.`,
      );
      return;
    }

    const righe = elenco
      .map((codice) => {
        const candidati = gruppi[codice];
        if (!candidati.length) return `<li><b>${escapeHtml(codice)}</b>: non trovato su OpenStreetMap</li>`;
        const tipo = candidati.length > 1 ? 'radio' : 'checkbox';
        return candidati
          .map((c, i) => {
            const tratto = [c.da, c.a].filter(Boolean).map(escapeHtml).join(' → ') || escapeHtml(c.nome) || `relazione ${c.idOsm}`;
            return `<li><label class="scelta">
              <input type="${tipo}" name="scelta-${escapeHtml(codice)}" value="${c.idOsm}" ${i === 0 ? 'checked' : ''} />
              <span><b>${escapeHtml(codice)}</b> ${tratto} · ${km(lunghezzaKm({ coordinates: c.linee }).toFixed(1))}${
                haInformazioniBici(c.suggerimentoBici)
                  ? `<br /><small class="tenue">Bici su OSM: ${escapeHtml(descriviSuggerimento(c.suggerimentoBici))}</small>`
                  : ''
              }</span>
            </label></li>`;
          })
          .join('');
      })
      .join('');

    const tutti = Object.values(gruppi).flat();
    pannello.innerHTML = `
      <p class="messaggio">Risultati da OpenStreetMap (in blu sulla mappa):</p>
      <ul class="risultati">${righe}</ul>
      <p class="tenue">Vengono salvati i sentieri interi: se ti serve solo un tratto, importa un GPX.</p>
      <div class="azioni-mappa">
        <button class="bottone primario" data-azione="salva-osm">Salva traccia</button>
        <button class="bottone" data-azione="annulla">Annulla</button>
      </div>
    `;

    function scelti() {
      const id = new Set([...pannello.querySelectorAll('input:checked')].map((i) => Number(i.value)));
      return tutti.filter((c) => id.has(c.idOsm));
    }

    function anteprima() {
      livelloAnteprima.clearLayers();
      const selezione = scelti();
      if (!selezione.length) return;
      const gruppo = disegnaPercorso(combinaTraccia(selezione).geojson, { colore: COLORE_ANTEPRIMA, tratteggio: '8 6' });
      gruppo.addTo(livelloAnteprima);
      avviso.hidden = true;
      mappa.attenuaSentieri(true);
      mappa.fitBounds(gruppo.getBounds(), { padding: [36, 36] });
    }

    risultati = { scelti, anteprima };
    anteprima();
  }

  async function salvaOsm() {
    const selezione = risultati?.scelti() ?? [];
    if (!selezione.length) {
      pannello.querySelector('.messaggio').innerHTML = '<span class="errore">Seleziona almeno un sentiero.</span>';
      return;
    }
    const nuova = combinaTraccia(selezione);
    const presi = new Set(selezione.map((c) => c.codice));
    const mancanti = (sentiero.codici ?? []).map((c) => c.toUpperCase()).filter((c) => !presi.has(c));
    traccia = await salvaTraccia({ sentieroId: id, ...nuova, dettagli: { ...nuova.dettagli, mancanti } });
    mostraTracciaSalvata();
    pannelloBase(
      haInformazioniBici(traccia.dettagli.suggerimentoBici)
        ? 'Traccia salvata. Nella scheda trovi un suggerimento sulla bici da confermare.'
        : 'Traccia salvata sul dispositivo.',
    );
  }

  async function aggiungiQuoteTraccia() {
    pannello.innerHTML = '<p class="messaggio">Chiedo le quote a Open-Meteo…</p>';
    try {
      const geojson = await aggiungiQuote(traccia.geojson);
      traccia = await salvaTraccia({ ...traccia, geojson, dettagli: { ...traccia.dettagli, quote: 'open-meteo' } });
      pannelloBase('Quote aggiunte alla traccia.');
    } catch (e) {
      pannelloBase(`<span class="errore">${escapeHtml(e.message)}</span>`);
    }
  }

  async function importaGpx(file) {
    try {
      const { geojson } = leggiGpx(await file.text());
      traccia = await salvaTraccia({
        sentieroId: id,
        origine: 'gpx',
        geojson,
        dettagli: { nomeFile: file.name },
      });
      mostraTracciaSalvata();
      pannelloBase('Traccia GPX salvata sul dispositivo.');
    } catch (e) {
      pannelloBase(`<span class="errore">${escapeHtml(e.message)}</span>`);
    }
  }

  pannello.addEventListener('click', async (evento) => {
    const azione = evento.target.closest('[data-azione]')?.dataset.azione;
    if (!azione) return;
    if (azione === 'osm') cercaOsm();
    if (azione === 'gpx') fileGpx.click();
    if (azione === 'annulla') {
      pannelloBase();
      mostraTracciaSalvata({ inquadra: false });
    }
    if (azione === 'quote') aggiungiQuoteTraccia();
    if (azione === 'inverti') {
      traccia = await salvaTraccia({ ...traccia, geojson: invertiGeojson(traccia.geojson) });
      mostraTracciaSalvata({ inquadra: false });
      pannelloBase('Partenza e arrivo scambiati.');
    }
    if (azione === 'salva-osm') salvaOsm();
    if (azione === 'elimina' && confirm('Eliminare la traccia salvata?')) {
      await eliminaTraccia(id);
      traccia = undefined;
      mostraTracciaSalvata();
      pannelloBase('Traccia eliminata.');
    }
  });

  pannello.addEventListener('change', () => risultati?.anteprima());

  fileGpx.addEventListener('change', () => {
    const file = fileGpx.files?.[0];
    fileGpx.value = '';
    if (file) importaGpx(file);
  });

  mostraTracciaSalvata();
  pannelloBase();
  // Leaflet calcola le dimensioni dopo che la pagina è stata disegnata
  requestAnimationFrame(() => mappa.invalidateSize());

  return () => {
    fermaGps();
    mappa.remove();
    document.body.classList.remove('con-mappa');
  };
}
