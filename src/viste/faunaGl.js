// La Fauna sulla mappa MapLibre del pianificatore: heatmap di iNaturalist e icone degli animali, con gli stessi filtri della mappa
// principale (stato condiviso, «Solo rare», specie nascoste, specie scelta nel pannello). Le icone non intercettano i tocchi (un tocco
// sulla mappa aggiunge sempre una tappa): i dettagli di un'osservazione si aprono con la pressione lunga sull'icona.
import { stato } from '../stato.js';
import { urlTileHeatmap } from '../lib/inaturalist.js';
import { leggiGruppiSalvati, testoGruppi } from '../lib/gruppiFauna.js';
import { nascoste } from '../lib/specieNascoste.js';
import { urlIconaAnimale } from './icone.js';
import { filtriHeatmap } from './heatmap.js';
import { senzaGruppi, cercaOsservazioniFauna, raggruppaOsservazioni, popupGruppoHtml, cercaNomeItaliano, NOMI_IT } from './faunaComune.js';

const ZOOM_ICONE = 11; // zoom di MapLibre: uno meno di Leaflet (12)
const ZOOM_HEATMAP_GRUPPI = 9; // idem (10)
const PRESSIONE_LUNGA_MS = 550;
const RAGGIO_ICONA_PX = 30;

// La mappa vista dal pannello Fauna (faunaHome.js), che parla il linguaggio di Leaflet: dimensione, punti e fine movimento
export function adattatoreMappa(mappa) {
  return {
    getSize: () => ({ x: mappa.getCanvas().clientWidth, y: mappa.getCanvas().clientHeight }),
    containerPointToLatLng: ([x, y]) => {
      const ll = mappa.unproject([x, y]);
      return { lat: ll.lat, lng: ll.lng };
    },
    dopoIlMovimento(_nome, fn, opzioni = {}) {
      const f = () => {
        if (opzioni.visibile && !opzioni.visibile()) return;
        fn();
      };
      mappa.on('moveend', f);
      return () => mappa.off('moveend', f);
    },
  };
}

// → { attiva, ricarica, osservazioniVisibili, testoStato, pressioneLungaAppena, rimuovi }
// personalizza(): campi in più per i filtri (la specie scelta); alCambio(): il testo di stato è cambiato
export function aggiungiFaunaGl(mappa, maplibregl, { personalizza = () => ({}), alCambio = () => {}, prima = null } = {}) {
  const calcolaFiltri = () => ({ ...filtriHeatmap(stato.leggi()), gruppi: leggiGruppiSalvati(), escludiInat: nascoste.idInat(), escludi: nascoste.firma(), ...personalizza() });
  let filtri = calcolaFiltri();
  let attiva = false;
  let rimossa = false;
  let ultimeOss = [];
  let contoIcone = null; // null = non ancora cercate; sempre lo stesso criterio, a ogni zoom
  let contoParziale = false;
  let marcatori = [];
  let controllo = null;
  let richiesta = 0;
  let attesa = null;
  let ultimaPressioneLunga = 0;
  let gruppiOra = [];
  let chiaveCoperta = null; // zona e filtri delle icone già caricate

  const nomeFiltri = () => {
    const f = testoGruppi(filtri.gruppi, nascoste.conta()).replace(/^Tutti gli animali/, 'tutti gli animali').replace(/^Solo rare/, 'solo rare');
    return filtri.taxon ? `${filtri.taxon.nome || filtri.taxon.scientifico}${nascoste.conta() ? ` · ${nascoste.conta()} nascoste` : ''}` : f;
  };
  // il testo per la barra: sempre in chiaro quali filtri ci sono («Fauna: solo rare · 30 nascoste · 12 animali qui»)
  function testoStato() {
    if (!attiva) return '';
    let coda = '';
    if (!senzaGruppi(filtri)) {
      if (mappa.getZoom() < ZOOM_ICONE) coda = ' · avvicinati per le icone';
      else if (contoIcone != null) coda = contoIcone ? ` · ${contoIcone}${contoParziale ? '+' : ''} ${contoIcone === 1 ? 'animale' : 'animali'} qui` : ' · nessun animale qui';
    }
    return `Fauna: ${nomeFiltri()}${coda}`;
  }
  const segnala = () => {
    alCambio(testoStato());
    // chi mostra l'elenco delle specie (pannello Fauna) lo rifà sulle stesse osservazioni
    setTimeout(() => window.dispatchEvent(new CustomEvent('orme-oss-aggiornate')), 0);
  };

  // --- heatmap (tessere raster di iNaturalist) ---
  function togliHeatmap() {
    if (mappa.getLayer('fauna-heat')) mappa.removeLayer('fauna-heat');
    if (mappa.getSource('fauna-heat')) mappa.removeSource('fauna-heat');
  }
  function disegnaHeatmap() {
    togliHeatmap();
    if (!attiva || senzaGruppi(filtri)) return;
    mappa.addSource('fauna-heat', { type: 'raster', tiles: [urlTileHeatmap({ ...filtri, soloVerificate: true })], tileSize: 512, minzoom: 0, maxzoom: 15, attribution: 'Heatmap © <a href="https://www.inaturalist.org" target="_blank" rel="noopener">iNaturalist</a>' });
    mappa.addLayer({ id: 'fauna-heat', type: 'raster', source: 'fauna-heat', ...(filtri.taxon ? {} : { minzoom: ZOOM_HEATMAP_GRUPPI }), paint: { 'raster-opacity': 0.85, 'raster-fade-duration': 150 } }, prima && mappa.getLayer(prima) ? prima : undefined);
  }

  // --- icone ---
  function pulisciIcone() {
    for (const m of marcatori) m.remove();
    marcatori = [];
    gruppiOra = [];
  }
  function elementoIcona(g) {
    const el = document.createElement('div');
    el.className = `pian-fauna-icona${g.sfumata ? ' sfumata' : ''}`;
    el.style.pointerEvents = 'none'; // i tocchi passano alla mappa: la pressione lunga la gestiamo noi
    el.innerHTML = `<img src="${urlIconaAnimale(g.icona)}" alt="" width="18" height="18" />${g.oss.length > 1 ? `<b>${g.oss.length}</b>` : ''}`;
    return el;
  }
  function disegnaIcone() {
    pulisciIcone();
    if (!attiva || contoIcone == null) return;
    const gruppi = raggruppaOsservazioni(ultimeOss, (o) => mappa.project([o.lon, o.lat]), mappa.getZoom() + 1 < 14 ? 90 : 60);
    gruppiOra = gruppi;
    for (const g of gruppi) marcatori.push(new maplibregl.Marker({ element: elementoIcona(g), anchor: 'bottom' }).setLngLat([g.lon, g.lat]).addTo(mappa));
    for (const sci of [...new Set(gruppi.filter((g) => !g.animale && g.scientifico).map((g) => g.scientifico))].slice(0, 15)) cercaNomeItaliano(sci);
  }
  const visibili = () => {
    const v = mappa.getBounds();
    return ultimeOss.filter((o) => v.contains([o.lon, o.lat]));
  };
  async function aggiornaIcone() {
    const mia = ++richiesta;
    if (!attiva || senzaGruppi(filtri) || mappa.getZoom() < ZOOM_ICONE) {
      controllo?.abort();
      pulisciIcone();
      ultimeOss = [];
      contoIcone = null;
      chiaveCoperta = null;
      return segnala();
    }
    const v = mappa.getBounds().toArray(); // [[o, s], [e, n]]
    const chiave = JSON.stringify([filtri, mappa.getZoom() < 13]);
    const dentro = chiaveCoperta && chiaveCoperta.chiave === chiave && v[0][0] >= chiaveCoperta.o && v[0][1] >= chiaveCoperta.s && v[1][0] <= chiaveCoperta.e && v[1][1] <= chiaveCoperta.n;
    if (dentro) {
      contoIcone = visibili().length;
      disegnaIcone();
      return segnala();
    }
    // si chiede un po' più della zona visibile: i piccoli spostamenti restano coperti
    const dx = (v[1][0] - v[0][0]) * 0.25;
    const dy = (v[1][1] - v[0][1]) * 0.25;
    const area = { o: v[0][0] - dx, s: v[0][1] - dy, e: v[1][0] + dx, n: v[1][1] + dy };
    controllo?.abort();
    controllo = new AbortController();
    try {
      const { osservazioni } = await cercaOsservazioniFauna([area.s, area.o, area.n, area.e], 300, controllo.signal, filtri);
      if (rimossa || mia !== richiesta) return;
      ultimeOss = osservazioni;
      contoParziale = osservazioni.length >= 300;
      contoIcone = visibili().length;
      chiaveCoperta = { chiave, ...area };
      disegnaIcone();
    } catch (e) {
      if (e?.name === 'AbortError') return;
      if (mia === richiesta) contoIcone = null;
    }
    segnala();
  }
  const dopoMovimento = () => {
    clearTimeout(attesa);
    attesa = setTimeout(aggiornaIcone, 350);
  };
  mappa.on('moveend', dopoMovimento);
  // zoom: le icone si raggruppano di nuovo
  mappa.on('zoomend', () => attiva && contoIcone != null && disegnaIcone());

  // --- pressione lunga sull'icona: i dettagli ---
  const contenitore = mappa.getCanvasContainer();
  let giu = null;
  contenitore.addEventListener('pointerdown', (e) => {
    if (!attiva || !e.isPrimary) return;
    giu = { x: e.clientX, y: e.clientY, id: e.pointerId };
    const id = e.pointerId;
    clearTimeout(giu.t);
    giu.t = setTimeout(() => {
      if (!giu || giu.id !== id) return;
      const r = contenitore.getBoundingClientRect();
      const px = [e.clientX - r.left, e.clientY - r.top];
      let migliore = null;
      for (const g of gruppiOra) {
        const p = mappa.project([g.lon, g.lat]);
        const d = Math.hypot(p.x - px[0], p.y - 12 - px[1]); // l'icona sta sopra il punto
        if (d <= RAGGIO_ICONA_PX && (!migliore || d < migliore.d)) migliore = { g, d };
      }
      if (!migliore) return;
      ultimaPressioneLunga = performance.now();
      const g = migliore.g;
      const popup = new maplibregl.Popup({ offset: [0, -26], maxWidth: '300px' }).setLngLat([g.lon, g.lat]).setHTML(popupGruppoHtml(g)).addTo(mappa);
      if (!g.animale && !NOMI_IT.get(g.scientifico)) cercaNomeItaliano(g.scientifico).then((n) => n && popup.isOpen() && popup.setHTML(popupGruppoHtml(g)));
    }, PRESSIONE_LUNGA_MS);
  });
  const fineTocco = () => {
    clearTimeout(giu?.t);
    giu = null;
  };
  contenitore.addEventListener('pointerup', fineTocco);
  contenitore.addEventListener('pointercancel', fineTocco);
  contenitore.addEventListener('pointermove', (e) => {
    if (giu && e.pointerId === giu.id && Math.hypot(e.clientX - giu.x, e.clientY - giu.y) > 8) fineTocco();
  });

  // --- accensione e filtri ---
  function ricarica() {
    if (rimossa) return;
    filtri = calcolaFiltri();
    chiaveCoperta = null;
    disegnaHeatmap();
    aggiornaIcone();
  }
  const scollegaStato = stato.ascolta((nuovo) => {
    const acceso = Boolean(nuovo.livelli.heatmap);
    const prossimi = calcolaFiltri();
    const cambiati = JSON.stringify(prossimi) !== JSON.stringify(filtri);
    if (acceso !== attiva) {
      attiva = acceso;
      filtri = prossimi;
      chiaveCoperta = null;
      disegnaHeatmap();
      if (attiva) aggiornaIcone();
      else {
        pulisciIcone();
        contoIcone = null;
        segnala();
      }
    } else if (cambiati) ricarica();
  });
  const scollegaNascoste = nascoste.ascolta(ricarica);

  const avvia = () => {
    attiva = Boolean(stato.leggi().livelli.heatmap);
    disegnaHeatmap();
    aggiornaIcone();
  };

  return {
    avvia,
    attiva: () => attiva,
    ricarica,
    osservazioniVisibili: () => (contoIcone == null ? null : visibili()),
    testoStato,
    pressioneLungaAppena: () => performance.now() - ultimaPressioneLunga < 700,
    rimuovi() {
      rimossa = true;
      clearTimeout(attesa);
      controllo?.abort();
      scollegaStato();
      scollegaNascoste();
      pulisciIcone();
      togliHeatmap();
    },
  };
}
