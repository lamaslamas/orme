// Livello "Fauna": heatmap delle osservazioni di tutte le fonti raccolte da GBIF (iNaturalist,
// eBird, Observation.org, atlanti…, ognuna una volta sola), icone degli animali da vicino ed
// elenco delle osservazioni toccando una zona. La correzione per lo sforzo usa la griglia di iNaturalist.
// Non usa mai i miei avvistamenti personali.
import L from 'leaflet';
import { ANIMALI, TAXON_GBIF } from '../lib/costanti.js';
import { leggiGruppiSalvati, leggiSoloRare, salvaSoloRare, testoGruppi } from '../lib/gruppiFauna.js';
import { stato } from '../stato.js';
import { htmlVoceOsservazione } from './vociOsservazioni.js';
import { NOMI_IT, cercaNomeItaliano, cercaOsservazioniFauna, raggruppaOsservazioni, popupGruppoHtml } from './faunaComune.js';
import { nascoste } from '../lib/specieNascoste.js';
import { escapeHtml } from '../lib/formato.js';
import {
  STAGIONI,
  urlTileHeatmap,
  FILTRI_INAT_PREDEFINITI,
  riquadroAttorno,
  urlTileGriglia,
  TUTTE_LE_SPECIE,
} from '../lib/inaturalist.js';
import { urlIconaAnimale } from './icone.js';
import { SegnoSuTela, telaSegni, immagine, segnoPronto } from './segniSuTela.js';
import { celleDaTile, rapportoSforzo, classifica, tilePerRiquadro, MINIMO_RIFERIMENTO } from '../lib/griglia.js';

const COLORI_CLASSI = { 0: '#f3f4f6', 1: '#c4b5fd', 2: '#7c6cf0', 3: '#3c9a2a', 4: '#e2d600' };
const MASSIMO_TILE = 12;

const RAGGIO_TOCCO_PX = 28;

const ICONA =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="9" cy="10" r="6" fill="currentColor" opacity=".35"/><circle cx="15" cy="14" r="6" fill="currentColor" opacity=".5"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/></svg>';

export const SPIEGAZIONE_HEATMAP = `
  <p><b>Cosa mostra.</b> Dove sono state registrate più osservazioni delle specie scelte (dal rosa: poche, al rosso: molte). Si vede da una regione o un parco in giù: a scala nazionale coprirebbe tutto. Densità relativa, non un censimento.</p>
  <p><b>Fonti.</b> Tutte quelle raccolte da GBIF, ognuna una volta sola: iNaturalist, eBird, Observation.org, atlanti e collezioni scientifiche. Aprendo un'osservazione vedi da dove viene.</p>
  <p><b>Posizioni approssimate.</b> Per le specie protette (orso, lupo, camoscio…) la posizione è spostata di proposito fino a circa 20 km; anche alcuni atlanti hanno posizioni a quadrati. Sulla mappa sono icone tratteggiate: indicano la zona, non il punto.</p>
  <p><b>Dove passano più persone.</b> Le osservazioni si concentrano vicino a strade, paesi e sentieri frequentati: una zona vuota spesso significa solo che lì nessuno ha registrato niente.</p>
  <p><b>Correzione per lo sforzo.</b> Ogni cella mostra le osservazioni della specie rispetto a tutte quelle della cella, per non premiare le zone solo perché frequentate. È calcolata sui dati di iNaturalist; le celle grigie hanno troppo pochi dati (meno di ${MINIMO_RIFERIMENTO}).</p>
  <p class="tenue">Dati © degli autori, con le licenze Creative Commons indicate su ogni osservazione. I tuoi avvistamenti personali non sono mai inclusi.</p>`;

// Filtri della heatmap dallo stato condiviso: l'animale è lo stesso scelto nei filtri dei sentieri
// intorno: solo in "Intorno a me" anche gli animali imperdibili (la fauna più comune); altrove
// sempre e solo le specie rare della lista
// Le stesse regole in tutte le mappe dell'app: i gruppi scelti (di base tutti), come nella home
export function filtriHeatmap(st = stato.leggi()) {
  const h = st.heatmap ?? {};
  const specie = st.specie && TAXON_GBIF[st.specie] ? st.specie : 'notevoli';
  // solo i campi noti: valori estranei rimasti in memoria non devono cambiare la ricerca
  return {
    specie,
    stagione: h.stagione ?? FILTRI_INAT_PREDEFINITI.stagione,
    anni: Number(h.anni) || 0,
    soloVerificate: h.soloVerificate ?? true,
    correggiSforzo: Boolean(h.correggiSforzo),
  };
}


// occupata() dice se un altro strumento (misura, nuovo avvistamento) sta usando i tocchi
// personalizza(): campi in più per i filtri (in Intorno a me: gruppi scelti, specie scelta)
export const ZOOM_HEATMAP_GRUPPI = 10;

// pannelloIn: dove mettere legenda e filtri (di base sulla mappa; nella pagina iniziale nel foglio della fauna)
// riapriPannello(): Fauna accesa con il pannello chiuso: il tocco su "Fauna" lo riapre invece di spegnere
export function aggiungiHeatmap(mappa, { occupata = () => false, personalizza = () => ({}), pannelloIn = null, riapriPannello = () => false } = {}) {
  const intorno = true; // stesse icone, fonti e regole ovunque (prima solo nella home)
  // le specie nascoste: i taxon per la heatmap di iNaturalist e la firma che rifà icone e tessere quando cambiano
  const calcolaFiltri = (st) => ({ ...filtriHeatmap(st), gruppi: leggiGruppiSalvati(), escludiInat: nascoste.idInat(), escludi: nascoste.firma(), ...personalizza() });
  // nessun gruppo scelto (e nessun animale): niente heatmap, non una heatmap piena
  const senzaGruppi = (f) => f.specie === 'notevoli' && !f.taxon && !f.gruppi?.length;
  let filtri = calcolaFiltri(stato.leggi());
  let richiestaZona = 0;
  let livello = null;
  let attiva = false;
  // mappa tolta (uscendo dalla schermata): niente più livelli da aggiungere
  let rimossa = false;
  mappa.on('unload', () => (rimossa = true));

  mappa.vociLegenda?.push(() =>
    stato.leggi().livelli.heatmap
      ? `<div class="voce-legenda"><b><span class="campione sfumato"></span>Fauna (iNaturalist)</b>
          <p class="tenue piccolo">Dal rosa (poche osservazioni) al giallo (molte). Specie protette: posizione sfumata.</p></div>`
      : '',
  );

  if (!mappa.getPane('heatmap')) {
    mappa.createPane('heatmap');
    mappa.getPane('heatmap').style.zIndex = 350; // sopra le mappe, sotto le tracce
  }

  // parte ridotto (titolo e legenda): i filtri si aprono con un tocco
  const pannello = L.DomUtil.create('div', 'barra-flottante pannello-heatmap ridotto');
  pannello.hidden = true;
  (pannelloIn ?? mappa.getContainer()).appendChild(pannello);
  L.DomEvent.disableClickPropagation(pannello);
  L.DomEvent.disableScrollPropagation(pannello);

  const foglio = document.createElement('dialog');
  foglio.className = 'foglio';
  document.body.appendChild(foglio);
  foglio.addEventListener('click', (e) => {
    if (e.target === foglio || e.target.closest('[data-chiudi]')) foglio.close();
  });

  const Controllo = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const div = L.DomUtil.create('div', 'leaflet-bar');
      const b = L.DomUtil.create('a', 'heat-bottone', div);
      b.href = '#';
      b.title = 'Heatmap della fauna: dove gli animali sono stati osservati (iNaturalist)';
      b.setAttribute('role', 'button');
      b.setAttribute('aria-label', 'Mostra o nascondi la heatmap della fauna (osservazioni iNaturalist)');
      // con l'etichetta: la sola icona non si capiva
      b.innerHTML = `${ICONA}<span>Fauna</span>`;
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.on(b, 'click', (e) => {
        L.DomEvent.preventDefault(e);
        if (attiva && riapriPannello()) return;
        stato.imposta({ livelli: { heatmap: !attiva } });
      });
      this.bottone = b;
      return div;
    },
  });
  const controllo = new Controllo().addTo(mappa);
  // il pulsante Fauna sta in cima, sopra quello dei livelli: il pannello dei livelli non lo copre
  const angolo = controllo.getContainer().parentNode;
  angolo.insertBefore(controllo.getContainer(), angolo.firstChild);

  let griglia = null;
  let richiestaGriglia = 0;

  async function disegnaGriglia() {
    const mia = ++richiestaGriglia;
    const testoGriglia = () => pannello.querySelector('#statoGriglia');
    const z = Math.min(12, Math.max(7, Math.round(mappa.getZoom())));
    const b = mappa.getBounds();
    const tile = tilePerRiquadro([b.getSouth(), b.getWest(), b.getNorth(), b.getEast()], z);
    if (tile.length > MASSIMO_TILE) {
      griglia?.clearLayers();
      if (testoGriglia()) testoGriglia().textContent = 'Avvicina la mappa per calcolare la correzione.';
      return;
    }
    if (testoGriglia()) testoGriglia().textContent = 'Calcolo il rapporto per cella…';
    const prendi = async (url) => {
      const risposta = await fetch(url);
      if (!risposta.ok) throw new Error(`iNaturalist ha risposto ${risposta.status}`);
      return risposta.json();
    };
    const sostituisci = (u, x, y) => u.replace('{z}', z).replace('{x}', x).replace('{y}', y);
    let celle;
    try {
      const parti = await Promise.all(
        tile.map(async ([x, y]) => {
          const [specie, tutte] = await Promise.all([
            prendi(sostituisci(urlTileGriglia(filtri), x, y)),
            prendi(sostituisci(urlTileGriglia({ ...filtri, specie: TUTTE_LE_SPECIE }), x, y)),
          ]);
          return rapportoSforzo(celleDaTile(z, x, y, specie), celleDaTile(z, x, y, tutte));
        }),
      );
      celle = classifica(parti.flat());
    } catch (e) {
      if (mia === richiestaGriglia && testoGriglia()) testoGriglia().textContent = `Correzione non disponibile (${e.message}).`;
      return;
    }
    if (rimossa || mia !== richiestaGriglia || !attiva || !filtri.correggiSforzo) return;
    griglia ??= L.layerGroup().addTo(mappa);
    griglia.clearLayers();
    for (const c of celle) {
      const [s, o, n, e] = c.limiti;
      L.rectangle(
        [
          [s, o],
          [n, e],
        ],
        c.classe == null
          ? { pane: 'heatmap', stroke: false, fillColor: '#9ca3af', fillOpacity: 0.25, interactive: false }
          : { pane: 'heatmap', stroke: false, fillColor: COLORI_CLASSI[c.classe], fillOpacity: c.classe === 0 ? 0.35 : 0.6, interactive: false },
      ).addTo(griglia);
    }
    const valide = celle.filter((c) => c.classe != null).length;
    if (testoGriglia()) testoGriglia().textContent = `${valide} celle con dati sufficienti, ${celle.length - valide} con dati scarsi.`;
  }

  mappa.dopoIlMovimento('fauna: griglia', () => attiva && filtri.correggiSforzo && disegnaGriglia(), { priorita: 6 });

  // Da vicino: un'icona per ogni osservazione con posizione esatta (le sfumate delle specie
  // protette no: indicherebbero un punto falso). Toccando l'icona si vede l'animale; il tocco
  // non arriva alla mappa, così nel disegno di un percorso non aggiunge punti.
  const ZOOM_ICONE = 12;
  const icone = L.layerGroup();
  let richiestaIcone = 0;
  // richiesta in corso (si annulla se la mappa si sposta di nuovo) e zona già coperta dalle icone
  let controlloIcone = null;
  let coperto = null; // { limiti, zoom, chiave }
  let iconeInfo = '';
  let contoIcone = null; // osservazioni nella zona visibile (null = non ancora cercate); sempre lo stesso criterio, a ogni zoom
  let contoParziale = false; // arrivate al massimo richiesto: ce ne possono essere di più
  let ultimeOss = [];
  // quante osservazioni (non quante icone, che cambiano con lo zoom) stanno nell'area che si vede, a fine movimento
  const contaVisibili = () => {
    const v = mappa.getBounds();
    return ultimeOss.filter((o) => v.contains([o.lat, o.lon])).length;
  };
  // le osservazioni ammesse che stanno nell'area che si vede (le stesse delle icone e del conteggio), null se le icone non ci sono
  const osservazioniVisibili = () => {
    if (contoIcone == null) return null;
    const v = mappa.getBounds();
    return ultimeOss.filter((o) => v.contains([o.lat, o.lon]));
  };
  const raggruppa = (oss) => raggruppaOsservazioni(oss, (o) => mappa.latLngToContainerPoint([o.lat, o.lon]), mappa.getZoom() < 14 ? 90 : 60);
  // Spillo lilla come quello di prima: sempre chiaro, con l'animale, il numero di osservazioni e il
  // bordo tratteggiato per le posizioni approssimate
  function disegnoSpillo(g, tela) {
    const url = urlIconaAnimale(g.icona);
    const n = g.oss.length;
    const spillo = (ctx, x, y, img) => {
      const cy = y - 22;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, cy, 13, Math.PI * 0.75, Math.PI * 0.25);
      ctx.lineTo(x, y - 3);
      ctx.closePath();
      ctx.shadowColor = 'rgba(37, 50, 56, 0.4)';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetY = 1;
      ctx.fillStyle = g.sfumata ? 'rgba(241, 236, 255, 0.85)' : '#fff';
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#7c6cf0';
      if (g.sfumata) ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (img) {
        ctx.globalAlpha = g.sfumata ? 0.6 : 1;
        ctx.drawImage(img, x - 9, cy - 9, 18, 18);
        ctx.globalAlpha = 1;
      }
      if (n > 1) {
        const testo = String(n);
        ctx.font = '700 10px Inter, system-ui, sans-serif';
        const w = Math.max(16, ctx.measureText(testo).width + 8);
        ctx.fillStyle = '#5b4b9a';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y - 42, w, 16, 8);
        else ctx.rect(x, y - 42, w, 16);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(testo, x + w / 2, y - 34);
      }
      ctx.restore();
    };
    // immagine pronta (ombra compresa) appena l'icona dell'animale è caricata; prima, senza icona
    return (ctx, x, y) => {
      const img = immagine(url, tela);
      if (!img) return spillo(ctx, x, y, null);
      segnoPronto(`${url}|${g.sfumata ? 1 : 0}|${n}`, [70, 48], [20, 44], (c, ax, ay) => spillo(c, ax, ay, img))(ctx, x, y);
    };
  }

  // le osservazioni nel riquadro, già filtrate (faunaComune.js)
  const cercaOsservazioni = (riquadro, limite, segnale) => cercaOsservazioniFauna(riquadro, limite, segnale, filtri);

  async function aggiornaIcone() {
    const mia = ++richiestaIcone;
    if (!attiva || filtri.correggiSforzo || senzaGruppi(filtri) || mappa.getZoom() < ZOOM_ICONE) {
      icone.clearLayers();
      icone.remove();
      coperto = null;
      controlloIcone?.abort();
      iconeInfo = attiva && !filtri.correggiSforzo && !senzaGruppi(filtri) ? 'Avvicinati per vedere le icone degli animali.' : '';
      contoIcone = null;
      ultimeOss = [];
      scriviConto();
      return mappa.aggiornaLegenda?.();
    }
    // spostamento piccolo dentro la zona già caricata (stesso zoom e filtri): le icone ci sono già
    const vista = mappa.getBounds();
    const chiave = JSON.stringify(filtri);
    if (coperto && coperto.chiave === chiave && coperto.zoom === mappa.getZoom() && coperto.limiti.contains(vista) && mappa.hasLayer(icone)) {
      contoIcone = contaVisibili();
      scriviConto();
      return;
    }
    // si chiede un po' più della zona visibile: i piccoli spostamenti restano coperti
    const b = vista.pad(0.25);
    controlloIcone?.abort();
    controlloIcone = new AbortController();
    try {
      // con "animali imperdibili" anche le specie fuori dalla lista di Orme
      const { osservazioni } = await cercaOsservazioni([b.getSouth(), b.getWest(), b.getNorth(), b.getEast()], 300, controlloIcone.signal);
      const oss = osservazioni;
      if (rimossa || mia !== richiestaIcone) return;
      icone.clearLayers();
      // una sola icona per animale in ogni zona di circa 60 px, con il numero di osservazioni;
      // le posizioni approssimate (specie protette, atlanti) a parte, sbiadite e tratteggiate
      const gruppi = raggruppa(oss);
      // i nomi italiani delle specie fuori dalla lista (prime 15), così il fumetto li ha già all'apertura
      for (const sci of [...new Set(gruppi.filter((g) => !g.animale && g.scientifico).map((g) => g.scientifico))].slice(0, 15)) cercaNomeItaliano(sci);
      for (const g of gruppi) {
        // sulla tela, non come segnaposto HTML: lo spillo sta sopra il punto (lì si tocca)
        new SegnoSuTela([g.lat, g.lon], { renderer: telaSegni(mappa), radius: 15, centro: [0, -22], disegno: disegnoSpillo(g, telaSegni(mappa)), inattivo: occupata })
          .bindPopup(() => popupGruppoHtml(g), { offset: [0, -34] })
          .on('popupopen', (ev) => {
            if (g.animale || NOMI_IT.get(g.scientifico)) return;
            cercaNomeItaliano(g.scientifico).then((nome) => nome && ev.popup.isOpen() && ev.popup.setContent(popupGruppoHtml(g)));
          })
          .addTo(icone);
      }
      icone.addTo(mappa);
      coperto = { limiti: b, zoom: mappa.getZoom(), chiave };
      ultimeOss = oss;
      contoParziale = osservazioni.length >= 300;
      contoIcone = contaVisibili();
      const sfumate = oss.filter((o) => o.sfumata).length;
      iconeInfo = `${oss.length} osservazioni qui${sfumate ? `, di cui ${sfumate} con posizione approssimata (icone tratteggiate)` : ''}.`;
    } catch (e) {
      if (e?.name === 'AbortError') return; // superata da uno spostamento più recente
      if (mia === richiestaIcone) {
        iconeInfo = 'Icone degli animali non disponibili ora.';
        contoIcone = null;
      }
    }
    mappa.aggiornaLegenda?.();
    scriviConto();
  }
  // in breve nella barra della Fauna: cosa si vede qui (sempre visibile, anche con la barra chiusa)
  function scriviConto() {
    // chi mostra l'elenco delle specie (pannello Fauna) lo rifà sulle stesse osservazioni
    setTimeout(() => window.dispatchEvent(new CustomEvent('orme-oss-aggiornate')), 0);
    const el = pannello.querySelector('.heat-conto');
    if (!el) return;
    el.textContent = !attiva || filtri.correggiSforzo
      ? ''
      : senzaGruppi(filtri)
        ? '' // lo dice già la scritta sopra la scala
        : mappa.getZoom() < ZOOM_ICONE
        ? 'avvicinati per gli animali'
        : contoIcone == null
          ? ''
          : contoIcone
            ? `${contoIcone}${contoParziale ? '+' : ''} ${contoIcone === 1 ? 'animale' : 'animali'} qui`
            : "Nessuna osservazione in quest'area";
  }
  mappa.dopoIlMovimento('fauna: icone', () => aggiornaIcone(), { priorita: 3 });
  mappa.vociLegenda?.push(() => (stato.leggi().livelli.heatmap && iconeInfo ? `<p class="voce-legenda tenue piccolo">Icone: ${escapeHtml(iconeInfo)}</p>` : ''));

  function disegnaLivello() {
    if (rimossa) return;
    aggiornaIcone();
    livello?.remove();
    livello = null;
    griglia?.clearLayers();
    if (filtri.correggiSforzo) {
      disegnaGriglia();
      return;
    }
    if (senzaGruppi(filtri)) return;
    // tile dello zoom precedente mostrate a 512 px: le macchie diventano più grandi e leggibili
    // la heatmap è quella di iNaturalist (leggibile a ogni zoom); icone ed elenchi usano tutte le fonti
    livello = L.tileLayer(urlTileHeatmap({ ...filtri, soloVerificate: true }), {
      pane: 'heatmap',
      opacity: 1,
      // con i gruppi (molte più osservazioni delle sole rare) da lontano iNaturalist dà riquadri pieni
      ...(intorno && !filtri.taxon ? { minZoom: ZOOM_HEATMAP_GRUPPI } : {}),
      tileSize: 512,
      zoomOffset: -1,
      minNativeZoom: 1,
      // le tessere di iNaturalist esistono fino all'indirizzo di zoom 15 (zoom della mappa 16, con tessere da 512 px): oltre
      // si ingrandisce l'ultima disponibile invece di non mostrare niente
      maxNativeZoom: 16,
      maxZoom: 19,
      attribution: 'Heatmap © <a href="https://www.inaturalist.org" target="_blank" rel="noopener">iNaturalist</a>, osservazioni <a href="https://www.gbif.org" target="_blank" rel="noopener">GBIF</a> (CC)',
    }).addTo(mappa);
  }

  // cosa mostra la heatmap, scritto sopra la scala
  // con una specie scelta, una X accanto al nome la toglie (si torna a tutti gli animali)
  const htmlCosa = () =>
    `${escapeHtml(cosaSiVede())}${filtri.taxon ? ' <button type="button" class="togli-specie" data-azione="togli-specie" aria-label="Togli la specie scelta" title="Torna a tutti gli animali">×</button>' : ''}`;
  function cosaSiVede() {
    if (filtri.taxon) return filtri.taxon.nome || filtri.taxon.scientifico || 'Un animale';
    if (filtri.specie !== 'notevoli') return ANIMALI[filtri.specie] ?? filtri.specie;
    return testoGruppi(filtri.gruppi, nascoste.conta());
  }
  // nelle mappe senza il foglio della Fauna «Solo rare» si sceglie qui (stessa scelta della home)
  const htmlGruppi = () =>
    `<label class="scelta intera-riga"><input type="checkbox" data-solo-rare ${leggiSoloRare() ? 'checked' : ''}/> Solo rare (specie minacciate o protette)</label>`;

  function disegnaPannello() {
    pannello.innerHTML = `
      <div class="heat-testa"><b>Fauna</b><label class="fauna-switch" title="Spegni la heatmap della fauna"><input type="checkbox" role="switch" data-azione="spegni" checked aria-label="Fauna accesa" /></label><span class="heat-conto" aria-live="polite"></span>
        <span><button type="button" class="info-heatmap" data-azione="info" aria-label="Come leggerla" title="Come leggerla">?</button>
        <button type="button" class="chiudi-pannello" data-azione="riduci" aria-label="Mostra o nascondi i filtri">Filtri</button></span></div>
      <div class="heat-filtri">
        ${pannelloIn ? '' : htmlGruppi()}
        <select name="stagione" aria-label="Periodo dell'anno">${Object.entries(STAGIONI)
          .map(([k, s]) => `<option value="${k}" ${filtri.stagione === k ? 'selected' : ''}>${s.nome}</option>`)
          .join('')}</select>
        <select name="anni" aria-label="Anni">${[
          [0, 'Tutti gli anni'],
          [1, "Ultimo anno"],
          [3, 'Ultimi 3 anni'],
          [5, 'Ultimi 5 anni'],
          [10, 'Ultimi 10 anni'],
        ]
          .map(([v, et]) => `<option value="${v}" ${Number(filtri.anni) === v ? 'selected' : ''}>${et}</option>`)
          .join('')}</select>
        <label class="scelta intera-riga"><input type="checkbox" name="correggiSforzo" ${filtri.correggiSforzo ? 'checked' : ''}/> Correggi per lo sforzo di osservazione</label>
      </div>
      ${
        filtri.correggiSforzo
          ? `<div class="heat-legenda griglia-legenda"><span>rispetto a tutte: poche</span>${[1, 2, 3, 4]
              .map((c) => `<b style="background:${COLORI_CLASSI[c]}"></b>`)
              .join('')}<span>molte</span><b class="insufficiente"></b><span>dati scarsi</span></div>
             <p class="nota-mappa" id="statoGriglia"></p>`
          : `<div class="heat-scala"><p class="heat-cosa">${htmlCosa()}</p><div class="heat-legenda"><span>poche</span><i aria-hidden="true"></i><span>molte</span></div></div>`
      }
      <p class="nota-mappa">Tocca una zona colorata o un'icona per vedere le osservazioni. Heatmap iNaturalist; icone ed elenchi da tutte le fonti (GBIF: iNaturalist, eBird, Observation.org…).</p>`;
    pannello.hidden = false;
    scriviConto();
  }

  pannello.addEventListener('change', (e) => {
    const { name } = e.target;
    if (!name) return;
    const valore = e.target.type === 'checkbox' ? e.target.checked : name === 'anni' ? Number(e.target.value) : e.target.value;
    stato.imposta({ heatmap: { [name]: valore } });
  });

  // ogni cambio di animale o di filtri sostituisce subito la heatmap precedente
  const scollega = stato.ascolta((nuovo) => {
    const prossimi = calcolaFiltri(nuovo);
    const cambiati = JSON.stringify(prossimi) !== JSON.stringify(filtri);
    if (nuovo.livelli.heatmap !== attiva) nuovo.livelli.heatmap ? accendi() : spegni();
    if (!cambiati) return;
    filtri = prossimi;
    if (!attiva) return;
    richiestaZona++;
    if (foglio.open) foglio.close();
    disegnaPannello();
    disegnaLivello();
  });

  pannello.addEventListener('click', (e) => {
    e.stopPropagation();
    const soloRare = e.target.closest('[data-solo-rare]');
    if (soloRare) {
      salvaSoloRare(soloRare.checked);
      filtri = calcolaFiltri(stato.leggi());
      richiestaZona++;
      disegnaPannello();
      disegnaLivello();
      return;
    }
    const azione = e.target.closest('[data-azione]')?.dataset.azione;
    if (azione === 'info') {
      foglio.innerHTML = `<div class="foglio-maniglia"></div><h2 class="foglio-titolo">Come leggere la heatmap</h2>${SPIEGAZIONE_HEATMAP}<button type="button" class="bottone pieno-largo" data-chiudi>Chiudi</button>`;
      foglio.showModal();
    }
    if (azione === 'riduci') pannello.classList.toggle('ridotto');
    if (azione === 'togli-specie') window.dispatchEvent(new CustomEvent('orme-togli-specie'));
    if (azione === 'spegni') stato.imposta({ livelli: { heatmap: false } });
  });

  function accendi() {
    attiva = true;
    controllo.bottone?.classList.add('attivo');
    controllo.bottone?.setAttribute('aria-pressed', 'true');
    mappa.getContainer().classList.add('con-heatmap');
    disegnaLivello();
    disegnaPannello();
  }

  function spegni() {
    attiva = false;
    controllo.bottone?.classList.remove('attivo');
    controllo.bottone?.setAttribute('aria-pressed', 'false');
    mappa.getContainer().classList.remove('con-heatmap');
    livello?.remove();
    livello = null;
    griglia?.clearLayers();
    aggiornaIcone();
    pannello.hidden = true;
  }

  function avvisoBreve(testo) {
    const el = L.DomUtil.create('p', 'avviso-mappa avviso-breve', mappa.getContainer());
    el.textContent = testo;
    setTimeout(() => el.remove(), 1800);
  }

  async function mostraZona(e) {
    const mia = ++richiestaZona;
    const centro = mappa.latLngToContainerPoint(e.latlng);
    const no = mappa.containerPointToLatLng(centro.subtract([RAGGIO_TOCCO_PX, RAGGIO_TOCCO_PX]));
    const se = mappa.containerPointToLatLng(centro.add([RAGGIO_TOCCO_PX, RAGGIO_TOCCO_PX]));
    // il pannello si apre solo se ci sono osservazioni: un tocco a vuoto mostra solo un avviso breve
    let elenco;
    try {
      elenco = await cercaOsservazioni(riquadroAttorno(e.latlng, no, se), 30);
    } catch (err) {
      if (mia === richiestaZona) avvisoBreve(`Osservazioni non disponibili (${err.message})`);
      return;
    }
    // una risposta arrivata dopo un altro tocco o un cambio di animale non conta più
    if (mia !== richiestaZona || !attiva) return;
    if (!elenco.osservazioni.length) {
      avvisoBreve('Nessuna osservazione qui');
      return;
    }
    foglio.showModal();
    foglio.innerHTML = `
      <div class="foglio-maniglia"></div>
      <h2 class="foglio-titolo">Osservazioni in questa zona</h2>
      <p class="tenue">${elenco.totale} ${elenco.totale === 1 ? 'osservazione' : 'osservazioni'}${
        elenco.totale > elenco.osservazioni.length ? (elenco.osservazioni.length === 1 ? ', la più recente' : `, le ${elenco.osservazioni.length} più recenti`) : ''
      }. Le posizioni approssimate dalla fonte possono essere lontane fino a ~10 km dal punto mostrato.</p>
      <ul class="elenco-oss">
        ${
          elenco.osservazioni
            .map((o) => htmlVoceOsservazione(o))
            .join('') || '<li class="vuoto">Nessuna osservazione con questi filtri in questo punto.</li>'
        }
      </ul>
      <button type="button" class="bottone pieno-largo" data-chiudi>Chiudi</button>`;
  }

  // un tocco singolo apre le osservazioni; il doppio tocco serve a ingrandire e non apre niente
  let attesaTocco = null;
  mappa.on('click', (e) => {
    if (!attiva || occupata()) return;
    // i tocchi sulle tracce aprono il loro riquadro, non l'elenco delle osservazioni
    if (e.originalEvent?.target?.classList?.contains('leaflet-interactive')) return;
    if (mappa.percorsoVicino?.(e.latlng)) return;
    // il tocco che ha chiuso il foglio del percorso (telefono) serve solo a quello
    if (mappa.foglioAppenaChiuso?.()) return;
    // un tocco sull'icona di un animale apre solo il suo riquadro
    if (e.originalEvent?.target?.closest?.('.leaflet-marker-icon, .leaflet-popup') || Date.now() - popupApertoAlle < 500) return;
    // da vicino, con le icone sulla mappa: un tocco accanto a un'icona apre quella, non l'elenco
    // della zona (la macchia della heatmap sta proprio sotto le icone)
    const vicina = iconaVicina(e.latlng);
    if (vicina) {
      vicina.openPopup();
      return;
    }
    clearTimeout(attesaTocco);
    attesaTocco = setTimeout(() => mostraZona(e), 300);
  });
  let popupApertoAlle = 0;
  mappa.on('popupopen', () => (popupApertoAlle = Date.now()));
  function iconaVicina(latlng, raggioPx = 30) {
    if (!mappa.hasLayer(icone)) return null;
    const p = mappa.latLngToContainerPoint(latlng);
    let migliore = null;
    icone.eachLayer((m) => {
      // il segnaposto è sopra il punto: si misura dal centro dell'icona
      const c = mappa.latLngToContainerPoint(m.getLatLng()).subtract([0, 20]);
      const d = c.distanceTo(p);
      if (d <= raggioPx && (!migliore || d < migliore.d)) migliore = { m, d };
    });
    return migliore?.m ?? null;
  }
  mappa.on('dblclick zoomstart', () => clearTimeout(attesaTocco));

  // se la heatmap era accesa nella schermata precedente, resta accesa
  if (stato.leggi().livelli.heatmap) accendi();

  function ricarica() {
    if (rimossa) return;
    filtri = calcolaFiltri(stato.leggi());
    richiestaZona++;
    if (attiva) {
      disegnaLivello();
      const cosa = pannello.querySelector('.heat-cosa');
      if (cosa) cosa.innerHTML = htmlCosa();
    }
  }
  // una specie nascosta o rimessa (anche da un altro pannello): heatmap, icone e scritta si rifanno
  const scollegaNascoste = nascoste.ascolta(ricarica);

  return {
    attiva: () => attiva,
    osservazioniVisibili,
    // dopo un cambio dei campi di personalizza(): heatmap e icone si ridisegnano
    ricarica,
    rimuovi() {
      rimossa = true;
      scollegaNascoste();
      scollega();
      foglio.remove();
    },
  };
}
