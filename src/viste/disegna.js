// Modalità disegno: tocco la mappa e il percorso segue i sentieri (BRouter, tratto per tratto), oppure
// a mano libera. In basso sempre distanza, dislivello, tempo (quote TINITALY, metodo CAI), profilo e
// acqua e rifugi entro 300 m; tirando su la barra il profilo grande e i punti con il km.
// Punti: trascinare = spostare; tocco = menu (Togli / Sposta); pressione lunga = togliere.
import L from 'leaflet';
import { tendinaTrascinabile, finestraTrascinabile } from './tendina.js';
import { leggiPercorso, salvaPercorso } from '../db.js';
import { calcolaPercorso } from '../lib/brouter.js';
import { nuovoIdPercorso } from '../lib/percorso.js';
import { leggiBozza, salvaBozza, cancellaBozza } from '../lib/bozza.js';
import { normalizzaPunti, chiaveTratto, trattoLibero, unisciTratti, unisciTerreno, chiudiAnello, eAnello, inverti, profiloPezzi, puntoAlKm } from '../lib/disegno.js';
import { misureDeiPezzi, km1 } from '../lib/lungoIlPercorso.js';
import { puntiLungoIlPercorso, riassuntoPunti, RAGGIO_LUNGO_IL_PERCORSO_M } from '../lib/puntiUtili.js';
import { leggiGpx } from '../lib/gpx.js';
import { creaGpx, nomeFileGpx } from '../lib/gpxScrittura.js';
import { escapeHtml, durata } from '../lib/formato.js';
import { creaMappa } from './mappa.js';
import { aggiungiGps } from './gps.js';
import { aggiungiHeatmap } from './heatmap.js';
import { quoteDeiPezzi, testoFonteQuote } from './quote.js';
import { puntiPerIlPercorso } from './puntiPercorso.js';
import { mostraPuntiLungoIlPercorso } from './puntiUtili.js';
import { ICONE } from './icone.js';
import { tuttiISentieri, tutteLeTracce } from '../db.js';
import { trattiARischio, testiAvvisi, intervalliLiberi, ACCESSI_REGOLATI } from '../lib/avvisiParco.js';
import { puntoNelPoligono } from '../lib/confini.js';
import { PARCHI } from '../datiParchi.js';
import { caricaConfini } from './copertura.js';

// Per gli avvisi: in quale parco cade un punto (confine, o riquadro se manca) e i nostri sentieri ad
// accesso regolato, con la traccia. Si preparano una volta.
let datiAvvisi = null;
function preparaAvvisi() {
  datiAvvisi ??= Promise.all([caricaConfini(), tuttiISentieri(), tutteLeTracce()]).then(([confini, sentieri, tracce]) => {
    const parchi = PARCHI.filter((p) => !p.zona);
    const parcoDi = ([lon, lat]) =>
      parchi.find((p) => (lat >= p.bbox[0] && lat <= p.bbox[2] && lon >= p.bbox[1] && lon <= p.bbox[3] ? (confini[p.id]?.length ? puntoNelPoligono([lon, lat], confini[p.id]) : true) : false)) ?? null;
    const regolati = sentieri
      .filter((x) => ACCESSI_REGOLATI[x.accesso?.tipo] && tracce.get(x.id)?.geojson)
      .map((x) => ({ nome: [x.codici?.join(' + '), x.nome].filter(Boolean).join(' '), accesso: x.accesso.tipo, geojson: tracce.get(x.id).geojson }));
    return { parcoDi, regolati };
  });
  return datiAvvisi;
}

const COLORE = '#0f6e56'; // verde: diverso dal viola dei percorsi dell'archivio
const ATTESA_PUNTI_MS = 1200; // rifugi e acqua si cercano quando il disegno si ferma un attimo

export async function vistaDisegna(app, id = null) {
  const esistente = id ? await leggiPercorso(id) : null;
  // un percorso nuovo riparte dalla bozza (punti messi con "Inizia percorso da qui" / "Aggiungi")
  let punti = normalizzaPunti(esistente?.puntiControllo ?? (esistente ? null : leggiBozza()?.punti));
  let manoLibera = false;
  const tratti = new Map(); // chiave → tratto calcolato (si ricalcola solo quello che cambia)
  let risultato = null; // { linea, terreno, tratti, pezziQuote, fonte, misure }
  let richiesta = 0;
  let puntoDaSpostare = null;
  let chiusa = false;

  document.body.classList.add('con-mappa', 'disegno');
  app.innerHTML = `
    <div id="mappa" class="mappa mappa-disegno"></div>
    <div class="disegno-sopra">
      <a class="pill-mappa tondo" href="${esistente ? `#/percorso/${encodeURIComponent(esistente.id)}` : '#/'}" aria-label="Esci (la bozza resta)">${ICONE.chiudi}</a>
      <div class="disegno-strumenti">
        <button type="button" class="pill-mappa tondo" data-azione="annulla" aria-label="Togli l'ultimo punto" title="Togli l'ultimo punto">${ICONE.indietro}</button>
        <button type="button" class="pill-mappa tondo" data-azione="anello" aria-label="Chiudi ad anello" title="Chiudi ad anello">${ICONE.anello}</button>
        <button type="button" class="pill-mappa tondo" data-azione="inverti" aria-label="Inverti il verso" title="Inverti il verso">${ICONE.inverti}</button>
        <button type="button" class="pill-mappa tondo" data-azione="libera" aria-pressed="false" aria-label="Mano libera" title="Mano libera">${ICONE.matita}</button>
        <button type="button" class="pill-mappa tondo" data-azione="menu" aria-expanded="false" aria-label="Altro" title="Altro">${ICONE.altro}</button>
      </div>
      <div class="disegno-menu" hidden>
        <button type="button" data-azione="importa">${ICONE.carica}<span>Importa GPX</span></button>
        <button type="button" data-azione="esporta">${ICONE.scarica}<span>Esporta GPX</span></button>
        <button type="button" data-azione="ricomincia">${ICONE.cestino}<span>Ricomincia</span></button>
      </div>
      <input type="file" id="fileGpxDisegno" accept=".gpx,application/gpx+xml,application/xml,text/xml" hidden />
    </div>
    <p class="disegno-suggerimento" id="suggerimento" hidden></p>
    <section class="foglio-disegno" aria-label="Il percorso disegnato">
      <button type="button" class="foglio-maniglia-zona" aria-label="Trascina per aprire o abbassare"><span class="foglio-maniglia"></span></button>
      <div class="disegno-numeri" id="numeri"></div>
      <div class="disegno-profilo" id="profilo"></div>
      <p class="disegno-punti" id="riassuntoPunti"></p>
      <div class="disegno-avvisi" id="avvisi"></div>
      <button type="button" class="bottone primario pieno" data-azione="salva">${ICONE.segnalibro}<span>Salva</span></button>
      <div class="disegno-dettagli" id="dettagli"></div>
    </section>
    <dialog class="foglio foglio-salva">
      <div class="foglio-maniglia" aria-hidden="true"></div>
      <h2 class="foglio-titolo">Salva il percorso</h2>
      <label class="campo"><span>Nome</span><input id="nomePercorso" value="${escapeHtml(esistente?.nome ?? '')}" placeholder="es. Anello di Val Fondillo" /></label>
      <p class="tenue piccolo" id="riepilogoSalva"></p>
      <div class="azioni-salva"><button type="button" class="bottone" data-azione="continua">Continua</button><button type="button" class="bottone primario" data-azione="conferma">Salva</button></div>
      <p class="tenue piccolo">Lo ritrovi in I miei percorsi · Disegnati.</p>
    </dialog>
  `;

  const mappa = creaMappa(app.querySelector('#mappa'), { livelli: ['heatmap', 'gps'], ricorda: 'pianifica' });
  const fermaGps = aggiungiGps(mappa, () => null);
  // la fauna si guarda soltanto: i tocchi sulla mappa sono del disegno
  const heat = aggiungiHeatmap(mappa, { occupata: () => true });
  const livelloLinea = L.layerGroup().addTo(mappa);
  const livelloAvvisi = L.layerGroup().addTo(mappa);
  const livelloPunti = L.layerGroup().addTo(mappa);
  const segnaProfilo = L.circleMarker([0, 0], { radius: 7, color: '#fff', weight: 3, fillColor: '#ef9f27', fillOpacity: 1, interactive: false });
  const foglio = app.querySelector('.foglio-disegno');
  // la stessa tendina degli altri fogli, ma resta sempre (la posizione più bassa è metà)
  const tendina = tendinaTrascinabile(foglio, { naturale: true, chiudibile: false, fineMeta: '[data-azione="salva"]' });
  tendina.apri('meta');
  const suggerimento = app.querySelector('#suggerimento');

  function scriviSuggerimento(testo) {
    suggerimento.textContent = testo;
    suggerimento.hidden = !testo;
  }
  function suggerimentoBase() {
    if (puntoDaSpostare != null) return scriviSuggerimento('Tocca la mappa dove spostare il punto');
    if (!punti.length) return scriviSuggerimento('Tocca la mappa per la partenza');
    if (punti.length === 1) return scriviSuggerimento(manoLibera ? 'Mano libera: tocca il prossimo punto' : 'Tocca il prossimo punto: il percorso segue i sentieri');
    scriviSuggerimento(manoLibera ? 'Mano libera: linea dritta fino al prossimo punto' : '');
  }

  // --- punti sulla mappa ---
  function iconaPunto(i) {
    const primo = i === 0;
    const ultimo = i === punti.length - 1 && i > 0;
    return L.divIcon({ className: `punto-disegno${primo ? ' primo' : ''}${ultimo ? ' ultimo' : ''}${punti[i].libero ? ' libero' : ''}`, iconSize: [22, 22], iconAnchor: [11, 11] });
  }
  function disegnaPunti() {
    livelloPunti.clearLayers();
    // in un anello l'ultimo punto è il primo: non si disegna due volte
    const quanti = eAnello(punti) ? punti.length - 1 : punti.length;
    for (let i = 0; i < quanti; i++) {
      const m = L.marker([punti[i].p[1], punti[i].p[0]], { icon: iconaPunto(i), draggable: true, keyboard: false, autoPan: true, bubblingMouseEvents: false }).addTo(livelloPunti);
      m.on('dragend', () => {
        const ll = m.getLatLng();
        spostaPunto(i, [Number(ll.lng.toFixed(6)), Number(ll.lat.toFixed(6))]);
      });
      // pressione lunga (o tasto destro): si toglie
      m.on('contextmenu', (e) => {
        if (e.originalEvent) L.DomEvent.preventDefault(e.originalEvent);
        togliPunto(i);
      });
      // tocco: piccolo menu
      m.on('click', () => {
        L.popup({ className: 'popup-punto-disegno', offset: [0, -8], closeButton: false })
          .setLatLng(m.getLatLng())
          .setContent(`<div class="menu-punto"><button type="button" data-punto="${i}" data-fai="togli">${ICONE.cestino}Togli</button><button type="button" data-punto="${i}" data-fai="sposta">${ICONE.sposta}Sposta</button></div>`)
          .openOn(mappa);
      });
    }
  }
  mappa.getContainer().addEventListener('click', (e) => {
    const b = e.target.closest('[data-fai]');
    if (!b) return;
    const i = Number(b.dataset.punto);
    mappa.closePopup();
    if (b.dataset.fai === 'togli') togliPunto(i);
    else {
      puntoDaSpostare = i;
      suggerimentoBase();
    }
  });

  function spostaPunto(i, nuovo) {
    const anello = eAnello(punti);
    punti[i] = { ...punti[i], p: nuovo };
    // spostando la partenza di un anello si sposta anche l'arrivo
    if (anello && i === 0) punti[punti.length - 1] = { ...punti.at(-1), p: [...nuovo] };
    aggiorna();
  }
  function togliPunto(i) {
    const anello = eAnello(punti);
    punti.splice(i, 1);
    if (anello && i === 0 && punti.length > 1) punti[punti.length - 1] = { ...punti.at(-1), p: [...punti[0].p] };
    if (punti.length) punti[0] = { ...punti[0], libero: false };
    aggiorna();
  }

  mappa.on('click', (e) => {
    const p = [Number(e.latlng.lng.toFixed(6)), Number(e.latlng.lat.toFixed(6))];
    menu.hidden = true;
    if (puntoDaSpostare != null) {
      const i = puntoDaSpostare;
      puntoDaSpostare = null;
      return spostaPunto(i, p);
    }
    // un anello chiuso si riapre togliendo l'arrivo, poi si allunga
    if (eAnello(punti)) punti.pop();
    punti.push({ p, libero: punti.length > 0 && manoLibera });
    aggiorna();
  });

  // --- calcolo ---
  function tratto(a, b) {
    const k = chiaveTratto(a, b, b.libero);
    if (!tratti.has(k)) {
      const calcolo = b.libero
        ? Promise.resolve(trattoLibero(a, b))
        : calcolaPercorso([a.p, b.p]).then((r) => ({ coordinate: r.coordinate.map(([lon, lat]) => [lon, lat]), terreno: r.terreno, libero: false }));
      calcolo.catch(() => tratti.delete(k)); // un tratto non calcolato si riprova
      tratti.set(k, calcolo);
    }
    return tratti.get(k);
  }

  async function aggiorna() {
    if (!esistente) salvaBozza(punti.map((x) => x.p));
    disegnaPunti();
    suggerimentoBase();
    const mia = ++richiesta;
    if (punti.length < 2) {
      risultato = null;
      livelloLinea.clearLayers();
      livelloAvvisi.clearLayers();
      app.querySelector('#avvisi').innerHTML = '';
      app.querySelector('#riassuntoPunti').innerHTML = '';
      app.querySelector('#dettagli').innerHTML = '';
      return mostraBarra();
    }
    mostraBarra('Calcolo il percorso…');
    let fatti;
    try {
      fatti = await Promise.all(punti.slice(1).map((b, i) => tratto(punti[i], b)));
    } catch (e) {
      if (mia === richiesta) mostraBarra(`<span class="errore">${escapeHtml(e.message)}</span>`);
      return;
    }
    if (mia !== richiesta || chiusa) return;
    const linea = unisciTratti(fatti);
    livelloLinea.clearLayers();
    // tratti agganciati pieni, a mano libera tratteggiati
    for (const t of fatti) {
      const ll = t.coordinate.map(([lon, lat]) => [lat, lon]);
      L.polyline(ll, { color: '#fff', weight: 8, opacity: 0.9, interactive: false }).addTo(livelloLinea);
      L.polyline(ll, { color: COLORE, weight: 4.5, opacity: 0.95, dashArray: t.libero ? '8 7' : null, interactive: false }).addTo(livelloLinea);
    }
    risultato = { linea, terreno: unisciTerreno(fatti), tratti: fatti, pezziQuote: null, fonte: null, misure: misureDeiPezzi([linea]) };
    mostraBarra();
    mostraAvvisi(mia);
    // quote (TINITALY) e poi rifugi e acqua: con un attimo di calma, il disegno è veloce
    const { pezzi, fonte } = await quoteDeiPezzi([linea]).catch(() => ({ pezzi: [linea], fonte: null }));
    if (mia !== richiesta || chiusa) return;
    Object.assign(risultato, { pezziQuote: pezzi, fonte, misure: misureDeiPezzi(pezzi) });
    mostraBarra();
    clearTimeout(aggiorna.timer);
    aggiorna.timer = setTimeout(() => mostraPunti(mia), ATTESA_PUNTI_MS);
  }

  // --- barra in basso ---
  function mostraBarra(stato = '') {
    const m = risultato?.misure;
    const numeri = app.querySelector('#numeri');
    numeri.innerHTML = m
      ? `<div><b>${km1(m.km)} km</b><span>distanza</span></div>
         <div><b>${m.salita != null ? `+${m.salita} −${m.discesa}` : '…'}</b><span>dislivello</span></div>
         <div><b>${m.durataMin != null ? durata(m.durataMin) : '–'}</b><span>tempo</span></div>`
      : `<p class="tenue">${stato || (punti.length ? 'Ancora un punto per il percorso' : 'Tocca la mappa per iniziare')}</p>`;
    if (stato && m) numeri.insertAdjacentHTML('beforeend', `<p class="tenue piccolo stato-disegno">${stato}</p>`);
    disegnaProfilo();
    app.querySelector('[data-azione="salva"]').disabled = !m;
  }

  let serieProfilo = [];
  function disegnaProfilo() {
    const box = app.querySelector('#profilo');
    serieProfilo = risultato?.pezziQuote ? profiloPezzi(risultato.pezziQuote) : [];
    if (serieProfilo.length < 2) {
      box.innerHTML = '';
      return;
    }
    const zs = serieProfilo.map((x) => x.z);
    const [min, max] = [Math.min(...zs), Math.max(...zs)];
    const tot = serieProfilo.at(-1).km || 1;
    const X = (km) => (km / tot) * 300;
    const Y = (z) => 56 - ((z - min) / (max - min || 1)) * 50;
    const d = serieProfilo.map((x, i) => `${i ? 'L' : 'M'}${X(x.km).toFixed(1)} ${Y(x.z).toFixed(1)}`).join(' ');
    box.innerHTML = `<svg viewBox="0 0 300 60" preserveAspectRatio="none" role="img" aria-label="Profilo altimetrico: da ${Math.round(min)} a ${Math.round(max)} m">
        <path d="${d} L300 60 L0 60 Z" class="profilo-area"/><path d="${d}" class="profilo-linea" fill="none" vector-effect="non-scaling-stroke"/>
        <line class="profilo-cursore" x1="-10" x2="-10" y1="0" y2="60" vector-effect="non-scaling-stroke"/></svg>
      <p class="profilo-dati"><span>${Math.round(min)}–${Math.round(max)} m</span><span id="datoProfilo"></span></p>
      <p class="profilo-fonte tenue">${escapeHtml(testoFonteQuote(risultato.fonte))}</p>`;
  }
  // tocco sul profilo: il punto sulla mappa
  app.querySelector('#profilo').addEventListener('pointerdown', (e) => {
    const svg = e.target.closest('svg');
    if (!svg || serieProfilo.length < 2) return;
    const r = svg.getBoundingClientRect();
    const tot = serieProfilo.at(-1).km;
    const x = puntoAlKm(serieProfilo, ((e.clientX - r.left) / r.width) * tot);
    segnaProfilo.setLatLng([x.p[1], x.p[0]]).addTo(mappa);
    const cursore = svg.querySelector('.profilo-cursore');
    cursore.setAttribute('x1', ((x.km / tot) * 300).toFixed(1));
    cursore.setAttribute('x2', ((x.km / tot) * 300).toFixed(1));
    app.querySelector('#datoProfilo').textContent = `km ${km1(x.km)} · ${Math.round(x.z)} m`;
  });

  // nei parchi: tratti non segnati, a mano libera o su sentieri ad accesso regolato, in arancione
  async function mostraAvvisi(mia) {
    const box = app.querySelector('#avvisi');
    const { parcoDi, regolati } = await preparaAvvisi();
    if (mia !== richiesta || chiusa || !risultato) return;
    const tratti = trattiARischio({ linea: risultato.linea, terreno: risultato.terreno, liberi: intervalliLiberi(risultato.tratti) }, { parcoDi, regolati });
    livelloAvvisi.clearLayers();
    for (const t of tratti) L.polyline(t.linea.map(([lon, lat]) => [lat, lon]), { color: '#ef9f27', weight: 9, opacity: 0.6, interactive: false }).addTo(livelloAvvisi);
    box.innerHTML = testiAvvisi(tratti)
      .map((t) => `<p class="avviso-via">${ICONE.avviso}<span>${escapeHtml(t)}</span></p>`)
      .join('');
  }

  // rifugi e acqua entro 300 m: riassunto sempre, elenco con il km nella barra aperta
  async function mostraPunti(mia) {
    if (!risultato || mia !== richiesta) return;
    const pezzi = [risultato.linea];
    const geojson = { type: 'MultiLineString', coordinates: pezzi };
    const { punti: tutti, avviso } = await puntiPerIlPercorso('bozza-disegno', pezzi);
    if (mia !== richiesta || chiusa) return;
    const vicini = tutti ? puntiLungoIlPercorso(tutti, geojson) : [];
    app.querySelector('#riassuntoPunti').innerHTML = vicini.length
      ? `${ICONE.goccia}<span>${escapeHtml(riassuntoPunti(vicini))} · entro ${RAGGIO_LUNGO_IL_PERCORSO_M} m</span>`
      : `<span class="tenue">${escapeHtml(avviso || `Niente acqua né rifugi entro ${RAGGIO_LUNGO_IL_PERCORSO_M} m`)}</span>`;
    mostraPuntiLungoIlPercorso(app.querySelector('#dettagli'), geojson, { punti: tutti, avviso, pezzi });
  }

  // --- comandi ---
  const strumenti = app.querySelector('.disegno-sopra');
  const menu = app.querySelector('.disegno-menu');
  const file = app.querySelector('#fileGpxDisegno');
  strumenti.addEventListener('click', (e) => {
    const b = e.target.closest('[data-azione]');
    const azione = b?.dataset.azione;
    if (!azione) return;
    if (azione !== 'menu') menu.hidden = true;
    if (azione === 'annulla' && punti.length) {
      punti.pop();
      aggiorna();
    } else if (azione === 'anello' && punti.length >= 2) {
      punti = chiudiAnello(punti);
      aggiorna();
    } else if (azione === 'inverti' && punti.length >= 2) {
      punti = inverti(punti);
      aggiorna();
    } else if (azione === 'libera') {
      manoLibera = !manoLibera;
      b.setAttribute('aria-pressed', String(manoLibera));
      b.classList.toggle('attiva', manoLibera);
      suggerimentoBase();
    } else if (azione === 'menu') {
      menu.hidden = !menu.hidden;
      b.setAttribute('aria-expanded', String(!menu.hidden));
    } else if (azione === 'importa') file.click();
    else if (azione === 'esporta' && risultato) esporta();
    else if (azione === 'ricomincia' && (punti.length < 3 || confirm('Cancellare tutti i punti?'))) {
      punti = [];
      aggiorna();
    }
  });
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    try {
      const { geojson, nome } = leggiGpx(await f.text());
      const nuovo = { id: nuovoIdPercorso(), nome: nome || f.name.replace(/\.gpx$/i, ''), origine: 'gpx', geojson, note: '' };
      await salvaPercorso(nuovo);
      location.hash = `#/percorso/${encodeURIComponent(nuovo.id)}`;
    } catch (err) {
      mostraBarra(`<span class="errore">${escapeHtml(err.message)}</span>`);
    }
  });
  function esporta() {
    const nome = app.querySelector('#nomePercorso').value.trim() || 'Percorso Orme';
    const gpx = new File([creaGpx({ nome, linee: risultato.pezziQuote ?? [risultato.linea] })], nomeFileGpx(nome), { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(gpx);
    const a = Object.assign(document.createElement('a'), { href: url, download: gpx.name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  const finestraSalva = app.querySelector('.foglio-salva');
  finestraTrascinabile(finestraSalva); // si chiude anche trascinandola in giù
  foglio.addEventListener('click', (e) => {
    const b = e.target.closest('[data-azione]');
    const azione = b?.dataset.azione;
    if (azione === 'salva' && risultato) {
      const m = risultato.misure;
      app.querySelector('#riepilogoSalva').textContent = `${km1(m.km)} km${m.salita != null ? ` · +${m.salita} m` : ''}${m.durataMin != null ? ` · ${durata(m.durataMin)}` : ''}${eAnello(punti) ? ' · anello' : ''}`;
      finestraSalva.showModal();
    }
  });
  finestraSalva.addEventListener('click', async (e) => {
    const azione = e.target.closest('[data-azione]')?.dataset.azione;
    if (e.target === finestraSalva || azione === 'continua') return finestraSalva.close();
    if (azione !== 'conferma' || !risultato) return;
    const nuovo = {
      ...(esistente ?? { id: nuovoIdPercorso(), note: '' }),
      nome: app.querySelector('#nomePercorso').value.trim() || 'Percorso senza nome',
      origine: 'disegnato',
      puntiControllo: punti,
      geojson: { type: 'MultiLineString', coordinates: [risultato.linea] },
      terreno: risultato.terreno,
      fonteTerreno: 'brouter',
      aggiornatoTerreno: new Date().toISOString(),
    };
    await salvaPercorso(nuovo);
    if (!esistente) cancellaBozza();
    location.hash = `#/percorso/${encodeURIComponent(nuovo.id)}`;
  });

  // all'apertura: la mappa sul percorso (o sulla bozza)
  if (punti.length) {
    mappa.sbloccaInquadrature?.();
    if (punti.length === 1) mappa.setView([punti[0].p[1], punti[0].p[0]], 15);
    else mappa.fitBounds(punti.map(({ p }) => [p[1], p[0]]), { paddingTopLeft: [30, 80], paddingBottomRight: [30, 220], maxZoom: 15 });
  }
  aggiorna();
  requestAnimationFrame(() => mappa.invalidateSize());

  return () => {
    chiusa = true;
    clearTimeout(aggiorna.timer);
    fermaGps();
    heat.rimuovi();
    mappa.remove();
    finestraSalva.remove();
    document.body.classList.remove('con-mappa', 'disegno');
  };
}
