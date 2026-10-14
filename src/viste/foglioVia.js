// Tocco su un sentiero qualsiasi di OpenStreetMap (non nel nostro archivio): dal basso un foglio con
// nome, tipo, se è segnato, difficoltà CAI e i pulsanti per iniziare o allungare un percorso da lì.
// Dentro un parco, sui tratti non segnati un avviso: possono essere vietati. Se il tratto fa parte
// di itinerari segnati (route=hiking), "Scarica questo itinerario" (o la scelta tra più itinerari).
import L from 'leaflet';
import { interrogaOverpass } from '../lib/overpass.js';
import { queryViaVicina, viaDallaRisposta, viaVietata } from '../lib/viaOsm.js';
import { puntoNelPoligono } from '../lib/confini.js';
import { iniziaBozza, aggiungiABozza, leggiBozza } from '../lib/bozza.js';
import { escapeHtml } from '../lib/formato.js';
import { PARCHI } from '../datiParchi.js';
import { caricaConfini } from './copertura.js';
import { ICONE } from './icone.js';
import { tendinaTrascinabile } from './tendina.js';
import { tuttiISentieri, tutteLeTracce } from '../db.js';
import { ID_INTORNO } from '../datiParchi.js';
import { itinerarioPresente, testoItinerario } from '../lib/itinerario.js';
import { scaricaItinerario } from './itinerario.js';

const TIPI_TILE = { path: 'Sentiero', footway: 'Sentiero', bridleway: 'Mulattiera', steps: 'Gradini', track: 'Carrareccia' };

async function parcoDelPunto([lon, lat]) {
  const confini = await caricaConfini();
  return PARCHI.find((p) => !p.zona && (confini[p.id]?.length ? puntoNelPoligono([lon, lat], confini[p.id]) : lat >= p.bbox[0] && lat <= p.bbox[2] && lon >= p.bbox[1] && lon <= p.bbox[3])) ?? null;
}

export function creaFoglioVia(mappa, { allaChiusura = () => {} } = {}) {
  const foglio = document.createElement('section');
  foglio.className = 'foglio-percorso foglio-via';
  foglio.hidden = true;
  foglio.setAttribute('aria-label', 'Sentiero toccato');
  document.body.appendChild(foglio);
  const selezione = L.layerGroup().addTo(mappa);
  let punto = null; // [lon, lat] del tocco
  let richiesta = 0;
  let parcoAttuale = null;

  // itinerari segnati del tratto: uno → "Scarica questo itinerario"; più di uno → si sceglie quale.
  // Quelli già sul telefono (archivio, zona o scaricati) si aprono e basta.
  async function mostraItinerari(percorsi, mia) {
    const [sentieri, tracce] = await Promise.all([tuttiISentieri(), tutteLeTracce()]);
    const box = foglio.querySelector('.itinerari-via');
    if (mia !== richiesta || !box) return;
    const ids = new Set(sentieri.map((x) => x.id));
    const riga = (p, solo) => {
      const presente = itinerarioPresente(p.id, ids, tracce);
      // nell'archivio i sentieri OSM dei parchi sono tagliati al riquadro del parco: si può prendere intero
      const tagliato = presente && tracce.get(presente)?.dettagli?.ritagliata;
      const azione = presente
        ? `<span class="azioni-itinerario"><a class="bottone" href="#/sentiero/${encodeURIComponent(presente)}">Apri</a>${tagliato ? `<button type="button" class="bottone" data-scarica="${p.id}">Scarica intero</button>` : ''}</span>`
        : `<button type="button" class="bottone${solo ? ' pieno-largo' : ''}" data-scarica="${p.id}">${ICONE.percorso}<span>${solo ? 'Scarica questo itinerario' : 'Scarica'}</span></button>`;
      return `<li><span>${escapeHtml(testoItinerario(p))}${presente ? ` <span class="tenue piccolo">· ${tagliato ? 'sul telefono solo il tratto nel parco' : 'già sul telefono'}</span>` : ''}</span>${azione}</li>`;
    };
    box.innerHTML =
      percorsi.length === 1
        ? `<p class="tenue piccolo">Fa parte dell'itinerario segnato:</p><ul>${riga(percorsi[0], true)}</ul>`
        : `<p class="tenue piccolo">Questo tratto fa parte di ${percorsi.length} itinerari segnati: scegli quale scaricare.</p><ul>${percorsi.map((p) => riga(p, false)).join('')}</ul>`;
    box.insertAdjacentHTML('beforeend', '<p class="tenue piccolo stato-scarica" role="status"></p>');
  }

  // la stessa tendina degli altri fogli, alta quanto il contenuto (cresce quando arrivano i dati da OSM)
  const tendina = tendinaTrascinabile(foglio, { corpo: '.foglio-corpo', naturale: true, fineMeta: '.itinerari-via', allaChiusura: () => chiudi() });

  function chiudi() {
    if (foglio.hidden) return;
    foglio.hidden = true;
    tendina.chiudi();
    selezione.clearLayers();
    richiesta++;
    allaChiusura();
  }

  function htmlVia(via, parco) {
    const inAttesa = via.segnata === null;
    const segnato = inAttesa
      ? '<span class="chip stato-via">Controllo il segnavia…</span>'
      : via.segnata
      ? `<span class="chip chip-segnato">Segnato${via.percorsi.find((p) => p.ref) ? ` · ${escapeHtml(via.percorsi.filter((p) => p.ref).map((p) => p.ref).slice(0, 2).join(', '))}` : ''}</span>`
      : '<span class="chip chip-verifica">Non segnato</span>';
    const avvisi = [
      viaVietata(via) ? 'Accesso privato o vietato secondo OpenStreetMap.' : '',
      parco && via.segnata === false ? `Nel ${escapeHtml(parco.nomeBreve)} i tratti non segnati possono essere vietati: verifica le regole del parco.` : '',
    ].filter(Boolean);
    const bozza = leggiBozza()?.punti?.length ?? 0;
    return `
      <button type="button" class="foglio-maniglia-zona" aria-label="Trascina per aprire, abbassare o chiudere"><span class="foglio-maniglia"></span></button>
      <div class="foglio-corpo">
        <p class="foglio-nome"><b>${escapeHtml(via.nome ?? `${via.tipo} senza nome`)}</b></p>
        <p class="tenue piccolo foglio-sotto">${escapeHtml([via.tipo, parco ? `dentro il ${parco.nomeBreve}` : ''].filter(Boolean).join(' · '))}</p>
        <div class="chips">${segnato}${inAttesa ? '' : `<span class="chip">${escapeHtml(via.testoDifficolta || 'Difficoltà non indicata')}</span>`}</div>
        ${avvisi.map((a) => `<p class="avviso-via">${ICONE.avviso}<span>${a}</span></p>`).join('')}
        <div class="foglio-azioni due">
          <button type="button" class="bottone primario" data-azione="inizia">${ICONE.bandierina}<span>Inizia da qui</span></button>
          <button type="button" class="bottone" data-azione="aggiungi">${ICONE.percorso}<span>${bozza ? `Aggiungi (${bozza})` : 'Aggiungi'}</span></button>
        </div>
        <div class="itinerari-via"></div>
        ${via.id ? `<a class="tenue piccolo link-osm" href="https://www.openstreetmap.org/way/${via.id}" target="_blank" rel="noopener">Dati OpenStreetMap ↗</a>` : ''}
      </div>`;
  }

  // dalleTile: { classe, sottoclasse, nome } letti dalla mappa: il foglio si apre subito con questi,
  // poi Overpass aggiunge segnavia e difficoltà (se non risponde, lo si dice e i pulsanti restano)
  async function apri(latlng, dalleTile = null) {
    punto = [Number(latlng.lng.toFixed(6)), Number(latlng.lat.toFixed(6))];
    const mia = ++richiesta;
    selezione.clearLayers();
    const parco = await parcoDelPunto(punto);
    if (mia !== richiesta) return;
    const provvisoria = {
      id: null,
      nome: dalleTile?.nome ?? null,
      tipo: TIPI_TILE[dalleTile?.sottoclasse] ?? TIPI_TILE[dalleTile?.classe] ?? 'Sentiero',
      testoDifficolta: '',
      segnata: null,
      percorsi: [],
      tag: {},
    };
    foglio.innerHTML = htmlVia(provvisoria, parco);
    const eraChiuso = foglio.hidden;
    foglio.hidden = false;
    if (eraChiuso || tendina.posizione() === 'chiusa') tendina.apri('meta');
    try {
      const json = await interrogaOverpass(queryViaVicina(punto[1], punto[0]), { timeoutMs: 15000 });
      if (mia !== richiesta) return;
      const via = viaDallaRisposta(json, punto);
      if (!via) return void (foglio.querySelector('.stato-via').textContent = 'Dettagli non trovati su OpenStreetMap');
      L.polyline(via.linea.map(([lon, lat]) => [lat, lon]), { color: '#ef9f27', weight: 8, opacity: 0.55, interactive: false }).addTo(selezione);
      foglio.innerHTML = htmlVia(via, parco);
      parcoAttuale = parco;
      if (via.percorsi.length) mostraItinerari(via.percorsi, mia);
    } catch (e) {
      if (mia !== richiesta) return;
      console.warn('Sentiero toccato', e);
      const stato = foglio.querySelector('.stato-via');
      if (stato) stato.textContent = 'Segnavia e difficoltà non disponibili ora (OpenStreetMap non risponde)';
      // nel dubbio, dentro un parco l'avviso c'è comunque
      if (parco) foglio.querySelector('.foglio-azioni')?.insertAdjacentHTML('beforebegin', `<p class="avviso-via">${ICONE.avviso}<span>Nel ${escapeHtml(parco.nomeBreve)} i tratti non segnati possono essere vietati: verifica le regole del parco.</span></p>`);
    }
  }

  foglio.addEventListener('click', async (e) => {
    const scarica = e.target.closest('[data-scarica]');
    if (scarica) {
      const stato = foglio.querySelector('.stato-scarica');
      foglio.querySelectorAll('[data-scarica]').forEach((b) => (b.disabled = true));
      try {
        const id = await scaricaItinerario(Number(scarica.dataset.scarica), parcoAttuale?.id ?? ID_INTORNO, { avanzamento: (t) => stato && (stato.textContent = t) });
        location.hash = `#/sentiero/${encodeURIComponent(id)}`;
      } catch (err) {
        console.warn('Itinerario non scaricato', err);
        if (stato) stato.textContent = 'Non sono riuscito a scaricarlo (OpenStreetMap non risponde): riprova tra poco.';
        foglio.querySelectorAll('[data-scarica]').forEach((b) => (b.disabled = false));
      }
      return;
    }
    const azione = e.target.closest('[data-azione]')?.dataset.azione;
    if (azione === 'chiudi') chiudi();
    else if (azione === 'inizia' && punto) {
      iniziaBozza(punto);
      location.hash = '#/percorso-nuovo';
    } else if (azione === 'aggiungi' && punto) {
      aggiungiABozza(punto);
      location.hash = '#/percorso-nuovo';
    }
  });
  mappa.on('unload', () => {
    foglio.remove();
  });

  return { apri, chiudi, aperto: () => !foglio.hidden };
}
