// "Intorno a me": i percorsi segnati attorno alla mia posizione (o a un punto scelto sulla mappa),
// scaricati dal telefono da OpenStreetMap. Stessa lista, filtri e schede dei parchi, ma separata.
// Il punto resta sul dispositivo: a OpenStreetMap e Open-Meteo vanno solo zona e tracce.
import L from 'leaflet';
import { tuttiISentieri, tutteLeTracce, leggiIntorno, salvaIntorno, aggiornaCalcolati, salvaPuntiIntorno, leggiPuntiIntorno } from '../db.js';
import { ID_INTORNO, parcoDa } from '../datiParchi.js';
import { interrogaOverpass } from '../lib/overpass.js';
import { quoteDellaTraccia } from '../lib/riassunto.js';
import { improntaTraccia } from '../lib/panorama.js';
import { queryPuntiParco, puntiDallaRisposta } from '../lib/puntiUtili.js';
import { interpretaGbif } from '../lib/gbif.js';
import { faunaDalleOsservazioni } from '../lib/faunaPercorso.js';
import { GRUPPI_FAUNA, GRUPPI_FAUNA_PREDEFINITI } from '../lib/costanti.js';
import { interpretaOsservazioni } from '../lib/inaturalist.js';
import { iconaAnimale } from './icone.js';
import {
  RAGGI_INTORNO,
  RAGGIO_INTORNO,
  queryIntorno,
  percorsiIntorno,
  nelRaggio,
  puntiPerLeQuote,
  urlQuote,
  leggiQuote,
  profiloIntorno,
  testoDistanza,
  riquadroIntorno,
  urlFaunaIntorno,
  PAGINE_GBIF_MAX,
  faunaDaRicalcolare,
  ricercheSpecieDellaZona,
  specieDellaZona,
  urlOsservazioniSpecie,
  percorsiDoveVisto,
  VERSIONE_RICERCA,
  retiAreeProtette,
} from '../lib/intorno.js';
import { escapeHtml, data as testoData } from '../lib/formato.js';
import { creaMappa } from './mappa.js';
import { COLORI_STATO } from './mappaGenerale.js';
import { percorsiToccabili } from './toccaPercorso.js';
import { montaElenco } from './lista.js';
import { aggiungiGps } from './gps.js';
import { htmlSelettoreAttivita, collegaSelettoreAttivita } from './attivita.js';
import { ICONE } from './icone.js';
import { stato } from '../stato.js';
import { aggiungiHeatmap } from './heatmap.js';
import { dimenticaPunti } from './puntiUtili.js';

const ZONA = '#e8590c';
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

function posizioneAttuale() {
  return new Promise((risolvi, rifiuta) => {
    if (!navigator.geolocation) return rifiuta(new Error('Questo dispositivo non dà la posizione.'));
    navigator.geolocation.getCurrentPosition(
      (p) => risolvi([p.coords.longitude, p.coords.latitude]),
      (e) => rifiuta(new Error(e.code === 1 ? 'Posizione non concessa: puoi scegliere il punto sulla mappa.' : 'Posizione non trovata: riprova o scegli il punto sulla mappa.')),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60_000 },
    );
  });
}

const CHIAVE_GRUPPI = 'orme.gruppiIntorno';
let sceltaRicordata = null; // { zona, specie, viste }
function leggiGruppi() {
  try {
    const g = JSON.parse(localStorage.getItem(CHIAVE_GRUPPI) ?? 'null');
    return Array.isArray(g) ? g.filter((x) => GRUPPI_FAUNA[x]) : [...GRUPPI_FAUNA_PREDEFINITI];
  } catch {
    return [...GRUPPI_FAUNA_PREDEFINITI];
  }
}
function salvaGruppi(g) {
  try {
    localStorage.setItem(CHIAVE_GRUPPI, JSON.stringify(g));
  } catch {
    // memoria non disponibile: la scelta vale per questa visita
  }
}

export async function vistaIntorno(app) {
  let zona = await leggiIntorno();
  let raggio = zona?.raggioKm ?? RAGGIO_INTORNO;
  let sceltaSullaMappa = false;
  let chiusa = false;
  let occupata = false;
  // "Cosa vedere qui": gruppi che mi interessano (sul telefono), specie scelta e dove è stata vista
  let gruppi = leggiGruppi();
  // la specie scelta resta tornando da un sentiero (finché non cambia la zona)
  let scelta = sceltaRicordata?.zona === JSON.stringify(zona?.centro) ? sceltaRicordata.specie : null; // { inat, nome, scientifico }
  let visteScelta = scelta ? sceltaRicordata.viste : null; // id dei percorsi vicino alle osservazioni della specie scelta

  app.innerHTML = `
    <h1 class="titolo-pagina">Intorno a me</h1>
    <section class="riquadro zona-intorno">
      <p class="stato-intorno"></p>
      <div class="segmenti scelta-raggio" role="radiogroup" aria-label="Distanza">${RAGGI_INTORNO.map(
        (r) => `<button type="button" role="radio" class="segmento" data-raggio="${r}">${r} km</button>`,
      ).join('')}</div>
      <div class="azioni-intorno">
        <button type="button" class="bottone primario" data-azione="posizione">${ICONE.navigazione}Usa la mia posizione</button>
        <button type="button" class="bottone" data-azione="mappa">${ICONE.segnaposto}Scegli sulla mappa</button>
        <button type="button" class="bottone" data-azione="aggiorna" hidden>Aggiorna</button>
      </div>
    </section>
    <div class="anteprima-mappa parco-mappa"><div id="mappaIntorno"></div><p class="avviso-mappa" id="avvisoIntorno" hidden>Tocca la mappa nel punto da cui vuoi partire</p></div>
    <section class="cosa-vedere" hidden>
      <h2 class="titolo-sezione">Cosa vedere qui</h2>
      <div class="gruppi-fauna" role="group" aria-label="Animali che ti interessano">${Object.entries(GRUPPI_FAUNA)
        .map(([k, g]) => `<button type="button" class="chip-scorciatoia" data-gruppo="${k}">${escapeHtml(g.nome)}</button>`)
        .join('')}</div>
      <ul class="specie-zona"></ul>
      <p class="tenue piccolo nota-specie">Tocca un animale: la mappa mostra dove è stato visto e la lista i percorsi lì vicino.</p>
    </section>
    <a class="invito-meteo" href="#/domani?zona=intorno" hidden><span class="icona-meteo" aria-hidden="true">⛅</span><span><b>Dove vado domani?</b><span class="tenue piccolo">I percorsi della zona secondo il meteo e la durata</span></span></a>
    <h2 class="titolo-sezione">Percorsi</h2>
    ${htmlSelettoreAttivita({ titolo: false })}
    <div id="elenco"></div>
    <p class="tenue piccolo nota-intorno">Percorsi, rifugi e acqua da OpenStreetMap (ODbL), più i percorsi dei parchi che passano nella zona. Dislivelli: Open-Meteo. Fauna: osservazioni GBIF. La tua posizione resta sul telefono.</p>
  `;

  const statoTesto = app.querySelector('.stato-intorno');
  const avviso = app.querySelector('#avvisoIntorno');
  const bottoneAggiorna = app.querySelector('[data-azione="aggiorna"]');
  const contenitoreElenco = app.querySelector('#elenco');
  const scollegaAttivita = collegaSelettoreAttivita(app);

  const mappa = creaMappa(app.querySelector('#mappaIntorno'), { livelli: ['heatmap', 'percorsi', 'gps'], ricorda: 'intorno' });
  if (!mappa.vistaRitrovata) mappa.setView([42, 12.6], 5);
  const fermaGps = aggiungiGps(mappa, () => null);
  // qui la fauna si vede subito: heatmap accesa (si spegne dal pulsante "Fauna"); uscendo torna
  // com'era, così le altre mappe non la ereditano
  const heatmapPrima = stato.leggi().livelli.heatmap;
  stato.imposta({ livelli: { heatmap: true } });
  const heat = aggiungiHeatmap(mappa, {
    intorno: true,
    personalizza: () => ({ gruppi, ...(scelta ? { taxon: { inat: scelta.inat, scientifico: scelta.scientifico } } : {}) }),
  });
  const cosaVedere = app.querySelector('.cosa-vedere');
  const elencoSpecie = app.querySelector('.specie-zona');
  const invitoMeteo = app.querySelector('.invito-meteo');
  const livelloZona = L.layerGroup().addTo(mappa);
  const percorsi = L.layerGroup();
  let accesi = true;
  mappa.suLivello('percorsi', (acceso) => {
    accesi = acceso;
    if (acceso) percorsi.addTo(mappa);
    else percorsi.remove();
  });

  let elenco = null;
  let ultimi = [];
  const toccabili = percorsiToccabili(mappa, { occupata: () => sceltaSullaMappa });
  const disegnaPercorsi = (risultato) => {
    percorsi.clearLayers();
    for (const { sentiero: s, traccia } of risultato) {
      if (!traccia?.geojson) continue;
      toccabili.disegna(percorsi, s, traccia, { color: COLORI_STATO[s.stato] ?? COLORI_STATO.da_fare, weight: 3.5, opacity: 0.85 });
    }
    if (accesi && !mappa.hasLayer(percorsi)) percorsi.addTo(mappa);
  };

  function disegnaRaggio() {
    for (const b of app.querySelectorAll('[data-raggio]')) {
      const scelto = Number(b.dataset.raggio) === raggio;
      b.classList.toggle('attivo', scelto);
      b.setAttribute('aria-checked', String(scelto));
    }
  }

  // la zona salvata, oppure quella appena scelta mentre si scaricano i percorsi
  function disegnaZona({ inquadra = true, z = zona } = {}) {
    livelloZona.clearLayers();
    if (!z) return;
    const centro = [z.centro[1], z.centro[0]];
    const cerchio = L.circle(centro, { radius: z.raggioKm * 1000, color: ZONA, weight: 2, dashArray: '6 6', fill: false, interactive: false }).addTo(livelloZona);
    L.marker(centro, { interactive: false, keyboard: false, icon: L.divIcon({ className: 'spillo-daqui', html: '<span></span>', iconSize: [26, 34], iconAnchor: [13, 34] }) }).addTo(livelloZona);
    if (inquadra) mappa.fitBounds(cerchio.getBounds(), { padding: [10, 10] });
  }

  // Elenco: i percorsi (della zona e dei parchi) che passano entro il raggio, dal più vicino
  async function mostraElenco() {
    elenco?.scollega();
    elenco = null;
    invitoMeteo.hidden = !zona;
    if (!zona) {
      cosaVedere.hidden = true;
      contenitoreElenco.innerHTML = '<p class="vuoto">Scegli da dove partire: la tua posizione o un punto sulla mappa.</p>';
      disegnaPercorsi([]);
      return;
    }
    const [tutti, tracce] = await Promise.all([tuttiISentieri(), tutteLeTracce()]);
    if (chiusa) return;
    const vicini = nelRaggio(
      tutti.map((s) => ({ sentiero: s, traccia: tracce.get(s.id) })),
      zona.centro,
      zona.raggioKm,
    );
    const distanze = new Map(vicini.map((v) => [v.sentiero.id, v.distanzaM]));
    ultimi = vicini;
    // con un animale scelto restano i percorsi passati vicino a dove è stato visto
    const mostrati = visteScelta ? vicini.filter((v) => visteScelta.has(v.sentiero.id)) : vicini;
    if (!vicini.length) {
      contenitoreElenco.innerHTML = `<p class="vuoto">Nessun percorso segnato su OpenStreetMap entro ${zona.raggioKm} km.${
        zona.raggioKm < RAGGI_INTORNO.at(-1) ? ' Prova con una distanza maggiore.' : ''
      }</p>`;
      disegnaPercorsi([]);
      return;
    }
    elenco = montaElenco(
      contenitoreElenco,
      mostrati.map((v) => v.sentiero),
      tracce,
      {
        parcoFisso: ID_INTORNO,
        ordina: (r) => [...r].sort((a, b) => distanze.get(a.sentiero.id) - distanze.get(b.sentiero.id)),
        // per i percorsi dei parchi anche il nome del parco
        nota: (p) => [testoDistanza(distanze.get(p.sentiero.id)), p.sentiero.parco !== ID_INTORNO ? parcoDa(p.sentiero.parco)?.nomeBreve : ''].filter(Boolean).join(' · '),
        alRisultato: disegnaPercorsi,
        limita: scelta
          ? { filtro: () => true, testo: (n) => `<b>${n}</b> ${n === 1 ? 'percorso' : 'percorsi'} vicino a dove è stato visto: ${escapeHtml(scelta.nome)} · <button type="button" class="link" data-azione="togli-specie">tutti</button>` }
          : null,
      },
    );
    if (scelta && !mostrati.length) contenitoreElenco.querySelector('.lista').innerHTML = `<li class="vuoto">Nessun percorso passa vicino a dove è stato visto: ${escapeHtml(scelta.nome)}. <button type="button" class="link" data-azione="togli-specie">Tutti i percorsi</button></li>`;
  }

  // "Cosa vedere qui": le specie più osservate nella zona, nei gruppi scelti
  let richiestaSpecie = 0;
  async function mostraSpecie() {
    for (const b of app.querySelectorAll('[data-gruppo]')) {
      const on = gruppi.includes(b.dataset.gruppo);
      b.classList.toggle('attiva', on);
      b.setAttribute('aria-pressed', String(on));
    }
    if (!zona) return;
    cosaVedere.hidden = false;
    const mia = ++richiestaSpecie;
    const ricerche = ricercheSpecieDellaZona(zona.centro, zona.raggioKm, gruppi);
    if (!ricerche.length) {
      elencoSpecie.innerHTML = '<li class="tenue">Scegli almeno un gruppo di animali.</li>';
      return;
    }
    elencoSpecie.innerHTML = '<li class="tenue">Cerco gli animali della zona…</li>';
    let specie;
    try {
      const risposte = await Promise.all(ricerche.map(async (u) => (await fetch(u)).json()));
      specie = specieDellaZona(risposte, undefined, { rare: gruppi.includes('rare') ? [risposte.length - 1] : [] });
    } catch {
      if (mia === richiestaSpecie) elencoSpecie.innerHTML = '<li class="tenue">Animali non disponibili ora (sei offline?).</li>';
      return;
    }
    if (mia !== richiestaSpecie || chiusa) return;
    elencoSpecie.innerHTML = specie.length
      ? specie
          .map(
            (x) => `<li><button type="button" class="carta-specie-zona ${scelta?.inat === x.inat ? 'scelta' : ''}" data-taxon="${x.inat}" data-nome="${escapeHtml(x.nome)}" data-scientifico="${escapeHtml(x.scientifico)}" aria-pressed="${scelta?.inat === x.inat}" aria-label="${escapeHtml(`${x.nome}, ${x.osservazioni} osservazioni${x.rara ? ', specie rara' : ''}`)}" title="${escapeHtml(x.scientifico)}">
              ${x.foto ? `<img src="${escapeHtml(x.foto.url)}" alt="" loading="lazy" />` : `<span class="specie-icona">${iconaAnimale(x.icona)}</span>`}
              <b>${escapeHtml(x.nome)}</b>${x.rara ? '<span class="specie-rara">rara</span>' : ''}
              <span class="tenue">${x.osservazioni} ${x.osservazioni === 1 ? 'osservazione' : 'osservazioni'}</span>
            </button></li>`,
          )
          .join('')
      : '<li class="tenue">Nessuna osservazione di questi animali nella zona.</li>';
  }

  async function scegliSpecie(x) {
    scelta = scelta?.inat === x?.inat ? null : x;
    visteScelta = null;
    heat.ricarica();
    if (scelta) {
      // la mappa sulla zona e la fauna accesa: si vede subito dove è stato visto
      if (!stato.leggi().livelli.heatmap) stato.imposta({ livelli: { heatmap: true } });
      disegnaZona();
      try {
        const oss = interpretaOsservazioni(await (await fetch(urlOsservazioniSpecie(zona.centro, zona.raggioKm, scelta.inat))).json());
        const [tutti, tracce] = await Promise.all([tuttiISentieri(), tutteLeTracce()]);
        const percorsi = nelRaggio(tutti.map((s) => ({ sentiero: s, traccia: tracce.get(s.id) })), zona.centro, zona.raggioKm);
        visteScelta = new Set(percorsiDoveVisto(percorsi, oss).map((p) => p.sentiero.id));
      } catch {
        visteScelta = null;
      }
    }
    if (chiusa) return;
    sceltaRicordata = scelta ? { zona: JSON.stringify(zona.centro), specie: scelta, viste: visteScelta } : null;
    await mostraElenco();
    mostraSpecie();
  }

  function scriviStato(testo) {
    if (testo != null) {
      statoTesto.innerHTML = testo;
      return;
    }
    statoTesto.innerHTML = zona
      ? `<b>${ultimi.length} ${ultimi.length === 1 ? 'percorso' : 'percorsi'}</b> entro ${zona.raggioKm} km · aggiornati il ${escapeHtml(testoData(zona.aggiornato))}`
      : 'Trova i percorsi segnati vicino a te, dovunque ti trovi.';
    bottoneAggiorna.hidden = !zona;
  }

  // Dislivelli: quote da Open-Meteo per i percorsi della zona che non le hanno ancora
  async function calcolaQuote() {
    const [tutti, tracce] = await Promise.all([tuttiISentieri(), tutteLeTracce()]);
    // le reti di sentieri non hanno un giro: niente profilo
    const daFare = tutti.filter((s) => s.parco === ID_INTORNO && s.tipoPercorso !== 'rete_sentieri' && tracce.get(s.id)?.geojson && !quoteDellaTraccia(s, tracce.get(s.id)));
    let fatti = 0;
    for (const s of daFare) {
      if (chiusa) return;
      scriviStato(`Calcolo i dislivelli… ${fatti + 1} di ${daFare.length}`);
      const g = tracce.get(s.id).geojson;
      const memoria = new Map();
      try {
        for (const { url, punti } of urlQuote(puntiPerLeQuote(g))) {
          let r = await fetch(url);
          if (r.status === 429) {
            // limite gratuito al minuto: si aspetta e si riprova una volta
            scriviStato(`Calcolo i dislivelli… ${fatti + 1} di ${daFare.length} · pausa di un minuto (limite del servizio gratuito)`);
            await attendi(65_000);
            if (chiusa) return;
            r = await fetch(url);
          }
          if (r.status === 429) throw new Error('troppe richieste');
          if (!r.ok) throw new Error(`risposta ${r.status}`);
          leggiQuote(await r.json(), punti, memoria);
          await attendi(150); // con calma: Open-Meteo è gratuito
        }
        const profilo = profiloIntorno(g, memoria);
        if (profilo) await aggiornaCalcolati(s.id, { quote: profilo });
      } catch (e) {
        console.warn('Quote non calcolate', s.id, e);
        break; // si riprova alla prossima apertura
      }
      fatti++;
    }
    if (chiusa) return;
    if (fatti) await mostraElenco();
    scriviStato();
  }

  // Fauna: le osservazioni GBIF della zona, poi lo stesso calcolo dei parchi per ogni percorso
  async function calcolaFauna() {
    const [tutti, tracce] = await Promise.all([tuttiISentieri(), tutteLeTracce()]);
    const daFare = tutti.filter((s) => s.parco === ID_INTORNO && tracce.get(s.id)?.geojson && faunaDaRicalcolare(s, tracce.get(s.id).geojson));
    if (!daFare.length || !zona) return;
    scriviStato('Cerco la fauna osservata nella zona…');
    const osservazioni = [];
    try {
      for (let pagina = 0; pagina < PAGINE_GBIF_MAX; pagina++) {
        const r = await fetch(urlFaunaIntorno(zona.centro, zona.raggioKm, pagina));
        if (!r.ok) throw new Error(`GBIF ha risposto ${r.status}`);
        const json = await r.json();
        // solo i campi che servono: dell'osservatore resta un codice anonimo
        for (const o of interpretaGbif(json)) osservazioni.push({ animale: o.animale, lat: o.lat, lon: o.lon, sfumata: o.sfumata, osservatore: o.osservatore, data: o.data });
        if (chiusa) return;
        if (json.endOfRecords || !json.results?.length) break;
        await attendi(300); // con calma: GBIF è gratuito
      }
    } catch (e) {
      console.warn('Fauna non calcolata', e);
      scriviStato();
      return; // si riprova alla prossima apertura
    }
    const oggi = new Date().toISOString().slice(0, 10);
    for (const s of daFare) {
      const g = tracce.get(s.id).geojson;
      await aggiornaCalcolati(s.id, { faunaInat: { specie: faunaDalleOsservazioni(osservazioni, g), calcolato: oggi, impronta: improntaTraccia(g).split('-')[1] } });
    }
    if (chiusa) return;
    await mostraElenco();
    scriviStato();
  }

  // Rifugi, bivacchi e acqua della zona: servono alla scheda del sentiero e alla mappa
  async function scaricaPunti(centro, km) {
    const query = queryPuntiParco({ bbox: riquadroIntorno(centro, km) });
    for (let tentativo = 1; tentativo <= 2 && !chiusa; tentativo++) {
      try {
        scriviStato('Cerco rifugi e acqua…');
        await salvaPuntiIntorno(puntiDallaRisposta(await interrogaOverpass(query, { timeoutMs: 90000 })));
        dimenticaPunti();
        return;
      } catch (e) {
        console.warn('Rifugi e acqua non scaricati', e); // restano quelli di prima; si riprova
        await attendi(5000);
      }
    }
  }

  // dopo lo scaricamento: dislivelli e fauna, uno dopo l'altro (servizi gratuiti, con calma)
  async function completa() {
    // zona salvata prima che ci fossero rifugi e acqua: si scaricano ora
    if (zona && !(await leggiPuntiIntorno()).length) await scaricaPunti(zona.centro, zona.raggioKm);
    await calcolaQuote();
    if (!chiusa) await calcolaFauna();
  }

  async function scarica(centro) {
    if (occupata) return;
    occupata = true;
    app.querySelectorAll('.azioni-intorno button').forEach((b) => (b.disabled = true));
    scriviStato(`Cerco i percorsi entro ${raggio} km…`);
    disegnaZona({ z: { centro, raggioKm: raggio } });
    try {
      // Overpass a volte è occupato: un secondo tentativo dopo qualche secondo
      let json;
      try {
        json = await interrogaOverpass(queryIntorno(centro, raggio), { timeoutMs: 120000 });
      } catch {
        if (chiusa) return;
        scriviStato('OpenStreetMap è occupato, riprovo…');
        await attendi(5000);
        json = await interrogaOverpass(queryIntorno(centro, raggio), { timeoutMs: 120000 });
      }
      const esistenti = new Set((await tuttiISentieri()).filter((s) => s.parco !== ID_INTORNO).map((s) => s.id));
      // nella stessa risposta anche i sentieri non segnati delle aree protette
      const reti = retiAreeProtette(json, centro, raggio);
      await salvaIntorno({ centro, raggioKm: raggio, versione: VERSIONE_RICERCA, percorsi: [...percorsiIntorno(json, centro, raggio, { esistenti }), ...reti] });
      if (chiusa) return;
      zona = await leggiIntorno();
      // zona nuova: la specie scelta prima non vale più
      scelta = null;
      visteScelta = null;
      sceltaRicordata = null;
      heat.ricarica();
      disegnaZona();
      await mostraElenco();
      mostraSpecie();
      scriviStato();
      await scaricaPunti(centro, raggio);
      completa();
    } catch (e) {
      console.warn('Intorno a me', e);
      if (chiusa) return;
      // si torna alla zona di prima (se c'era): i suoi percorsi sono ancora sul telefono
      disegnaZona();
      scriviStato(`<span class="errore">${escapeHtml(e.message)}</span>`);
      bottoneAggiorna.hidden = false;
    } finally {
      occupata = false;
      app.querySelectorAll('.azioni-intorno button').forEach((b) => (b.disabled = false));
    }
  }

  function modoMappa(attivo) {
    sceltaSullaMappa = attivo;
    avviso.hidden = !attivo;
    mappa.getContainer().classList.toggle('scegli-punto', attivo);
  }
  mappa.on('click', (e) => {
    if (!sceltaSullaMappa) return;
    modoMappa(false);
    scarica([Math.round(e.latlng.lng * 1e4) / 1e4, Math.round(e.latlng.lat * 1e4) / 1e4]);
  });

  app.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.taxon) {
      scegliSpecie({ inat: Number(b.dataset.taxon), nome: b.dataset.nome, scientifico: b.dataset.scientifico });
    } else if (b.dataset.azione === 'togli-specie') {
      scegliSpecie(null);
    } else if (b.dataset.gruppo) {
      const g = b.dataset.gruppo;
      gruppi = gruppi.includes(g) ? gruppi.filter((x) => x !== g) : [...gruppi, g];
      salvaGruppi(gruppi);
      scelta = null;
      visteScelta = null;
      sceltaRicordata = null;
      heat.ricarica();
      mostraElenco();
      mostraSpecie();
    } else if (b.dataset.raggio) {
      raggio = Number(b.dataset.raggio);
      disegnaRaggio();
      if (zona && zona.raggioKm !== raggio) scarica(zona.centro);
    } else if (b.dataset.azione === 'posizione') {
      modoMappa(false);
      scriviStato('Cerco la tua posizione…');
      try {
        scarica(await posizioneAttuale());
      } catch (err) {
        scriviStato(`<span class="errore">${escapeHtml(err.message)}</span>`);
      }
    } else if (b.dataset.azione === 'mappa') {
      modoMappa(!sceltaSullaMappa);
      app.querySelector('#mappaIntorno').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (b.dataset.azione === 'aggiorna' && zona) scarica(zona.centro);
  });

  disegnaRaggio();
  requestAnimationFrame(() => {
    mappa.invalidateSize();
    disegnaZona();
  });
  await mostraElenco();
  mostraSpecie();
  scriviStato();
  // zona scaricata con una ricerca più vecchia: si aggiorna da sola
  if (zona && zona.versione !== VERSIONE_RICERCA) scarica(zona.centro);
  else if (zona) completa();

  return () => {
    chiusa = true;
    elenco?.scollega();
    scollegaAttivita();
    fermaGps();
    heat.rimuovi();
    mappa.remove();
    if (!heatmapPrima) stato.imposta({ livelli: { heatmap: false } });
  };
}

