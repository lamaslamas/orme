import L from 'leaflet';
import { leggiGiro } from '../db.js';
import { calcolaGiro } from '../lib/giro.js';
import { escapeHtml } from '../lib/formato.js';
import { creaMappa } from './mappa.js';
import { aggiungiGps } from './gps.js';
import { aggiungiMisura } from './misura.js';
import { aggiungiAvvistamenti } from './livelloAvvistamenti.js';
import { aggiungiHeatmap } from './heatmap.js';
import { freccia, marcatoreEstremo } from './disegnoTraccia.js';
import { frecceLungoPercorso, SOGLIA_ANELLO_M } from '../lib/tracce.js';
import { distanzaKm } from '../lib/geo.js';
import { caricaContesto, htmlMisure } from './giri.js';

// colori ben distinguibili per le tappe, ripetuti se il giro è lungo
export const COLORI_TAPPE = ['#c2410c', '#2563eb', '#7c3aed', '#0f766e', '#be185d', '#a16207'];

const latlng = ([lon, lat]) => [lat, lon];

export async function vistaMappaGiro(app, id) {
  const [giro, contesto] = await Promise.all([leggiGiro(id), caricaContesto()]);
  if (!giro) {
    app.innerHTML = '<p class="vuoto">Giro non trovato. <a href="#/giri">Torna ai giri</a></p>';
    return;
  }
  const calcolo = calcolaGiro(giro, contesto.sentieri, contesto.tracce);

  document.body.classList.add('con-mappa');
  app.innerHTML = `
    <div class="mappa-barra">
      <a class="indietro" href="#/giro/${encodeURIComponent(id)}">‹ ${escapeHtml(giro.nome)}</a>
    </div>
    <div id="mappa" class="mappa"></div>
    <section class="pannello">
      <ol class="tappe legenda-tappe">
        ${calcolo.tappe
          .map(
            (t, i) =>
              `<li><span class="segno" style="background:${COLORI_TAPPE[i % COLORI_TAPPE.length]}"></span>${escapeHtml(t.etichetta)}${
                t.alContrario ? ' <span class="chip">al contrario</span>' : ''
              }</li>`,
          )
          .join('')}
      </ol>
      ${htmlMisure(calcolo)}
    </section>
  `;

  const mappa = creaMappa(app.querySelector('#mappa'), { livelli: ['heatmap', 'gps'] });
  const limiti = L.latLngBounds([]);
  const giaNumerate = new Set();

  for (const pezzo of calcolo.pezzi) {
    const colore = COLORI_TAPPE[pezzo.tappa % COLORI_TAPPE.length];
    L.polyline(pezzo.linea.map(latlng), { color: '#fff', weight: 9, opacity: 0.9, interactive: false }).addTo(mappa);
    const linea = L.polyline(pezzo.linea.map(latlng), { color: colore, weight: 5, opacity: 0.95 }).addTo(mappa);
    for (const f of frecceLungoPercorso([pezzo.linea], 3)) freccia(f.punto, f.direzione, colore).addTo(mappa);
    limiti.extend(linea.getBounds());
    // numero all'inizio di ogni tappa
    if (!giaNumerate.has(pezzo.tappa)) {
      giaNumerate.add(pezzo.tappa);
      L.marker(latlng(pezzo.linea[0]), {
        icon: L.divIcon({
          className: 'numero-tappa',
          html: `<span style="background:${colore}">${pezzo.tappa + 1}</span>`,
          iconSize: [24, 24],
        }),
        keyboard: false,
      })
        .bindTooltip(escapeHtml(calcolo.tappe[pezzo.tappa].etichetta))
        .addTo(mappa);
    }
  }

  for (const salto of calcolo.salti) {
    L.polyline(salto.punti.map(latlng), { color: '#475569', weight: 3, dashArray: '4 8' })
      .bindTooltip(`Salto di ${Math.round(salto.distanzaM)} m in linea d'aria`, { permanent: true, direction: 'center', className: 'etichetta-salto' })
      .addTo(mappa);
  }

  // arrivo del giro (oppure "partenza e arrivo" se si torna al punto di partenza)
  if (calcolo.pezzi.length) {
    const inizio = calcolo.pezzi[0].linea[0];
    const ultima = calcolo.pezzi[calcolo.pezzi.length - 1].linea;
    const fine = ultima[ultima.length - 1];
    const anello = distanzaKm(inizio, fine) * 1000 <= SOGLIA_ANELLO_M;
    marcatoreEstremo(anello ? inizio : fine, anello ? 'anello' : 'arrivo').addTo(mappa);
  }
  mappa.attenuaSentieri(calcolo.pezzi.length > 0);
  if (limiti.isValid()) mappa.fitBounds(limiti, { padding: [36, 36] });
  const fermaGps = aggiungiGps(mappa, () => (calcolo.pezzi.length ? { geojson: calcolo.geojson } : null));
  const misura = aggiungiMisura(mappa, () => (calcolo.pezzi.length ? [calcolo.geojson] : []));
  const avv = aggiungiAvvistamenti(mappa);
  const heat = aggiungiHeatmap(mappa, { occupata: () => misura.attiva() || avv.attiva() });
  requestAnimationFrame(() => mappa.invalidateSize());

  return () => {
    fermaGps();
    heat.rimuovi();
    mappa.remove();
    document.body.classList.remove('con-mappa');
  };
}
