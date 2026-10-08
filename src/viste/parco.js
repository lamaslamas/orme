import L from 'leaflet';
import { tuttiISentieri, tutteLeTracce } from '../db.js';
import { parcoDa } from '../datiParchi.js';
import { escapeHtml } from '../lib/formato.js';
import { creaMappa, disegnaTraccia } from './mappa.js';
import { COLORI_STATO } from './mappaGenerale.js';
import { ottieniConfine, disegnaConfine } from './confine.js';
import { montaElenco } from './lista.js';
import { impostaBanner } from './banner.js';
import { aggiungiAvvistamenti } from './livelloAvvistamenti.js';

export async function vistaParco(app, id) {
  const parco = parcoDa(id);
  if (!parco) {
    app.innerHTML = '<p class="vuoto">Parco non trovato. <a href="#/">Torna ai parchi</a></p>';
    return;
  }
  impostaBanner(parco.id);
  const [tutti, tracce] = await Promise.all([tuttiISentieri(), tutteLeTracce()]);
  const sentieri = tutti.filter((s) => s.parco === parco.id);
  const conTraccia = sentieri.filter((s) => tracce.has(s.id));
  const fatti = sentieri.filter((s) => s.stato === 'fatto').length;

  app.innerHTML = `
    <a class="indietro" href="#/">‹ Parchi</a>
    <article class="pagina-parco">
      <div class="anteprima-mappa parco-mappa"><div id="mappaParco"></div><p class="avviso-mappa" id="statoConfine">Carico il confine del parco…</p></div>
      <p class="zona">${escapeHtml(parco.regioni.join(' · '))}</p>
      <h1>${escapeHtml(parco.nomeBreve)}</h1>
      <p class="tenue nome-esteso">${escapeHtml(parco.nome)}</p>
      <div class="numeri-grandi">
        <div class="numero"><b>${sentieri.length}</b><span>Sentieri</span></div>
        <div class="numero"><b>${conTraccia.length}</b><span>Con traccia</span></div>
        <div class="numero"><b>${fatti}</b><span>Fatti</span></div>
      </div>
      <p class="descrizione">${escapeHtml(parco.descrizione)}</p>

      <section class="riquadro accesso accesso-guida">
        <h2>Regole del parco</h2>
        <p>${escapeHtml(parco.regole)}</p>
        <a href="${escapeHtml(parco.sito)}" target="_blank" rel="noopener">Sito ufficiale del Parco ↗</a>
        ${parco.daVerificare ? '<p class="tenue piccolo">Testi ricavati dal sito ufficiale: da verificare.</p>' : ''}
      </section>

      <div class="azioni">
        <a class="bottone" href="#/parco/${encodeURIComponent(parco.id)}/importa">Importa sentieri da OSM</a>
        <a class="bottone" href="#/nuovo?parco=${encodeURIComponent(parco.id)}">Aggiungi sentiero</a>
      </div>

      <h2 class="titolo-sezione">Sentieri</h2>
      <div id="elenco"></div>
    </article>
  `;

  const elenco = montaElenco(app.querySelector('#elenco'), sentieri, tracce, { parcoFisso: parco.id });

  const mappa = creaMappa(app.querySelector('#mappaParco'));
  // centratura immediata sul riquadro del parco; il confine, quando arriva, la affina
  mappa.fitBounds(
    [
      [parco.bbox[0], parco.bbox[1]],
      [parco.bbox[2], parco.bbox[3]],
    ],
    { padding: [10, 10] },
  );
  mappa.attenuaSentieri(true);
  aggiungiAvvistamenti(mappa, { filtro: (a) => a.parco === parco.id });
  for (const s of conTraccia) {
    disegnaTraccia(tracce.get(s.id).geojson, { color: COLORI_STATO[s.stato] ?? COLORI_STATO.da_fare, weight: 4 })
      .bindPopup(`<a href="#/sentiero/${encodeURIComponent(s.id)}">${escapeHtml(s.nome)}</a>`)
      .addTo(mappa);
  }
  requestAnimationFrame(() => {
    mappa.invalidateSize();
    mappa.fitBounds(
      [
        [parco.bbox[0], parco.bbox[1]],
        [parco.bbox[2], parco.bbox[3]],
      ],
      { padding: [10, 10] },
    );
  });

  const stato = app.querySelector('#statoConfine');
  let chiusa = false;
  ottieniConfine(parco)
    .then((confine) => {
      if (chiusa) return;
      const poligono = disegnaConfine(confine).addTo(mappa);
      mappa.fitBounds(poligono.getBounds(), { padding: [12, 12] });
      stato.hidden = true;
    })
    .catch((e) => {
      if (chiusa) return;
      stato.textContent = `Confine non disponibile: ${e.message}`;
    });

  return () => {
    chiusa = true;
    elenco.scollega();
    mappa.remove();
  };
}
