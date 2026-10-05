import L from 'leaflet';
import { tuttiISentieri, tutteLeTracce } from '../db.js';
import { filtraSentieri, ordinaSentieri, dividiPerTraccia, unisciGeometrie } from '../lib/filtri.js';
import { escapeHtml, codici } from '../lib/formato.js';
import { creaMappa, disegnaTraccia } from './mappa.js';
import { aggiungiGps } from './gps.js';
import { leggiFiltri, htmlFiltri, collegaFiltri, filtriAttivi } from './filtri.js';

export const COLORI_STATO = {
  da_fare: '#c2410c',
  fatto: '#15803d',
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
      <details class="filtri-mappa">
        <summary id="riassuntoFiltri">Filtri</summary>
        ${htmlFiltri(sentieri, filtri)}
        <button type="button" class="link" id="azzera">Azzera filtri</button>
      </details>
    </div>
    <div id="mappa" class="mappa"></div>
    <section class="pannello">
      <h2 class="titolo-sezione" id="titoloSenza"></h2>
      <ul class="senza-traccia" id="senzaTraccia"></ul>
    </section>
  `;

  const mappa = creaMappa(app.querySelector('#mappa'));
  const livello = L.layerGroup().addTo(mappa);
  let visibili = [];
  let primaVolta = true;

  const Legenda = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd() {
      this.div = L.DomUtil.create('div', 'legenda');
      return this.div;
    },
  });
  const legenda = new Legenda().addTo(mappa);

  const fermaGps = aggiungiGps(mappa, () => (visibili.length ? { geojson: unisciGeometrie(visibili) } : null));

  function disegna() {
    const filtrati = ordinaSentieri(filtraSentieri(sentieri, filtri));
    const { conTraccia, senzaTraccia } = dividiPerTraccia(filtrati, tracce);
    visibili = conTraccia.map((x) => x.traccia);

    livello.clearLayers();
    const limiti = L.latLngBounds([]);
    // prima i "fatto", così i "da fare" restano sopra e ben visibili
    for (const { sentiero, traccia } of [...conTraccia].sort((a, b) => sopra(a) - sopra(b))) {
      const colore = COLORI_STATO[sentiero.stato] ?? COLORI_STATO.da_fare;
      const linea = disegnaTraccia(traccia.geojson, { color: colore, weight: 4 }).addTo(livello);
      // linea invisibile più larga: più facile da toccare con il dito
      const area = disegnaTraccia(traccia.geojson, { color: colore, weight: 22, opacity: 0 }).addTo(livello);
      area.bindPopup(riquadroSentiero(sentiero));
      area.on('popupopen', () => linea.setStyle({ weight: 7 }));
      area.on('popupclose', () => linea.setStyle({ weight: 4 }));
      limiti.extend(linea.getBounds());
    }
    if (primaVolta && limiti.isValid()) mappa.fitBounds(limiti, { padding: [24, 24], maxZoom: 14 });
    primaVolta = false;

    const conta = (stato) => conTraccia.filter((x) => x.sentiero.stato === stato).length;
    legenda.div.innerHTML = `
      <div><span class="segno" style="background:${COLORI_STATO.da_fare}"></span>Da fare (${conta('da_fare')})</div>
      <div><span class="segno" style="background:${COLORI_STATO.fatto}"></span>Fatto (${conta('fatto')})</div>`;

    const n = filtriAttivi(filtri);
    app.querySelector('#riassuntoFiltri').textContent =
      `Filtri${n ? ` (${n} ${n === 1 ? 'attivo' : 'attivi'})` : ''} · ` +
      `${conTraccia.length} ${conTraccia.length === 1 ? 'traccia' : 'tracce'} su ${filtrati.length} ${filtrati.length === 1 ? 'sentiero' : 'sentieri'}`;
    app.querySelector('#azzera').hidden = !n;

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

  const controlli = collegaFiltri(app.querySelector('.filtri'), filtri, disegna);
  app.querySelector('#azzera').addEventListener('click', () => controlli.azzera());
  requestAnimationFrame(() => mappa.invalidateSize());

  return () => {
    fermaGps();
    mappa.remove();
    document.body.classList.remove('con-mappa');
  };
}
