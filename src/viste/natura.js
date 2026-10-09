// iNaturalist lungo percorsi e sentieri (ricerca solo a richiesta: serve la rete)
import { GRUPPI, STAGIONI, urlOsservazioni, interpretaOsservazioni } from '../lib/inaturalist.js';
import {
  riquadroTraccia,
  osservazioniNellaFascia,
  specieConsistenti,
  FASCE_M,
  RAGGIO_SENTIERI_M,
  MINIMO_OSSERVAZIONI,
  MINIMO_PERSONE,
  MASSIMO_PAGINE,
} from '../lib/inaturalistTraccia.js';
import { escapeHtml } from '../lib/formato.js';

const MOSTRATE = 40;

async function scarica(pezzi, filtri, raggioM) {
  const riquadro = riquadroTraccia(pezzi, raggioM);
  let tutte = [];
  let totale = 0;
  for (let pagina = 1; pagina <= MASSIMO_PAGINE; pagina++) {
    const risposta = await fetch(urlOsservazioni(riquadro, filtri, { perPagina: 200, pagina }));
    if (!risposta.ok) throw new Error(`iNaturalist ha risposto ${risposta.status}`);
    const json = await risposta.json();
    totale = json.total_results ?? 0;
    tutte = tutte.concat(interpretaOsservazioni(json));
    if (tutte.length >= totale || !json.results?.length) break;
  }
  return { ...osservazioniNellaFascia(tutte, pezzi, raggioM), totale, scaricate: tutte.length };
}

function voceOsservazione(o) {
  return `<li>
    ${o.foto ? `<button type="button" class="foto-apri" data-foto="${escapeHtml(JSON.stringify({ url: o.foto.url, autore: o.foto.attribuzione, licenza: o.foto.licenza ?? '', pagina: o.url, titolo: o.specie }))}"><img src="${escapeHtml(o.foto.url)}" alt="" width="64" height="64" loading="lazy" /></button>` : '<div class="senza-foto"></div>'}
    <div>
      <b>${escapeHtml(o.specie)}</b> <span class="tenue">${escapeHtml(o.nomeScientifico)}</span><br />
      ${o.data ? escapeHtml(new Date(o.data).toLocaleDateString('it-IT')) : 'data non indicata'} · a ${Math.round(o.distanzaM)} m dalla traccia
      ${o.verificata ? '' : '<span class="chip">da confermare</span>'}<br />
      <a href="${escapeHtml(o.url)}" target="_blank" rel="noopener">Apri su iNaturalist ↗</a>
    </div>
  </li>`;
}

const notaSfumate = (n) =>
  n ? `<p class="tenue piccolo">${n} osservazioni nella zona hanno la posizione sfumata (specie protette): non sono confrontabili con il percorso e non sono mostrate.</p>` : '';

// --- Percorsi (Pianifica) ---

export function htmlNaturaPercorso() {
  return `<section class="riquadro" id="natura">
    <h2>Natura lungo il percorso</h2>
    <p class="tenue">Osservazioni di iNaturalist in una fascia attorno alla traccia.</p>
    <form class="modulo heat-filtri" id="filtriNatura">
      <select name="gruppo" aria-label="Gruppo">${Object.entries(GRUPPI).map(([k, g]) => `<option value="${k}">${g.nome}</option>`).join('')}</select>
      <select name="raggio" aria-label="Fascia">${FASCE_M.map((m) => `<option value="${m}" ${m === 250 ? 'selected' : ''}>Fascia di ${m} m</option>`).join('')}</select>
      <select name="stagione" aria-label="Periodo">${Object.entries(STAGIONI).map(([k, s]) => `<option value="${k}">${s.nome}</option>`).join('')}</select>
      <select name="anni" aria-label="Anni"><option value="0">Tutti gli anni</option><option value="3">Ultimi 3 anni</option><option value="5">Ultimi 5 anni</option><option value="10">Ultimi 10 anni</option></select>
      <label class="scelta intera-riga"><input type="checkbox" name="soloVerificate" checked /> Solo research grade</label>
      <button type="submit" class="bottone intera-riga">Cerca su iNaturalist</button>
    </form>
    <div id="risultatiNatura"></div>
  </section>`;
}

export function collegaNaturaPercorso(contenitore, pezzi, mostraPunti = () => {}) {
  const form = contenitore.querySelector('#filtriNatura');
  const esito = contenitore.querySelector('#risultatiNatura');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = form.elements;
    const filtri = { gruppo: f.gruppo.value, stagione: f.stagione.value, anni: Number(f.anni.value), soloVerificate: f.soloVerificate.checked };
    const raggio = Number(f.raggio.value);
    esito.innerHTML = '<p class="messaggio">Cerco su iNaturalist…</p>';
    let r;
    try {
      r = await scarica(pezzi, filtri, raggio);
    } catch (err) {
      esito.innerHTML = `<p class="errore">Osservazioni non disponibili (${escapeHtml(err.message)}).</p>`;
      return;
    }
    const ordinate = r.dentro.sort((a, b) => String(b.data).localeCompare(String(a.data)));
    mostraPunti(ordinate);
    esito.innerHTML = `
      <p><b>${ordinate.length}</b> ${ordinate.length === 1 ? 'osservazione' : 'osservazioni'} entro ${raggio} m dalla traccia.</p>
      ${r.totale > r.scaricate ? `<p class="tenue piccolo">Nella zona ce ne sono ${r.totale}: ho controllato le ${r.scaricate} più recenti.</p>` : ''}
      ${notaSfumate(r.sfumate)}
      <ul class="elenco-oss">${ordinate.slice(0, MOSTRATE).map(voceOsservazione).join('')}</ul>
      ${ordinate.length > MOSTRATE ? `<p class="tenue piccolo">Mostrate le ${MOSTRATE} più recenti.</p>` : ''}
      <p class="tenue piccolo">Dati e foto © degli autori su iNaturalist (licenze Creative Commons).</p>`;
  });
}

// --- Sentieri (Parchi): solo specie consistenti ---

export function htmlNaturaSentiero() {
  return `<section class="riquadro" id="naturaSentiero">
    <h2>Osservazioni iNaturalist vicine</h2>
    <p class="tenue">Fauna osservata entro ${RAGGIO_SENTIERI_M} m dalla traccia, solo se consistente (almeno ${MINIMO_OSSERVAZIONI} osservazioni verificate da almeno ${MINIMO_PERSONE} persone).</p>
    <button type="button" class="bottone" id="cercaNaturaSentiero">Cerca</button>
    <div id="risultatiNaturaSentiero"></div>
  </section>`;
}

export function collegaNaturaSentiero(contenitore, pezzi) {
  const esito = contenitore.querySelector('#risultatiNaturaSentiero');
  contenitore.querySelector('#cercaNaturaSentiero').addEventListener('click', async (e) => {
    e.target.disabled = true;
    esito.innerHTML = '<p class="messaggio">Cerco su iNaturalist…</p>';
    let r;
    try {
      r = await scarica(pezzi, { gruppo: 'fauna', stagione: 'tutto', anni: 0, soloVerificate: true }, RAGGIO_SENTIERI_M);
    } catch (err) {
      esito.innerHTML = `<p class="errore">Osservazioni non disponibili (${escapeHtml(err.message)}).</p>`;
      e.target.disabled = false;
      return;
    }
    const specie = specieConsistenti(r.dentro);
    esito.innerHTML = `
      ${
        specie.length
          ? `<ul class="elenco-link">${specie
              .map(
                (s) =>
                  `<li><b>${escapeHtml(s.specie)}</b>: ${s.osservazioni} osservazioni vicine, ${s.persone} persone${
                    s.mesiMigliori ? `, soprattutto ${escapeHtml(s.mesiMigliori)}` : ''
                  }</li>`,
              )
              .join('')}</ul>`
          : `<p>Nessuna specie con osservazioni consistenti (${r.dentro.length} osservazioni in tutto entro ${RAGGIO_SENTIERI_M} m).</p>`
      }
      ${notaSfumate(r.sfumate)}
      <p class="tenue piccolo">Non è un censimento: dipende da dove passano e fotografano le persone. Dati © iNaturalist (CC).</p>`;
  });
}
