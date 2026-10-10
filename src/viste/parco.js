import L from 'leaflet';
import { tuttiISentieri, tutteLeTracce } from '../db.js';
import { parcoDa } from '../datiParchi.js';
import { escapeHtml } from '../lib/formato.js';
import { creaMappa } from './mappa.js';
import { COLORI_STATO } from './mappaGenerale.js';
import { percorsiToccabili } from './toccaPercorso.js';
import { ottieniConfine, disegnaConfine } from './confine.js';
import { montaElenco } from './lista.js';
import { impostaBanner } from './banner.js';
import { aggiungiAvvistamenti } from './livelloAvvistamenti.js';
import { aggiungiHeatmap } from './heatmap.js';
import { aggiungiDistribuzione } from './distribuzione.js';
import { aggiungiGps } from './gps.js';
import { stato } from '../stato.js';
import { ANIMALI } from '../lib/costanti.js';
import { htmlSelettoreAttivita, collegaSelettoreAttivita } from './attivita.js';
import { htmlFaunaParco, collegaFaunaParco } from './faunaParco.js';

export async function vistaParco(app, id) {
  const parco = parcoDa(id);
  if (parco?.zona) {
    location.replace('#/intorno');
    return;
  }
  if (!parco) {
    app.innerHTML = '<p class="vuoto">Parco non trovato. <a href="#/">Torna ai parchi</a></p>';
    return;
  }
  impostaBanner(parco.id);
  const [tutti, tracce] = await Promise.all([tuttiISentieri(), tutteLeTracce()]);
  const sentieri = tutti.filter((s) => (s.parchi ?? [s.parco]).includes(parco.id));
  const conTraccia = sentieri.filter((s) => tracce.has(s.id));

  app.innerHTML = `
    <a class="indietro" href="#/">‹ Parchi</a>
    <article class="pagina-parco">
      <div class="anteprima-mappa parco-mappa"><div id="mappaParco"></div><p class="avviso-mappa" id="statoConfine">Carico il confine del parco…</p></div>
      <div class="animali-parco" role="group" aria-label="Animali del parco">
        ${parco.animali
          .map((a) => `<button type="button" class="pillola ${stato.leggi().specie === a ? 'attiva' : ''}" data-animale="${a}">${ANIMALI[a]}</button>`)
          .join('')}
      </div>
      <p class="zona">${escapeHtml(parco.regioni.join(' · '))} · ${sentieri.length} sentieri</p>
      <h1>${escapeHtml(parco.nomeBreve)}</h1>
      <p class="tenue nome-esteso">${escapeHtml(parco.nome)}</p>
      <p class="descrizione">${escapeHtml(parco.descrizione)}</p>
      </div>

      <h2 class="titolo-sezione">Percorsi</h2>
      ${htmlSelettoreAttivita({ titolo: false })}
      <div id="elenco"></div>

      ${htmlFaunaParco()}

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
    </article>
  `;

  const scollegaAttivita = collegaSelettoreAttivita(app);
  collegaFaunaParco(app, parco, sentieri);
  // la mappa mostra gli stessi percorsi dell'elenco (modalità e filtri scelti)
  let ultimoRisultato = null;
  let disegnaPercorsi = () => {};
  // l'elenco segue la mappa: solo i percorsi nella zona inquadrata (con "tutti" per vederli tutti)
  let mappa = null;
  let seguiMappa = true;
  let chiaveDisegnata = null;
  const riquadri = new Map(conTraccia.map((s) => [s.id, L.geoJSON(tracce.get(s.id).geojson).getBounds()]));
  const elenco = montaElenco(app.querySelector('#elenco'), sentieri, tracce, {
    parcoFisso: parco.id,
    alRisultato: (risultato) => {
      // spostando la mappa i percorsi filtrati non cambiano: niente da ridisegnare
      const chiave = risultato.map((p) => p.sentiero.id).join();
      if (chiave === chiaveDisegnata) return;
      chiaveDisegnata = chiave;
      ultimoRisultato = risultato;
      disegnaPercorsi();
    },
    limita: {
      filtro: (p) => !seguiMappa || !mappa || Boolean(riquadri.get(p.sentiero.id)?.intersects(mappa.getBounds())),
      testo: (n, totale) =>
        n < totale
          ? `<b>${n}</b> nella zona inquadrata su ${totale} · <button type="button" class="link" data-azione="tutti-i-percorsi">mostra tutti</button>`
          : `${totale} ${totale === 1 ? 'percorso' : 'percorsi'}`,
    },
  });
  app.querySelector('#elenco').addEventListener('click', (e) => {
    if (!e.target.closest('[data-azione="tutti-i-percorsi"]')) return;
    seguiMappa = false;
    elenco.ricalcola();
  });

  mappa = creaMappa(app.querySelector('#mappaParco'), { livelli: ['heatmap', 'distribuzione', 'percorsi', 'confini', 'gps'] });
  let attesaVista = null;
  mappa.on('moveend', () => {
    clearTimeout(attesaVista);
    attesaVista = setTimeout(() => {
      seguiMappa = true;
      elenco.ricalcola();
    }, 200);
  });
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
  aggiungiDistribuzione(mappa);
  const heat = aggiungiHeatmap(mappa, { occupata: () => avv.attiva() });
  const percorsi = L.layerGroup();
  const toccabili = percorsiToccabili(mappa, { occupata: () => avv.attiva() });
  disegnaPercorsi = () => {
    percorsi.clearLayers();
    for (const { sentiero: s, traccia } of ultimoRisultato ?? conTraccia.map((x) => ({ sentiero: x, traccia: tracce.get(x.id) }))) {
      if (!traccia?.geojson) continue;
      toccabili.disegna(percorsi, s, traccia, { color: COLORI_STATO[s.stato] ?? COLORI_STATO.da_fare, weight: 3.5, opacity: 0.85 });
    }
  };
  disegnaPercorsi();
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
      const poligono = disegnaConfine(confine, { scelto: true });
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
    clearTimeout(attesaVista);
    elenco.scollega();
    scollegaAnimali();
    scollegaAttivita();
    fermaGps();
    heat.rimuovi();
    mappa.remove();
  };
}
