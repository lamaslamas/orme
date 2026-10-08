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
import { aggiungiHeatmap } from './heatmap.js';
import { aggiungiGps } from './gps.js';
import { stato } from '../stato.js';
import { ANIMALI } from '../lib/costanti.js';
import { htmlSelettoreAttivita, collegaSelettoreAttivita } from './attivita.js';

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
      <div class="animali-parco" role="group" aria-label="Animali del parco">
        ${parco.animali
          .map((a) => `<button type="button" class="pillola ${stato.leggi().specie === a ? 'attiva' : ''}" data-animale="${a}">${ANIMALI[a]}</button>`)
          .join('')}
      </div>
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

      <h2 class="titolo-sezione">Percorsi</h2>
      ${htmlSelettoreAttivita({ titolo: false })}
      <div id="elenco"></div>
    </article>
  `;

  const scollegaAttivita = collegaSelettoreAttivita(app);
  const elenco = montaElenco(app.querySelector('#elenco'), sentieri, tracce, { parcoFisso: parco.id });

  const mappa = creaMappa(app.querySelector('#mappaParco'), { livelli: ['heatmap', 'percorsi', 'confini', 'gps'] });
  // centratura immediata sul riquadro del parco; il confine, quando arriva, la affina
  mappa.fitBounds(
    [
      [parco.bbox[0], parco.bbox[1]],
      [parco.bbox[2], parco.bbox[3]],
    ],
    { padding: [10, 10] },
  );
  mappa.attenuaSentieri(true);
  const fermaGps = aggiungiGps(mappa, () => null);
  const avv = aggiungiAvvistamenti(mappa, { filtro: (a) => a.parco === parco.id });
  const heat = aggiungiHeatmap(mappa, { occupata: () => avv.attiva() });
  const percorsi = L.layerGroup();
  for (const s of conTraccia) {
    disegnaTraccia(tracce.get(s.id).geojson, { color: COLORI_STATO[s.stato] ?? COLORI_STATO.da_fare, weight: 4 })
      .bindPopup(`<a href="#/sentiero/${encodeURIComponent(s.id)}">${escapeHtml(s.nome)}</a>`)
      .addTo(percorsi);
  }
  mappa.suLivello('percorsi', (acceso) => (acceso ? percorsi.addTo(mappa) : percorsi.remove()));

  // selettore degli animali: è la stessa scelta di heatmap e filtri
  const selettore = app.querySelector('.animali-parco');
  selettore.addEventListener('click', (e) => {
    const a = e.target.closest('[data-animale]')?.dataset.animale;
    if (!a) return;
    const nuovo = stato.leggi().specie === a ? '' : a;
    stato.imposta({ specie: nuovo, ...(nuovo ? { livelli: { heatmap: true } } : {}) });
  });
  const scollegaAnimali = stato.ascolta((s) => {
    for (const b of selettore.querySelectorAll('[data-animale]')) b.classList.toggle('attiva', b.dataset.animale === s.specie);
  });
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

  const avvisoConfine = app.querySelector('#statoConfine');
  let chiusa = false;
  ottieniConfine(parco)
    .then((confine) => {
      if (chiusa) return;
      const poligono = disegnaConfine(confine);
      mappa.suLivello('confini', (acceso) => (acceso ? poligono.addTo(mappa) : poligono.remove()));
      mappa.fitBounds(poligono.getBounds(), { padding: [12, 12] });
      avvisoConfine.hidden = true;
    })
    .catch((e) => {
      if (chiusa) return;
      avvisoConfine.textContent = `Confine non disponibile: ${e.message}`;
    });

  return () => {
    chiusa = true;
    elenco.scollega();
    scollegaAnimali();
    scollegaAttivita();
    fermaGps();
    heat.rimuovi();
    mappa.remove();
  };
}
