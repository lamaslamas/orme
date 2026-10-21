import L from 'leaflet';
import { geojsonUnito } from '../lib/tracce.js';
import { leggiBozza, cancellaBozza, impostaAperturaDisegno, aperturaDaMappa } from '../lib/bozza.js';
import { tuttiISentieri, tutteLeTracce } from '../db.js';
import { creaLivelloUscite, htmlUsciteDelSentiero } from './livelloUscite.js';
import { tendinaTrascinabile } from './tendina.js';
import { creaSuggeriscimi } from './suggeriscimi.js';
import { senzaTracciaNellaZona, testoRiassunto } from '../lib/elencoZona.js';
import { dividiPerTraccia, unisciGeometrie } from '../lib/filtri.js';
import { preparaPercorsi, filtraPercorsi } from '../lib/motore.js';
import { htmlSelettoreAttivita, collegaSelettoreAttivita } from './attivita.js';
import { escapeHtml, codici, durata, migliaia } from '../lib/formato.js';
import { creaMappa } from './mappa.js';
import { aggiungiGps } from './gps.js';
import { aggiungiMisura } from './misura.js';
import { aggiungiAvvistamenti } from './livelloAvvistamenti.js';
import { aggiungiHeatmap } from './heatmap.js';
import { aggiungiDistribuzione } from './distribuzione.js';
import { percorsiToccabili } from './toccaPercorso.js';
import { disegnaConfine, ottieniConfine } from './confine.js';
import { leggiFiltri, htmlFiltri, collegaFiltri, filtriAttivi } from './filtri.js';
import { stato } from '../stato.js';
import { parcoDa, PARCHI } from '../datiParchi.js';
import { COLORI } from './colori.js';
import { htmlFaunaBreve } from './faunaBreve.js';
import { aggiungiDaQui } from './daQui.js';
import { ICONE } from './icone.js';
import { miniatura } from './lista.js';
import { copertina, copertineCaricate, caricaCopertine as caricaDaVedere } from './daVedere.js';
import { misureSentiero } from '../lib/riassunto.js';
import { parchiCercati, urlLuoghi, luoghiDallaRisposta, risultatiOrdinati } from '../lib/cercaLuogo.js';
import { suTelefono } from './foglioPercorso.js';
import { leggiIntorno } from '../db.js';
import { zonaDaCercare, raggioPerZoom, distanzaDiPartenza, testoPartenza } from '../lib/intorno.js';
import { tipoZona, testoNessunoQui, testoZonaCercata, piuVicino, ZOOM_SENTIERI_NON_SEGNATI } from '../lib/zonaVuota.js';
import { avviaImportazione } from './importaFile.js';
import { distanzaKm } from '../lib/geo.js';

// La mia posizione, solo in memoria finché l'app è aperta (mai salvata): serve a ordinare
// "Percorsi qui" per partenza più vicina. ordine: 'consigliato' | 'vicini'
let miaPosizione = null;
let ordineElenco = 'consigliato';
function chiediPosizione() {
  return new Promise((risolvi) => {
    if (!navigator.geolocation) return risolvi(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => risolvi((miaPosizione = [coords.longitude, coords.latitude])),
      () => risolvi(null),
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 },
    );
  });
}
import { scaricaZona, completaZona } from './zona.js';

// Lavoro sulla zona (scaricamento e calcoli) fuori dalla schermata: continua se si apre una scheda
// e torna; a fine lavoro la mappa, se è aperta, si ridisegna con i percorsi nuovi.
let lavoroZona = null;
let testoZona = '';
let zonaCompletata = false;
const sullaMappa = () => /^#?\/?(\?|$)/.test(location.hash.replace(/^#/, ''));
let rivalutaBottone = null; // della mappa aperta: mostra il pulsante solo dove serve
function scriviZona(testo) {
  testoZona = testo;
  const b = document.querySelector('#cercaZona');
  if (!b) return;
  b.querySelector('span').textContent = testo || 'Cerca percorsi qui';
  b.disabled = Boolean(testo);
  if (testo) b.hidden = false;
  else rivalutaBottone?.();
}
const ridisegna = () => sullaMappa() && window.dispatchEvent(new HashChangeEvent('hashchange'));
function avviaZona(centro, raggio) {
  if (lavoroZona) return;
  lavoroZona = (async () => {
    try {
      const n = await scaricaZona(centro, raggio, { avanzamento: scriviZona });
      scriviZona(n ? '' : 'Nessun percorso segnato qui');
      ridisegna();
      zonaCompletata = false;
      await avviaCompletamento(true);
    } catch (e) {
      console.warn('Zona', e);
      scriviZona('OpenStreetMap non risponde, riprova');
    } finally {
      lavoroZona = null;
      if (testoZona) setTimeout(() => scriviZona(''), 4000);
    }
  })();
}
async function avviaCompletamento(dentroLavoro = false) {
  if (zonaCompletata || (lavoroZona && !dentroLavoro)) return;
  zonaCompletata = true;
  const cambiata = await completaZona({ avanzamento: scriviZona, chiusa: () => false }).catch(() => false);
  if (cambiata) ridisegna();
}
import { creaFaunaHome } from './faunaHome.js';
import { creaFoglioVia } from './foglioVia.js';

// Italia intera: la vista di riserva quando non c'è né la posizione né una vista salvata
const LIMITI_ITALIA = [[36.4, 6.6], [47.1, 18.6]];

// Alla prima apertura la mappa va sulla mia posizione (se il telefono la dà): un punto con l'alone,
// senza seguire né tenere acceso lo schermo (per quello c'è il pulsante GPS). Se non c'è la posizione
// resta l'ultima vista salvata, e senza nemmeno quella l'Italia intera. true se ci prova.
let giaCentrata = false;
function centraSuDiMe(mappa) {
  if (giaCentrata || !navigator.geolocation) return false;
  giaCentrata = true;
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      miaPosizione = [coords.longitude, coords.latitude];
      if (!mappa.getContainer().isConnected) return;
      mappa.setView([coords.latitude, coords.longitude], 13);
      mappa.mostraPosizione?.(coords);
    },
    () => {
      // niente posizione: l'ultima vista salvata, altrimenti l'Italia intera
      if (!mappa.vistaRitrovata && mappa.getContainer().isConnected) mappa.fitBounds(LIMITI_ITALIA, { padding: [10, 10] });
    },
    { enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 },
  );
  return true;
}

// Ricerca in alto: parchi (subito, dall'elenco dell'app) e luoghi (Nominatim, quando si preme Cerca)
function collegaRicercaLuogo(modulo, mappa, sceltoParco) {
  const campo = modulo.querySelector('input');
  const elenco = modulo.querySelector('.risultati-luogo');
  let risultati = [];
  const chiudi = () => {
    elenco.hidden = true;
    elenco.innerHTML = '';
  };
  const mostra = (voci, nota = '') => {
    risultati = voci;
    elenco.innerHTML =
      voci
        .map(
          (v, i) => `<li><button type="button" data-i="${i}">${v.parco ? ICONE.parco : ICONE.segnaposto}<span><b>${escapeHtml(v.nome)}</b>${v.dettaglio ? `<span class="tenue piccolo">${escapeHtml(v.dettaglio)}</span>` : ''}</span><span class="tipo-risultato ${v.parco ? 'parco' : 'luogo'}">${v.parco ? 'Parco' : 'Luogo'}</span></button></li>`,
        )
        .join('') + (nota ? `<li class="tenue piccolo nota-luogo">${escapeHtml(nota)}</li>` : '');
    elenco.hidden = !voci.length && !nota;
  };
  const parchiDi = (testo) => risultatiOrdinati(testo, parchiCercati(testo, PARCHI.filter((p) => !p.zona)), []);
  campo.addEventListener('input', () => {
    const parchi = parchiDi(campo.value);
    if (campo.value.trim()) mostra(parchi, 'Premi Cerca per i luoghi');
    else chiudi();
  });
  modulo.addEventListener('submit', async (e) => {
    e.preventDefault();
    const testo = campo.value.trim();
    if (!testo) return;
    campo.blur();
    const parchi = parchiDi(testo);
    mostra(parchi, 'Cerco…');
    try {
      const r = await fetch(urlLuoghi(testo), { headers: { Accept: 'application/json' } });
      const luoghi = luoghiDallaRisposta(r.ok ? await r.json() : []);
      // un paese con il nome esatto prima dei parchi che lo contengono nel nome
      const tutti = risultatiOrdinati(testo, parchi.map((x) => x.parco), luoghi);
      mostra(tutti, tutti.length ? '' : 'Nessun luogo trovato in Italia');
    } catch {
      mostra(parchi, 'Ricerca dei luoghi non disponibile ora');
    }
  });
  elenco.addEventListener('click', (e) => {
    const v = risultati[Number(e.target.closest('[data-i]')?.dataset.i)];
    if (!v) return;
    chiudi();
    if (v.parco) {
      campo.value = v.nome;
      return sceltoParco(v.parco);
    }
    campo.value = v.nome;
    sceltoParco(null);
    if (v.riquadro) mappa.fitBounds([[v.riquadro[0], v.riquadro[1]], [v.riquadro[2], v.riquadro[3]]], { maxZoom: 14 });
    else mappa.setView([v.lat, v.lon], 14);
  });
  const fuori = (e) => {
    if (!modulo.contains(e.target)) chiudi();
  };
  document.addEventListener('pointerdown', fuori);
  return () => document.removeEventListener('pointerdown', fuori);
}

// Tracce "di sfondo" quando non c'è una ricerca: discrete, per non affollare la mappa
// I nostri percorsi (segnati, dall'archivio o dalla zona cercata): viola pieno con un bordo chiaro
// (scuro sulle basi scure), così si distinguono dai sentieri non segnati e restano leggibili sopra
// la heatmap. Con una ricerca o dei filtri prendono il colore dello stato (da fare / fatto).
const STILE_PERCORSI = { color: COLORI.traccia, weight: 3, opacity: 0.9 };
const coloreBordo = () => (['scura', 'satellite'].includes(stato.leggi().base) ? 'rgba(11,16,18,0.85)' : 'rgba(255,255,255,0.9)');

// Riquadro di un parco, o di tutti i parchi
export function limitiParco(idParco) {
  const parchi = idParco ? [parcoDa(idParco)].filter(Boolean) : PARCHI;
  const b = L.latLngBounds([]);
  for (const p of parchi) b.extend([[p.bbox[0], p.bbox[1]], [p.bbox[2], p.bbox[3]]]);
  return b;
}

export const COLORI_STATO = {
  da_fare: COLORI.traccia,
  fatto: COLORI.tracciaFatta,
};

const sopra = (x) => (x.sentiero.stato === 'fatto' ? 0 : 1);

// La pagina iniziale: la mappa a tutto schermo, centrata su di me alla prima apertura.
// In alto la ricerca (luoghi e parchi); in basso "Percorsi qui" (elenco con i filtri, in un foglio)
// e la matita per disegnare. idParco (#/?parco=…): la mappa sul parco, con il suo confine.
export async function vistaMappaGenerale(app, idParco = null) {
  const [tutti, tracce] = await Promise.all([tuttiISentieri(), tutteLeTracce()]);
  // i percorsi dei parchi e quelli della zona cercata fuori dai parchi (ex "Intorno a me")
  const sentieri = tutti;
  if (idParco && parcoDa(idParco) && !parcoDa(idParco).zona) {
    stato.imposta({ parco: idParco });
    // l'indirizzo torna quello della mappa: togliendo il filtro del parco, ricaricando non ritorna
    history.replaceState(null, '', '#/');
  }
  const filtri = leggiFiltri();

  document.body.classList.add('con-mappa', 'home-mappa');
  app.innerHTML = `
    <div id="mappa" class="mappa mappa-home"></div>
    <form class="cerca-luogo" role="search">
      <label class="ricerca">${ICONE.cerca ?? ''}<input type="search" name="luogo" placeholder="Luogo o parco" aria-label="Cerca un luogo o un parco" autocomplete="off" enterkeyhint="search" /></label>
      <ul class="risultati-luogo" hidden></ul>
    </form>
    <div class="avviso-bozza" id="avvisoBozza" role="status" hidden>
      <b>Bozza in sospeso</b>
      <span class="tenue piccolo">Un percorso che stavi disegnando</span>
      <span class="azioni-bozza"><button type="button" class="bottone primario" data-bozza="riprendi">Riprendi</button><button type="button" class="bottone" data-bozza="elimina">Elimina</button></span>
    </div>
    <button type="button" class="pill-mappa cerca-zona" id="cercaZona" hidden>${ICONE.cerca}<span>Cerca percorsi qui</span></button>
    <div class="home-sotto">
      <button type="button" class="pill-mappa" id="apriSuggerisci">${ICONE.bussola}<span>Suggerisci</span></button>
      <button type="button" class="pill-mappa" id="apriElenco" aria-expanded="false" aria-controls="foglioElenco">${ICONE.percorso}<span>Percorsi qui</span><b id="contaQui"></b></button>
      <a class="pill-mappa tondo" href="#/percorso-nuovo" aria-label="Disegna un percorso">${ICONE.matita ?? '✎'}</a>
    </div>
    <div class="cornice-tendina">
    <section class="foglio-home" id="foglioElenco" hidden aria-label="Percorsi nella zona">
      <button type="button" class="foglio-maniglia-zona" aria-label="Trascina per aprire o abbassare l'elenco"><span class="foglio-maniglia"></span></button>
      <div class="foglio-home-corpo">
        <div id="testaParco"></div>
        <div id="zonaVuota" aria-live="polite"></div>
        <div class="mappa-barra">
          ${htmlSelettoreAttivita({ titolo: false })}
          ${htmlFiltri(sentieri, filtri)}
          <div class="riassunto-mappa" id="riassuntoFiltri"></div>
          <p class="avviso-vuoto" id="nessunRisultato" hidden>Nessun percorso con traccia corrisponde ai filtri.
            <button type="button" class="link" data-azione="reimposta">Reimposta filtri</button></p>
        </div>
        <section class="pannello">
          <h2 class="titolo-sezione" id="titoloRisultati"></h2>
          <div class="ordina-elenco" role="radiogroup" aria-label="Ordine dei percorsi">
            <button type="button" role="radio" data-ordine="consigliato">Consigliato</button>
            <button type="button" role="radio" data-ordine="vicini">${ICONE.navigazione}Partenza più vicina</button>
          </div>
          <p class="tenue piccolo" id="notaOrdine" hidden></p>
          <ul class="risultati-mappa" id="risultatiMappa"></ul>
          <details class="senza-traccia-zona" id="boxSenza" hidden>
            <summary class="tenue" id="titoloSenza"></summary>
            <ul class="senza-traccia" id="senzaTraccia"></ul>
          </details>
        </section>
      </div>
    </section>
    </div>
  `;

  const mappa = creaMappa(app.querySelector('#mappa'), { livelli: ['heatmap', 'distribuzione', 'percorsi', 'uscite', 'confini', 'gps'], ricorda: 'mappa' });
  const confini = L.layerGroup();
  // confini di tutti i parchi (dal telefono o dal file dell'app, senza aspettare Overpass)
  for (const parco of PARCHI) ottieniConfine(parco).then((c) => disegnaConfine(c).addTo(confini)).catch(() => {});
  mappa.suLivello('confini', (acceso) => (acceso ? confini.addTo(mappa) : confini.remove()));
  const livello = L.layerGroup();
  mappa.suLivello('percorsi', (acceso) => (acceso ? livello.addTo(mappa) : livello.remove()));
  // sentieri già collegati alle uscite delle associazioni
  const uscite = creaLivelloUscite(mappa, { coloreBordo });
  uscite.aggiorna(tutti, tracce);
  mappa.suLivello('uscite', (acceso) => (acceso ? uscite.gruppo.addTo(mappa) : uscite.gruppo.remove()));
  // area toccabile di ogni traccia: l'elenco dei risultati la "tocca" per evidenziarla
  const aree = new Map();
  // confine del parco scelto: sempre visibile e più marcato (si scarica se manca)
  const confineScelto = L.layerGroup().addTo(mappa);
  let parcoMostrato = null;
  function mostraConfineScelto(idParco) {
    if (idParco === parcoMostrato) return;
    parcoMostrato = idParco;
    confineScelto.clearLayers();
    const parco = parcoDa(idParco);
    if (!parco) return;
    ottieniConfine(parco)
      .then((confine) => {
        if (parcoMostrato !== idParco) return;
        disegnaConfine(confine, { scelto: true }).addTo(confineScelto);
      })
      .catch(() => {}); // senza rete il riquadro del parco basta per inquadrarlo
  }
  // margini per inquadrare: sotto la ricerca in alto e sopra il foglio dell'elenco, se è aperto
  const margini = (m) => {
    const foglio = app.querySelector('#foglioElenco');
    // la parte visibile della tendina (può essere spostata in basso, sotto la barra)
    const sotto = foglio && !foglio.hidden ? Math.max(70, mappa.getContainer().getBoundingClientRect().bottom - foglio.getBoundingClientRect().top) : 70;
    return { paddingTopLeft: [m, m + 50], paddingBottomRight: [m, sotto + m] };
  };
  let visibili = [];
  let primaVolta = true;
  let restaQui = false; // il prossimo cambio di filtri non sposta la mappa (es. tolto il parco per un luogo)
  let zonaSalvata = null; // l'ultima zona cercata fuori dai parchi (la legge più sotto)
  // alla prima apertura (non tornando sulla mappa) e senza un parco scelto: la mappa su di me
  const centrataSuDiMe = !idParco && centraSuDiMe(mappa);



  const fermaGps = aggiungiGps(mappa, () => (visibili.length ? { geojson: unisciGeometrie(visibili) } : null));
  const misura = aggiungiMisura(mappa, () => visibili.map((t) => t.geojson));
  const avv = aggiungiAvvistamenti(mappa, { filtro: (a) => !filtri.parco || a.parco === filtri.parco });
  // tocco su una traccia: evidenziata, inquadrata (senza cambiare l'elenco) e con il suo riquadro
  const toccabili = percorsiToccabili(mappa, {
    occupata: () => misura.attiva() || avv.attiva() || Boolean(mappa.strumento),
    inquadra: true,
    primaDiInquadrare: () => (saltaSpostamento = true),
    dopoInquadrare: () => (saltaSpostamento = false),
    extra: (s) => htmlUsciteDelSentiero(uscite.usciteDi(s.id)),
    // sotto un sentiero dell'archivio possono passare altri itinerari (es. il Sentiero Italia)
    altriItinerari: (latlng) => foglioVia.apri(latlng, mappa.sentieroVicino?.(latlng)),
  });
  aggiungiDistribuzione(mappa);
  // un foglio alla volta: aprendo l'elenco si nasconde la fauna (e viceversa)
  let mostraFoglio = null;
  // fauna come in "Intorno a me": gruppi di animali scelti e "Cosa vedere qui" nella zona inquadrata
  const fauna = creaFaunaHome(app, mappa, {
    allApertura: () => {
      mostraFoglio?.(false);
      suggerisci?.chiudi();
    },
    apriElenco: () => mostraFoglio?.(true),
  });
  // "Suggeriscimi": una tendina sua; aprendola si chiudono le altre
  let suggerisci = null;
  const heat = aggiungiHeatmap(mappa, {
    occupata: () => misura.attiva() || avv.attiva() || Boolean(mappa.strumento),
    intorno: true,
    personalizza: fauna.personalizza,
    pannelloIn: fauna.pannello,
    riapriPannello: () => fauna.riapri(),
  });
  fauna.collega(heat);
  // tocco su un sentiero qualsiasi (non nostro): foglio con i dati di OpenStreetMap. I nostri percorsi
  // hanno la precedenza (il loro foglio, con i nostri dati); con la fauna accesa i tocchi sono suoi
  const foglioVia = creaFoglioVia(mappa);
  mappa.on('click', (e) => {
    if (misura.attiva() || avv.attiva() || mappa.strumento) return;
    if (mappa.percorsoVicino?.(e.latlng) || heat.attiva()) return foglioVia.chiudi();
    const dalleTile = mappa.sentieroVicino?.(e.latlng);
    if (dalleTile) foglioVia.apri(e.latlng, dalleTile);
    else foglioVia.chiudi();
  });
  // "Percorsi da qui": tra i percorsi con i filtri e la modalità scelti
  let filtratiOra = [];
  const daQui = aggiungiDaQui(mappa, () => filtratiOra, { attenua: true, creaAnelloDaQui: (punto) => suggerisci?.apriAnelloDa(punto) });

  const preparati = preparaPercorsi(sentieri, tracce);
  // l'elenco "Nella zona inquadrata" segue la mappa: si aggiorna quando la si sposta o ingrandisce
  let inMappa = [];
  let senzaTracciaOra = []; // senza traccia con i filtri attivi (tutti i parchi)
  let saltaSpostamento = false; // lo spostamento fatto per inquadrare un percorso scelto non cambia l'elenco
  // l'elenco si scrive solo con il foglio aperto (il numero sul pulsante sempre): chiuso, si rifà
  // quando si apre
  let elencoVecchio = false;
  function elencoInVista() {
    if (!app.isConnected || !mappa._loaded || !mappa._mapPane) return; // schermata già chiusa
    const vista = mappa.getBounds();
    let qui = inMappa.filter(({ sentiero }) => aree.get(sentiero.id)?.getBounds().intersects(vista));
    // partenza più vicina a me (se la posizione c'è): distanza dall'inizio (o dalla fine) della traccia
    const vicini = ordineElenco === 'vicini' && miaPosizione;
    if (vicini) {
      qui = qui
        .map((p) => ({ ...p, distanza: distanzaDiPartenza(p.sentiero, p.traccia, miaPosizione, Infinity) }))
        .sort((a, b) => a.distanza.metri - b.distanza.metri);
    }
    for (const b of app.querySelectorAll('[data-ordine]')) {
      const on = b.dataset.ordine === (vicini ? 'vicini' : 'consigliato');
      b.classList.toggle('attivo', on);
      b.setAttribute('aria-checked', String(on));
    }
    const conta = app.querySelector('#contaQui');
    if (conta) conta.textContent = qui.length ? String(qui.length) : '';
    if (app.querySelector('#foglioElenco')?.hidden) {
      elencoVecchio = true;
      return;
    }
    elencoVecchio = false;
    senzaTracciaInVista();
    // zona vuota: niente titolo né ordine, subito cosa fare (htmlZonaVuota)
    app.querySelector('#titoloRisultati').textContent = inMappa.length && qui.length
      ? `Nella zona inquadrata (${qui.length}${qui.length < inMappa.length ? ` su ${inMappa.length}` : ''})`
      : '';
    app.querySelector('.ordina-elenco').hidden = !qui.length;
    const tipoQui = tipoZonaOra(qui.length);
    app.querySelector('#risultatiMappa').innerHTML =
      qui
        .slice(0, 60)
        .map(({ sentiero: s, traccia, distanza }) => {
          // stessa scheda degli elenchi, compatta: foto (o disegno della traccia), nome, tre numeri, fauna
          const m = misureSentiero(s, traccia);
          const foto = copertina(s, traccia);
          const dati = [
            m.km != null ? `<span>${ICONE.percorso}${m.km.toFixed(1).replace('.', ',')} km</span>` : '',
            m.salita != null ? `<span>${ICONE.salita}${m.salita} m</span>` : '',
            m.quotaMax != null ? `<span class="quota-max">max ${migliaia(m.quotaMax)} m</span>` : '',
            m.durataMin != null ? `<span>${ICONE.orologio}${durata(m.durataMin)}</span>` : '',
          ].join('');
          return `<li><button type="button" class="risultato-carta" data-id="${escapeHtml(s.id)}">
            <span class="ris-foto">${foto ? `<img src="${escapeHtml(foto.url)}" alt="" loading="lazy" decoding="async" />` : miniatura(traccia, s.stato)}</span>
            <span class="ris-corpo">
              <span class="nome">${s.codici?.length ? `<span class="codice">${escapeHtml(codici(s))}</span> ` : ''}${escapeHtml(s.nome)}</span>
              ${distanza && Number.isFinite(distanza.metri) ? `<span class="nota-partenza">${escapeHtml(testoPartenza(distanza))}</span>` : ''}
              ${dati ? `<span class="dati-icone">${dati}</span>` : ''}
              ${htmlFaunaBreve(s, { compatta: true })}
            </span>
          </button></li>`;
        })
        .join('') +
      (qui.length > 60 ? `<li class="tenue piccolo">e altri ${qui.length - 60}: avvicinati sulla mappa o usa i filtri</li>` : '') +
      (tipoQui === 'pochi' ? `<li>${htmlZonaVuota(qui.length, tipoQui)}</li>` : '');
    // zona vuota: il perché e cosa fare stanno in cima alla tendina, ben visibili anche a metà
    app.querySelector('#zonaVuota').innerHTML = tipoQui === 'vuota' || tipoQui === 'filtri' ? htmlZonaVuota(qui.length, tipoQui) : '';
  }
  const tipoZonaOra = (quanti) => tipoZona({ qui: quanti, altre: inMappa.length - quanti, filtri: filtriAttivi(filtri) > 0 || Boolean(filtri.parco) || stato.leggi().attivita !== 'trekking' });
  // zona senza risultati: dice perché e propone cosa fare (src/lib/zonaVuota.js)
  function htmlZonaVuota(quanti, tipo) {
    if (tipo === 'filtri') {
      return `<div class="zona-vuota"><p><b>${escapeHtml(testoNessunoQui(inMappa.length - quanti))}</b></p>
        <div class="azioni-vuota"><button type="button" class="bottone primario" data-azione="vai-vicino">Vai al più vicino</button><button type="button" class="bottone" data-azione="togli-filtri">Togli i filtri</button></div></div>`;
    }
    if (tipo === 'ok') return '';
    // zona vuota o con pochi percorsi: cosa si può fare qui
    const c = mappa.getCenter();
    const cercabile = zonaDaCercare([c.lng, c.lat], mappa.getZoom(), { zona: zonaSalvata, parchi: PARCHI });
    const cercata = !cercabile && zonaSalvata?.centro && distanzaKm([c.lng, c.lat], zonaSalvata.centro) <= zonaSalvata.raggioKm ? testoZonaCercata(zonaSalvata) : '';
    return `<div class="zona-vuota"><p><b>${quanti ? 'Pochi percorsi in questa zona' : 'Nessun percorso in questa zona'}</b></p>
      <div class="azioni-vuota">
        ${cercabile ? `<button type="button" class="bottone primario" data-azione="cerca-qui">${ICONE.cerca}<span>Cerca percorsi qui</span></button>` : ''}
        <button type="button" class="bottone${cercabile ? '' : ' primario'}" data-azione="anello-qui">${ICONE.anello}<span>Crea un anello da qui</span></button>
        <a class="bottone" href="#/percorso-nuovo">${ICONE.matita}<span>Disegna un percorso</span></a>
        <button type="button" class="bottone" data-azione="importa-gpx">${ICONE.carica}<span>Importa file</span></button>
      </div>
      ${cercata ? `<p class="tenue piccolo">${escapeHtml(cercata)}</p>` : ''}
      ${mappa.getZoom() < ZOOM_SENTIERI_NON_SEGNATI ? '<p class="tenue piccolo">Avvicinati per vedere carrarecce e sentieri non segnati.</p>' : ''}
    </div>`;
  }
  // le foto di copertina arrivano dopo: quando ci sono, l'elenco si ridisegna
  if (!copertineCaricate()) caricaDaVedere().then((d) => d && app.isConnected && elencoInVista());
  mappa.dopoIlMovimento(
    'elenco della zona',
    () => {
      if (saltaSpostamento) {
        saltaSpostamento = false;
        return;
      }
      elencoInVista();
    },
    { priorita: 1 },
  );

  function disegna() {
    mostraConfineScelto(filtri.parco);
    filtratiOra = filtraPercorsi(preparati, filtri, stato.leggi().attivita);
    const filtrati = filtratiOra.map((p) => p.sentiero);
    const { conTraccia, senzaTraccia } = dividiPerTraccia(filtrati, tracce);
    visibili = conTraccia.map((x) => x.traccia);

    livello.clearLayers();
    aree.clear();
    toccabili.pulisci();
    mappa.closePopup();
    // senza ricerca né filtri le tracce restano discrete; con una ricerca si evidenziano i risultati
    const ricerca = filtriAttivi(filtri) > 0 || stato.leggi().attivita !== 'trekking';
    mappa.attenuaSentieri(ricerca && conTraccia.length > 0);
    // prima i "fatto", così i "da fare" restano sopra e ben visibili
    for (const { sentiero, traccia: grezza } of [...conTraccia].sort((a, b) => sopra(a) - sopra(b))) {
      // i pezzi a meno di 50 m si disegnano uniti
      const traccia = grezza.geojson ? { ...grezza, geojson: geojsonUnito(grezza.geojson) } : grezza;
      const colore = COLORI_STATO[sentiero.stato] ?? COLORI_STATO.da_fare;
      // con la traccia anche un'area larga e invisibile: un tocco la evidenzia e apre il riquadro
      const stile = ricerca ? { color: colore, weight: 3.5, opacity: 0.9 } : STILE_PERCORSI;
      // bordo sotto la linea (stesso tracciato, più largo)
      L.geoJSON(traccia.geojson, { style: { color: coloreBordo(), weight: stile.weight + 3, opacity: 0.85 }, interactive: false }).addTo(livello);
      const { area } = toccabili.disegna(livello, sentiero, traccia, stile, colore);
      aree.set(sentiero.id, area);
    }
    // i filtri non spostano mai la mappa: filtrano la zona inquadrata. La mappa si sposta solo su richiesta
    // (ricerca, "Vai al più vicino", parco scelto, tocco su un percorso) e alla prima apertura
    if (restaQui) restaQui = false;
    else if (primaVolta && !centrataSuDiMe) mappa.fitBounds(filtri.parco ? limitiParco(filtri.parco) : LIMITI_ITALIA, margini(20));
    primaVolta = false;
    app.querySelector('#nessunRisultato').hidden = !(ricerca && conTraccia.length === 0);

    testaParco();

    app.querySelector('#riassuntoFiltri').textContent = testoRiassunto(conTraccia.length, filtriAttivi(filtri) > 0 || Boolean(filtri.parco));

    inMappa = conTraccia;
    senzaTracciaOra = senzaTraccia;
    elencoInVista();
  }

  // percorsi senza traccia (non sono sulla mappa): solo quelli della zona inquadrata o del parco,
  // in un riquadro chiuso
  function senzaTracciaInVista() {
    const b = mappa.getBounds();
    const qui = senzaTracciaNellaZona(senzaTracciaOra, [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()], {
      parco: filtri.parco,
      riquadroParco: (id) => parcoDa(id)?.bbox ?? null,
    });
    const box = app.querySelector('#boxSenza');
    box.hidden = !qui.length;
    app.querySelector('#titoloSenza').textContent = `Senza traccia in questa zona (${qui.length})`;
    app.querySelector('#senzaTraccia').innerHTML = qui
      .map(
        (s) => `<li>
          <span>${s.codici?.length ? `<span class="codice">${escapeHtml(codici(s))}</span> ` : ''}${escapeHtml(s.nome)}</span>
          <a href="#/sentiero/${encodeURIComponent(s.id)}/mappa">Recupera traccia</a>
        </li>`,
      )
      .join('');
  }

  const controlli = collegaFiltri(app.querySelector('.filtri'), sentieri, filtri, disegna);
  const scollegaAttivita = collegaSelettoreAttivita(app);
  app.querySelector('#risultatiMappa').addEventListener('click', (e) => {
    const azione = e.target.closest('[data-azione]')?.dataset.azione;
    if (azione === 'vai-vicino') return vaiAlPiuVicino();
    if (azione === 'togli-filtri') return togliIFiltri();
    if (azione === 'cerca-qui') return app.querySelector('#cercaZona').click();
    if (azione === 'anello-qui') {
      const c = mappa.getCenter();
      return suggerisci?.apriAnelloDa([Math.round(c.lng * 1e5) / 1e5, Math.round(c.lat * 1e5) / 1e5]);
    }
    if (azione === 'importa-gpx') return avviaImportazione();
    const id = e.target.closest('[data-id]')?.dataset.id;
    aree.get(id)?.fire('click');
  });
  // su richiesta: la mappa va al percorso più vicino (con gli stessi filtri), intero e senza zoomare troppo
  function vaiAlPiuVicino() {
    const c = mappa.getCenter();
    const v = piuVicino([c.lng, c.lat], inMappa.map(({ sentiero, traccia }) => ({ id: sentiero.id, geojson: traccia.geojson })));
    const area = v && aree.get(v.id);
    if (!area) return;
    mappa.sbloccaInquadrature?.();
    mappa.fitBounds(area.getBounds(), { ...margini(30), maxZoom: 14 });
  }
  function togliIFiltri() {
    controlli.azzera();
    stato.imposta({ parco: '', attivita: 'trekking' });
  }
  app.querySelector('#nessunRisultato').addEventListener('click', (e) => {
    if (e.target.closest('[data-azione="reimposta"]')) controlli.azzera();
  });
  requestAnimationFrame(() => mappa.invalidateSize());

  // ordine dell'elenco: "Partenza più vicina" chiede la posizione se non c'è ancora
  app.querySelector('.ordina-elenco').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ordine]');
    if (!b) return;
    const nota = app.querySelector('#notaOrdine');
    nota.hidden = true;
    if (b.dataset.ordine === 'vicini' && !miaPosizione) {
      nota.textContent = 'Cerco la tua posizione…';
      nota.hidden = false;
      if (!(await chiediPosizione())) {
        nota.textContent = 'Posizione non disponibile: attivala per ordinare per distanza.';
        return;
      }
      nota.hidden = true;
    }
    ordineElenco = b.dataset.ordine;
    elencoInVista();
  });

  // foglio "Percorsi qui": si apre dal pulsante in basso, si chiude con la maniglia
  const foglio = app.querySelector('#foglioElenco');
  const apri = app.querySelector('#apriElenco');
  // tendina a tre posizioni (chiusa, metà, aperta): si trascina dalla maniglia o dalla lista in cima
  const tendina = tendinaTrascinabile(foglio, { corpo: '.foglio-home-corpo', allaChiusura: () => mostraFoglio(false) });
  suggerisci = creaSuggeriscimi(app, mappa, {
    sentieri: tutti,
    tracce,
    posizione: () => miaPosizione,
    allApertura: () => mostraFoglio(false),
  });
  app.querySelector('#apriSuggerisci').addEventListener('click', () => (suggerisci.aperto() ? suggerisci.chiudi() : suggerisci.apri()));
  // tornando indietro dalla pagina di un sentiero aperto da Suggerisci: la lista com'era
  requestAnimationFrame(() => suggerisci.riprendi());
  mostraFoglio = (si) => {
    if (si) suggerisci?.chiudi();
    const cambia = foglio.hidden === si;
    foglio.hidden = !si;
    if (si && elencoVecchio) elencoInVista();
    if (cambia) si ? tendina.apri('meta') : tendina.chiudi();
    apri.setAttribute('aria-expanded', String(si));
    document.body.classList.toggle('elenco-aperto', si);
  };
  apri.addEventListener('click', () => mostraFoglio(foglio.hidden));
  // un tocco sulla mappa abbassa la tendina a metà
  mappa.on('click', () => !foglio.hidden && tendina.posizione() === 'aperta' && tendina.vai('meta'));
  // scegliendo un percorso dall'elenco il foglio si chiude e la mappa lo mostra
  app.querySelector('#risultatiMappa').addEventListener('click', (e) => {
    if (e.target.closest('[data-id]') && suTelefono()) mostraFoglio(false);
  });
  if (idParco) {
    // dall'elenco dei parchi: il foglio con il parco e la mappa sul parco, sopra il foglio
    mostraFoglio(true);
    mappa.sbloccaInquadrature?.();
    mappa.fitBounds(limitiParco(idParco), margini(20));
  }

  // intestazione del foglio quando c'è un parco scelto: nome, descrizione e la sua pagina
  function testaParco() {
    const p = parcoDa(filtri.parco);
    app.querySelector('#testaParco').innerHTML =
      p && !p.zona
        ? `<div class="testa-parco"><h2>${escapeHtml(p.nome)}</h2>${p.descrizione ? `<p class="tenue">${escapeHtml(p.descrizione)}</p>` : ''}<a href="#/parco/${encodeURIComponent(p.id)}">Pagina del parco ›</a></div>`
        : '';
  }
  testaParco();

  // fuori dai parchi: "Cerca percorsi qui" scarica i percorsi della zona inquadrata
  const bottoneZona = app.querySelector('#cercaZona');
  zonaSalvata = await leggiIntorno();
  elencoInVista(); // ora si sa se la zona è già stata cercata
  const aggiornaBottoneZona = () => {
    // la mappa può essere già chiusa (si è passati a un'altra schermata)
    if (testoZona || !bottoneZona.isConnected || !mappa._loaded) return;
    const c = mappa.getCenter();
    bottoneZona.hidden = !zonaDaCercare([c.lng, c.lat], mappa.getZoom(), { zona: zonaSalvata, parchi: PARCHI });
  };
  rivalutaBottone = async () => {
    zonaSalvata = await leggiIntorno();
    elencoInVista();
    if (bottoneZona.isConnected) aggiornaBottoneZona();
  };
  mappa.dopoIlMovimento('pulsante «Cerca percorsi qui»', aggiornaBottoneZona, { priorita: 2 });

  // la matita e «Disegna un percorso»: il disegno si apre con la vista di questa mappa
  app.addEventListener('click', (e) => {
    if (e.target.closest('a[href="#/percorso-nuovo"]')) impostaAperturaDisegno(aperturaDaMappa(mappa));
  });

  // una bozza del disegno rimasta salvata: avviso con "Riprendi" ed "Elimina"
  const avvisoBozza = app.querySelector('#avvisoBozza');
  const aggiornaBozza = () => (avvisoBozza.hidden = (leggiBozza()?.punti?.length ?? 0) === 0);
  aggiornaBozza();
  avvisoBozza.addEventListener('click', (e) => {
    const azione = e.target.closest('[data-bozza]')?.dataset.bozza;
    if (azione === 'riprendi') {
      impostaAperturaDisegno('bozza');
      location.hash = '#/percorso-nuovo';
    }
    else if (azione === 'elimina' && confirm('Eliminare la bozza del percorso che stavi disegnando?')) {
      cancellaBozza();
      aggiornaBozza();
    }
  });
  aggiornaBottoneZona();
  bottoneZona.addEventListener('click', () => {
    const c = mappa.getCenter();
    // i percorsi della zona non sono di un parco: il filtro del parco li nasconderebbe
    if (filtri.parco) {
      restaQui = true;
      stato.imposta({ parco: '' });
    }
    avviaZona([Math.round(c.lng * 1e4) / 1e4, Math.round(c.lat * 1e4) / 1e4], raggioPerZoom(mappa.getZoom()));
  });
  if (testoZona) scriviZona(testoZona);
  // una zona scaricata prima ma senza dislivelli o fauna: si completa con calma
  if (zonaSalvata && !zonaCompletata) avviaCompletamento();

  // cambiando mappa di base (chiara/scura) il bordo delle tracce cambia colore
  let baseDisegnata = stato.leggi().base;
  const scollegaBase = stato.ascolta((st) => {
    if (st.base === baseDisegnata) return;
    baseDisegnata = st.base;
    restaQui = true;
    disegna();
    uscite.ridisegna();
  });

  const scollegaRicerca = collegaRicercaLuogo(app.querySelector('.cerca-luogo'), mappa, (parco) => {
    if (!parco) {
      // un luogo (non un parco): via il filtro del parco, si vede tutto quello che c'è lì
      if (filtri.parco) {
        restaQui = true;
        stato.imposta({ parco: '' });
      }
      return;
    }
    // i filtri seguono lo stato condiviso: elenco, confine e inquadratura si aggiornano da soli
    // (prima si apre il foglio, così il parco si inquadra nella parte di mappa che resta visibile)
    mostraFoglio(true);
    stato.imposta({ parco: parco.id });
    mappa.sbloccaInquadrature?.();
    mappa.fitBounds(limitiParco(parco.id), margini(20));
  });

  return () => {
    scollegaRicerca();
    scollegaBase();
    fauna.chiudi();
    document.body.classList.remove('home-mappa', 'elenco-aperto');
    fermaGps();
    heat.rimuovi();
    daQui.chiudi();
    controlli.scollega();
    scollegaAttivita();
    mappa.remove();
    document.body.classList.remove('con-mappa');
  };
}
