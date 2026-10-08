import L from 'leaflet';
import { tuttiISentieri, tutteLeTracce } from '../db.js';
import { dividiPerTraccia, unisciGeometrie } from '../lib/filtri.js';
import { preparaPercorsi, filtraPercorsi } from '../lib/motore.js';
import { htmlSelettoreAttivita, collegaSelettoreAttivita } from './attivita.js';
import { escapeHtml, codici } from '../lib/formato.js';
import { creaMappa, disegnaTraccia } from './mappa.js';
import { aggiungiGps } from './gps.js';
import { aggiungiMisura } from './misura.js';
import { aggiungiAvvistamenti } from './livelloAvvistamenti.js';
import { aggiungiHeatmap } from './heatmap.js';
import { aggiungiDistribuzione } from './distribuzione.js';
import { disegnaPercorso } from './disegnoTraccia.js';
import { tuttiIConfini } from '../db.js';
import { disegnaConfine, ottieniConfine } from './confine.js';
import { leggiFiltri, htmlFiltri, collegaFiltri, filtriAttivi } from './filtri.js';
import { stato } from '../stato.js';
import { parcoDa, PARCHI } from '../datiParchi.js';

// Tracce "di sfondo" quando non c'è una ricerca: discrete, per non affollare la mappa
const STILE_DISCRETO = { color: '#475569', weight: 2, opacity: 0.45 };

// Riquadro di un parco, o di tutti i parchi
export function limitiParco(idParco) {
  const parchi = idParco ? [parcoDa(idParco)].filter(Boolean) : PARCHI;
  const b = L.latLngBounds([]);
  for (const p of parchi) b.extend([[p.bbox[0], p.bbox[1]], [p.bbox[2], p.bbox[3]]]);
  return b;
}

export const COLORI_STATO = {
  da_fare: '#c2410c',
  fatto: '#2f9e6b',
};

function riquadroSentiero(s) {
  const id = encodeURIComponent(s.id);
  return `
    <div class="popup-sentiero">
      ${s.codici?.length ? `<span class="codice">${escapeHtml(codici(s))}</span> ` : ''}<b>${escapeHtml(s.nome)}</b>
      <div class="tenue">${s.stato === 'fatto' ? 'Fatto' : 'Da fare'}</div>
      <a href="#/sentiero/${id}">Apri la scheda</a> · <a href="#/sentiero/${id}/mappa">Mappa del sentiero</a>
    </div>`;
}

const sopra = (x) => (x.sentiero.stato === 'fatto' ? 0 : 1);

export async function vistaMappaGenerale(app) {
  const [sentieri, tracce] = await Promise.all([tuttiISentieri(), tutteLeTracce()]);
  const filtri = leggiFiltri();

  document.body.classList.add('con-mappa');
  app.innerHTML = `
    <div class="mappa-barra">
      ${htmlSelettoreAttivita({ titolo: false })}
      ${htmlFiltri(sentieri, filtri)}
      <div class="riassunto-mappa" id="riassuntoFiltri"></div>
      <p class="avviso-vuoto" id="nessunRisultato" hidden>Nessun percorso con traccia corrisponde ai filtri.
        <button type="button" class="link" data-azione="reimposta">Reimposta filtri</button></p>
    </div>
    <div id="mappa" class="mappa"></div>
    <section class="pannello">
      <h2 class="titolo-sezione" id="titoloSenza"></h2>
      <ul class="senza-traccia" id="senzaTraccia"></ul>
    </section>
  `;

  const mappa = creaMappa(app.querySelector('#mappa'), { livelli: ['heatmap', 'distribuzione', 'percorsi', 'confini', 'gps'] });
  // confini dei parchi già scaricati (si scaricano aprendo la pagina del parco)
  const confini = L.layerGroup();
  for (const confine of await tuttiIConfini()) disegnaConfine(confine).addTo(confini);
  mappa.suLivello('confini', (acceso) => (acceso ? confini.addTo(mappa) : confini.remove()));
  const livello = L.layerGroup();
  mappa.suLivello('percorsi', (acceso) => (acceso ? livello.addTo(mappa) : livello.remove()));
  const selezione = L.layerGroup().addTo(mappa);
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
        disegnaConfine(confine).setStyle({ weight: 3.5, opacity: 0.95, fillOpacity: 0.08 }).addTo(confineScelto);
      })
      .catch(() => {}); // senza rete il riquadro del parco basta per inquadrarlo
  }
  let visibili = [];
  let primaVolta = true;
  let ultimiFiltri = '';

  // "Vista iniziale": niente filtri, niente parco, tutti i parchi inquadrati
  const VistaIniziale = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const div = L.DomUtil.create('div', 'leaflet-bar');
      const b = L.DomUtil.create('a', 'vista-iniziale', div);
      b.href = '#';
      b.title = 'Vista iniziale';
      b.setAttribute('role', 'button');
      b.setAttribute('aria-label', 'Torna alla vista iniziale');
      b.innerHTML =
        '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M3 11 12 4l9 7M6 9.5V20h12V9.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.on(b, 'click', (e) => {
        L.DomEvent.preventDefault(e);
        controlli.azzera();
        stato.imposta({ parco: '' });
        primaVolta = true;
      });
      return div;
    },
  });
  new VistaIniziale().addTo(mappa);

  const Legenda = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd() {
      this.div = L.DomUtil.create('div', 'legenda');
      return this.div;
    },
  });
  const legenda = new Legenda().addTo(mappa);

  const fermaGps = aggiungiGps(mappa, () => (visibili.length ? { geojson: unisciGeometrie(visibili) } : null));
  const misura = aggiungiMisura(mappa, () => visibili.map((t) => t.geojson));
  const avv = aggiungiAvvistamenti(mappa, { filtro: (a) => !filtri.parco || a.parco === filtri.parco });
  aggiungiDistribuzione(mappa);
  const heat = aggiungiHeatmap(mappa, { occupata: () => misura.attiva() || avv.attiva() });

  const preparati = preparaPercorsi(sentieri, tracce);
  function disegna() {
    mostraConfineScelto(filtri.parco);
    const filtrati = filtraPercorsi(preparati, filtri, stato.leggi().attivita).map((p) => p.sentiero);
    const { conTraccia, senzaTraccia } = dividiPerTraccia(filtrati, tracce);
    visibili = conTraccia.map((x) => x.traccia);

    livello.clearLayers();
    selezione.clearLayers();
    mappa.closePopup();
    // senza ricerca né filtri le tracce restano discrete; con una ricerca si evidenziano i risultati
    const ricerca = filtriAttivi(filtri) > 0 || stato.leggi().attivita !== 'trekking';
    mappa.attenuaSentieri(ricerca && conTraccia.length > 0);
    const limiti = L.latLngBounds([]);
    // prima i "fatto", così i "da fare" restano sopra e ben visibili
    for (const { sentiero, traccia } of [...conTraccia].sort((a, b) => sopra(a) - sopra(b))) {
      const colore = COLORI_STATO[sentiero.stato] ?? COLORI_STATO.da_fare;
      const linea = disegnaTraccia(traccia.geojson, ricerca ? { color: colore, weight: 4 } : STILE_DISCRETO).addTo(livello);
      // linea invisibile più larga: più facile da toccare con il dito
      const area = disegnaTraccia(traccia.geojson, { color: colore, weight: 22, opacity: 0 }).addTo(livello);
      // il riquadro si apre a mano (non con bindPopup, che fermerebbe il tocco):
      // così durante la misura il tocco arriva allo strumento di misura
      area.on('click', () => {
        if (misura.attiva() || avv.attiva()) return;
        // la traccia scelta si evidenzia con partenza, arrivo e verso di percorrenza
        // e viene inquadrata, lasciando in alto lo spazio per il riquadro
        selezione.clearLayers();
        const evidenziata = disegnaPercorso(traccia.geojson, { colore, spessore: 6 }).addTo(selezione);
        mappa.fitBounds(evidenziata.getBounds(), {
          paddingTopLeft: [40, 150],
          paddingBottomRight: [40, 30],
          maxZoom: 15,
          animate: false,
        });
        const limitiScelta = evidenziata.getBounds();
        L.popup({ autoPan: false })
          .setLatLng([limitiScelta.getNorth(), limitiScelta.getCenter().lng])
          .setContent(riquadroSentiero(sentiero))
          .on('remove', () => selezione.clearLayers())
          .openOn(mappa);
      });
      limiti.extend(linea.getBounds());
    }
    // a ogni cambio di filtri la mappa si sposta sui risultati (o sul parco scelto)
    const chiave = JSON.stringify(filtri);
    if (primaVolta || chiave !== ultimiFiltri) {
      if (ricerca && limiti.isValid()) mappa.fitBounds(limiti, { padding: [30, 30], maxZoom: 14 });
      else mappa.fitBounds(limitiParco(filtri.parco), { padding: [20, 20] });
    }
    primaVolta = false;
    ultimiFiltri = chiave;
    app.querySelector('#nessunRisultato').hidden = !(ricerca && conTraccia.length === 0);

    const conta = (s) => conTraccia.filter((x) => x.sentiero.stato === s).length;
    legenda.div.innerHTML = ricerca
      ? `<div><span class="segno" style="background:${COLORI_STATO.da_fare}"></span>Da fare (${conta('da_fare')})</div>
         <div><span class="segno" style="background:${COLORI_STATO.fatto}"></span>Fatto (${conta('fatto')})</div>`
      : `<div><span class="segno" style="background:${STILE_DISCRETO.color};opacity:.6"></span>Tracce in archivio (${conTraccia.length})</div>
         <div class="tenue">Cerca o filtra per evidenziarle</div>`;

    app.querySelector('#riassuntoFiltri').textContent =
      `${conTraccia.length} ${conTraccia.length === 1 ? 'traccia' : 'tracce'} su ` +
      `${filtrati.length} ${filtrati.length === 1 ? 'sentiero' : 'sentieri'}${filtriAttivi(filtri) ? ' filtrati' : ''}`;

    app.querySelector('#titoloSenza').textContent = senzaTraccia.length
      ? `Sentieri senza traccia (${senzaTraccia.length})`
      : 'Tutti i sentieri filtrati hanno una traccia.';
    app.querySelector('#senzaTraccia').innerHTML = senzaTraccia
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
  app.querySelector('#nessunRisultato').addEventListener('click', (e) => {
    if (e.target.closest('[data-azione="reimposta"]')) controlli.azzera();
  });
  requestAnimationFrame(() => mappa.invalidateSize());

  return () => {
    fermaGps();
    heat.rimuovi();
    controlli.scollega();
    scollegaAttivita();
    mappa.remove();
    document.body.classList.remove('con-mappa');
  };
}
