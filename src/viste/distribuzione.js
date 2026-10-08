// Livello "Distribuzione ufficiale (EEA)": celle di 10 km della Direttiva Habitat (Art. 17)
// per l'animale scelto. Fonte diversa dalla heatmap: dati riportati dall'Italia all'UE,
// non osservazioni di singole persone. Non interattivo: i tocchi restano alla heatmap.
import L from 'leaflet';
import { stato } from '../stato.js';
import { ANIMALI } from '../lib/costanti.js';
import { escapeHtml } from '../lib/formato.js';
import { FONTE_ART17, STATI_CONSERVAZIONE, haDistribuzione, descriviZona } from '../lib/distribuzione.js';

let datiInCorso = null;
function caricaDati() {
  datiInCorso ??= fetch(`${import.meta.env.BASE_URL}dati/distribuzione.json`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((d) => {
      if (!d) datiInCorso = null; // si riprova la prossima volta
      return d;
    });
  return datiInCorso;
}

export function aggiungiDistribuzione(mappa) {
  if (!mappa.getPane('distribuzione')) {
    mappa.createPane('distribuzione');
    mappa.getPane('distribuzione').style.zIndex = 340; // sotto la heatmap e le tracce
    mappa.getPane('distribuzione').style.pointerEvents = 'none';
  }
  let livello = null;
  let mostrata = null; // { animale, voci } attualmente sulla mappa
  let datiMancanti = false;
  let chiave = '';

  async function aggiorna() {
    const s = stato.leggi();
    const animale = s.livelli.distribuzione !== false && haDistribuzione(s.specie) ? s.specie : '';
    if (animale === chiave) return;
    chiave = animale;
    livello?.remove();
    livello = null;
    mostrata = null;
    if (!animale) return mappa.aggiornaLegenda?.();
    const dati = await caricaDati();
    if (chiave !== animale) return; // nel frattempo è cambiata la scelta
    datiMancanti = !dati;
    const voci = dati?.specie?.[animale] ?? [];
    livello = L.featureGroup(
      voci.map((v) =>
        L.polygon(v.anelli, {
          pane: 'distribuzione',
          interactive: false,
          color: STATI_CONSERVAZIONE[v.stato].colore,
          weight: 1.5,
          dashArray: '5 4',
          fillColor: STATI_CONSERVAZIONE[v.stato].colore,
          fillOpacity: 0.16,
          fillRule: 'evenodd',
        }),
      ),
    ).addTo(mappa);
    mostrata = { animale, voci };
    mappa.aggiornaLegenda?.();
  }

  mappa.vociLegenda?.push(() => {
    const s = stato.leggi();
    if (s.livelli.distribuzione === false) return '';
    if (!s.specie) return '<p class="voce-legenda tenue">Distribuzione ufficiale (EEA): scegli un animale per vederla.</p>';
    const nome = ANIMALI[s.specie] ?? s.specie;
    if (!haDistribuzione(s.specie)) {
      return `<p class="voce-legenda tenue">Distribuzione ufficiale: <b>non disponibile</b> per ${escapeHtml(nome)} (non è tra le specie della Direttiva Habitat riportate dall'Art. 17).</p>`;
    }
    if (datiMancanti) return '<p class="voce-legenda tenue">Distribuzione ufficiale: dati non raggiungibili ora.</p>';
    if (!mostrata || mostrata.animale !== s.specie) return '';
    return `<div class="voce-legenda">
      <b>Distribuzione ufficiale di ${escapeHtml(nome)}</b>
      <ul class="legenda-stati">${mostrata.voci
        .map(
          (v) =>
            `<li><span class="campione tratteggio" style="--colore:${STATI_CONSERVAZIONE[v.stato].colore}"></span>${escapeHtml(descriviZona(s.specie, v, nome).replace(`${nome} — `, ''))}</li>`,
        )
        .join('')}</ul>
      <p class="tenue piccolo">Celle di 10 km in cui l'Italia ha riportato la specie all'UE (Direttiva Habitat, Art. 17, 2013-2018). Indica la presenza generale, non dove trovare gli animali. <a href="${FONTE_ART17.url}" target="_blank" rel="noopener">${escapeHtml(FONTE_ART17.attribuzione)}, ${FONTE_ART17.licenza}</a></p>
    </div>`;
  });

  const scollega = stato.ascolta(aggiorna);
  mappa.on('unload', scollega);
  aggiorna();
}
