// Il pianificatore: l'unico modo di disegnare e modificare un percorso (matita sulla mappa, «Modifica traccia» da ogni sentiero e
// percorso, «Disegna da qui», Suggerisci). Una pagina con la sola mappa MapLibre (la mappa principale resta Leaflet).
// Tocco = tappa agganciata alla strada; trascinare una tappa la sposta e trascinare la linea ne crea una (la linea segue come un
// elastico, al rilascio si ricalcolano solo i tratti vicini); elenco delle tappe con nomi automatici, riordinabili ed eliminabili,
// e «Cerca un luogo»; numeri, profilo toccabile e barra del fondo sempre visibili; Annulla e Ripeti; salvataggio in I miei percorsi.
// Una traccia già esistente si apre come «base»: tra due tappe che non si sono mosse il tratto è il pezzo della traccia originale.
// I calcoli sono in src/lib/pianificatore.js, i tratti li calcola BRouter (src/lib/brouter.js).
import { calcolaPercorso, profiloPer } from '../lib/brouter.js';
import { unisciTratti, unisciTerreno, profiloPezzi, trattoLibero, lunghezzaM } from '../lib/disegno.js';
import { leggiBozza, salvaBozza, cancellaBozza, consumaAperturaDisegno } from '../lib/bozza.js';
import { percorsoSentiero, invertiPercorso } from '../lib/tracce.js';
import { versoDi } from '../lib/verso.js';
import { misureDeiPezzi, km1 } from '../lib/lungoIlPercorso.js';
import { nuovoIdPercorso, conservaOriginale } from '../lib/percorso.js';
import { salvaPercorso, leggiPercorso, leggiSentiero, leggiTraccia } from '../db.js';
import { quoteDeiPezzi, testoFonteQuote } from './quote.js';
import { htmlProfiloMini, collegaProfiloMini } from './profiloMini.js';
import { luoghiTappa, nomeProposto } from './nomeAutomatico.js';
import { nomeDaSostituire } from '../lib/nomePercorso.js';
import { urlLuoghi, luoghiDallaRisposta } from '../lib/cercaLuogo.js';
import { stileUnico } from '../lib/stileMappa.js';
import { preparaLibreria, ATTR_VETTORIALE } from './mappaVettoriale.js';
import { finestraTrascinabile } from './tendina.js';
import { stato } from '../stato.js';
import { ICONE } from './icone.js';
import { creaFaunaHome } from './faunaHome.js';
import { aggiungiFaunaGl, adattatoreMappa } from './faunaGl.js';
import { creaPoiGl } from './poiGl.js';
import { faunaLungoIlPercorso } from './faunaLungoIlPercorso.js';
import { urlIconaPoi } from './segniGl.js';
import { CATEGORIE_POI, nomePoi, nomePerTappa, poiVicinoA, riquadroDelPercorso } from '../lib/poiPianificatore.js';
import { PARCHI } from '../datiParchi.js';
import { ottieniConfine } from './confine.js';
import { COLORI } from './colori.js';
import { LIVELLI_SENTIERI, visibilita } from '../lib/stileMappa.js';
import { creaBase, fetta } from '../lib/modificaTraccia.js';
import { ANIMALI } from '../lib/costanti.js';
import { NOMI_IT } from './faunaComune.js';
import { escapeHtml, durata, codici } from '../lib/formato.js';
import {
  nuovaTappa, etichetta, inserisciDopo, sposta, togli, muovi, rinomina, creaStoria, trattoPiuVicino, fondoDaTerreno, preferenzaPer, chiaveTratto, nomeDellaTappa, kmTesto, kmDelleTappe,
  tappeDaTraccia, tappeDaPunti, tagliaCode, aggancioDelleTappe, DISTANZA_MASSIMA_AGGANCIO_M,
  aggiungiAlPercorso, comePartenza, comeArrivo, tappaComePartenza, tappaComeArrivo, impostaLibero, taglia, tappeConAnello, ID_CHIUSURA, sovrapposizione, proiettaSuTratti,
} from '../lib/pianificatore.js';

const COLORE = '#0f6e56';
const CENTRO_ITALIA = [12.5, 42.5];
const TRATTO_MAX_KM = 50; // oltre, BRouter pubblico non è adatto: tratto dritto «fuori sentiero»
const ZOOM_MINIMO = 11; // sotto, ci si avvicina prima di mettere tappe sui sentieri
const COLORI_FONDO = { sentiero: '#2aa58a', sterrata: '#c9a766', asfalto: '#e0782b', altro: '#8a9a94' };
const NOMI_FONDO = { sentiero: 'sentiero', sterrata: 'sterrata', asfalto: 'asfalto', altro: 'altro' };

function ultimaVista() {
  try {
    return JSON.parse(sessionStorage.getItem('orme.viste') ?? '{}').mappa ?? null;
  } catch {
    return null;
  }
}
const CHIAVE_SUGGERIMENTO = 'orme.pianSuggerimento';
const CHIAVE_LIVELLI = 'orme.pianLivelli';
const BASI_RASTER = {
  topo: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', massimo: 19, attribuzione: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', massimo: 19, attribuzione: 'Immagini &copy; Esri, Maxar, Earthstar Geographics e comunità GIS' },
};
const CLASSI_NON_PERCORRIBILI = new Set(['rail', 'transit', 'ferry', 'aerialway', 'pier']);
function leggiLivelli() {
  let v = null;
  try {
    v = JSON.parse(localStorage.getItem(CHIAVE_LIVELLI) ?? 'null');
  } catch {
    v = null;
  }
  return { base: ['topo', 'satellite'].includes(v?.base) ? v.base : 'chiara', segnati: v?.segnati !== false, tutti: v?.tutti !== false, confini: v?.confini === true };
}
const coordinateTesto = ([lon, lat]) => `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
const lineaGeo = (coordinate, props = {}) => ({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coordinate.map(([x, y]) => [x, y]) } });
const vuoto = () => ({ type: 'FeatureCollection', features: [] });

// id: un mio percorso da modificare (si salva sopra); sorgente: una traccia che non è un mio percorso (sentiero dell'archivio,
// carrareccia): al salvataggio si crea sempre una copia in I miei percorsi. { pezzi, nomeProposto, note, indietro, avviso, daSentiero }
export async function vistaPianificatore(app, id = null, sorgente = null) {
  const esistente = id ? await leggiPercorso(id) : null;
  if (id && !esistente) {
    app.innerHTML = '<p class="vuoto">Percorso non trovato. <a href="#/miei">Torna ai miei percorsi</a></p>';
    return;
  }
  // la traccia già caricata (mio percorso, sentiero dell'archivio, carrareccia) si apre come «base»; un percorso nuovo riparte dalla bozza
  const pezziBase = esistente?.geojson?.coordinates?.length ? percorsoSentiero(esistente.geojson).pezzi : sorgente?.pezzi ?? null;
  const daTraccia = pezziBase?.length ? tappeDaTraccia(pezziBase, esistente?.puntiControllo) : { base: null, tappe: [] };
  const base = daTraccia.base;
  const tappeIniziali = base ? daTraccia.tappe : tappeDaPunti(esistente || sorgente ? [] : (leggiBozza()?.punti ?? []));
  const apertura = esistente || sorgente ? (consumaAperturaDisegno(), null) : consumaAperturaDisegno();
  let attivita = stato.leggi().attivita === 'mtb' ? 'mtb' : 'trekking';
  const preferenza = 'sentieri'; // il profilo è uno solo: sentieri
  const storia = creaStoria(tappeIniziali);
  const agganciate = new Map(); // id tappa → dove cade sulla strada (da BRouter)
  const tratti = new Map(); // chiave → promessa del tratto (si ricalcola solo quello che cambia)
  let risultato = null; // { linea, terreno, tratti, pezziQuote, fonte, misure }
  let richiesta = 0;
  let chiusa = false;
  let nomeInCorso = 0;
  let poi = null; // i punti di interesse sulla mappa (poiGl.js)
  let kmTappe = null; // i km di ogni tappa lungo il percorso (null finché non è calcolato)
  let anello = false; // «Giro ad anello»: in fondo si torna alla partenza (la tappa finale si calcola, non è nell'elenco)
  let forbici = false; // le forbici sono accese: il prossimo tocco sulla linea taglia
  let fumetto = null; // il fumetto aperto sulla mappa
  const livelli = leggiLivelli();
  const avvisate = new Set(); // le tappe lontane dalle strade di cui si è già detto
  // quante etichette ha il percorso: con l'anello nessuna tappa è «B» (si torna in A)
  const nEt = () => storia.ora().length + (anello && storia.ora().length >= 2 ? 1 : 0);

  document.body.classList.add('con-mappa', 'pianificatore');
  app.innerHTML = `
    <div id="mappaPian" class="pian-mappa" aria-label="Mappa del pianificatore"></div>
    <div class="pian-barra" role="toolbar" aria-label="Strumenti del percorso">
      <a class="pill-mappa tondo pian-x" href="${esistente ? `#/percorso/${encodeURIComponent(esistente.id)}` : sorgente?.indietro ?? '#/'}" aria-label="Esci" title="Esci">${ICONE.chiudi}</a>
      <div class="pian-attrezzi">
        <button type="button" class="pill-mappa tondo" data-azione="annulla" aria-label="Annulla" title="Annulla">${ICONE.indietro}</button>
        <button type="button" class="pill-mappa tondo" data-azione="ripeti" aria-label="Ripeti" title="Ripeti"><span style="display:grid;transform:scaleX(-1)">${ICONE.indietro}</span></button>
        <button type="button" class="pill-mappa tondo" data-azione="forbici" aria-pressed="false" aria-label="Forbici: taglia il percorso" title="Forbici: taglia il percorso">${ICONE.forbici}</button>
        <button type="button" class="pill-mappa pian-icona" data-azione="livelli" aria-pressed="false" aria-expanded="false" aria-label="Livelli della mappa" title="Livelli">${ICONE.livelli}<span class="testo">Livelli</span></button>
        <button type="button" class="pill-mappa pian-icona" data-azione="fauna" aria-pressed="false" aria-label="Fauna" title="Fauna: heatmap, icone e filtri">${ICONE.zampa}<span class="testo">Fauna</span></button>
        <button type="button" class="pill-mappa pian-icona" data-azione="categorie" aria-pressed="false" aria-expanded="false" aria-label="Punti di interesse" title="Punti di interesse">${ICONE.segnaposto}<span class="testo">POI</span></button>
      </div>
      <button type="button" class="pill-mappa pian-salva" data-azione="salva" disabled>${ICONE.segnalibro}<span>Salva</span></button>
    </div>
    <div class="pian-livelli" id="pianLivelli" role="group" aria-label="Livelli della mappa" hidden>
      <h3>Mappa di base</h3>
      <div class="pian-basi">
        <button type="button" class="chip-scorciatoia" data-base="chiara">Chiara</button>
        <button type="button" class="chip-scorciatoia" data-base="topo">Dettagliata</button>
        <button type="button" class="chip-scorciatoia" data-base="satellite">Satellitare</button>
      </div>
      <h3>Livelli</h3>
      <label class="pian-voce"><span>Sentieri segnati</span><input type="checkbox" class="pian-interruttore" data-livello="segnati" /></label>
      <label class="pian-voce"><span>Tutti i sentieri e carrarecce</span><input type="checkbox" class="pian-interruttore" data-livello="tutti" /></label>
      <label class="pian-voce"><span>Confini dei parchi</span><input type="checkbox" class="pian-interruttore" data-livello="confini" /></label>
      <label class="pian-voce"><span>Acqua e rifugi</span><input type="checkbox" class="pian-interruttore" data-livello="acquaRifugi" /></label>
    </div>
    <p class="pian-fauna-stato" id="pianFaunaStato" role="status" hidden></p>
    <div class="pian-categorie" id="pianCategorie" role="group" aria-label="Punti di interesse da mostrare" hidden></div>
    <p class="pian-sugg" id="pianSugg" role="status"></p>
    <p class="pian-hint" id="pianHint" role="status" hidden>Trascina i punti o la linea per cambiare il percorso</p>
    <section class="pian-foglio" aria-label="Il percorso">
      <button type="button" class="pian-maniglia" data-azione="apri-foglio" aria-expanded="false" aria-label="Mostra o nascondi le tappe"><span class="foglio-maniglia"></span></button>
      <div class="pian-barra-numeri">
        <div class="disegno-numeri" id="pianNumeri"></div>
        <div class="disegno-profilo" id="pianProfilo"></div>
        <div id="pianFondo"></div>
      </div>
      <div class="pian-pannello">
        <div class="pian-testa">
          <h2>Il tuo percorso</h2>
          <div class="pian-attivita" role="group" aria-label="Attività">
            <button type="button" class="chip-scorciatoia" data-attivita="trekking">Trekking</button>
            <button type="button" class="chip-scorciatoia" data-attivita="mtb">MTB</button>
          </div>
          <button type="button" class="pian-menu-bottone" data-azione="menu" aria-label="Menu del percorso" aria-expanded="false" aria-haspopup="true">${ICONE.altro}</button>
          <div class="pian-menu" id="pianMenu" role="menu" hidden>
            <button type="button" role="menuitem" data-azione="ricomincia">Ricomincia</button>
            <button type="button" role="menuitem" data-azione="elimina-bozza"${esistente || sorgente ? ' hidden' : ''}>Elimina bozza</button>
          </div>
        </div>
        <div class="pian-avviso" id="pianAvviso" role="alert" hidden></div>
        <ol class="pian-tappe" id="pianTappe"></ol>
        <button type="button" class="pian-aggiungi" data-azione="aggiungi-tappa"><b aria-hidden="true">+</b><span>Aggiungi tappa</span></button>
        <form class="pian-cerca" role="search">
          <label class="ricerca">${ICONE.cerca}<input type="search" name="luogo" placeholder="Cerca un luogo" aria-label="Cerca un luogo per partenza, arrivo o tappa" autocomplete="off" enterkeyhint="search" /></label>
          <ul class="risultati-luogo" hidden></ul>
        </form>
        <label class="pian-anello"><span>Giro ad anello</span><input type="checkbox" class="pian-interruttore" id="pianAnello" role="switch" /></label>
        <div class="pian-fauna-riga" id="pianFaunaRiga" hidden></div>
        <p class="tenue piccolo pian-fonte" id="pianFonte"></p>
      </div>
    </section>
    <dialog class="foglio foglio-salva">
      <div class="foglio-maniglia" aria-hidden="true"></div>
      <h2 class="foglio-titolo">Salva il percorso</h2>
      <label class="campo"><span>Nome</span><input id="pianNome" placeholder="es. Anello di Val Fondillo" value="${escapeHtml(esistente?.nome ?? sorgente?.nomeProposto ?? '')}" /></label>
      <p class="tenue piccolo" id="pianRiepilogo"></p>
      <div class="azioni-salva"><button type="button" class="bottone" data-azione="continua">Continua</button><button type="button" class="bottone primario" data-azione="conferma">Salva</button></div>
      <p class="tenue piccolo">Lo ritrovi in I miei percorsi · Disegnati.</p>
    </dialog>
  `;

  const $ = (s) => app.querySelector(s);
  const sugg = $('#pianSugg');
  const scrivi = (t) => {
    sugg.textContent = t;
    sugg.hidden = !t;
  };

  // --- la mappa (MapLibre) ---
  let maplibregl;
  let mappa;
  let osservatore = null;
  try {
    const [{ base }, modulo] = await Promise.all([preparaLibreria('chiaro'), import('maplibre-gl')]);
    maplibregl = modulo.default ?? modulo;
    const v = ultimaVista();
    mappa = new maplibregl.Map({
      container: $('#mappaPian'),
      style: stileUnico(base, { scuro: false, sentieri: true }),
      center: v?.centro ? [v.centro[1], v.centro[0]] : CENTRO_ITALIA,
      zoom: (v?.zoom ?? 8) - 1, // zoom di MapLibre: uno meno di Leaflet
      attributionControl: false,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      dragRotate: false,
      pitchWithRotate: false,
    });
    mappa.touchZoomRotate.disableRotation();
    // la mappa segue la sua cornice (all'apertura, girando lo schermo, aprendo il foglio)
    osservatore = new ResizeObserver(() => mappa.resize());
    osservatore.observe($('#mappaPian'));
    mappa.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: ATTR_VETTORIALE }), 'bottom-left');
  } catch (e) {
    console.error('Pianificatore', e);
    app.innerHTML = '<p class="vuoto">La mappa non si può aprire (serve la connessione e un telefono con WebGL). <a href="#/">Torna alla mappa</a></p>';
    document.body.classList.remove('con-mappa', 'pianificatore');
    return;
  }

  if (import.meta.env.DEV) window.__pianMappa = mappa; // solo per le prove in sviluppo
  // la Fauna: lo stesso pannello e gli stessi filtri della mappa principale, in versione compatta
  const faunaPannello = creaFaunaHome(app, adattatoreMappa(mappa), { compatto: true, riservaAlto: 210 });
  const statoFauna = app.querySelector('#pianFaunaStato');
  const faunaGl = aggiungiFaunaGl(mappa, maplibregl, {
    personalizza: () => faunaPannello.personalizza(),
    alCambio: (testo) => {
      statoFauna.textContent = testo;
      statoFauna.hidden = !testo;
    },
    alFiltri: () => risultato && pianificaFaunaPercorso(), // i filtri cambiano: la fauna lungo il percorso si rifà
    prima: 'fauna-tratto',
  });
  faunaPannello.collega(faunaGl);
  const segnaFauna = () => app.querySelector('[data-azione="fauna"]')?.setAttribute('aria-pressed', String(Boolean(stato.leggi().livelli.heatmap)));
  const scollegaFauna = stato.ascolta(segnaFauna);
  segnaFauna();
  // «pronta» = lo stile è caricato (non aspetta tutte le tessere: con il server delle mappe lento il pianificatore parte lo stesso)
  const stileCaricato = () => {
    try {
      return Boolean(mappa.getStyle()?.layers?.length);
    } catch {
      return false;
    }
  };
  const pronta = new Promise((r) => (stileCaricato() ? r() : mappa.once('style.load', r)));
  const marcatori = new Map(); // id tappa → Marker
  if (import.meta.env.DEV) window.__pian = { storia, agganciate, risultato: () => risultato, marcatori, dentro: () => ({ trascinando, forbici, anello, fumetto: Boolean(fumetto) }) };
  let segnoProfilo = null;

  function preparaSorgenti() {
    mappa.addSource('linea', { type: 'geojson', data: vuoto() });
    // la traccia com'era all'inizio, in grigio, per confrontarla con quella che si modifica
    if (base) {
      mappa.addSource('base', { type: 'geojson', data: lineaGeo(base.linea) });
      mappa.addLayer({ id: 'base', type: 'line', source: 'base', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#6b7280', 'line-width': 4, 'line-opacity': 0.8, 'line-dasharray': [0.5, 2] } });
    }
    mappa.addSource('elastico', { type: 'geojson', data: vuoto() });
    mappa.addSource('fauna-tratto', { type: 'geojson', data: vuoto() });
    mappa.addLayer({ id: 'fauna-tratto', type: 'line', source: 'fauna-tratto', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#f4c542', 'line-width': 17, 'line-opacity': 0.6 } });
    mappa.addLayer({ id: 'linea-tocco', type: 'line', source: 'linea', paint: { 'line-width': 44, 'line-opacity': 0 } }); // 44 px: si prende anche con il dito
    mappa.addLayer({ id: 'linea-bordo', type: 'line', source: 'linea', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': 0.95 } });
    // il tratteggio non può dipendere dai dati: due livelli, uno per i tratti sui sentieri e uno per quelli «fuori sentiero»
    mappa.addLayer({ id: 'linea-colore', type: 'line', source: 'linea', filter: ['!', ['get', 'libero']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': COLORE, 'line-width': 5 } });
    mappa.addLayer({ id: 'linea-libera', type: 'line', source: 'linea', filter: ['get', 'libero'], layout: { 'line-join': 'round' }, paint: { 'line-color': COLORE, 'line-width': 4, 'line-dasharray': [1.4, 1.4] } });
    mappa.addLayer({ id: 'elastico-linea', type: 'line', source: 'elastico', layout: { 'line-cap': 'round' }, paint: { 'line-color': COLORE, 'line-width': 4, 'line-dasharray': [1.5, 1.5], 'line-opacity': 0.9 } });
  }
  pronta
    .then(preparaSorgenti)
    .then(() => {
      poi = creaPoiGl(mappa, maplibregl, { alCambio: alPoi });
      disegnaCategorie();
      applicaLivelli();
      aggiornaLivelli();
      faunaGl.avvia();
      if (risultato) {
        poi.aggiorna(risultato.linea);
        pianificaFaunaPercorso();
      }
    })
    .catch((e) => console.error('Pianificatore: livelli', e));

  // --- le tappe sulla mappa ---
  function elementoMarcatore(i, n) {
    const el = document.createElement('div');
    const primo = i === 0;
    const ultimo = i === n - 1 && n > 1;
    el.className = `pian-tappa${primo ? ' prima' : ''}${ultimo ? ' ultima' : ''}`;
    el.textContent = etichetta(i, n);
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', primo ? 'Partenza' : ultimo ? 'Arrivo' : `Tappa ${i}`);
    return el;
  }
  // dove si disegna una tappa: sulla strada dove BRouter l'ha agganciata, altrimenti dove l'ho messa
  const doveStaLaTappa = (t) => agganciate.get(t.id) ?? t.p;
  // durante il trascinamento di una tappa la linea si allunga come un elastico: dalla tappa prima e a quella dopo fino al dito
  function elasticoTappa(k, p) {
    const tappe = storia.ora();
    const linee = [];
    if (k > 0) linee.push(lineaGeo([doveStaLaTappa(tappe[k - 1]), p]));
    if (k < tappe.length - 1) linee.push(lineaGeo([p, doveStaLaTappa(tappe[k + 1])]));
    mappa.getSource('elastico')?.setData({ type: 'FeatureCollection', features: linee });
  }
  function disegnaTappe() {
    const tappe = storia.ora();
    const ids = new Set(tappe.map((t) => t.id));
    for (const [id, m] of marcatori) if (!ids.has(id)) (m.remove(), marcatori.delete(id));
    tappe.forEach((t, i) => {
      let m = marcatori.get(t.id);
      if (!m) {
        m = new maplibregl.Marker({ element: elementoMarcatore(i, nEt()), draggable: true }).setLngLat(doveStaLaTappa(t)).addTo(mappa);
        const indiceDi = () => storia.ora().findIndex((x) => x.id === t.id);
        m.on('dragstart', () => {
          trascinando = { tappa: true };
          chiudiFumetto();
          scrivi('');
        });
        m.on('drag', () => {
          const k = indiceDi();
          const ll = m.getLngLat();
          if (k >= 0) elasticoTappa(k, [ll.lng, ll.lat]);
        });
        m.on('dragend', () => {
          mappa.getSource('elastico')?.setData(vuoto());
          setTimeout(() => (trascinando = null), 80); // il click che segue il rilascio non aggiunge una tappa
          const k = indiceDi();
          if (k < 0) return;
          const ll = m.getLngLat();
          agganciate.delete(t.id);
          cambia(sposta(storia.ora(), k, [ll.lng, ll.lat]));
        });
        marcatori.set(t.id, m);
      } else {
        m.setLngLat(doveStaLaTappa(t));
        const el = m.getElement();
        const nuovo = elementoMarcatore(i, nEt());
        // le classi di MapLibre (maplibregl-marker: è lei che lo posiziona) restano: si cambiano solo prima e ultima
        el.classList.toggle('prima', nuovo.classList.contains('prima'));
        el.classList.toggle('ultima', nuovo.classList.contains('ultima'));
        el.textContent = nuovo.textContent;
        el.setAttribute('aria-label', nuovo.getAttribute('aria-label'));
      }
    });
  }

  // --- ogni cambio passa da qui: storia, mappa, calcolo ---
  function cambia(nuove) {
    storia.vai(nuove);
    aggiorna();
  }
  const opzioniChiave = () => `${attivita}:${preferenzaPer(preferenza, attivita) ?? 'base'}`;
  function tratto(a, b) {
    // due tappe ancora sulla traccia di partenza: il pezzo della traccia originale, senza ricalcolare niente
    if (base && Number.isFinite(a.pos) && Number.isFinite(b.pos) && b.pos > a.pos && !b.libero) return Promise.resolve({ coordinate: fetta(base, a.pos, b.pos), terreno: [], libero: false, daBase: true });
    const k = chiaveTratto(a, b, b.libero, opzioniChiave());
    if (!tratti.has(k)) {
      const calcolo = b.libero
        ? Promise.resolve(trattoLibero(a, b))
        : distanzaTra(a.p, b.p) > TRATTO_MAX_KM
          ? Promise.reject(Object.assign(new Error(`Tratto troppo lungo per i sentieri (oltre ${TRATTO_MAX_KM} km): aggiungi una tappa in mezzo.`), { lungo: true }))
          : calcolaPercorso([a.p, b.p], { profilo: profiloPer(attivita), preferenzaSegnati: preferenzaPer(preferenza, attivita) }).then((r) => ({ coordinate: r.coordinate.map(([lon, lat]) => [lon, lat]), terreno: r.terreno, libero: false }));
      calcolo.catch(() => tratti.delete(k)); // un tratto non calcolato si riprova
      tratti.set(k, calcolo);
    }
    return tratti.get(k);
  }
  const distanzaTra = (a, b) => Math.hypot((a[0] - b[0]) * Math.cos((a[1] * Math.PI) / 180), a[1] - b[1]) * 111.195;

  // il ritorno di un anello: tra le alternative di BRouter si sceglie quella che ripassa meno dall'andata (se l'andata è ripetuta
  // per oltre il 30 %, al massimo altre due richieste)
  function trattoChiusura(a, b, andata) {
    const k = chiaveTratto(a, b, false, `${opzioniChiave()}:anello:${andata.length}:${Math.round(lunghezzaM(andata))}`);
    if (!tratti.has(k)) {
      const prova = (alternativa) =>
        calcolaPercorso([a.p, b.p], { profilo: profiloPer(attivita), preferenzaSegnati: preferenzaPer(preferenza, attivita), alternativa }).then((r) => ({ coordinate: r.coordinate.map(([lon, lat]) => [lon, lat]), terreno: r.terreno, libero: false }));
      const calcolo = (async () => {
        let migliore = await prova(0);
        let quota = sovrapposizione(andata, migliore.coordinate);
        for (let alt = 1; alt <= 2 && quota > 0.3; alt++) {
          try {
            const altra = await prova(alt);
            const q = sovrapposizione(andata, altra.coordinate);
            if (q < quota - 0.05) (migliore = altra), (quota = q);
          } catch {
            break; // le alternative non ci sono o BRouter è occupato: resta quello che c'è
          }
        }
        return migliore;
      })();
      calcolo.catch(() => tratti.delete(k));
      tratti.set(k, calcolo);
    }
    return tratti.get(k);
  }

  async function aggiorna() {
    const tappeU = storia.ora(); // le tappe dell'elenco
    const tappe = tappeConAnello(tappeU, anello); // quelle che si calcolano (con l'anello, in fondo la partenza)
    const conAnello = tappe.length > tappeU.length;
    // una bozza per un percorso nuovo (la traccia di un percorso già esistente non tocca la bozza)
    if (!esistente && !sorgente) salvaBozza(tappeU.map((t) => t.p));
    disegnaTappe();
    disegnaTappeElenco();
    aggiornaPulsanti();
    trovaNomi();
    mostraAvviso('');
    const mia = ++richiesta;
    await pronta;
    if (chiusa) return;
    if (tappeU.length < 2) {
      risultato = null;
      kmTappe = null;
      poi?.aggiorna(null);
      pianificaFaunaPercorso();
      mappa.getSource('linea')?.setData(vuoto());
      scrivi(tappeU.length ? 'Tocca la mappa o cerca un luogo per l\'arrivo' : 'Tocca la mappa o cerca un luogo per la partenza');
      return mostraBarra();
    }
    mostraBarra('Calcolo…');
    scrivi('Calcolo del tratto…');
    let esiti = await Promise.allSettled(tappeU.slice(1).map((b, i) => tratto(tappeU[i], b)));
    if (conAnello && esiti.every((x) => x.status === 'fulfilled')) {
      const andata = unisciTratti(tagliaCode(esiti.map((x) => x.value)));
      const ritorno = await trattoChiusura(tappeU.at(-1), tappe.at(-1), andata).then(
        (value) => ({ status: 'fulfilled', value }),
        (reason) => ({ status: 'rejected', reason }),
      );
      esiti = [...esiti, ritorno];
    }
    if (mia !== richiesta || chiusa) return;
    scrivi('');
    const fallito = esiti.findIndex((x) => x.status === 'rejected');
    if (fallito >= 0) {
      risultato = null;
      poi?.aggiorna(null);
      pianificaFaunaPercorso();
      mappa.getSource('linea')?.setData(vuoto());
      const motivo = esiti[fallito].reason?.message ?? 'Il tratto non si è calcolato.';
      mostraBarra('Percorso non calcolato');
      mostraAvviso(motivo, fallito + 1);
      return;
    }
    const grezzi = esiti.map((x) => x.value);
    // senza «code»: dove una tappa sta su un ramo che finisce lì, il percorso passa dal punto dove il ramo si stacca
    const fatti = tagliaCode(grezzi);
    const linea = unisciTratti(fatti);
    // le tappe si disegnano sulla strada dove BRouter le ha agganciate; una più lontana di 200 m da ogni sentiero o strada no: si avvisa
    const vere = aggancioDelleTappe(tappe, grezzi);
    const viste = aggancioDelleTappe(tappe, fatti);
    agganciate.clear();
    let lontana = -1;
    tappe.forEach((t, i) => {
      if (t.id === ID_CHIUSURA) return; // il ritorno alla partenza non è una tappa
      if (vere[i].p && vere[i].distanzaM > DISTANZA_MASSIMA_AGGANCIO_M) lontana = lontana < 0 ? i : lontana;
      else if (viste[i].p) agganciate.set(t.id, viste[i].p);
    });
    disegnaTappe();
    mappa.getSource('linea')?.setData({ type: 'FeatureCollection', features: fatti.map((t, i) => lineaGeo(t.coordinate, { seg: i, libero: Boolean(t.libero) })) });
    risultato = { linea, terreno: unisciTerreno(fatti), tratti: fatti, pezziQuote: null, fonte: null, misure: misureDeiPezzi([linea]) };
    // una tappa a più di 200 m da ogni sentiero e strada: il fumetto lo dice e propone «Tratto fuori sentiero» (una volta per tappa)
    if (lontana >= 0) {
      const chiave = `${tappe[lontana].id}:${tappe[lontana].p.join(',')}`;
      if (!avvisate.has(chiave)) {
        avvisate.add(chiave);
        apriFumettoTappa(tappe[lontana].id, `La tappa è a ${vere[lontana].distanzaM} m dal sentiero o dalla strada più vicini: il percorso non ci arriva. Se vuoi andarci comunque, attiva «Tratto fuori sentiero».`);
      }
    }
    suggerisciTrascinare();
    kmTappe = kmDelleTappe(fatti.map((t) => lunghezzaM(t.coordinate)));
    disegnaTappeElenco();
    mostraBarra();
    poi?.aggiorna(linea);
    pianificaFaunaPercorso();
    // quote (TINITALY) per dislivello, tempo e profilo
    const { pezzi, fonte } = await quoteDeiPezzi([linea]).catch(() => ({ pezzi: [linea], fonte: null }));
    if (mia !== richiesta || chiusa) return;
    Object.assign(risultato, { pezziQuote: pezzi, fonte, misure: misureDeiPezzi(pezzi) });
    mostraBarra();
  }

  // un avviso con «Fuori sentiero» per il tratto: nel foglio, sempre sotto i numeri (anche a foglio ridotto)
  function mostraAvviso(testo, tratto = 0) {
    const box = $('#pianAvviso');
    box.hidden = !testo;
    box.innerHTML = testo ? `<span>${escapeHtml(testo)}</span>${tratto ? `<button type="button" class="bottone piccolo" data-azione="libera-tratto" data-indice="${tratto}">Fuori sentiero per questo tratto</button>` : ''}` : '';
  }
  // al primo uso: come cambiare il percorso (si vede qualche secondo, una volta sola)
  function suggerisciTrascinare() {
    let visto = false;
    try {
      visto = Boolean(localStorage.getItem(CHIAVE_SUGGERIMENTO));
    } catch {
      visto = true;
    }
    if (visto || chiusa) return;
    try {
      localStorage.setItem(CHIAVE_SUGGERIMENTO, '1');
    } catch {
      // si rivede la prossima volta
    }
    const hint = $('#pianHint');
    hint.hidden = false;
    setTimeout(() => (hint.hidden = true), 7000);
  }

  // --- numeri, profilo, fondo: sempre visibili ---
  let serieProfilo = [];
  function mostraBarra(messaggio = '') {
    const m = risultato?.misure;
    const numeri = $('#pianNumeri');
    if (m) {
      numeri.innerHTML = `<div><b>${km1(m.km)} km</b><span>distanza</span></div>
        <div><b>${m.salita != null ? `+${m.salita} m` : '…'}</b><span>salita</span></div>
        <div><b>${m.discesa != null ? `−${m.discesa} m` : '…'}</b><span>discesa</span></div>
        <div><b>${m.durataMin != null ? durata(m.durataMin) : '–'}</b><span>tempo</span></div>${messaggio ? `<p class="tenue piccolo">${escapeHtml(messaggio)}</p>` : ''}`;
    } else {
      numeri.innerHTML = `<p class="tenue">${escapeHtml(messaggio || (storia.ora().length ? 'Ancora una tappa per il percorso' : 'Tocca la mappa per iniziare'))}</p>`;
    }
    serieProfilo = risultato?.pezziQuote ? profiloPezzi(risultato.pezziQuote) : [];
    $('#pianProfilo').innerHTML = serieProfilo.length > 1 ? htmlProfiloMini(serieProfilo, '') : '';
    $('#pianFonte').textContent = serieProfilo.length > 1 ? testoFonteQuote(risultato.fonte) : '';
    disegnaFondo();
    $('[data-azione="salva"]').disabled = !m;
  }
  collegaProfiloMini($('#pianProfilo'), () => serieProfilo, (x) => {
    segnoProfilo ??= new maplibregl.Marker({ element: Object.assign(document.createElement('div'), { className: 'pian-segno-profilo' }) });
    segnoProfilo.setLngLat([x.p[0], x.p[1]]).addTo(mappa);
  });
  function disegnaFondo() {
    const box = $('#pianFondo');
    const f = risultato ? fondoDaTerreno(risultato.terreno) : null;
    if (!f?.percentuali) {
      box.innerHTML = risultato && risultato.tratti.every((t) => t.libero) ? '<p class="tenue piccolo">Fuori sentiero: il tipo di fondo non si conosce.</p>' : '';
      return;
    }
    const p = f.percentuali;
    box.innerHTML = `<div class="pian-fondo" role="img" aria-label="Tipo di fondo: ${Object.entries(p).filter(([, v]) => v).map(([k, v]) => `${v}% ${NOMI_FONDO[k]}`).join(', ')}">${f.parti
      .map((x) => `<i style="flex:${x.aM - x.daM};background:${COLORI_FONDO[x.classe]}"></i>`)
      .join('')}</div>
      <p class="pian-fondo-legenda">${Object.entries(p).filter(([, v]) => v).map(([k, v]) => `<span><i style="background:${COLORI_FONDO[k]}"></i>${NOMI_FONDO[k]} ${v}%</span>`).join('')}</p>`;
  }

  // --- elenco delle tappe ---
  function disegnaTappeElenco() {
    const tappe = storia.ora();
    $('#pianTappe').innerHTML = tappe
      .map((t, i) => {
        const n = nEt();
        const nome = nomeDellaTappa(t) ?? (i === 0 ? 'Partenza' : i === n - 1 ? 'Arrivo' : `Tappa ${i}`);
        return `<li data-i="${i}">
          <span class="pian-presa" role="button" tabindex="0" aria-label="Riordina la tappa ${etichetta(i, n)}: tieni premuto e trascina (o frecce su e giù)">⠿</span>
          <span class="pian-tappa piccola${i === 0 ? ' prima' : i === n - 1 && n > 1 ? ' ultima' : ''}" aria-hidden="true">${etichetta(i, n)}</span>
          <button type="button" class="pian-nome" data-azione="rinomina" aria-label="Rinomina la tappa ${etichetta(i, n)}"><span class="pian-nome-testo">${escapeHtml(nome)}</span>${kmTappe ? `<span class="pian-km">${escapeHtml(kmTesto(kmTappe[i]))}</span>` : ''}</button>
          <button type="button" class="pian-togli" data-azione="togli" aria-label="Togli la tappa ${etichetta(i, n)}">${ICONE.chiudi}</button>
        </li>`;
      })
      .join('');
  }
  // il nome di ogni tappa si trova da solo: via o sentiero, poi località, poi paese (Nominatim, una richiesta per tappa,
  // ricordata sul telefono). Quello scritto a mano non si cambia
  async function trovaNomi() {
    const mia = ++nomeInCorso;
    for (const t of storia.ora().filter((x) => !x.nomeManuale && !x.luoghi && !x.nome)) {
      const luoghi = await luoghiTappa(t.p);
      if (chiusa || mia !== nomeInCorso) return;
      if (!luoghi) continue;
      const k = storia.ora().findIndex((x) => x.id === t.id);
      if (k < 0 || storia.ora()[k].luoghi || storia.ora()[k].nomeManuale) continue;
      // il nome non è un cambio da annullare: si scrive sulla tappa com'è
      storia.ora()[k].luoghi = luoghi;
      aggiornaNomeRiga(k);
    }
  }
  function aggiornaNomeRiga(k) {
    const testo = $(`#pianTappe li[data-i="${k}"] .pian-nome-testo`);
    if (testo && !$(`#pianTappe li[data-i="${k}"] .pian-nome-campo`)) testo.textContent = nomeDellaTappa(storia.ora()[k]) ?? testo.textContent;
  }
  // toccando il nome si scrive il proprio; vuoto = di nuovo quello automatico
  function iniziaRinomina(i) {
    const li = $(`#pianTappe li[data-i="${i}"]`);
    const tappa = storia.ora()[i];
    const bottone = li?.querySelector('.pian-nome');
    if (!bottone || !tappa) return;
    const campo = document.createElement('input');
    campo.className = 'pian-nome-campo';
    campo.value = nomeDellaTappa(tappa) ?? '';
    campo.setAttribute('aria-label', `Nome della tappa ${etichetta(i, nEt())}`);
    bottone.replaceWith(campo);
    campo.focus();
    campo.select();
    const fine = (salva) => {
      if (!campo.isConnected) return;
      if (salva && campo.value.trim() !== (nomeDellaTappa(tappa) ?? '')) cambia(rinomina(storia.ora(), i, campo.value));
      else disegnaTappeElenco();
    };
    campo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') fine(true);
      else if (e.key === 'Escape') fine(false);
    });
    campo.addEventListener('blur', () => fine(true));
  }
  // riordino: si tiene premuta la maniglia e si trascina (dito o mouse); con la tastiera, frecce su e giù sulla maniglia
  const elencoTappe = $('#pianTappe');
  elencoTappe.addEventListener('pointerdown', (e) => {
    const presa = e.target.closest('.pian-presa');
    if (!presa) return;
    e.preventDefault();
    const li = presa.closest('li');
    const da = Number(li.dataset.i);
    const righe = [...elencoTappe.children];
    const rette = righe.map((r) => r.getBoundingClientRect());
    const y0 = e.clientY;
    let a = da;
    presa.setPointerCapture(e.pointerId);
    li.classList.add('trascinata');
    const muoviF = (ev) => {
      const dy = ev.clientY - y0;
      li.style.transform = `translateY(${dy}px)`;
      const centro = rette[da].top + rette[da].height / 2 + dy;
      a = Math.max(0, rette.findIndex((r) => centro < r.bottom));
      if (centro >= rette.at(-1).bottom) a = rette.length - 1;
      righe.forEach((r, k) => {
        if (k === da) return;
        const spostamento = da < a && k > da && k <= a ? -rette[da].height : da > a && k < da && k >= a ? rette[da].height : 0;
        r.style.transform = spostamento ? `translateY(${spostamento}px)` : '';
      });
    };
    const fineF = () => {
      presa.removeEventListener('pointermove', muoviF);
      presa.removeEventListener('pointerup', fineF);
      presa.removeEventListener('pointercancel', fineF);
      for (const r of righe) r.style.transform = '';
      li.classList.remove('trascinata');
      if (a !== da) cambia(muovi(storia.ora(), da, a));
    };
    presa.addEventListener('pointermove', muoviF);
    presa.addEventListener('pointerup', fineF);
    presa.addEventListener('pointercancel', fineF);
  });
  elencoTappe.addEventListener('keydown', (e) => {
    const presa = e.target.closest('.pian-presa');
    if (!presa || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const da = Number(presa.closest('li').dataset.i);
    cambia(muovi(storia.ora(), da, da + (e.key === 'ArrowUp' ? -1 : 1)));
    $(`#pianTappe li[data-i="${Math.max(0, Math.min(storia.ora().length - 1, da + (e.key === 'ArrowUp' ? -1 : 1)))}"] .pian-presa`)?.focus();
  });
  function aggiornaPulsanti() {
    $('[data-azione="annulla"]').disabled = !storia.puoAnnullare();
    $('[data-azione="ripeti"]').disabled = !storia.puoRipetere();
    for (const b of app.querySelectorAll('[data-attivita]')) {
      const on = b.dataset.attivita === attivita;
      b.classList.toggle('attiva', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }

  // --- fumetti: un tocco sulla mappa, su un punto di interesse o su una tappa apre un fumetto con i comandi ---
  function chiudiFumetto() {
    const f = fumetto;
    fumetto = null;
    f?.remove();
  }
  function apriFumetto(lngLat, html, scosta = [0, -6]) {
    chiudiFumetto();
    const p = new maplibregl.Popup({ className: 'pian-fumetto', maxWidth: '300px', closeButton: true, closeOnClick: false, focusAfterOpen: false, offset: scosta }).setLngLat(lngLat).setHTML(html).addTo(mappa);
    p.on('close', () => {
      if (fumetto === p) fumetto = null;
    });
    fumetto = p;
    mettiNelloSpazioLibero(p);
    return p;
  }
  // il fumetto sta nell'area libera della mappa: sotto gli strumenti, fuori dal pannello (computer) o dalla colonna di pulsanti e dalla
  // tendina (telefono); se serve la mappa si sposta da sola
  function mettiNelloSpazioLibero(p) {
    requestAnimationFrame(() => {
      const r = p.getElement()?.getBoundingClientRect();
      if (!r || chiusa) return;
      const largo = window.innerWidth >= 1024;
      const nav = largo ? app.closest('body')?.querySelector('nav')?.getBoundingClientRect().width ?? 232 : 0;
      const limiti = {
        su: largo ? 66 : 62,
        sinistra: largo ? nav + 428 : 10,
        destra: window.innerWidth - (largo ? 12 : 66),
        giu: Math.min(window.innerHeight, (largo ? $('.pian-barra-numeri') : $('.pian-foglio'))?.getBoundingClientRect().top ?? window.innerHeight) - 8,
      };
      const dx = r.left < limiti.sinistra ? limiti.sinistra - r.left : r.right > limiti.destra ? limiti.destra - r.right : 0;
      const dy = r.top < limiti.su ? limiti.su - r.top : r.bottom > limiti.giu ? limiti.giu - r.bottom : 0;
      if (dx || dy) mappa.panBy([-dx, -dy], { duration: 200 });
    });
  }
  // i pulsanti del fumetto (click) e l'interruttore (change) passano da qui
  function collegaFumetto(p, gestore) {
    const el = p.getElement();
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-f]');
      if (b) gestore(b.dataset.f, el);
    });
    el.addEventListener('change', (e) => e.target.matches?.('[data-f="libero"]') && gestore('libero', el));
  }
  const interruttoreLibero = (acceso) => `<label class="pian-voce"><span>Tratto fuori sentiero</span><input type="checkbox" class="pian-interruttore" data-f="libero"${acceso ? ' checked' : ''} /></label>`;
  // quanto dista dal sentiero o dalla strada più vicini (dai dati della mappa già caricati); null se la mappa è troppo lontana per saperlo
  function distanzaDaStrade(p) {
    if (mappa.getZoom() < 13) return null;
    const vicini = mappa.querySourceFeatures('openmaptiles', { sourceLayer: 'transportation' }).filter((f) => !CLASSI_NON_PERCORRIBILI.has(f.properties?.class));
    const m = 0.01; // gradi: attorno al punto bastano
    const linee = [];
    for (const f of vicini) {
      const gs = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : f.geometry.type === 'LineString' ? [f.geometry.coordinates] : [];
      for (const l of gs) if (l.some(([x, y]) => Math.abs(x - p[0]) < m && Math.abs(y - p[1]) < m)) linee.push(l);
    }
    return linee.length ? proiettaSuTratti(linee, p).distanzaM : Infinity;
  }
  // un punto della mappa (o un punto di interesse): Aggiungi al percorso, partenza, arrivo, tratto fuori sentiero
  function apriFumettoPunto(p, { titolo = 'Punto sulla mappa', dettaglio = '', extra = {} } = {}) {
    const n = storia.ora().length;
    const d = distanzaDaStrade(p);
    const lontano = d != null && d > DISTANZA_MASSIMA_AGGANCIO_M;
    const avviso = lontano ? `A ${Number.isFinite(d) ? `circa ${Math.round(d / 10) * 10} m` : 'più di 200 m'} dal sentiero o dalla strada più vicini: il percorso non ci arriva. Se vuoi andarci comunque, attiva «Tratto fuori sentiero».` : '';
    const bottoni = n === 0
      ? '<button type="button" class="bottone primario" data-f="partenza">Imposta come partenza</button>'
      : '<button type="button" class="bottone primario" data-f="aggiungi">Aggiungi al percorso</button><button type="button" class="bottone" data-f="partenza">Imposta come partenza</button><button type="button" class="bottone" data-f="arrivo">Imposta come arrivo</button>';
    const f = apriFumetto(p, `<div class="fumetto-pian"><h3>${escapeHtml(titolo)}</h3>${dettaglio ? `<span class="coord">${escapeHtml(dettaglio)}</span>` : ''}<span class="coord">${coordinateTesto(p)}</span>${avviso ? `<p class="avviso">${escapeHtml(avviso)}</p>` : ''}${bottoni}${n ? interruttoreLibero(false) : ''}</div>`);
    collegaFumetto(f, (az, el) => {
      const libero = Boolean(el.querySelector('[data-f="libero"]')?.checked);
      const tappe = storia.ora();
      chiudiFumetto();
      if (az === 'aggiungi') cambia(aggiungiAlPercorso(tappe, p, extra, libero));
      else if (az === 'partenza') cambia(comePartenza(tappe, p, extra, libero));
      else if (az === 'arrivo') cambia(comeArrivo(tappe, p, extra, libero));
    });
  }
  // una tappa: Togli, partenza, arrivo, tratto fuori sentiero (per il tratto che arriva lì)
  function apriFumettoTappa(id, avviso = '') {
    const tappe = storia.ora();
    const i = tappe.findIndex((t) => t.id === id);
    if (i < 0) return;
    const t = tappe[i];
    const n = tappe.length;
    const nome = nomeDellaTappa(t) ?? (i === 0 ? 'Partenza' : i === n - 1 && n > 1 ? 'Arrivo' : `Tappa ${i}`);
    const f = apriFumetto(
      doveStaLaTappa(t),
      `<div class="fumetto-pian"><h3>${escapeHtml(etichetta(i, nEt()))} · ${escapeHtml(nome)}</h3>${avviso ? `<p class="avviso">${escapeHtml(avviso)}</p>` : ''}<button type="button" class="bottone" data-f="togli">Togli</button>${i > 0 ? '<button type="button" class="bottone" data-f="partenza-tappa">Imposta come partenza</button>' : ''}${i < n - 1 ? '<button type="button" class="bottone" data-f="arrivo-tappa">Imposta come arrivo</button>' : ''}${i > 0 ? interruttoreLibero(t.libero) : ''}</div>`,
      [0, -24],
    );
    collegaFumetto(f, (az, el) => {
      const k = storia.ora().findIndex((x) => x.id === id);
      if (k < 0) return;
      if (az === 'libero') return cambia(impostaLibero(storia.ora(), k, el.querySelector('[data-f="libero"]').checked));
      chiudiFumetto();
      if (az === 'togli') cambia(togli(storia.ora(), k));
      else if (az === 'partenza-tappa') cambia(tappaComePartenza(storia.ora(), k));
      else if (az === 'arrivo-tappa') cambia(tappaComeArrivo(storia.ora(), k));
    });
  }
  // le forbici: un tocco sulla linea e si sceglie quale parte tenere
  function apriFumettoTaglio(e) {
    const tratti = risultato?.tratti?.map((t) => t.coordinate) ?? [];
    const vicino = tratti.length ? proiettaSuTratti(tratti, [e.lngLat.lng, e.lngLat.lat]) : null;
    const dito = vicino?.p ? mappa.project(vicino.p) : null;
    if (!dito || Math.hypot(dito.x - e.point.x, dito.y - e.point.y) > 30) return scrivi(tratti.length ? 'Tocca la linea del percorso dove vuoi tagliare' : 'Il percorso da tagliare non c\'è ancora');
    scrivi('');
    const k = vicino.indice;
    const f = apriFumetto(vicino.p, '<div class="fumetto-pian"><h3>Taglia qui</h3><button type="button" class="bottone primario" data-f="tieni-inizio">Tieni la parte dalla partenza a qui</button><button type="button" class="bottone primario" data-f="tieni-fine">Tieni la parte da qui all\'arrivo</button><button type="button" class="bottone" data-f="annulla">Non tagliare</button></div>');
    collegaFumetto(f, (az) => {
      chiudiFumetto();
      if (az === 'annulla') return;
      // con l'anello il ritorno è un tratto vero: tagliando l'anello si apre
      const tutte = tappeConAnello(storia.ora(), anello).map((t) => (t.id === ID_CHIUSURA ? { ...t, id: nuovaTappa(t.p).id } : t));
      impostaAnello(false);
      cambia(taglia(tutte, k, vicino.p, az === 'tieni-inizio' ? 'inizio' : 'fine'));
      impostaForbici(false);
    });
  }
  function impostaForbici(acceso) {
    forbici = acceso;
    $('[data-azione="forbici"]').setAttribute('aria-pressed', String(acceso));
    scrivi(acceso ? 'Tocca la linea del percorso dove vuoi tagliare' : '');
    mappa.getCanvas().style.cursor = acceso ? 'crosshair' : '';
  }
  function impostaAnello(acceso) {
    anello = acceso;
    $('#pianAnello').checked = acceso;
  }

  // --- tocco sulla mappa ---
  mappa.on('click', (e) => {
    if (trascinando || faunaGl.pressioneLungaAppena()) return;
    // una tappa: i suoi comandi
    const marcatore = e.originalEvent?.target?.closest?.('.pian-tappa');
    if (marcatore) {
      if (forbici) return;
      const id = [...marcatori].find(([, m]) => m.getElement() === marcatore)?.[0];
      return id && apriFumettoTappa(id);
    }
    if (forbici) return apriFumettoTaglio(e);
    // un punto di interesse (le icone della fauna non si toccano: dettagli con la pressione lunga)
    const toccato = poi?.poiAl(e.point);
    if (toccato) return apriFumettoPunto([toccato.lon, toccato.lat], { titolo: nomePoi(toccato), dettaglio: toccato.km != null ? `km ${String(toccato.km).replace('.', ',')} del percorso` : '', extra: { poi: nomePerTappa(toccato) } });
    if (mappa.getZoom() + 1 < ZOOM_MINIMO && storia.ora().length) return scrivi('Avvicinati per mettere le tappe sui sentieri');
    apriFumettoPunto([e.lngLat.lng, e.lngLat.lat]);
  });

  // --- trascinare la linea crea una tappa ---
  let trascinando = null; // { k, ... }
  function iniziaTrascinamento(e) {
    if (forbici) return; // con le forbici un tocco sulla linea taglia
    const tappe = storia.ora();
    if (tappe.length < 2) return;
    const seg = e.features?.[0]?.properties?.seg;
    const k = Number.isInteger(seg) ? seg : trattoPiuVicino(risultato?.tratti?.map((t) => t.coordinate) ?? [], [e.lngLat.lng, e.lngLat.lat]).indice;
    const tratti = tappe.length - 1 + (nEt() > tappe.length ? 1 : 0); // con l'anello c'è anche il ritorno alla partenza
    if (k < 0 || k >= tratti) return;
    chiudiFumetto();
    e.preventDefault();
    mappa.dragPan.disable();
    trascinando = { k, mosso: false };
    const muovi = (ev) => {
      trascinando.mosso = true;
      trascinando.p = [ev.lngLat.lng, ev.lngLat.lat];
      mappa.getSource('elastico')?.setData({ type: 'FeatureCollection', features: [lineaGeo([doveStaLaTappa(tappe[k]), trascinando.p, doveStaLaTappa(tappe[k + 1] ?? tappe[0])])] });
    };
    const fine = (ev) => {
      mappa.off('mousemove', muovi);
      mappa.off('touchmove', muovi);
      mappa.dragPan.enable();
      mappa.getSource('elastico')?.setData(vuoto());
      const t = trascinando;
      setTimeout(() => (trascinando = null), 50); // il click che segue il rilascio non aggiunge una tappa
      if (t?.mosso && t.p) cambia(inserisciDopo(storia.ora(), t.k, t.p));
    };
    mappa.on('mousemove', muovi);
    mappa.on('touchmove', muovi);
    mappa.once('mouseup', fine);
    mappa.once('touchend', fine);
  }
  pronta.then(() => {
    mappa.on('mousedown', 'linea-tocco', iniziaTrascinamento);
    mappa.on('touchstart', 'linea-tocco', iniziaTrascinamento);
    mappa.on('mouseenter', 'linea-tocco', () => (mappa.getCanvas().style.cursor = 'grab'));
    mappa.on('mouseleave', 'linea-tocco', () => (mappa.getCanvas().style.cursor = ''));
  });

  // --- cerca un luogo: partenza, poi arrivo, poi tappe ---
  const modulo = $('.pian-cerca');
  const campo = modulo.querySelector('input');
  const elenco = modulo.querySelector('.risultati-luogo');
  let risultatiRicerca = [];
  const mostraRisultati = (voci, nota = '') => {
    risultatiRicerca = voci;
    elenco.innerHTML = voci.map((v, i) => `<li><button type="button" data-i="${i}">${ICONE.segnaposto}<span><b>${escapeHtml(v.nome)}</b>${v.dettaglio ? `<span class="tenue piccolo">${escapeHtml(v.dettaglio)}</span>` : ''}</span></button></li>`).join('') + (nota ? `<li class="tenue piccolo nota-luogo">${escapeHtml(nota)}</li>` : '');
    elenco.hidden = !voci.length && !nota;
  };
  modulo.addEventListener('submit', async (e) => {
    e.preventDefault();
    const testo = campo.value.trim();
    if (!testo) return;
    campo.blur();
    mostraRisultati([], 'Cerco…');
    try {
      const r = await fetch(urlLuoghi(testo), { headers: { Accept: 'application/json' } });
      const luoghi = luoghiDallaRisposta(r.ok ? await r.json() : []);
      mostraRisultati(luoghi, luoghi.length ? '' : 'Nessun luogo trovato in Italia');
    } catch {
      mostraRisultati([], 'Ricerca dei luoghi non disponibile ora');
    }
  });
  elenco.addEventListener('click', (e) => {
    const v = risultatiRicerca[Number(e.target.closest('[data-i]')?.dataset.i)];
    if (!v) return;
    const p = [v.lon, v.lat];
    elenco.hidden = true;
    campo.value = '';
    // la partenza, poi l'arrivo, poi altre tappe: sempre in fondo
    cambia([...storia.ora(), nuovaTappa(p, { nome: v.nome })]);
    mappa.flyTo({ center: p, zoom: Math.max(mappa.getZoom(), 12) });
  });

  // --- comandi ---
  // --- punti di interesse ---
  function disegnaCategorie() {
    const accese = poi?.categorie() ?? new Set();
    $('#pianCategorie').innerHTML = CATEGORIE_POI.map(
      (c) => `<button type="button" class="chip-scorciatoia" data-azione="categoria" data-chiave="${c.chiave}" aria-pressed="${accese.has(c.chiave)}"><img src="${urlIconaPoi(c)}" alt="" width="15" height="18" /><span>${escapeHtml(c.nome)}</span></button>`,
    ).join('');
  }
  // i POI lungo il percorso sono cambiati: il nome delle tappe
  function alPoi(nuovi) {
    // il nome delle tappe: un punto di interesse entro 100 m vince su via, località e paese (quelle a mano restano)
    let cambiato = false;
    for (const t of storia.ora()) {
      if (t.nomeManuale || t.nome) continue;
      const trovato = poiVicinoA(t.p, nuovi.tutti);
      const nome = trovato ? nomePerTappa(trovato) : null;
      if ((t.poi ?? null) !== nome) {
        t.poi = nome;
        cambiato = true;
      }
    }
    if (cambiato) disegnaTappeElenco();
  }
  // --- fauna lungo il percorso: le specie entro 300 m e il tratto con più fauna sulla linea ---
  let attesaFauna = null;
  let controlloFauna = null;
  function pianificaFaunaPercorso() {
    clearTimeout(attesaFauna);
    controlloFauna?.abort();
    const riga = $('#pianFaunaRiga');
    if (!risultato) {
      riga.hidden = true;
      mappa.getSource('fauna-tratto')?.setData(vuoto());
      return;
    }
    attesaFauna = setTimeout(async () => {
      controlloFauna = new AbortController();
      const mio = controlloFauna;
      const linea = risultato?.linea;
      riga.hidden = false;
      riga.innerHTML = '<span class="tenue piccolo">Fauna lungo il percorso: cerco…</span>';
      try {
        const f = await faunaLungoIlPercorso(linea, faunaGl.filtri(), mio.signal);
        if (chiusa || mio.signal.aborted || linea !== risultato?.linea) return;
        mostraFaunaPercorso(f);
      } catch (e) {
        if (e?.name === 'AbortError') return;
        riga.innerHTML = '<span class="tenue piccolo">Fauna lungo il percorso: non disponibile ora.</span>';
      }
    }, 2000);
  }
  function mostraFaunaPercorso(f) {
    const riga = $('#pianFaunaRiga');
    const sorgente = mappa.getSource('fauna-tratto');
    if (!f || f.troppoLungo) {
      sorgente?.setData(vuoto());
      riga.innerHTML = '<span class="tenue piccolo">Fauna lungo il percorso: percorso troppo lungo per cercarla.</span>';
      return;
    }
    const filtro = faunaGl.testoFiltri();
    const nomi = (a) => {
      const n = ANIMALI[a] ?? NOMI_IT.get(a) ?? a;
      return n.replace(/^./, (c) => c.toUpperCase());
    };
    const specie = f.specie.length
      ? `${f.specie.map((x) => `${escapeHtml(x.nome)}${x.rara ? ' (rara)' : ''}`).join(', ')}${f.altre ? ` e altre ${f.altre}` : ''}`
      : 'nessuna osservazione entro 300 m';
    const tratto = f.tratto ? `<span class="pian-fauna-tratto">Più fauna: km ${String(Math.round(f.tratto.daKm * 10) / 10).replace('.', ',')}–${String(Math.round(f.tratto.aKm * 10) / 10).replace('.', ',')} (${f.tratto.specie.slice(0, 3).map((a) => escapeHtml(nomi(a))).join(', ')})</span>` : '';
    riga.innerHTML = `<b>Fauna lungo il percorso</b><span>${specie}${f.approssimato ? ' · le più recenti' : ''}</span>${tratto}${filtro ? `<span class="tenue piccolo">${escapeHtml(filtro)}</span>` : ''}`;
    if (f.tratto && risultato) sorgente?.setData({ type: 'FeatureCollection', features: [lineaGeo(fetta(creaBase([risultato.linea]), f.tratto.daM, f.tratto.aM))] });
    else sorgente?.setData(vuoto());
  }

  const suClick = async (e) => {
    const b = e.target.closest('[data-azione], [data-attivita], [data-base]');
    if (!b) return;
    if (b.dataset.base) {
      livelli.base = b.dataset.base;
      salvaLivelli();
      applicaLivelli();
      return aggiornaLivelli();
    }
    if (b.dataset.attivita) {
      if (b.dataset.attivita === attivita) return;
      attivita = b.dataset.attivita;
      stato.imposta({ attivita });
      return aggiorna();
    }
    const azione = b.dataset.azione;
    const i = Number(b.closest('li')?.dataset.i);
    if (azione === 'annulla') (chiudiFumetto(), storia.annulla(), aggiorna());
    else if (azione === 'ripeti') (chiudiFumetto(), storia.ripeti(), aggiorna());
    else if (azione === 'togli') (chiudiFumetto(), cambia(togli(storia.ora(), i)));
    else if (azione === 'rinomina') iniziaRinomina(i);
    else if (azione === 'aggiungi-tappa') {
      scrivi('Cerca un luogo o tocca la mappa');
      campo.focus();
    } else if (azione === 'menu') {
      const box = $('#pianMenu');
      box.hidden = !box.hidden;
      b.setAttribute('aria-expanded', String(!box.hidden));
    } else if (azione === 'ricomincia') {
      chiudiMenu();
      chiudiFumetto();
      if (!storia.ora().length) return scrivi('Il percorso è già vuoto');
      // si può recuperare con «Annulla»
      impostaAnello(false);
      cambia([]);
      scrivi('Percorso svuotato: con «Annulla» lo ritrovi');
      setTimeout(() => $('#pianSugg')?.textContent.startsWith('Percorso svuotato') && aggiorna(), 4000);
    } else if (azione === 'elimina-bozza') {
      chiudiMenu();
      if (!confirm('Eliminare la bozza del percorso? Non si può recuperare.')) return;
      chiudiFumetto();
      impostaAnello(false);
      cancellaBozza();
      storia.azzera([]);
      aggiorna();
    } else if (azione === 'forbici') {
      chiudiFumetto();
      impostaForbici(!forbici);
    } else if (azione === 'livelli') {
      const box = $('#pianLivelli');
      box.hidden = !box.hidden;
      b.setAttribute('aria-expanded', String(!box.hidden));
      b.setAttribute('aria-pressed', String(!box.hidden));
      if (!box.hidden) chiudiCategorie();
    } else if (azione === 'libera-tratto') {
      const k = Number(b.dataset.indice);
      cambia(storia.ora().map((t, j) => (j === k ? { ...t, libero: true } : t)));
    } else if (azione === 'apri-foglio') {
      const f = $('.pian-foglio');
      const aperto = f.classList.toggle('aperto');
      b.setAttribute('aria-expanded', String(aperto));
    } else if (azione === 'categorie') {
      const box = $('#pianCategorie');
      box.hidden = !box.hidden;
      b.setAttribute('aria-expanded', String(!box.hidden));
      b.setAttribute('aria-pressed', String(!box.hidden));
      if (!box.hidden) chiudiLivelli();
    } else if (azione === 'categoria') {
      poi?.imposta(b.dataset.chiave, !poi.categorie().has(b.dataset.chiave));
      disegnaCategorie();
      aggiornaLivelli();
    } else if (azione === 'fauna') {
      // acceso ma con il pannello chiuso: si riapre; altrimenti si accende o si spegne
      if (!faunaPannello.riapri()) stato.imposta({ livelli: { heatmap: !stato.leggi().livelli.heatmap } });
    }
    else if (azione === 'salva' && risultato) apriSalva();
  };
  app.addEventListener('click', suClick);
  $('#pianAnello').addEventListener('change', (e) => {
    chiudiFumetto();
    anello = e.target.checked;
    aggiorna();
  });
  function chiudiMenu() {
    $('#pianMenu').hidden = true;
    $('[data-azione="menu"]').setAttribute('aria-expanded', 'false');
  }
  // un tocco fuori dal menu lo chiude
  const fuoriDalMenu = (e) => {
    if (!$('#pianMenu').hidden && !e.target.closest('.pian-menu, .pian-menu-bottone')) chiudiMenu();
  };
  document.addEventListener('click', fuoriDalMenu);
  function chiudiCategorie() {
    $('#pianCategorie').hidden = true;
    const b = $('[data-azione="categorie"]');
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-pressed', 'false');
  }
  function chiudiLivelli() {
    $('#pianLivelli').hidden = true;
    const b = $('[data-azione="livelli"]');
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-pressed', 'false');
  }

  // --- livelli: mappa di base, sentieri segnati, tutti i sentieri, confini, acqua e rifugi ---
  const primoStrato = () => mappa.getStyle().layers.find((l) => l.type !== 'background')?.id;
  const primaDelleScritte = () => mappa.getStyle().layers.find((l) => l.type === 'symbol' && l.source === 'openmaptiles')?.id;
  function assicuraRaster(chiave) {
    const b = BASI_RASTER[chiave];
    if (!b || mappa.getSource(`base-${chiave}`)) return;
    mappa.addSource(`base-${chiave}`, { type: 'raster', tiles: [b.url], tileSize: 256, maxzoom: b.massimo, attribution: b.attribuzione });
    mappa.addLayer({ id: `base-${chiave}`, type: 'raster', source: `base-${chiave}` }, primoStrato());
  }
  function assicuraSegnati() {
    if (mappa.getSource('segnati')) return;
    mappa.addSource('segnati', { type: 'raster', tiles: ['https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png'], tileSize: 256, minzoom: 11, maxzoom: 18, attribution: '&copy; <a href="https://hiking.waymarkedtrails.org">Waymarked Trails</a> (CC-BY-SA)' });
    mappa.addLayer({ id: 'segnati', type: 'raster', source: 'segnati', paint: { 'raster-opacity': 0.8 } }, primaDelleScritte());
  }
  function assicuraConfini() {
    if (mappa.getSource('confini')) return;
    const features = [];
    mappa.addSource('confini', { type: 'geojson', data: vuoto() });
    mappa.addLayer({ id: 'confini-fascia', type: 'line', source: 'confini', layout: { 'line-join': 'round' }, paint: { 'line-color': COLORI.confineFascia, 'line-width': 9, 'line-opacity': 0.22 } }, primaDelleScritte());
    mappa.addLayer({ id: 'confini-linea', type: 'line', source: 'confini', layout: { 'line-join': 'round' }, paint: { 'line-color': COLORI.confine, 'line-width': 1.5, 'line-opacity': 0.9 } }, primaDelleScritte());
    for (const parco of PARCHI) {
      ottieniConfine(parco)
        .then((c) => {
          features.push({ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: c.anelli } });
          mappa.getSource('confini')?.setData({ type: 'FeatureCollection', features });
        })
        .catch(() => {}); // senza il confine di un parco si vedono gli altri
    }
  }
  const mostra = (id, si) => mappa.getLayer(id) && mappa.setLayoutProperty(id, 'visibility', visibilita(si));
  function applicaLivelli() {
    if (!stileCaricato() || chiusa) return;
    const raster = livelli.base !== 'chiara' ? livelli.base : null;
    if (raster) assicuraRaster(raster);
    for (const k of Object.keys(BASI_RASTER)) mostra(`base-${k}`, k === raster);
    // sotto una base a immagini il disegno vettoriale si nasconde (le scritte restano sul satellitare; la «dettagliata» ha già le sue)
    for (const l of mappa.getStyle().layers) {
      if (l.id.startsWith('orme-')) continue;
      if (l.type === 'symbol' && l.source === 'openmaptiles') mostra(l.id, livelli.base !== 'topo');
      else if (l.type !== 'background' && (l.source === 'openmaptiles' || l.source === 'ne2_shaded')) mostra(l.id, !raster);
    }
    for (const id of LIVELLI_SENTIERI) mostra(id, livelli.tutti);
    if (livelli.segnati) assicuraSegnati();
    mostra('segnati', livelli.segnati);
    if (livelli.confini) assicuraConfini();
    mostra('confini-fascia', livelli.confini);
    mostra('confini-linea', livelli.confini);
  }
  function aggiornaLivelli() {
    for (const b of app.querySelectorAll('[data-base]')) b.setAttribute('aria-pressed', String(b.dataset.base === livelli.base));
    for (const c of app.querySelectorAll('[data-livello]')) {
      c.checked = c.dataset.livello === 'acquaRifugi' ? Boolean(poi?.categorie().has('acqua') && poi.categorie().has('dormire')) : Boolean(livelli[c.dataset.livello]);
    }
  }
  const suCambio = (e) => {
    const k = e.target.dataset?.livello;
    if (!k) return;
    if (k === 'acquaRifugi') {
      poi?.imposta('acqua', e.target.checked);
      poi?.imposta('dormire', e.target.checked);
      disegnaCategorie();
    } else {
      livelli[k] = e.target.checked;
      salvaLivelli();
      applicaLivelli();
    }
  };
  app.addEventListener('change', suCambio);
  function salvaLivelli() {
    try {
      localStorage.setItem(CHIAVE_LIVELLI, JSON.stringify(livelli));
    } catch {
      // vale per questa visita
    }
  }

  // --- salvataggio in I miei percorsi ---
  const finestra = $('.foglio-salva');
  finestraTrascinabile(finestra);
  $('#pianNome').addEventListener('input', (e) => (e.target.dataset.digitato = '1'));
  function apriSalva() {
    const m = risultato.misure;
    $('#pianRiepilogo').textContent = `${km1(m.km)} km${m.salita != null ? ` · +${m.salita} m` : ''}${m.durataMin != null ? ` · ${durata(m.durataMin)}` : ''} · ${storia.ora().length} tappe`;
    finestra.showModal();
    const nome = $('#pianNome');
    if (!nome.dataset.digitato && nomeDaSostituire(nome.value)) {
      nomeProposto(risultato.pezziQuote ?? [risultato.linea]).then((n) => {
        if (n && !nome.dataset.digitato && nomeDaSostituire(nome.value)) nome.value = n;
      });
    }
  }
  finestra.addEventListener('click', async (e) => {
    const azione = e.target.closest('[data-azione]')?.dataset.azione;
    if (e.target === finestra || azione === 'continua') return finestra.close();
    if (azione !== 'conferma' || !risultato) return;
    // dove c'è un pezzo della traccia di partenza il terreno non è noto: si legge da OpenStreetMap dalla scheda
    const conBase = risultato.tratti.some((t) => t.daBase);
    // un mio percorso si modifica direttamente; un sentiero dell'archivio o una carrareccia diventa sempre una copia
    const nuovo = {
      ...(esistente ?? { id: nuovoIdPercorso(), note: sorgente?.note ?? '', ...(sorgente?.daSentiero ? { daSentiero: sorgente.daSentiero } : {}) }),
      nome: $('#pianNome').value.trim() || 'Percorso senza nome',
      origine: 'disegnato',
      // con l'anello anche la partenza ripetuta in fondo: riaprendo il percorso è una tappa come le altre
      puntiControllo: tappeConAnello(storia.ora(), anello).map((t) => ({ p: t.id === ID_CHIUSURA ? doveStaLaTappa(storia.ora()[0]) : doveStaLaTappa(t), libero: t.libero, ...(t.nomeManuale ? { nome: t.nome, nomeManuale: true } : {}) })),
      geojson: { type: 'MultiLineString', coordinates: [risultato.linea] },
      // la traccia del file importato si conserva (una volta sola): «Ripristina la traccia originale» nella scheda
      ...conservaOriginale(esistente),
      terreno: conBase ? [] : risultato.terreno,
      fonteTerreno: conBase ? null : 'brouter',
      aggiornatoTerreno: conBase ? null : new Date().toISOString(),
    };
    await salvaPercorso(nuovo);
    if (!esistente && !sorgente) cancellaBozza();
    location.hash = `#/percorso/${encodeURIComponent(nuovo.id)}`;
  });

  aggiornaPulsanti();
  disegnaTappeElenco();
  // all'apertura: la traccia da modificare o il percorso a tappe si inquadra; altrimenti la vista della mappa da cui si è venuti
  if (tappeIniziali.length > 1) {
    const [s, o, n, e] = riquadroDelPercorso(tappeIniziali.map((t) => t.p), 0.002);
    // sul computer il pannello copre la sinistra, la barra dei numeri il fondo; sul telefono la tendina il fondo
    const largo = window.innerWidth >= 1024;
    mappa.fitBounds([[o, s], [e, n]], { padding: largo ? { top: 80, bottom: 170, left: 450, right: 50 } : { top: 110, bottom: 260, left: 30, right: 70 }, maxZoom: 15, animate: false });
  } else if (tappeIniziali.length === 1) mappa.jumpTo({ center: tappeIniziali[0].p, zoom: 14 });
  else if (apertura?.centro) mappa.jumpTo({ center: [apertura.centro[1], apertura.centro[0]], zoom: (apertura.zoom ?? 13) - 1 });
  aggiorna();

  return () => {
    chiusa = true;
    richiesta++;
    osservatore?.disconnect();
    clearTimeout(attesaFauna);
    controlloFauna?.abort();
    poi?.rimuovi();
    scollegaFauna();
    faunaGl.rimuovi();
    faunaPannello.chiudi();
    app.removeEventListener('click', suClick);
    app.removeEventListener('change', suCambio);
    document.removeEventListener('click', fuoriDalMenu);
    chiudiFumetto();
    for (const m of marcatori.values()) m.remove();
    segnoProfilo?.remove();
    mappa.remove();
    finestra.remove();
    document.body.classList.remove('con-mappa', 'pianificatore');
  };
}

// «Modifica traccia» da un sentiero dell'archivio: la traccia si apre nel pianificatore e si salva sempre una copia
export async function vistaPianificatoreSentiero(app, idCodificato) {
  const id = decodeURIComponent(idCodificato);
  const [sentiero, traccia] = await Promise.all([leggiSentiero(id), leggiTraccia(id)]);
  if (!sentiero || !traccia?.geojson?.coordinates?.length) {
    app.innerHTML = `<p class="vuoto">Per modificare la traccia serve una traccia. <a href="#/sentiero/${encodeURIComponent(id)}">Torna al sentiero</a></p>`;
    return;
  }
  return vistaPianificatore(app, null, {
    // la traccia nel verso scelto («Inverti senso», o quello dell'archivio)
    pezzi: (versoDi(sentiero ?? { id }) ? invertiPercorso(percorsoSentiero(traccia.geojson)) : percorsoSentiero(traccia.geojson)).pezzi,
    nomeProposto: `${sentiero.codici?.length ? codici(sentiero) : sentiero.nome} (modificato)`,
    note: `Modificato da ${[sentiero.codici?.length ? codici(sentiero) : '', sentiero.nome].filter(Boolean).join(' ')}.`,
    indietro: `#/sentiero/${encodeURIComponent(id)}`,
    daSentiero: id,
  });
}

// «Modifica traccia» da una carrareccia o un sentiero non segnato: il tratto l'ha preparato il foglio al tocco
export async function vistaPianificatoreVia(app) {
  let via = null;
  try {
    via = JSON.parse(sessionStorage.getItem('orme.viaDaModificare') ?? 'null');
  } catch {
    via = null;
  }
  if (!via?.pezzi?.length) {
    app.innerHTML = '<p class="vuoto">Tocca un sentiero sulla mappa e scegli «Modifica traccia». <a href="#/">Torna alla mappa</a></p>';
    return;
  }
  return vistaPianificatore(app, null, { ...via, indietro: '#/' });
}
