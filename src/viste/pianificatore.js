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
import { CATEGORIE_POI, categoriaDelPoi, nomePoi, nomePerTappa, passaDiQui, poiVicinoA, riquadroDelPercorso } from '../lib/poiPianificatore.js';
import { creaBase, fetta } from '../lib/modificaTraccia.js';
import { ANIMALI } from '../lib/costanti.js';
import { NOMI_IT } from './faunaComune.js';
import { escapeHtml, durata, codici } from '../lib/formato.js';
import {
  nuovaTappa, etichetta, inserisciDopo, sposta, togli, muovi, rinomina, sostituisci, creaStoria, trattoPiuVicino, fondoDaTerreno, preferenzaPer, chiaveTratto, nomeDellaTappa, kmTesto, kmDelleTappe,
  tappeDaTraccia, tappeDaPunti, tagliaCode, aggancioDelleTappe, DISTANZA_MASSIMA_AGGANCIO_M,
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
  let preferenza = 'sentieri';
  const storia = creaStoria(tappeIniziali);
  const agganciate = new Map(); // id tappa → dove cade sulla strada (da BRouter)
  const tratti = new Map(); // chiave → promessa del tratto (si ricalcola solo quello che cambia)
  let risultato = null; // { linea, terreno, tratti, pezziQuote, fonte, misure }
  let richiesta = 0;
  let chiusa = false;
  let nomeInCorso = 0;
  let poi = null; // i punti di interesse sulla mappa (poiGl.js)
  let poiOra = { lungo: [], tutti: [], mancanti: false };
  let kmTappe = null; // i km di ogni tappa lungo il percorso (null finché non è calcolato)

  document.body.classList.add('con-mappa', 'pianificatore');
  app.innerHTML = `
    <div id="mappaPian" class="pian-mappa" aria-label="Mappa del pianificatore"></div>
    <div class="pian-sopra">
      <a class="pill-mappa tondo" href="${esistente ? `#/percorso/${encodeURIComponent(esistente.id)}` : sorgente?.indietro ?? '#/'}" aria-label="Esci">${ICONE.chiudi}</a>
      <form class="pian-cerca" role="search">
        <label class="ricerca">${ICONE.cerca}<input type="search" name="luogo" placeholder="Cerca un luogo" aria-label="Cerca un luogo per partenza, arrivo o tappa" autocomplete="off" enterkeyhint="search" /></label>
        <ul class="risultati-luogo" hidden></ul>
      </form>
    </div>
    <div class="pian-opzioni" role="group" aria-label="Opzioni del percorso">
      <button type="button" class="chip-scorciatoia" data-attivita="trekking">Trekking</button>
      <button type="button" class="chip-scorciatoia" data-attivita="mtb">MTB</button>
      <span class="pian-sep" aria-hidden="true"></span>
      <button type="button" class="chip-scorciatoia" data-preferenza="sentieri">Preferisci sentieri</button>
      <button type="button" class="chip-scorciatoia" data-preferenza="misto">Misto</button>
    </div>
    <p class="pian-fauna-stato" id="pianFaunaStato" role="status" hidden></p>
    <div class="pian-categorie" id="pianCategorie" role="group" aria-label="Punti di interesse da mostrare" hidden></div>
    <div class="pian-strumenti">
      <button type="button" class="pill-mappa tondo" data-azione="fauna" aria-pressed="false" aria-label="Fauna" title="Fauna: heatmap, icone e filtri">${ICONE.zampa}</button>
      <button type="button" class="pill-mappa tondo" data-azione="categorie" aria-pressed="false" aria-expanded="false" aria-label="Punti di interesse" title="Punti di interesse">${ICONE.segnaposto}</button>
      <button type="button" class="pill-mappa tondo" data-azione="posizione" aria-label="La mia posizione" title="La mia posizione">${ICONE.navigazione}</button>
      <button type="button" class="pill-mappa tondo" data-azione="annulla" aria-label="Annulla" title="Annulla">${ICONE.indietro}</button>
      <button type="button" class="pill-mappa tondo" data-azione="ripeti" aria-label="Ripeti" title="Ripeti"><span style="display:inline-block;transform:scaleX(-1);display:grid">${ICONE.indietro}</span></button>
    </div>
    <p class="pian-sugg" id="pianSugg" role="status"></p>
    <p class="pian-hint" id="pianHint" role="status" hidden>Trascina i punti o la linea per cambiare il percorso</p>
    <section class="pian-foglio" aria-label="Il percorso">
      <button type="button" class="pian-maniglia" data-azione="apri-foglio" aria-expanded="false" aria-label="Mostra o nascondi le tappe"><span class="foglio-maniglia"></span></button>
      <div class="disegno-numeri" id="pianNumeri"></div>
      <div class="pian-avviso" id="pianAvviso" role="alert" hidden></div>
      <div class="disegno-profilo" id="pianProfilo"></div>
      <div id="pianFondo"></div>
      <div class="pian-fauna-riga" id="pianFaunaRiga" hidden></div>
      <h2 class="titolo-sezione pian-titolo-tappe">Tappe</h2>
      <ol class="pian-tappe" id="pianTappe"></ol>
      <h2 class="titolo-sezione pian-titolo-poi" hidden>Lungo il percorso</h2>
      <ul class="pian-poi" id="pianPoi"></ul>
      <button type="button" class="bottone primario pieno" data-azione="salva" disabled>${ICONE.segnalibro}<span>Salva</span></button>
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
  if (import.meta.env.DEV) window.__pian = { storia, agganciate, risultato: () => risultato, marcatori };
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
      poi = creaPoiGl(mappa, maplibregl, { alCambio: alPoi, passa: passaDiQuiPoi });
      disegnaCategorie();
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
        m = new maplibregl.Marker({ element: elementoMarcatore(i, tappe.length), draggable: true }).setLngLat(doveStaLaTappa(t)).addTo(mappa);
        const indiceDi = () => storia.ora().findIndex((x) => x.id === t.id);
        m.on('dragstart', () => {
          trascinando = { tappa: true };
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
        const nuovo = elementoMarcatore(i, tappe.length);
        el.className = nuovo.className;
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

  async function aggiorna() {
    const tappe = storia.ora();
    // una bozza per un percorso nuovo (la traccia di un percorso già esistente non tocca la bozza)
    if (!esistente && !sorgente) salvaBozza(tappe.map((t) => t.p));
    disegnaTappe();
    disegnaTappeElenco();
    aggiornaPulsanti();
    trovaNomi();
    mostraAvviso('');
    const mia = ++richiesta;
    await pronta;
    if (chiusa) return;
    if (tappe.length < 2) {
      risultato = null;
      kmTappe = null;
      poi?.aggiorna(null);
      pianificaFaunaPercorso();
      mappa.getSource('linea')?.setData(vuoto());
      scrivi(tappe.length ? 'Tocca la mappa o cerca un luogo per l\'arrivo' : 'Tocca la mappa o cerca un luogo per la partenza');
      return mostraBarra();
    }
    mostraBarra('Calcolo…');
    scrivi('Calcolo del tratto…');
    const esiti = await Promise.allSettled(tappe.slice(1).map((b, i) => tratto(tappe[i], b)));
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
      if (vere[i].p && vere[i].distanzaM > DISTANZA_MASSIMA_AGGANCIO_M) lontana = lontana < 0 ? i : lontana;
      else if (viste[i].p) agganciate.set(t.id, viste[i].p);
    });
    disegnaTappe();
    mappa.getSource('linea')?.setData({ type: 'FeatureCollection', features: fatti.map((t, i) => lineaGeo(t.coordinate, { seg: i, libero: Boolean(t.libero) })) });
    risultato = { linea, terreno: unisciTerreno(fatti), tratti: fatti, pezziQuote: null, fonte: null, misure: misureDeiPezzi([linea]) };
    if (lontana >= 0) mostraAvviso(`${etichetta(lontana, tappe.length) === 'A' ? 'La partenza' : etichetta(lontana, tappe.length) === 'B' ? 'L\'arrivo' : `La tappa ${lontana}`} è a ${vere[lontana].distanzaM} m dal sentiero o dalla strada più vicini.`, lontana === 0 ? 1 : lontana);
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
        <div><b>${m.salita != null ? `+${m.salita} −${m.discesa}` : '…'}</b><span>dislivello</span></div>
        <div><b>${m.durataMin != null ? durata(m.durataMin) : '–'}</b><span>tempo</span></div>${messaggio ? `<p class="tenue piccolo">${escapeHtml(messaggio)}</p>` : ''}`;
    } else {
      numeri.innerHTML = `<p class="tenue">${escapeHtml(messaggio || (storia.ora().length ? 'Ancora una tappa per il percorso' : 'Tocca la mappa per iniziare'))}</p>`;
    }
    serieProfilo = risultato?.pezziQuote ? profiloPezzi(risultato.pezziQuote) : [];
    $('#pianProfilo').innerHTML = serieProfilo.length > 1 ? htmlProfiloMini(serieProfilo, testoFonteQuote(risultato.fonte)) : '';
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
    $('.pian-titolo-tappe').hidden = !tappe.length;
    $('#pianTappe').innerHTML = tappe
      .map((t, i) => {
        const nome = nomeDellaTappa(t) ?? (i === 0 ? 'Partenza' : i === tappe.length - 1 ? 'Arrivo' : `Tappa ${i}`);
        return `<li data-i="${i}">
          <span class="pian-presa" role="button" tabindex="0" aria-label="Riordina la tappa ${etichetta(i, tappe.length)}: tieni premuto e trascina (o frecce su e giù)">⠿</span>
          <span class="pian-tappa piccola${i === 0 ? ' prima' : i === tappe.length - 1 && tappe.length > 1 ? ' ultima' : ''}" aria-hidden="true">${etichetta(i, tappe.length)}</span>
          <button type="button" class="pian-nome" data-azione="rinomina" aria-label="Rinomina la tappa ${etichetta(i, tappe.length)}"><span class="pian-nome-testo">${escapeHtml(nome)}</span>${kmTappe ? `<span class="pian-km">${escapeHtml(kmTesto(kmTappe[i]))}</span>` : ''}</button>
          <span class="pian-azioni-tappa">
            <button type="button" data-azione="cerca-tappa" aria-label="Cerca un altro luogo per la tappa ${etichetta(i, tappe.length)}">${ICONE.cerca}</button>
            <button type="button" data-azione="togli" aria-label="Elimina la tappa ${etichetta(i, tappe.length)}">${ICONE.chiudi}</button>
          </span>
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
    campo.setAttribute('aria-label', `Nome della tappa ${etichetta(i, storia.ora().length)}`);
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
    for (const b of app.querySelectorAll('[data-preferenza]')) {
      const on = b.dataset.preferenza === preferenza && attivita !== 'mtb';
      b.classList.toggle('attiva', on);
      b.setAttribute('aria-pressed', String(on));
      b.disabled = attivita === 'mtb';
      b.title = attivita === 'mtb' ? 'Con MTB il profilo è uno solo' : '';
    }
  }

  // --- tocco sulla mappa: una tappa in fondo ---
  mappa.on('click', (e) => {
    if (trascinando || faunaGl.pressioneLungaAppena() || e.originalEvent?.target?.closest?.('.pian-tappa')) return;
    // un tocco su un punto di interesse ne apre i dettagli («Passa di qui»); altrove aggiunge una tappa
    const toccato = poi?.poiAl(e.point);
    if (toccato) return poi.apri(toccato);
    if (mappa.getZoom() + 1 < ZOOM_MINIMO && storia.ora().length) return scrivi('Avvicinati per mettere le tappe sui sentieri');
    cambia([...storia.ora(), nuovaTappa([e.lngLat.lng, e.lngLat.lat])]);
  });

  // --- trascinare la linea crea una tappa ---
  let trascinando = null; // { k, ... }
  function iniziaTrascinamento(e) {
    const tappe = storia.ora();
    if (tappe.length < 2) return;
    const seg = e.features?.[0]?.properties?.seg;
    const k = Number.isInteger(seg) ? seg : trattoPiuVicino(risultato?.tratti?.map((t) => t.coordinate) ?? [], [e.lngLat.lng, e.lngLat.lat]).indice;
    if (k < 0 || k >= tappe.length - 1) return;
    e.preventDefault();
    mappa.dragPan.disable();
    trascinando = { k, mosso: false };
    const muovi = (ev) => {
      trascinando.mosso = true;
      trascinando.p = [ev.lngLat.lng, ev.lngLat.lat];
      mappa.getSource('elastico')?.setData({ type: 'FeatureCollection', features: [lineaGeo([tappe[k].p, trascinando.p, tappe[k + 1].p])] });
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
  let tappaDaCambiare = null; // indice di una tappa a cui si cerca un altro luogo
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
    const tappe = storia.ora();
    if (tappaDaCambiare != null && tappe[tappaDaCambiare]) {
      cambia(sostituisci(tappe, tappaDaCambiare, p, v.nome));
      tappaDaCambiare = null;
      campo.placeholder = 'Cerca un luogo';
    } else cambia([...tappe, nuovaTappa(p, { nome: v.nome })]);
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
  // i POI lungo il percorso sono cambiati: elenco nel foglio e nomi delle tappe
  function alPoi(nuovi) {
    poiOra = nuovi;
    const lista = nuovi.lungo.filter((p) => p.categoria).slice(0, 15);
    $('.pian-titolo-poi').hidden = !lista.length;
    $('#pianPoi').innerHTML = lista
      .map((p) => {
        const c = categoriaDelPoi(p);
        return `<li><img src="${urlIconaPoi(c)}" alt="" width="20" height="24" /><span class="pian-poi-nome">${escapeHtml(nomePoi(p))}<span class="pian-km">km ${String(p.km).replace('.', ',')} · ${p.distanzaM < 30 ? 'sul percorso' : `a ${p.distanzaM} m`}</span></span><button type="button" class="link" data-azione="passa-poi" data-id="${escapeHtml(p.id)}">Passa di qui</button></li>`;
      })
      .join('');
    if (nuovi.mancanti && !lista.length) $('#pianPoi').innerHTML = '<li class="tenue piccolo">Punti di interesse non scaricati per questa zona.</li>';
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
  function passaDiQuiPoi(p) {
    cambia(passaDiQui(storia.ora(), kmTappe, p.km, p));
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
    const b = e.target.closest('[data-azione], [data-attivita], [data-preferenza]');
    if (!b) return;
    if (b.dataset.attivita) {
      if (b.dataset.attivita === attivita) return;
      attivita = b.dataset.attivita;
      stato.imposta({ attivita });
      return aggiorna();
    }
    if (b.dataset.preferenza) {
      if (b.dataset.preferenza === preferenza) return;
      preferenza = b.dataset.preferenza;
      return aggiorna();
    }
    const azione = b.dataset.azione;
    const i = Number(b.closest('li')?.dataset.i);
    if (azione === 'annulla') (storia.annulla(), aggiorna());
    else if (azione === 'ripeti') (storia.ripeti(), aggiorna());
    else if (azione === 'togli') cambia(togli(storia.ora(), i));
    else if (azione === 'rinomina') iniziaRinomina(i);
    else if (azione === 'cerca-tappa') {
      tappaDaCambiare = i;
      campo.placeholder = `Cerca il luogo per la tappa ${etichetta(i, storia.ora().length)}`;
      campo.focus();
    } else if (azione === 'libera-tratto') {
      const k = Number(b.dataset.indice);
      cambia(storia.ora().map((t, j) => (j === k ? { ...t, libero: true } : t)));
    } else if (azione === 'apri-foglio') {
      const f = $('.pian-foglio');
      const aperto = f.classList.toggle('aperto');
      b.setAttribute('aria-expanded', String(aperto));
    } else if (azione === 'posizione') posizione();
    else if (azione === 'categorie') {
      const box = $('#pianCategorie');
      box.hidden = !box.hidden;
      b.setAttribute('aria-expanded', String(!box.hidden));
      b.setAttribute('aria-pressed', String(!box.hidden));
    } else if (azione === 'categoria') {
      poi?.imposta(b.dataset.chiave, !poi.categorie().has(b.dataset.chiave));
      disegnaCategorie();
    } else if (azione === 'passa-poi') {
      const p = poiOra.lungo.find((x) => x.id === b.dataset.id);
      if (p) passaDiQuiPoi(p);
    } else if (azione === 'fauna') {
      // acceso ma con il pannello chiuso: si riapre; altrimenti si accende o si spegne
      if (!faunaPannello.riapri()) stato.imposta({ livelli: { heatmap: !stato.leggi().livelli.heatmap } });
    }
    else if (azione === 'salva' && risultato) apriSalva();
  };
  app.addEventListener('click', suClick);
  // la mia posizione: resta solo in memoria. Senza tappe è la partenza
  function posizione() {
    if (!navigator.geolocation) return scrivi('Il telefono non dà la posizione');
    scrivi('Cerco la tua posizione…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        scrivi('');
        const p = [pos.coords.longitude, pos.coords.latitude];
        mappa.flyTo({ center: p, zoom: Math.max(mappa.getZoom(), 14) });
        if (!storia.ora().length) cambia([nuovaTappa(p, { nome: 'La mia posizione' })]);
      },
      () => scrivi('Posizione non disponibile: tocca la mappa o cerca un luogo'),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
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
      puntiControllo: storia.ora().map((t) => ({ p: doveStaLaTappa(t), libero: t.libero, ...(t.nomeManuale ? { nome: t.nome, nomeManuale: true } : {}) })),
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
    mappa.fitBounds([[o, s], [e, n]], { padding: { top: 110, bottom: 260, left: 30, right: 30 }, maxZoom: 15, animate: false });
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
