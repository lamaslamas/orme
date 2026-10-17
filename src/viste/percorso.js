// Scheda di un percorso della sezione Pianifica
import { leggiPercorso, salvaPercorso, eliminaPercorso } from '../db.js';
import { percorsoSentiero, estremiTraccia } from '../lib/tracce.js';
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
import { htmlPiuGiorni, collegaPiuGiorni, ORE_AL_GIORNO, quoteDisponibili } from './piuGiorni.js';
import { misureDeiPezzi } from '../lib/lungoIlPercorso.js';
import { testoFonteQuote } from './quote.js';
import { misureAR, misureScelte, eAnelloPezzi } from '../lib/andataRitorno.js';
import { htmlAndataRitorno, collegaAndataRitorno, modoScelto } from './andataRitorno.js';
import { htmlQuandoAndare, collegaQuandoAndare } from './quandoAndare.js';
import { quoteMeteoDaiPezzi } from '../lib/quandoAndare.js';
import L from 'leaflet';

// numeri in alto: lo stesso calcolo del blocco Andata e ritorno, secondo la scelta
function htmlNumeri(misure, fonte, ar = null, modo = modoScelto()) {
  const scelte = ar ? { ...misureScelte(ar, modo), durataStimata: true, conQuote: misure.conQuote } : misure;
  const didascalia = ar ? `<p class="tenue piccolo nota-numeri">${ar.anello ? 'Giro ad anello' : modo === 'ar' ? 'Andata e ritorno' : 'Solo andata'} · metodo CAI</p>` : '';
  return `${numeriGrandi(scelte)}${didascalia}
      ${
        !misure.conQuote
          ? '<p class="tenue">Dislivello non disponibile: il percorso non ha le quote.</p>'
          : fonte && fonte !== 'traccia'
            ? `<p class="tenue piccolo">Dislivello e durata: ${testoFonteQuote(fonte)}.</p>`
            : ''
      }`;
}

export async function vistaPercorso(app, id) {
  const p = await leggiPercorso(id);
  if (!p) {
    app.innerHTML = '<p class="vuoto">Percorso non trovato. <a href="#/pianifica">Torna a Pianifica</a></p>';
    return;
  }
  const pezzi = percorsoSentiero(p.geojson).pezzi;
  // un solo calcolo per tutta la pagina: con le quote della traccia o, se salvate, di Open-Meteo
  const quote = quoteDisponibili(p, pezzi);
  let misure = misureDeiPezzi(quote?.pezzi ?? pezzi);
  // andata e ritorno (o il giro, se è un anello) con il metodo CAI nei due sensi
  const arDa = (m) => (pezzi.length ? misureAR({ km: Math.round(m.km * 10) / 10, salita: m.salita, discesa: m.discesa }, { anello: eAnelloPezzi(pezzi) }) : null);
  let ar = arDa(misure);
  let fonteQuote = quote?.fonte;
  // "Su più giorni" se la camminata scelta supera la giornata più corta
  const serveGiorni = (modo) => ar && misureScelte(ar, modo).durataMin > ORE_AL_GIORNO[0] * 60;
  const e = estremiTraccia(p.geojson);
  const idUrl = encodeURIComponent(p.id);

  app.innerHTML = `
    <a class="indietro" href="#/pianifica">‹ Pianifica</a>
    <article class="scheda">
      <a class="anteprima-mappa" href="#/percorso/${idUrl}/mappa" aria-label="Apri la mappa grande del percorso"><div id="miniMappa"></div></a>
      <h1>${escapeHtml(p.nome || 'Percorso senza nome')}</h1>
      <p class="zona">${p.origine === 'disegnato' ? 'Disegnato sulla mappa (BRouter)' : p.origine === 'kml' ? 'Da file KML' : 'Da file GPX'}</p>
      <div id="numeriPercorso">${htmlNumeri(misure, quote?.fonte, ar)}</div>
      ${ar ? htmlAndataRitorno(ar) : ''}
      ${htmlQuandoAndare()}
      ${htmlProfiloPendenze(quote?.pezzi ?? pezzi)}
      <div id="contenitoreTerreno">${htmlTerreno(p, pezzi)}</div>
      ${pezzi.length ? '<div id="puntiLungo"></div>' : ''}
      ${pezzi.length ? `<div id="contenitoreGiorni" ${serveGiorni(modoScelto()) ? '' : 'hidden'}>${htmlPiuGiorni()}</div>` : ''}
      ${pezzi.length ? htmlNaturaPercorso() : ''}
      ${e ? htmlPortamiAllaPartenza({ lat: e.inizio[1], lon: e.inizio[0], fonte: 'traccia' }) : ''}
      <section class="riquadro">
        <h2>Note</h2>
        <form class="modulo" id="moduloPercorso">
          <label class="campo"><span>Nome</span><input name="nome" value="${escapeHtml(p.nome)}" /></label>
          <label class="campo"><span>Note</span><textarea name="note" rows="3">${escapeHtml(p.note)}</textarea></label>
          <button type="submit" class="bottone">Salva</button> <span class="salvato" id="salvato" hidden>Salvato</span>
        </form>
      </section>
      <div class="barra-azioni">
        <button type="button" class="bottone primario" id="esporta">Esporta GPX</button>
        <a class="bottone" href="#/percorso/${idUrl}/disegna">Modifica traccia</a>
      </div>
      <button type="button" class="bottone pericolo pieno" id="elimina">Elimina percorso</button>
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
        attuale = await salvaPercorso({ ...attuale, terreno, fonteTerreno: 'overpass', aggiornatoTerreno: new Date().toISOString() });
        contenitoreTerreno.innerHTML = htmlTerreno(attuale, pezzi);
      } catch (err) {
        stato.innerHTML = `<span class="errore">${escapeHtml(err.message)}</span>`;
        ev.target.disabled = false;
      }
    }
  });

  app.querySelector('#moduloPercorso').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    attuale = await salvaPercorso({ ...attuale, nome: f.elements.nome.value.trim(), note: f.elements.note.value.trim() });
    app.querySelector('#salvato').hidden = false;
  });

  app.querySelector('#esporta').addEventListener('click', async () => {
    const file = new File([creaGpx({ nome: p.nome || 'Percorso', linee: pezzi })], nomeFileGpx(p.nome), { type: 'application/gpx+xml' });
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

  app.querySelector('#elimina').addEventListener('click', async () => {
    if (!confirm(`Eliminare il percorso "${p.nome}"?`)) return;
    await eliminaPercorso(p.id);
    location.hash = '#/pianifica';
  });

  const contenitore = app.querySelector('#miniMappa');
  if (!pezzi.length) return;
  // rifugi, bivacchi e acqua lungo il percorso, come nella scheda dei sentieri
  // fuori dai parchi e da "Intorno a me" i punti si scaricano per la zona del percorso
  const contenitorePunti = app.querySelector('#puntiLungo');
  contenitorePunti.innerHTML = '<section class="riquadro punti-percorso"><h2>Rifugi e acqua lungo il percorso</h2><p class="tenue">Cerco lungo il percorso…</p></section>';
  const puntiDelPercorso = puntiPerIlPercorso(p.id, pezzi);
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
        blocco.outerHTML = htmlAndataRitorno(ar);
        collegaAR();
      }
    },
  });
  const mini = creaMappa(contenitore, { anteprima: true });
  const puntiNatura = L.layerGroup().addTo(mini);
  collegaNaturaPercorso(app.querySelector('#natura'), pezzi, (oss) => {
    puntiNatura.clearLayers();
    for (const o of oss) {
      L.circleMarker([o.lat, o.lon], { radius: 4, color: '#fff', weight: 1, fillColor: '#7c3aed', fillOpacity: 0.9, interactive: false }).addTo(puntiNatura);
    }
  });
  const g = disegnaPercorso(p.geojson, { colore: '#2563eb', frecce: false }).addTo(mini);
  mini.attenuaSentieri(true);
  requestAnimationFrame(() => {
    mini.invalidateSize();
    mini.fitBounds(g.getBounds(), { padding: [28, 28] });
  });
  return () => mini.remove();
}
