// Livello "Fauna": heatmap delle osservazioni di tutte le fonti raccolte da GBIF (iNaturalist,
// eBird, Observation.org, atlanti…, ognuna una volta sola), icone degli animali da vicino ed
// elenco delle osservazioni toccando una zona. La correzione per lo sforzo usa la griglia di iNaturalist.
// Non usa mai i miei avvistamenti personali.
import L from 'leaflet';
import { ANIMALI, TAXON_GBIF } from '../lib/costanti.js';
import { urlOsservazioniGbif, interpretaGbif, iconaPerOsservazione } from '../lib/gbif.js';
import { stato } from '../stato.js';
import { escapeHtml } from '../lib/formato.js';
import {
  STAGIONI,
  SPECIE_RARE,
  urlTileHeatmap,
  FILTRI_INAT_PREDEFINITI,
  riquadroAttorno,
  urlTileGriglia,
  TUTTE_LE_SPECIE,
} from '../lib/inaturalist.js';
import { iconaAnimale } from './icone.js';
import { celleDaTile, rapportoSforzo, classifica, tilePerRiquadro, MINIMO_RIFERIMENTO } from '../lib/griglia.js';

const COLORI_CLASSI = { 0: '#f3f4f6', 1: '#c4b5fd', 2: '#7c6cf0', 3: '#3c9a2a', 4: '#e2d600' };
const MASSIMO_TILE = 12;

const CHIAVE = 'orme.heatmap';
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
export function filtriHeatmap(st = stato.leggi(), { intorno = false } = {}) {
  const h = st.heatmap ?? {};
  const insieme = intorno ? h.insiemeIntorno ?? 'notevoli' : 'rare';
  // ("selvatici" era il nome di prima di "notevoli")
  const specie = st.specie && TAXON_GBIF[st.specie] ? st.specie : insieme === 'rare' ? 'rare' : 'notevoli';
  // solo i campi noti: valori estranei rimasti in memoria non devono cambiare la ricerca
  return {
    specie,
    stagione: h.stagione ?? FILTRI_INAT_PREDEFINITI.stagione,
    anni: Number(h.anni) || 0,
    soloVerificate: h.soloVerificate ?? true,
    correggiSforzo: Boolean(h.correggiSforzo),
  };
}

const CLASSI = new Set(['Mammalia', 'Aves']);

// Nome italiano delle specie fuori dalla lista (da iNaturalist, una volta sola per specie)
const NOMI_IT = new Map();
function nomeGruppo(g) {
  return g.animale ? ANIMALI[g.animale] : NOMI_IT.get(g.scientifico) || g.nome || g.scientifico;
}
async function cercaNomeItaliano(scientifico) {
  if (!scientifico || NOMI_IT.has(scientifico)) return NOMI_IT.get(scientifico);
  NOMI_IT.set(scientifico, '');
  try {
    const r = await fetch(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(scientifico)}&rank=species&locale=it&per_page=1`);
    const t = (await r.json()).results?.[0];
    if (t?.name === scientifico && t.preferred_common_name) NOMI_IT.set(scientifico, t.preferred_common_name.replace(/^./, (c) => c.toUpperCase()));
  } catch {
    // resta il nome scientifico
  }
  return NOMI_IT.get(scientifico);
}

function opzioniSpecie(scelta, intorno) {
  const voci = [
    ['rare', 'Tutte le specie rare della lista'],
    ...(intorno ? [['notevoli', 'Animali imperdibili (anche fuori dalla lista)']] : []),
    ...SPECIE_RARE.map((k) => [k, ANIMALI[k]]),
  ];
  return voci.map(([v, et]) => `<option value="${v}" ${scelta === v ? 'selected' : ''}>${escapeHtml(et)}</option>`).join('');
}

// occupata() dice se un altro strumento (misura, nuovo avvistamento) sta usando i tocchi
export function aggiungiHeatmap(mappa, { occupata = () => false, intorno = false } = {}) {
  let filtri = filtriHeatmap(stato.leggi(), { intorno });
  let richiestaZona = 0;
  let livello = null;
  let attiva = false;

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
  const pannello = L.DomUtil.create('div', 'misura-barra pannello-heatmap ridotto');
  pannello.hidden = true;
  mappa.getContainer().appendChild(pannello);
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
    if (mia !== richiestaGriglia || !attiva || !filtri.correggiSforzo) return;
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

  let attesa = null;
  mappa.on('moveend', () => {
    if (!attiva || !filtri.correggiSforzo) return;
    clearTimeout(attesa);
    attesa = setTimeout(disegnaGriglia, 600);
  });

  // Da vicino: un'icona per ogni osservazione con posizione esatta (le sfumate delle specie
  // protette no: indicherebbero un punto falso). Toccando l'icona si vede l'animale; il tocco
  // non arriva alla mappa, così nel disegno di un percorso non aggiunge punti.
  const ZOOM_ICONE = 12;
  const icone = L.layerGroup();
  let richiestaIcone = 0;
  let attesaIcone = null;
  let iconeInfo = '';
  let contoIcone = null; // gruppi di icone nella zona inquadrata (null = non ancora cercati)
  function raggruppa(oss) {
    const gruppi = new Map();
    for (const o of oss) {
      const p = mappa.latLngToContainerPoint([o.lat, o.lon]);
      const specie = o.animale ?? o.nomeScientifico;
      const k = `${specie}|${o.sfumata ? 1 : 0}|${Math.floor(p.x / 60)}|${Math.floor(p.y / 60)}`;
      const g = gruppi.get(k) ?? { animale: o.animale, scientifico: o.nomeScientifico, nome: o.specie, icona: iconaPerOsservazione(o), sfumata: o.sfumata, oss: [] };
      g.oss.push(o);
      gruppi.set(k, g);
    }
    return [...gruppi.values()].map((g) => ({
      ...g,
      lat: g.oss.reduce((a, o) => a + o.lat, 0) / g.oss.length,
      lon: g.oss.reduce((a, o) => a + o.lon, 0) / g.oss.length,
      oss: g.oss.sort((a, b) => String(b.data).localeCompare(String(a.data))),
    }));
  }
  function popupGruppo(g) {
    const righe = g.oss
      .slice(0, 5)
      .map(
        (o) =>
          `<li>${o.data ? escapeHtml(o.data.split('-').reverse().join('/')) : 'data non indicata'} · ${escapeHtml(o.fonte)} · <a href="${escapeHtml(o.url)}" target="_blank" rel="noopener">apri ↗</a></li>`,
      )
      .join('');
    return `<div class="popup-oss"><b>${escapeHtml(nomeGruppo(g))}</b>${g.animale ? '' : ` <i class="tenue">${escapeHtml(g.scientifico)}</i>`} · ${g.oss.length} ${g.oss.length === 1 ? 'osservazione' : 'osservazioni'}
      ${g.sfumata ? '<p class="tenue piccolo">Posizione approssimata (fino a ~20 km per le specie protette): qui è solo la zona.</p>' : ''}
      <ul>${righe}</ul>${g.oss.length > 5 ? `<p class="tenue piccolo">e altre ${g.oss.length - 5}</p>` : ''}</div>`;
  }

  // osservazioni nel riquadro; con "animali imperdibili" anche i mammiferi e uccelli minacciati (IUCN)
  async function cercaOsservazioni(riquadro, limite) {
    const ricerche = [filtri, ...(filtri.specie === 'notevoli' ? [{ ...filtri, specie: 'minacciate' }] : [])];
    const risposte = await Promise.all(
      ricerche.map(async (f) => {
        const r = await fetch(urlOsservazioniGbif(riquadro, f, { limite }));
        if (!r.ok) throw new Error(`GBIF ha risposto ${r.status}`);
        return r.json();
      }),
    );
    const viste = new Set();
    const osservazioni = risposte
      .flatMap((j) => interpretaGbif(j))
      .filter((o) => !viste.has(o.id) && viste.add(o.id))
      .sort((a, b) => String(b.data).localeCompare(String(a.data)));
    // il totale è approssimato: una specie minacciata può essere anche tra quelle degne di nota
    return { totale: Math.max(...risposte.map((j) => j.count ?? 0)), osservazioni };
  }

  async function aggiornaIcone() {
    const mia = ++richiestaIcone;
    if (!attiva || filtri.correggiSforzo || mappa.getZoom() < ZOOM_ICONE) {
      icone.clearLayers();
      icone.remove();
      iconeInfo = attiva && !filtri.correggiSforzo ? 'Avvicinati per vedere le icone degli animali.' : '';
      contoIcone = null;
      scriviConto();
      return mappa.aggiornaLegenda?.();
    }
    const b = mappa.getBounds();
    try {
      // con "animali imperdibili" anche le specie fuori dalla lista di Orme
      const { osservazioni } = await cercaOsservazioni([b.getSouth(), b.getWest(), b.getNorth(), b.getEast()], 300);
      const oss = osservazioni.filter((o) => o.animale || (filtri.specie === 'notevoli' && CLASSI.has(o.classe)));
      if (mia !== richiestaIcone) return;
      icone.clearLayers();
      // una sola icona per animale in ogni zona di circa 60 px, con il numero di osservazioni;
      // le posizioni approssimate (specie protette, atlanti) a parte, sbiadite e tratteggiate
      for (const g of raggruppa(oss)) {
        L.marker([g.lat, g.lon], {
          icon: L.divIcon({
            className: `icona-osservazione${g.sfumata ? ' sfumata' : ''}`,
            html: `<span class="spillo"><span>${iconaAnimale(g.icona)}</span></span>${g.oss.length > 1 ? `<b class="quante">${g.oss.length}</b>` : ''}`,
            iconSize: [30, 36],
            iconAnchor: [15, 36],
            popupAnchor: [0, -34],
          }),
          title: `${nomeGruppo(g)}: ${g.oss.length}`,
          keyboard: false,
        })
          .bindPopup(() => popupGruppo(g))
          .on('popupopen', (ev) => {
            if (g.animale || NOMI_IT.get(g.scientifico)) return;
            cercaNomeItaliano(g.scientifico).then((nome) => nome && ev.popup.isOpen() && ev.popup.setContent(popupGruppo(g)));
          })
          .addTo(icone);
      }
      icone.addTo(mappa);
      contoIcone = icone.getLayers().length;
      const sfumate = oss.filter((o) => o.sfumata).length;
      iconeInfo = `${oss.length} osservazioni qui${sfumate ? `, di cui ${sfumate} con posizione approssimata (icone tratteggiate)` : ''}.`;
    } catch {
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
    const el = pannello.querySelector('.heat-conto');
    if (!el) return;
    el.textContent = !attiva || filtri.correggiSforzo
      ? ''
      : mappa.getZoom() < ZOOM_ICONE
        ? 'avvicinati per gli animali'
        : contoIcone == null
          ? ''
          : contoIcone
            ? `${contoIcone} ${contoIcone === 1 ? 'animale' : 'animali'} qui`
            : 'nessun animale qui';
  }
  mappa.on('moveend', () => {
    clearTimeout(attesaIcone);
    attesaIcone = setTimeout(aggiornaIcone, 500);
  });
  mappa.vociLegenda?.push(() => (stato.leggi().livelli.heatmap && iconeInfo ? `<p class="voce-legenda tenue piccolo">Icone: ${escapeHtml(iconeInfo)}</p>` : ''));

  function disegnaLivello() {
    aggiornaIcone();
    livello?.remove();
    livello = null;
    griglia?.clearLayers();
    if (filtri.correggiSforzo) {
      disegnaGriglia();
      return;
    }
    // tile dello zoom precedente mostrate a 512 px: le macchie diventano più grandi e leggibili
    // la heatmap è quella di iNaturalist (leggibile a ogni zoom); icone ed elenchi usano tutte le fonti
    livello = L.tileLayer(urlTileHeatmap({ ...filtri, soloVerificate: true }), {
      pane: 'heatmap',
      opacity: 1,
      tileSize: 512,
      zoomOffset: -1,
      minNativeZoom: 1,
      maxNativeZoom: 17,
      maxZoom: 19,
      attribution: 'Heatmap © <a href="https://www.inaturalist.org" target="_blank" rel="noopener">iNaturalist</a>, osservazioni <a href="https://www.gbif.org" target="_blank" rel="noopener">GBIF</a> (CC)',
    }).addTo(mappa);
  }

  function disegnaPannello() {
    pannello.innerHTML = `
      <div class="heat-testa"><b>Fauna</b><span class="heat-conto" aria-live="polite"></span>
        <span><button type="button" class="info-heatmap" data-azione="info" aria-label="Come leggerla" title="Come leggerla">?</button>
        <button type="button" class="chiudi-pannello" data-azione="riduci" aria-label="Mostra o nascondi i filtri">Filtri</button></span></div>
      <div class="heat-filtri">
        <select name="specie" aria-label="Specie">${opzioniSpecie(filtri.specie, intorno)}</select>
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
             <p class="misura-nota" id="statoGriglia"></p>`
          : '<div class="heat-legenda"><span>poche</span><i aria-hidden="true"></i><span>molte</span></div>'
      }
      <p class="misura-nota">Tocca una zona colorata o un'icona per vedere le osservazioni. Heatmap iNaturalist; icone ed elenchi da tutte le fonti (GBIF: iNaturalist, eBird, Observation.org…).</p>`;
    pannello.hidden = false;
    scriviConto();
  }

  pannello.addEventListener('change', (e) => {
    const { name } = e.target;
    if (!name) return;
    if (name === 'specie') {
      // un animale diventa la scelta di tutta l'app; "rare" toglie la scelta
      const v = e.target.value;
      if (TAXON_GBIF[v]) stato.imposta({ specie: v });
      else if (intorno) stato.imposta({ specie: '', heatmap: { insiemeIntorno: v } });
      else stato.imposta({ specie: '' });
      return;
    }
    const valore = e.target.type === 'checkbox' ? e.target.checked : name === 'anni' ? Number(e.target.value) : e.target.value;
    stato.imposta({ heatmap: { [name]: valore } });
  });

  // ogni cambio di animale o di filtri sostituisce subito la heatmap precedente
  const scollega = stato.ascolta((nuovo) => {
    const prossimi = filtriHeatmap(nuovo, { intorno });
    const cambiati = JSON.stringify(prossimi) !== JSON.stringify(filtri);
    if (nuovo.livelli.heatmap !== attiva) nuovo.livelli.heatmap ? accendi() : spegni();
    if (!cambiati) return;
    const cambiaVista = prossimi.correggiSforzo !== filtri.correggiSforzo;
    filtri = prossimi;
    if (!attiva) return;
    richiestaZona++;
    if (foglio.open) foglio.close();
    if (cambiaVista || pannello.querySelector('[name=specie]')?.value !== filtri.specie) disegnaPannello();
    disegnaLivello();
  });

  pannello.addEventListener('click', (e) => {
    e.stopPropagation();
    const azione = e.target.closest('[data-azione]')?.dataset.azione;
    if (azione === 'info') {
      foglio.innerHTML = `<div class="foglio-maniglia"></div><h2 class="foglio-titolo">Come leggere la heatmap</h2>${SPIEGAZIONE_HEATMAP}<button type="button" class="bottone pieno-largo" data-chiudi>Chiudi</button>`;
      foglio.showModal();
    }
    if (azione === 'riduci') pannello.classList.toggle('ridotto');
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
        elenco.totale > elenco.osservazioni.length ? `, le ${elenco.osservazioni.length} più recenti` : ''
      }. Le posizioni approssimate (specie protette, atlanti) possono essere lontane fino a ~10 km dal punto mostrato.</p>
      <ul class="elenco-oss">
        ${
          elenco.osservazioni
            .map(
              (o) => `<li>
            ${o.foto ? `<button type="button" class="foto-apri" data-foto="${escapeHtml(JSON.stringify({ url: o.foto.url, autore: o.foto.attribuzione, licenza: o.foto.licenza ?? '', pagina: o.url, titolo: o.specie }))}"><img src="${escapeHtml(o.foto.url)}" alt="" width="64" height="64" loading="lazy" /></button>` : '<div class="senza-foto"></div>'}
            <div>
              <b>${escapeHtml(o.specie)}</b> <span class="tenue">${escapeHtml(o.nomeScientifico)}</span><br />
              ${o.data ? escapeHtml(new Date(o.data).toLocaleDateString('it-IT')) : 'data non indicata'}
              ${o.sfumata ? '<span class="chip chip-verifica">posizione approssimata</span>' : ''}<br />
              <span class="tenue">Fonte: ${escapeHtml(o.fonte)}${o.licenza ? ` · ${escapeHtml(o.licenza)}` : ''}</span> ·
              <a href="${escapeHtml(o.url)}" target="_blank" rel="noopener">Apri ↗</a>
            </div>
          </li>`,
            )
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
    clearTimeout(attesaTocco);
    attesaTocco = setTimeout(() => mostraZona(e), 300);
  });
  mappa.on('dblclick zoomstart', () => clearTimeout(attesaTocco));

  // se la heatmap era accesa nella schermata precedente, resta accesa
  if (stato.leggi().livelli.heatmap) accendi();

  return {
    attiva: () => attiva,
    rimuovi() {
      scollega();
      foglio.remove();
    },
  };
}
