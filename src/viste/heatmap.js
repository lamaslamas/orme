// Livello "Fauna rara – iNaturalist" per la mappa principale: heatmap ufficiale di
// iNaturalist (tile già filtrate) ed elenco delle osservazioni toccando una zona.
// Non usa mai i miei avvistamenti personali.
import L from 'leaflet';
import { ANIMALI } from '../lib/costanti.js';
import { escapeHtml } from '../lib/formato.js';
import {
  STAGIONI,
  SPECIE_RARE,
  FILTRI_INAT_PREDEFINITI,
  urlTileHeatmap,
  urlOsservazioni,
  interpretaOsservazioni,
  riquadroAttorno,
} from '../lib/inaturalist.js';

const CHIAVE = 'orme.heatmap';
const RAGGIO_TOCCO_PX = 28;

const ICONA =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="9" cy="10" r="6" fill="currentColor" opacity=".35"/><circle cx="15" cy="14" r="6" fill="currentColor" opacity=".5"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/></svg>';

export const SPIEGAZIONE_HEATMAP = `
  <p><b>Cosa mostra.</b> Le zone colorate indicano dove sono state registrate più osservazioni su iNaturalist (dal rosa: poche, al giallo: molte). È una densità relativa, non un conteggio, e la scala cambia con lo zoom.</p>
  <p><b>Posizioni sfumate.</b> Per le specie protette (orso, lupo, camoscio e altre) iNaturalist sposta di proposito ogni osservazione dentro un quadrato di circa 20 km. Per queste specie la heatmap indica solo la zona generale: a zoom alto non va letta come posizione reale.</p>
  <p><b>Dove passano più persone.</b> Le osservazioni si concentrano vicino a strade, paesi e sentieri frequentati: una zona vuota spesso significa solo che lì nessuno ha fotografato, non che l'animale manchi. Non è un censimento.</p>
  <p><b>Solo verificate.</b> Con "solo research grade" restano le osservazioni con data, luogo e foto la cui specie è stata confermata da altri utenti.</p>
  <p class="tenue">Dati e foto © degli autori su iNaturalist, con licenze Creative Commons indicate su ogni osservazione. I tuoi avvistamenti personali non sono mai inclusi.</p>`;

function leggiFiltri() {
  try {
    return { ...FILTRI_INAT_PREDEFINITI, ...JSON.parse(sessionStorage.getItem(CHIAVE) ?? '{}') };
  } catch {
    return { ...FILTRI_INAT_PREDEFINITI };
  }
}

function salvaFiltri(f) {
  try {
    sessionStorage.setItem(CHIAVE, JSON.stringify(f));
  } catch {
    // pazienza
  }
}

function opzioniSpecie(scelta) {
  const voci = [
    ['rare', 'Tutte le specie rare della lista'],
    ['minacciate', 'Specie minacciate (iNaturalist)'],
    ...SPECIE_RARE.map((k) => [k, ANIMALI[k]]),
  ];
  return voci.map(([v, et]) => `<option value="${v}" ${scelta === v ? 'selected' : ''}>${escapeHtml(et)}</option>`).join('');
}

// occupata() dice se un altro strumento (misura, nuovo avvistamento) sta usando i tocchi
export function aggiungiHeatmap(mappa, { occupata = () => false } = {}) {
  const filtri = leggiFiltri();
  let livello = null;
  let attiva = false;

  if (!mappa.getPane('heatmap')) {
    mappa.createPane('heatmap');
    mappa.getPane('heatmap').style.zIndex = 350; // sopra le mappe, sotto le tracce
  }

  // parte ridotto (titolo e legenda): i filtri si aprono con un tocco
  const pannello = L.DomUtil.create('div', 'misura-barra pannello-heatmap ridotto');
  pannello.hidden = true;
  mappa.getContainer().appendChild(pannello);
  L.DomEvent.disableClickPropagation(pannello);
  L.DomEvent.disableScrollPropagation(pannello);

  const foglio = document.createElement('dialog');
  foglio.className = 'foglio';
  document.body.appendChild(foglio);
  foglio.addEventListener('click', (e) => {
    if (e.target === foglio || e.target.closest('[data-chiudi]')) foglio.close();
  });

  const Controllo = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const div = L.DomUtil.create('div', 'leaflet-bar');
      const b = L.DomUtil.create('a', 'heat-bottone', div);
      b.href = '#';
      b.title = 'Fauna rara – iNaturalist';
      b.setAttribute('role', 'button');
      b.setAttribute('aria-label', 'Mostra la heatmap della fauna rara (iNaturalist)');
      b.innerHTML = ICONA;
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.on(b, 'click', (e) => {
        L.DomEvent.preventDefault(e);
        attiva ? spegni() : accendi();
        b.classList.toggle('attivo', attiva);
        b.setAttribute('aria-pressed', String(attiva));
      });
      return div;
    },
  });
  new Controllo().addTo(mappa);

  function disegnaLivello() {
    livello?.remove();
    livello = L.tileLayer(urlTileHeatmap(filtri), {
      pane: 'heatmap',
      opacity: 0.8,
      maxZoom: 19,
      attribution: 'Osservazioni © <a href="https://www.inaturalist.org" target="_blank" rel="noopener">iNaturalist</a> (CC)',
    }).addTo(mappa);
  }

  function disegnaPannello() {
    pannello.innerHTML = `
      <div class="heat-testa"><b>Fauna rara · iNaturalist</b>
        <span><button type="button" class="link" data-azione="info">Come leggerla</button>
        <button type="button" class="chiudi-pannello" data-azione="riduci" aria-label="Mostra o nascondi i filtri">Filtri</button></span></div>
      <div class="heat-filtri">
        <select name="specie" aria-label="Specie">${opzioniSpecie(filtri.specie)}</select>
        <select name="stagione" aria-label="Periodo dell'anno">${Object.entries(STAGIONI)
          .map(([k, s]) => `<option value="${k}" ${filtri.stagione === k ? 'selected' : ''}>${s.nome}</option>`)
          .join('')}</select>
        <select name="anni" aria-label="Anni">${[
          [0, 'Tutti gli anni'],
          [1, "Ultimo anno"],
          [3, 'Ultimi 3 anni'],
          [5, 'Ultimi 5 anni'],
          [10, 'Ultimi 10 anni'],
        ]
          .map(([v, et]) => `<option value="${v}" ${Number(filtri.anni) === v ? 'selected' : ''}>${et}</option>`)
          .join('')}</select>
        <label class="scelta"><input type="checkbox" name="soloVerificate" ${filtri.soloVerificate ? 'checked' : ''}/> Solo research grade</label>
      </div>
      <div class="heat-legenda"><span>poche</span><i aria-hidden="true"></i><span>molte</span></div>
      <p class="misura-nota">Tocca una zona colorata per vedere le osservazioni. Dati © iNaturalist (CC).</p>`;
    pannello.hidden = false;
  }

  pannello.addEventListener('change', (e) => {
    const { name } = e.target;
    if (!name) return;
    filtri[name] = e.target.type === 'checkbox' ? e.target.checked : name === 'anni' ? Number(e.target.value) : e.target.value;
    salvaFiltri(filtri);
    disegnaLivello();
  });

  pannello.addEventListener('click', (e) => {
    e.stopPropagation();
    const azione = e.target.closest('[data-azione]')?.dataset.azione;
    if (azione === 'info') {
      foglio.innerHTML = `<div class="foglio-maniglia"></div><h2 class="foglio-titolo">Come leggere la heatmap</h2>${SPIEGAZIONE_HEATMAP}<button type="button" class="bottone pieno-largo" data-chiudi>Chiudi</button>`;
      foglio.showModal();
    }
    if (azione === 'riduci') pannello.classList.toggle('ridotto');
  });

  function accendi() {
    attiva = true;
    mappa.getContainer().classList.add('con-heatmap');
    disegnaLivello();
    disegnaPannello();
  }

  function spegni() {
    attiva = false;
    mappa.getContainer().classList.remove('con-heatmap');
    livello?.remove();
    livello = null;
    pannello.hidden = true;
  }

  async function mostraZona(e) {
    const centro = mappa.latLngToContainerPoint(e.latlng);
    const no = mappa.containerPointToLatLng(centro.subtract([RAGGIO_TOCCO_PX, RAGGIO_TOCCO_PX]));
    const se = mappa.containerPointToLatLng(centro.add([RAGGIO_TOCCO_PX, RAGGIO_TOCCO_PX]));
    foglio.innerHTML = '<div class="foglio-maniglia"></div><h2 class="foglio-titolo">Osservazioni in questa zona</h2><p class="messaggio">Cerco su iNaturalist…</p>';
    foglio.showModal();
    let elenco;
    try {
      const risposta = await fetch(urlOsservazioni(riquadroAttorno(e.latlng, no, se), filtri));
      if (!risposta.ok) throw new Error(`iNaturalist ha risposto ${risposta.status}`);
      const json = await risposta.json();
      elenco = { totale: json.total_results ?? 0, osservazioni: interpretaOsservazioni(json) };
    } catch (err) {
      foglio.querySelector('.messaggio').innerHTML = `<span class="errore">Osservazioni non disponibili (${escapeHtml(err.message)}).</span>`;
      return;
    }
    if (!foglio.open) return;
    foglio.innerHTML = `
      <div class="foglio-maniglia"></div>
      <h2 class="foglio-titolo">Osservazioni in questa zona</h2>
      <p class="tenue">${elenco.totale} ${elenco.totale === 1 ? 'osservazione' : 'osservazioni'}${
        elenco.totale > elenco.osservazioni.length ? `, le ${elenco.osservazioni.length} più recenti` : ''
      }. Con le posizioni sfumate una osservazione può trovarsi fino a ~10 km dal punto mostrato.</p>
      <ul class="elenco-oss">
        ${
          elenco.osservazioni
            .map(
              (o) => `<li>
            ${o.foto ? `<img src="${escapeHtml(o.foto.url)}" alt="" width="64" height="64" loading="lazy" />` : '<div class="senza-foto"></div>'}
            <div>
              <b>${escapeHtml(o.specie)}</b> <span class="tenue">${escapeHtml(o.nomeScientifico)}</span><br />
              ${o.data ? escapeHtml(new Date(o.data).toLocaleDateString('it-IT')) : 'data non indicata'}
              ${o.sfumata ? '<span class="chip chip-verifica">posizione sfumata</span>' : ''}
              ${o.verificata ? '' : '<span class="chip">da confermare</span>'}<br />
              <a href="${escapeHtml(o.url)}" target="_blank" rel="noopener">Apri su iNaturalist ↗</a>
              ${o.foto?.attribuzione ? `<div class="crediti">Foto ${escapeHtml(o.foto.attribuzione)}</div>` : ''}
            </div>
          </li>`,
            )
            .join('') || '<li class="vuoto">Nessuna osservazione con questi filtri in questo punto.</li>'
        }
      </ul>
      <button type="button" class="bottone pieno-largo" data-chiudi>Chiudi</button>`;
  }

  mappa.on('click', (e) => {
    if (!attiva || occupata()) return;
    // i tocchi sulle tracce aprono il loro riquadro, non l'elenco delle osservazioni
    if (e.originalEvent?.target?.classList?.contains('leaflet-interactive')) return;
    mostraZona(e);
  });

  return {
    attiva: () => attiva,
    rimuovi() {
      foglio.remove();
    },
  };
}
