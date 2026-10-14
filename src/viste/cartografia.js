// Sistema cartografico unico: mappe di base, sentieri di Waymarked Trails e pannello
// dei livelli, uguali in tutte le mappe dell'app. Le scelte stanno nello stato condiviso.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { stato } from '../stato.js';
import { creaBaseVettoriale, creaSentieriVettoriali, mostraSentieri } from './mappaVettoriale.js';
import { aggiungiPuntiUtili } from './puntiUtili.js';
import { cronometra, registraMappa } from '../lib/misura.js';
import { telePigre } from './telaPigra.js';
import { creaCoda } from '../lib/codaMovimento.js';

telePigre();

const CENTRO_PREDEFINITO = [41.79, 13.85];

// Basi "chiara" e "scura": una sola mappa MapLibre con base, tutti i sentieri e scritte (un solo
// contesto WebGL: sul telefono tre mappe separate rallentavano ogni movimento). La "satellitare" ha i
// nomi dei luoghi in un livello a immagini sopra le tracce. Le basi "nomiSotto" sono immagini con i
// nomi già stampati: lì le tracce si fanno trasparenti.
export const BASI = {
  chiara: {
    nome: 'Chiara',
    vettoriale: 'chiaro', // MapLibre + OpenFreeMap, caricata solo quando serve
  },
  // indipendente dalla modalità scura dell'app: si sceglie qui, tra le basi
  scura: {
    nome: 'Scura',
    vettoriale: 'scuro',
  },
  topo: {
    nome: 'Dettagliata (OSM)',
    nomiSotto: true,
    crea: () =>
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }),
  },
  curve: {
    nome: 'Curve di livello',
    nomiSotto: true,
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
  heatmap: 'Fauna (heatmap)',
  percorsi: 'Percorsi',
  osservazione: 'Percorsi di osservazione',
  uscite: 'Sentieri delle uscite',
  confini: 'Confini dei parchi',
  distribuzione: 'Distribuzione EEA',
  panoramicita: 'Panoramicità',
  rifugi: 'Rifugi e bivacchi',
  acqua: 'Acqua',
  sentieriOsm: 'Sentieri segnati',
  tuttiSentieri: 'Tutti i sentieri (anche non segnati)',
  gps: 'Posizione GPS',
};

const ICONA_LIVELLI =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m3 13 9 5 9-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

// anteprima: mappa ferma, senza comandi. livelli: chiavi dei livelli offerti da questa mappa.
// Vista di ogni mappa (centro e zoom) per la sessione: tornando su una pagina la mappa è dov'era
const CHIAVE_VISTE = 'orme.viste';
function leggiViste() {
  try {
    return JSON.parse(sessionStorage.getItem(CHIAVE_VISTE) ?? '{}');
  } catch {
    return {};
  }
}
function salvaVista(chiave, mappa) {
  const viste = leggiViste();
  const c = mappa.getCenter();
  viste[chiave] = { centro: [Math.round(c.lat * 1e5) / 1e5, Math.round(c.lng * 1e5) / 1e5], zoom: mappa.getZoom() };
  try {
    sessionStorage.setItem(CHIAVE_VISTE, JSON.stringify(viste));
  } catch {
    // memoria piena o non disponibile: la vista non si ricorda
  }
}

// ricorda: chiave per ritrovare la vista (es. "mappa", "parco:pnalm"). Se c'è una vista salvata, le
// inquadrature automatiche dell'apertura (fitBounds sul parco, sulla zona…) non la spostano:
// si riattivano alla prima mossa di chi usa la mappa, o dopo qualche secondo.
export function creaMappa(contenitore, { anteprima = false, livelli = [], ricorda = null } = {}) {
  const basi = Object.fromEntries(Object.entries(BASI).filter(([, b]) => b.crea).map(([k, b]) => [k, b.crea()]));
  // sentieri di Waymarked: tenui e solo da vicino (a scala regionale o nazionale fanno solo confusione)
  const sentieri = L.tileLayer('https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png', {
    maxZoom: 18,
    minZoom: 11,
    // sopra la heatmap e i sentieri non segnati, sotto le nostre tracce
    pane: 'sentieriSegnati',
    // più coprenti dei puntini dei sentieri non segnati che stanno sotto
    opacity: 0.8,
    attribution: '&copy; <a href="https://hiking.waymarkedtrails.org">Waymarked Trails</a> (CC-BY-SA)',
  });
  const ferma = anteprima
    ? { zoomControl: false, dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false }
    : { zoomControl: true };
  // canvas: molto più veloce con centinaia di tracce (i tocchi sulle linee funzionano lo stesso)
  // minZoom esplicito: senza, Leaflet prende quello dei livelli (Waymarked parte da 11) e impedisce di allontanarsi
  const mappa = L.map(contenitore, { ...ferma, preferCanvas: true, minZoom: 5, maxZoom: 19 }).setView(CENTRO_PREDEFINITO, 11);
  // sentieri: tutti (vettoriali, non segnati compresi) e sopra quelli segnati (Waymarked); entrambi
  // sopra la heatmap (350) e sotto le tracce (400), senza intercettare i tocchi
  for (const [nome, z] of [['sentieriVettoriali', 360], ['sentieriSegnati', 365]]) {
    mappa.createPane(nome);
    mappa.getPane(nome).style.zIndex = z;
    mappa.getPane(nome).style.pointerEvents = 'none';
  }
  if (!anteprima) registraMappa(mappa); // misuratore (?misura)
  // mentre la mappa si muove i controlli "di vetro" non sfocano lo sfondo: sul telefono ricalcolare la
  // sfocatura a ogni fotogramma costa più del disegno della mappa (stile.css, .mappa-in-movimento)
  if (!anteprima) {
    const radice = document.documentElement;
    mappa.on('movestart zoomstart', () => radice.classList.add('mappa-in-movimento'));
    mappa.on('moveend zoomend unload', () => radice.classList.remove('mappa-in-movimento'));
  }

  // Lavori di fine movimento (elenco, fauna, punti, legenda, vista salvata…) in un'unica coda: partono
  // 250 ms dopo l'ultimo movimento, uno per fotogramma (mai tutti insieme), e si fermano se la mappa
  // riparte (src/lib/codaMovimento.js). visibile(): false = si salta
  const coda = creaCoda({ fotogramma: () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))), avvolgi: cronometra });
  mappa.dopoIlMovimento = coda.aggiungi;
  mappa.on('movestart', coda.inizio);
  mappa.on('moveend', () => coda.fine(() => mappa._loaded));
  const vistaSalvata = ricorda && !anteprima ? leggiViste()[ricorda] : null;
  mappa.vistaRitrovata = Boolean(vistaSalvata);
  if (vistaSalvata) {
    mappa.setView(vistaSalvata.centro, vistaSalvata.zoom, { animate: false });
    const inquadra = mappa.fitBounds.bind(mappa);
    let bloccata = true;
    const libera = () => (bloccata = false);
    setTimeout(libera, 4000);
    // qualunque tocco, clic o rotella sulla mappa: da lì in poi le inquadrature tornano normali
    for (const evento of ['pointerdown', 'wheel']) mappa.getContainer().addEventListener(evento, libera, { once: true, passive: true });
    mappa.fitBounds = (...argomenti) => (bloccata ? mappa : inquadra(...argomenti));
    // una scelta fatta fuori dalla mappa (es. una card della lista) la deve poter spostare subito
    mappa.sbloccaInquadrature = libera;
  }
  if (ricorda && !anteprima) mappa.dopoIlMovimento('salvataggio della vista', () => !rimossaVista && salvaVista(ricorda, mappa), { priorita: 9 });
  let rimossaVista = false;
  mappa.on('unload', () => (rimossaVista = true));
  // ordine dei livelli: base e sentieri Waymarked, poi heatmap e tracce, sopra i nomi dei luoghi
  // (non toccabili), sopra ancora pin e riquadri
  mappa.createPane('etichette');
  mappa.getPane('etichette').style.zIndex = 450;
  mappa.getPane('etichette').style.pointerEvents = 'none';
  const etichette = Object.fromEntries(Object.entries(BASI).filter(([, b]) => b.etichette).map(([k, b]) => [k, b.etichette()]));

  // basi vettoriali (chiara e scura): si creano alla prima richiesta; se non si può (offline, niente
  // WebGL) si usa la dettagliata
  const vettoriali = {};
  const glBase = {}; // mappe MapLibre delle basi vettoriali, quando sono sulla mappa
  const preparaVettoriale = (k) =>
    (vettoriali[k] ??= creaBaseVettoriale(BASI[k].vettoriale, { sentieri: !anteprima && stato.leggi().livelli.tuttiSentieri !== false })
      .then((v) => {
        basi[k] = v;
        v.on('add', () => {
          glBase[k] = v.getMaplibreMap?.() ?? null;
          applicaTuttiISentieri();
        });
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
    if (BASI[k].vettoriale && !basi[k]) {
      // si aspetta la vettoriale (di solito già scaricata all'avvio): la dettagliata solo se non si può
      if (!(await preparaVettoriale(k))) k = 'topo';
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
    mappa.getContainer().classList.toggle('nomi-sotto', !!BASI[k].nomiSotto);
    baseAttuale = k;
    applicaTuttiISentieri();
  }
  // tutti i sentieri: colori chiari o scuri secondo la base; si creano alla prima richiesta
  const tuttiISentieri = {};
  const glPronti = {}; // mappe MapLibre del livello, quando sono sulla mappa
  let tuttiAccesi = false;
  let tuttiMostrati = null;
  // base vettoriale: i sentieri sono già nel suo stile e si accendono lì; sulle basi a immagini serve
  // una mappa MapLibre a parte (l'unica)
  const conSentieriDentro = () => Boolean(BASI[baseAttuale]?.vettoriale && glBase[baseAttuale]);
  async function applicaTuttiISentieri(acceso = tuttiAccesi) {
    tuttiAccesi = acceso;
    if (BASI[baseAttuale]?.vettoriale) mostraSentieri(glBase[baseAttuale], acceso && !anteprima);
    const scuro = ['scura', 'satellite'].includes(baseAttuale);
    const voluto = acceso && !anteprima && !BASI[baseAttuale]?.vettoriale ? (scuro ? 'scuro' : 'chiaro') : null;
    if (voluto === tuttiMostrati) return;
    if (tuttiMostrati) tuttiISentieri[tuttiMostrati]?.then((l) => l?.remove());
    tuttiMostrati = voluto;
    if (!voluto) return;
    tuttiISentieri[voluto] ??= creaSentieriVettoriali(voluto === 'scuro')
      .then((l) => {
        l.on('add', () => (glPronti[voluto] = l.getMaplibreMap?.() ?? null));
        return l;
      })
      .catch((e) => {
        console.warn('Sentieri vettoriali non disponibili', e);
        return null;
      });
    const livello = await tuttiISentieri[voluto];
    if (livello && tuttiMostrati === voluto && !rimossa) livello.addTo(mappa);
  }
  // C'è un sentiero (anche non segnato) sotto il dito? Si guarda il livello già disegnato, senza
  // chiedere niente a nessuno: solo se sì si cercano i suoi dati (nome, segnavia…) su Overpass
  mappa.sentieroVicino = (latlng, tolleranzaPx = 14) => {
    const gl = conSentieriDentro() ? (tuttiAccesi ? glBase[baseAttuale] : null) : tuttiMostrati ? glPronti[tuttiMostrati] : null;
    if (!gl?.isStyleLoaded?.()) return false;
    const p = gl.project([latlng.lng, latlng.lat]);
    const box = [[p.x - tolleranzaPx, p.y - tolleranzaPx], [p.x + tolleranzaPx, p.y + tolleranzaPx]];
    const linee = gl.queryRenderedFeatures(box, { layers: ['orme-sentieri', 'orme-carrarecce'] });
    if (!linee.length) return null;
    // { classe, sottoclasse, nome }: quello che dicono le tile, subito (il resto da Overpass)
    const nome = gl.queryRenderedFeatures(box, { layers: ['orme-nomi'] }).map((f) => f.properties['name:it'] ?? f.properties.name).find(Boolean) ?? null;
    return { classe: linee[0].properties.class, sottoclasse: linee[0].properties.subclass ?? null, nome };
  };
  function applicaSentieri(visibili) {
    if (visibili) sentieri.addTo(mappa);
    else sentieri.remove();
  }
  applicaBase(stato.leggi().base);
  applicaSentieri(stato.leggi().livelli.sentieriOsm !== false);

  // i sentieri di Waymarked si attenuano quando si vuole far risaltare una traccia
  mappa.attenuaSentieri = (attenua) => sentieri.setOpacity(attenua ? 0.3 : 0.8);

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
  mappa.vociLegenda = [
    // i tre tipi di sentiero, solo quelli accesi
    () => {
      const l = stato.leggi().livelli;
      const scuro = ['scura', 'satellite'].includes(stato.leggi().base);
      const bordo = scuro ? '#0b1012' : '#fff';
      const riga = (svg, testo) => `<li><svg viewBox="0 0 34 10" width="34" height="10" aria-hidden="true">${svg}</svg>${testo}</li>`;
      const voci = [
        l.percorsi !== false ? riga(`<path d="M2 5H32" stroke="${bordo}" stroke-width="7" stroke-linecap="round"/><path d="M2 5H32" stroke="#7b2d9b" stroke-width="4" stroke-linecap="round"/>`, 'I nostri percorsi') : '',
        l.sentieriOsm !== false ? riga('<path d="M2 5H32" stroke="#d6362f" stroke-width="3" stroke-linecap="round" opacity="0.85"/>', 'Segnati (Waymarked Trails)') : '',
        l.tuttiSentieri !== false
          ? riga(`<path d="M2 5H32" stroke="${bordo}" stroke-width="5" stroke-linecap="round"/><path d="M3 5H32" stroke="${scuro ? '#f0c27a' : '#8a5a2b'}" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="0.1 5"/>`, 'Non segnati (OpenStreetMap)')
          : '',
      ].filter(Boolean);
      return voci.length ? `<div class="voce-legenda"><b>Sentieri</b><ul class="legenda-sentieri">${voci.join('')}</ul></div>` : '';
    },
  ];
  mappa.aggiornaLegenda = () => {};
  if (anteprima) return mappa;
  L.control.scale({ imperial: false }).addTo(mappa);
  // crediti: un piccolo "©" nell'angolo che li apre con un tocco (i link restano cliccabili).
  // All'apertura della mappa si vedono per qualche secondo, poi si richiudono da soli.
  const crediti = mappa.attributionControl?.getContainer();
  if (crediti) {
    crediti.classList.add('aperti');
    crediti.setAttribute('title', 'Crediti della mappa');
    const chiudiCrediti = setTimeout(() => crediti.classList.remove('aperti'), 4000);
    crediti.addEventListener('click', (e) => {
      clearTimeout(chiudiCrediti);
      if (e.target.closest('a') && crediti.classList.contains('aperti')) return;
      crediti.classList.toggle('aperti');
      if (e.target.closest('a')) e.preventDefault();
    });
  }
  // rifugi e acqua: in tutte le mappe con il pannello dei livelli, prima del GPS
  const conPunti = [...livelli.filter((k) => k !== 'gps'), 'rifugi', 'acqua', ...livelli.filter((k) => k === 'gps')];
  aggiungiPannelloLivelli(mappa, ['sentieriOsm', 'tuttiSentieri', ...conPunti]);
  aggiungiPuntiUtili(mappa);
  mappa.suLivello('tuttiSentieri', (acceso) => applicaTuttiISentieri(acceso));
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
  const controlloLivelli = new Controllo().addTo(mappa);
  // un tocco sulla mappa (o uno spostamento) chiude il pannello dei livelli
  const chiudi = () => {
    if (pannello.hidden) return;
    pannello.hidden = true;
    controlloLivelli.getContainer().querySelector('.livelli-bottone')?.setAttribute('aria-expanded', 'false');
  };
  mappa.on('dragstart zoomstart', chiudi);
  // il tocco che chiude il pannello serve solo a quello: non apre percorsi né osservazioni
  const contenitore = mappa.getContainer();
  let ignoraClic = false;
  contenitore.addEventListener(
    'pointerdown',
    (e) => {
      if (pannello.hidden || pannello.contains(e.target) || e.target.closest('.leaflet-control')) return;
      chiudi();
      ignoraClic = true;
      setTimeout(() => (ignoraClic = false), 600);
    },
    true,
  );
  contenitore.addEventListener(
    'click',
    (e) => {
      if (!ignoraClic) return;
      ignoraClic = false;
      e.stopPropagation();
      e.preventDefault();
    },
    true,
  );

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
      </fieldset>`;
  }
  // la legenda segue le scelte (animale, livelli) mentre il pannello è aperto
  mappa.aggiornaLegenda = cronometra('legenda', () => {
    if (!pannello.hidden) disegna();
  });

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
