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
import { faunaDalleOsservazioni, animaliPossibili } from '../lib/faunaPercorso.js';
import { ANIMALI } from '../lib/costanti.js';
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
  animaliDellaZona,
} from '../lib/intorno.js';
import { escapeHtml, data as testoData } from '../lib/formato.js';
import { creaMappa, disegnaTraccia } from './mappa.js';
import { COLORI_STATO } from './mappaGenerale.js';
import { montaElenco } from './lista.js';
import { aggiungiGps } from './gps.js';
import { htmlSelettoreAttivita, collegaSelettoreAttivita } from './attivita.js';
import { ICONE } from './icone.js';
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

export async function vistaIntorno(app) {
  let zona = await leggiIntorno();
  let raggio = zona?.raggioKm ?? RAGGIO_INTORNO;
  let sceltaSullaMappa = false;
  let chiusa = false;
  let occupata = false;
  let animaleScelto = '';

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
    <div class="animali-parco animali-intorno" role="group" aria-label="Animali della zona" hidden></div>
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

  const mappa = creaMappa(app.querySelector('#mappaIntorno'), { livelli: ['heatmap', 'percorsi', 'gps'] });
  mappa.setView([42, 12.6], 5);
  const fermaGps = aggiungiGps(mappa, () => null);
  const heat = aggiungiHeatmap(mappa);
  const selettoreAnimali = app.querySelector('.animali-intorno');
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
  const disegnaPercorsi = (risultato) => {
    percorsi.clearLayers();
    for (const { sentiero: s, traccia } of risultato) {
      if (!traccia?.geojson) continue;
      disegnaTraccia(traccia.geojson, { color: COLORI_STATO[s.stato] ?? COLORI_STATO.da_fare, weight: 3.5, opacity: 0.85 })
        .bindPopup(`<a href="#/sentiero/${encodeURIComponent(s.id)}">${escapeHtml(s.nome)}</a>`)
        .addTo(percorsi);
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
      selettoreAnimali.hidden = true;
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
    // gli animali della zona: toccandone uno restano i percorsi dove è stato osservato
    const animali = animaliDellaZona(vicini.map((v) => v.sentiero));
    if (animaleScelto && !animali.some((a) => a.animale === animaleScelto)) animaleScelto = '';
    selettoreAnimali.hidden = !animali.length;
    selettoreAnimali.innerHTML = animali
      .map(
        ({ animale, percorsi: n }) =>
          `<button type="button" class="pillola ${animaleScelto === animale ? 'attiva' : ''}" data-animale="${animale}" aria-pressed="${animaleScelto === animale}" title="${n} ${n === 1 ? 'percorso' : 'percorsi'}">${escapeHtml(ANIMALI[animale] ?? animale)}</button>`,
      )
      .join('');
    const mostrati = animaleScelto ? vicini.filter((v) => animaliPossibili(v.sentiero).includes(animaleScelto)) : vicini;
    if (!vicini.length) {
      selettoreAnimali.hidden = true;
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
      },
    );
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
    const daFare = tutti.filter((s) => s.parco === ID_INTORNO && tracce.get(s.id)?.geojson && !quoteDellaTraccia(s, tracce.get(s.id)));
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
        json = await interrogaOverpass(queryIntorno(centro, raggio), { timeoutMs: 90000 });
      } catch {
        if (chiusa) return;
        scriviStato('OpenStreetMap è occupato, riprovo…');
        await attendi(5000);
        json = await interrogaOverpass(queryIntorno(centro, raggio), { timeoutMs: 90000 });
      }
      const esistenti = new Set((await tuttiISentieri()).filter((s) => s.parco !== ID_INTORNO).map((s) => s.id));
      await salvaIntorno({ centro, raggioKm: raggio, percorsi: percorsiIntorno(json, centro, raggio, { esistenti }) });
      if (chiusa) return;
      zona = await leggiIntorno();
      disegnaZona();
      await mostraElenco();
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
    if (b.dataset.animale) {
      animaleScelto = animaleScelto === b.dataset.animale ? '' : b.dataset.animale;
      mostraElenco();
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
  scriviStato();
  if (zona) completa();

  return () => {
    chiusa = true;
    elenco?.scollega();
    scollegaAttivita();
    fermaGps();
    heat.rimuovi();
    mappa.remove();
  };
}

