// Scheda di un percorso della sezione Pianifica
import { leggiPercorso, salvaPercorso, eliminaPercorso } from '../db.js';
import { percorsoSentiero, estremiTraccia, invertiPercorso, invertiGeojson } from '../lib/tracce.js';
import { versoDi, impostaVerso } from '../lib/verso.js';
import { giornoOraIniziali } from '../lib/quandoAndare.js';
import { albaTramonto, minutiItaliani } from '../lib/sole.js';
import { inizializzaGiorno } from './giornoScelto.js';
import { ritmoScelto, testoRitmo } from '../lib/ritmo.js';
import { htmlProfiloMini, collegaProfiloMini } from './profiloMini.js';
import { profiloPezzi } from '../lib/disegno.js';
import { creaPuntoProfilo } from './puntoProfilo.js';
import { ICONE } from './icone.js';
import { creaGpx, nomeFileGpx } from '../lib/gpxScrittura.js';
import { escapeHtml } from '../lib/formato.js';
import { creaMappa } from './mappa.js';
import { disegnaPercorso } from './disegnoTraccia.js';
import { numeriGrandi, htmlPortamiAllaPartenza } from './scheda.js';
import { htmlProfiloPendenze } from './profilo.js';
import { htmlTerreno, leggiTerrenoDaOsm } from './terreno.js';
import { htmlNaturaPercorso, collegaNaturaPercorso } from './natura.js';
import { mostraPuntiLungoIlPercorso } from './puntiUtili.js';
import { puntiPerIlPercorso } from './puntiPercorso.js';
import { htmlPiuGiorni, collegaPiuGiorni, ORE_AL_GIORNO, quoteDisponibili, pezziConQuote } from './piuGiorni.js';
import { oraPartenzaTesto } from './andataRitorno.js';
import { serveScaricoQuote, chiaveQuote } from '../lib/quoteSalvate.js';
import { misureDeiPezzi } from '../lib/lungoIlPercorso.js';
import { testoFonteQuote } from './quote.js';
import { misureAR, misureScelte, eAnelloPezzi } from '../lib/andataRitorno.js';
import { htmlAndataRitorno, collegaAndataRitorno, modoScelto } from './andataRitorno.js';
import { htmlQuandoAndare, collegaQuandoAndare } from './quandoAndare.js';
import { quoteMeteoDaiPezzi } from '../lib/quandoAndare.js';
import L from 'leaflet';
import { ripristinaOriginale, nuovoIdPercorso } from '../lib/percorso.js';
import { apriCondividi } from './condividi.js';

// numeri in alto: lo stesso calcolo del blocco Andata e ritorno, secondo la scelta
function htmlNumeri(misure, fonte, ar = null, modo = modoScelto(), scarico = false) {
  const scelte = ar ? { ...misureScelte(ar, modo), durataStimata: true, conQuote: misure.conQuote } : misure;
  const didascalia = ar ? `<p class="tenue piccolo nota-numeri">${ar.anello ? 'Giro ad anello' : modo === 'ar' ? 'Andata e ritorno' : 'Solo andata'} · ${ritmoScelto() === 'senza' ? 'metodo CAI' : testoRitmo()}</p>` : '';
  return `${numeriGrandi(scelte)}${didascalia}
      ${
        !misure.conQuote
          ? scarico
            ? '<p class="tenue">Scarico le quote (Terrain Tiles) per il dislivello…</p>'
            : '<p class="tenue">Dislivello non disponibile: il percorso non ha le quote.</p>'
          : fonte && fonte !== 'traccia'
            ? `<p class="tenue piccolo">Dislivello e durata: ${testoFonteQuote(fonte)}.</p>`
            : ''
      }`;
}

const quoteProvate = new Set(); // (percorso|traccia) per cui si è già provato a scaricare le quote in questa visita

// virtuale: un percorso arrivato da un link («#/condiviso?…»): si vede in sola lettura, senza scrivere niente sul telefono,
// con «Salva nei miei percorsi». { nome, note, verso, pezzi }
export async function vistaPercorso(app, id, virtuale = null) {
  const p = virtuale ? { id: 'condiviso', nome: virtuale.nome, note: virtuale.note, origine: 'condiviso', virtuale: true, geojson: { type: 'MultiLineString', coordinates: virtuale.pezzi }, terreno: [], fonteTerreno: null, quote: virtuale.quote } : await leggiPercorso(id);
  if (!p) {
    app.innerHTML = '<p class="vuoto">Percorso non trovato. <a href="#/pianifica">Torna a Pianifica</a></p>';
    return;
  }
  // verso: «Inverti senso» (anelli: «Gira al contrario») capovolge profilo, salita e discesa, tempi e orari; la traccia salvata resta com'è
  const invertito = virtuale ? Boolean(virtuale.verso) : versoDi({ id: p.id });
  const originali = percorsoSentiero(p.geojson).pezzi;
  const capovolgi = (z) => (invertito ? invertiPercorso({ pezzi: z, salti: [] }).pezzi : z);
  const pezzi = capovolgi(originali);
  // un solo calcolo per tutta la pagina: con le quote della traccia o, se salvate, scaricate dalle Terrain Tiles
  const quoteO = quoteDisponibili(p, originali);
  const quote = quoteO ? { ...quoteO, pezzi: capovolgi(quoteO.pezzi) } : null;
  let misure = misureDeiPezzi(quote?.pezzi ?? pezzi);
  // andata e ritorno (o il giro, se è un anello) con il metodo CAI nei due sensi
  const arDa = (m) => (pezzi.length ? misureAR({ km: Math.round(m.km * 10) / 10, salita: m.salita, discesa: m.discesa }, { anello: eAnelloPezzi(pezzi) }) : null);
  let ar = arDa(misure);
  let fonteQuote = quote?.fonte;
  // "Su più giorni" se la camminata scelta supera la giornata più corta
  const serveGiorni = (modo) => ar && misureScelte(ar, modo).durataMin > ORE_AL_GIORNO[0] * 60;
  const e = estremiTraccia(invertito ? invertiGeojson(p.geojson) : p.geojson);
  const idUrl = encodeURIComponent(p.id);
  const suPagina = () => (virtuale ? location.hash.startsWith('#/condiviso') : location.hash === `#/percorso/${idUrl}`);
  const eAnello = eAnelloPezzi(pezzi);
  // giorno e ora iniziali: oggi all'ora solita; se è già passata o non lascia luce per finire, domani alle 8:00
  const inizialiOrari = (() => {
    const oggiIt = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
    const domani = new Date(new Date(`${oggiIt}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
    const adesso = new Date();
    const inizio = pezzi[0]?.[0];
    const tramonto = inizio ? minutiItaliani(albaTramonto(oggiIt, [inizio[0], inizio[1]]).tramonto) : null;
    const m0 = ar ? misureScelte(ar, modoScelto()) : null;
    return giornoOraIniziali({ oggi: oggiIt, domani, adessoMin: adesso.getHours() * 60 + adesso.getMinutes(), oraSolita: oraPartenzaTesto(), durataMin: m0?.durataMin ?? null, tramontoOggiMin: tramonto });
  })();
  inizializzaGiorno(inizialiOrari.giorno);
  const scaricoQuote = serveScaricoQuote(p, originali, quoteProvate);

  app.innerHTML = `
    <a class="indietro" href="${virtuale ? '#/' : '#/pianifica'}">‹ ${virtuale ? 'Mappa' : 'Pianifica'}</a>
    <article class="scheda">
      ${virtuale ? '<div class="anteprima-mappa"><div id="miniMappa"></div></div>' : `<a class="anteprima-mappa" href="#/percorso/${idUrl}/mappa" aria-label="Apri la mappa grande del percorso"><div id="miniMappa"></div></a>`}
      <div class="testata-percorso">
        <h1>${escapeHtml(p.nome || 'Percorso senza nome')}</h1>
        <div class="azioni-testata">
          ${virtuale ? '<button type="button" class="bottone primario" data-salva-condiviso>Salva nei miei percorsi</button>' : '<button type="button" class="bottone primario" data-esporta>Esporta GPX</button>'}
          ${virtuale ? '<button type="button" class="bottone" data-esporta>Esporta GPX</button>' : `<a class="bottone" href="#/percorso/${idUrl}/disegna">Modifica traccia</a>`}
          <button type="button" class="bottone" data-condividi>${ICONE.condividi ?? ''}<span>Condividi</span></button>
        </div>
      </div>
      <p class="zona">${virtuale ? 'Percorso condiviso con te: in sola lettura' : ''}${virtuale ? '' : p.origine === 'condiviso' ? 'Condiviso con me' : ''}${virtuale || p.origine === 'condiviso' ? '' : p.originale ? `Da file ${p.originale.origine === 'kml' ? 'KML' : 'GPX'}, modificato` : p.origine === 'disegnato' ? 'Disegnato sulla mappa (BRouter)' : p.origine === 'esteso' ? 'Esteso da sentieri collegati' : p.origine === 'kml' ? 'Da file KML' : 'Da file GPX'}</p>
      <div id="numeriPercorso">${htmlNumeri(misure, quote?.fonte, ar, modoScelto(), scaricoQuote)}</div>
      <div id="profiloPercorso" class="profilo-scheda"></div>
      ${pezzi.length && !virtuale ? `<div class="verso-traccia"><button type="button" class="bottone testo" data-inverti-verso>${ICONE.inverti ?? '⇄'}<span>${invertito ? (eAnello ? 'Girato al contrario · torna al verso della traccia' : 'Senso invertito · torna al verso della traccia') : eAnello ? 'Gira al contrario' : 'Inverti senso'}</span></button></div>` : ''}
      ${ar ? htmlAndataRitorno(ar, modoScelto(), inizialiOrari) : ''}
      ${htmlQuandoAndare()}
      ${htmlProfiloPendenze(quote?.pezzi ?? pezzi)}
      <div id="contenitoreTerreno">${htmlTerreno(p, pezzi)}</div>
      ${pezzi.length ? '<div id="puntiLungo"></div>' : ''}
      ${pezzi.length ? `<div id="contenitoreGiorni" ${serveGiorni(modoScelto()) ? '' : 'hidden'}>${htmlPiuGiorni()}</div>` : ''}
      ${pezzi.length ? htmlNaturaPercorso() : ''}
      ${e ? htmlPortamiAllaPartenza({ lat: e.inizio[1], lon: e.inizio[0], fonte: 'traccia' }) : ''}
      ${virtuale ? (virtuale.note ? `<section class="riquadro"><h2>Note</h2><p>${escapeHtml(virtuale.note)}</p></section>` : '') : `<section class="riquadro">
        <h2>Note</h2>
        <form class="modulo" id="moduloPercorso">
          <label class="campo"><span>Nome</span><input name="nome" value="${escapeHtml(p.nome)}" /></label>
          <label class="campo"><span>Note</span><textarea name="note" rows="3">${escapeHtml(p.note)}</textarea></label>
          <button type="submit" class="bottone">Salva</button> <span class="salvato" id="salvato" hidden>Salvato</span>
        </form>
      </section>`}
      <div class="barra-azioni barra-azioni-percorso">
        ${virtuale ? '<button type="button" class="bottone primario" data-salva-condiviso>Salva nei miei percorsi</button>' : '<button type="button" class="bottone primario" data-esporta>Esporta GPX</button>'}
        ${virtuale ? '<button type="button" class="bottone" data-condividi>Condividi</button>' : `<a class="bottone" href="#/percorso/${idUrl}/disegna">Modifica traccia</a><button type="button" class="bottone" data-condividi>Condividi</button>`}
      </div>
      ${!virtuale && p.originale ? `<section class="riquadro"><h2>Traccia originale</h2><p class="tenue piccolo">Hai modificato la traccia del file importato: l'originale è conservato.</p><button type="button" class="bottone pieno" id="ripristina">Ripristina la traccia originale</button></section>` : ''}
      ${virtuale ? '' : '<button type="button" class="bottone pericolo pieno" id="elimina">Elimina percorso</button>'}
    </article>
  `;

  // terreno: cambio attributo e lettura da OSM per i GPX
  let attuale = p;
  const contenitoreTerreno = app.querySelector('#contenitoreTerreno');
  contenitoreTerreno.addEventListener('click', async (ev) => {
    const attributo = ev.target.closest('[data-attributo]')?.dataset.attributo;
    if (attributo) contenitoreTerreno.innerHTML = htmlTerreno(attuale, pezzi, attributo);
    if (ev.target.closest('[data-azione="leggi-terreno"]')) {
      const stato = contenitoreTerreno.querySelector('#statoTerreno');
      ev.target.disabled = true;
      stato.textContent = 'Chiedo a OpenStreetMap le vie lungo il percorso…';
      try {
        const terreno = await leggiTerrenoDaOsm(pezzi);
        const nuovoTerreno = { ...attuale, terreno, fonteTerreno: 'overpass', aggiornatoTerreno: new Date().toISOString() };
        attuale = virtuale ? nuovoTerreno : await salvaPercorso(nuovoTerreno);
        contenitoreTerreno.innerHTML = htmlTerreno(attuale, pezzi);
      } catch (err) {
        stato.innerHTML = `<span class="errore">${escapeHtml(err.message)}</span>`;
        ev.target.disabled = false;
      }
    }
  });

  app.querySelector('#moduloPercorso')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    attuale = await salvaPercorso({ ...attuale, nome: f.elements.nome.value.trim(), note: f.elements.note.value.trim() });
    app.querySelector('#salvato').hidden = false;
  });

  for (const b of app.querySelectorAll('[data-esporta]')) b.addEventListener('click', async () => {
    const file = new File([creaGpx({ nome: p.nome || 'Percorso', note: attuale.note ?? p.note ?? '', linee: quote?.pezzi ?? pezzi })], nomeFileGpx(p.nome), { type: 'application/gpx+xml' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: p.nome });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(file);
    const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });

  // condividere: GPX, link (senza server) o immagine; da un link ricevuto, salvarlo nei miei percorsi
  for (const b of app.querySelectorAll('[data-condividi]')) {
    b.addEventListener('click', () => apriCondividi({ nome: attuale.nome || p.nome, note: attuale.note ?? p.note ?? '', pezzi: quote?.pezzi ?? pezzi, originali, verso: invertito }));
  }
  for (const b of app.querySelectorAll('[data-salva-condiviso]')) {
    b.addEventListener('click', async () => {
      const idNuovo = nuovoIdPercorso();
      await salvaPercorso({ id: idNuovo, nome: virtuale.nome, note: virtuale.note, origine: 'condiviso', geojson: p.geojson, terreno: [], fonteTerreno: null });
      if (virtuale.verso) impostaVerso(idNuovo, true, false);
      location.hash = `#/percorso/${encodeURIComponent(idNuovo)}`;
    });
  }

  app.querySelector('#ripristina')?.addEventListener('click', async () => {
    if (!confirm('Ripristinare la traccia originale del file? Le modifiche fatte alla traccia andranno perse.')) return;
    await salvaPercorso(ripristinaOriginale(p));
    vistaPercorso(app, id, virtuale);
  });

  app.querySelector('#elimina')?.addEventListener('click', async () => {
    if (!confirm(`Eliminare il percorso "${p.nome}"?`)) return;
    await eliminaPercorso(p.id);
    location.hash = '#/pianifica';
  });

  app.querySelector('[data-inverti-verso]')?.addEventListener('click', () => {
    impostaVerso(p.id, !invertito, false);
    vistaPercorso(app, id, virtuale);
  });
  // il profilo altimetrico, se ci sono le quote
  const serieProfilo = quote?.pezzi ? profiloPezzi(quote.pezzi) : [];
  const puntoSuMappa = creaPuntoProfilo();
  if (serieProfilo.length > 1) {
    const boxProfilo = app.querySelector('#profiloPercorso');
    boxProfilo.innerHTML = htmlProfiloMini(serieProfilo, quote.fonte && quote.fonte !== 'traccia' ? testoFonteQuote(quote.fonte) : 'Quote della traccia');
    collegaProfiloMini(boxProfilo, () => serieProfilo, (x) => puntoSuMappa.mostra(x.p));
  }
  // senza quote (percorso disegnato o importato senza altitudini): si scaricano da sole, si salvano e la pagina si ricalcola
  if (scaricoQuote) {
    quoteProvate.add(chiaveQuote(p, originali));
    pezziConQuote(p, originali).then(({ fonte }) => {
      if (virtuale && p.quote) virtuale.quote = p.quote; // le quote scaricate restano per la prossima volta che la pagina si ridisegna
      if (fonte && app.isConnected && suPagina()) vistaPercorso(app, id, virtuale);
      else if (!fonte) app.querySelector('#numeriPercorso')?.insertAdjacentHTML('beforeend', '<p class="tenue piccolo">Quote non scaricabili ora (sei offline?): riprova riaprendo la pagina.</p>');
    });
  }
  const contenitore = app.querySelector('#miniMappa');
  if (!pezzi.length) return;
  // rifugi, bivacchi e acqua lungo il percorso, come nella scheda dei sentieri
  // fuori dai parchi e da "Intorno a me" i punti si scaricano per la zona del percorso
  const contenitorePunti = app.querySelector('#puntiLungo');
  contenitorePunti.innerHTML = '<section class="riquadro punti-percorso"><h2>Rifugi e acqua lungo il percorso</h2><p class="tenue">Cerco lungo il percorso…</p></section>';
  const puntiDelPercorso = puntiPerIlPercorso(virtuale ? 'bozza-disegno' : p.id, pezzi);
  puntiDelPercorso.then(({ punti, avviso }) => {
    if (contenitorePunti.isConnected) mostraPuntiLungoIlPercorso(contenitorePunti, { type: 'MultiLineString', coordinates: pezzi }, { punti, avviso, pezzi });
  });
  // meteo dei prossimi giorni, con la durata scelta (Solo andata / A/R)
  const misureMeteo = (modo = modoScelto()) => (ar ? misureScelte(ar, modo) : misure);
  const aggiornaMeteo = collegaQuandoAndare(app.querySelector('.quando-andare'), {
    sentiero: { panorama: null },
    traccia: { geojson: { type: 'MultiLineString', coordinates: pezzi } },
    quote: quoteMeteoDaiPezzi(quote?.pezzi ?? pezzi),
    misure: misureMeteo(),
  });
  app.querySelector('.andata-ritorno')?.addEventListener('input', (e) => e.target.matches('[data-ora]') && aggiornaMeteo(misureMeteo()));
  // andata e ritorno: la scelta cambia i numeri in alto, "Su più giorni" e il meteo
  const collegaAR = () => collegaAndataRitorno(app.querySelector('.andata-ritorno'), {
    ar,
    ricarica: () => vistaPercorso(app, id, virtuale),
    partenza: e ? e.inizio : null,
    alCambioModo: (modo) => {
      app.querySelector('#numeriPercorso').innerHTML = htmlNumeri(misure, fonteQuote, ar, modo);
      aggiornaMeteo(misureMeteo(modo));
      const giorni = app.querySelector('#contenitoreGiorni');
      if (giorni) {
        giorni.hidden = !serveGiorni(modo);
        // le giornate calcolate prima valevano per l'altra scelta
        giorni.querySelector('.giorni-risultato').innerHTML = '';
        giorni.querySelectorAll('[data-ore]').forEach((b) => {
          b.classList.remove('attiva');
          b.setAttribute('aria-pressed', 'false');
        });
      }
    },
  });
  collegaAR();
  // su più giorni: dove finisce ogni giornata e dove dormire
  collegaPiuGiorni(app.querySelector('.piu-giorni'), attuale, pezzi, puntiDelPercorso, {
    modo: modoScelto,
    conQuote: (pq, fonte) => {
      misure = misureDeiPezzi(pq);
      ar = arDa(misure);
      fonteQuote = fonte;
      const numeri = app.querySelector('#numeriPercorso');
      if (numeri) numeri.innerHTML = htmlNumeri(misure, fonte, ar);
      aggiornaMeteo(misureMeteo(), quoteMeteoDaiPezzi(pq));
      // anche il blocco Andata e ritorno, ora con le quote
      const blocco = app.querySelector('.andata-ritorno');
      if (blocco && ar) {
        blocco.outerHTML = htmlAndataRitorno(ar, modoScelto(), inizialiOrari);
        collegaAR();
      }
    },
  });
  const mini = creaMappa(contenitore, { anteprima: true });
  puntoSuMappa.collega(mini);
  const puntiNatura = L.layerGroup().addTo(mini);
  collegaNaturaPercorso(app.querySelector('#natura'), pezzi, (oss) => {
    puntiNatura.clearLayers();
    for (const o of oss) {
      L.circleMarker([o.lat, o.lon], { radius: 4, color: '#fff', weight: 1, fillColor: '#7c3aed', fillOpacity: 0.9, interactive: false }).addTo(puntiNatura);
    }
  });
  const g = disegnaPercorso(invertito ? invertiGeojson(p.geojson) : p.geojson, { colore: '#2563eb', frecce: false }).addTo(mini);
  mini.attenuaSentieri(true);
  requestAnimationFrame(() => {
    mini.invalidateSize();
    mini.fitBounds(g.getBounds(), { padding: [28, 28] });
  });
  return () => mini.remove();
}
