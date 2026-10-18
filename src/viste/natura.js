// iNaturalist lungo percorsi e sentieri (ricerca solo a richiesta: serve la rete)
import { STAGIONI, urlOsservazioni, interpretaOsservazioni } from '../lib/inaturalist.js';
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
import { leggiGruppiSalvati, testoGruppi } from '../lib/gruppiFauna.js';
import { GRUPPI_FAUNA } from '../lib/costanti.js';
import { raggruppaPerSpecie, dataBreve } from '../lib/osservazioniPerSpecie.js';
import { htmlVoceOsservazione } from './vociOsservazioni.js';
import { iconaAnimale } from './icone.js';
import { iconaPerOsservazione } from '../lib/gbif.js';

const SPECIE_VISIBILI = 5;

async function scarica(pezzi, filtri, raggioM) {
  const riquadro = riquadroTraccia(pezzi, raggioM);
  // più ricerche se serve (i gruppi scelti e, a parte, le specie rare), senza doppioni
  const ricerche = Array.isArray(filtri) ? filtri : [filtri];
  const viste = new Set();
  let tutte = [];
  let totale = 0;
  for (const f of ricerche) {
    let fatte = 0;
    let tot = 0;
    for (let pagina = 1; pagina <= MASSIMO_PAGINE; pagina++) {
      const risposta = await fetch(urlOsservazioni(riquadro, f, { perPagina: 200, pagina }));
      if (!risposta.ok) throw new Error(`iNaturalist ha risposto ${risposta.status}`);
      const json = await risposta.json();
      tot = json.total_results ?? 0;
      const nuove = interpretaOsservazioni(json).filter((o) => !viste.has(o.id) && viste.add(o.id));
      tutte = tutte.concat(nuove);
      fatte += json.results?.length ?? 0;
      if (fatte >= tot || !json.results?.length) break;
    }
    totale += tot;
  }
  return { ...osservazioniNellaFascia(tutte, pezzi, raggioM), totale, scaricate: tutte.length };
}

const notaSfumate = (n) =>
  n ? `<p class="tenue piccolo">${n} osservazioni nella zona hanno la posizione approssimata dalla fonte: non si sa dove sono rispetto al percorso, quindi non sono mostrate.</p>` : '';

// --- Percorsi (Pianifica) ---

export function htmlNaturaPercorso() {
  return `<section class="riquadro" id="natura">
    <h2>Natura lungo il percorso</h2>
    <p class="tenue">Osservazioni di iNaturalist in una fascia attorno alla traccia, per i gruppi scelti nel pannello Fauna della mappa.</p>
    <p class="gruppi-attivi">Gruppi attivi: <b id="gruppiAttivi">${escapeHtml(testoGruppi(leggiGruppiSalvati()))}</b></p>
    <form class="modulo heat-filtri" id="filtriNatura">
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
    // i gruppi sono quelli scelti nel pannello Fauna (nessun gruppo nuovo qui)
    const gruppi = leggiGruppiSalvati();
    contenitore.querySelector('#gruppiAttivi').textContent = testoGruppi(gruppi);
    if (!gruppi.length) {
      esito.innerHTML = '<p class="tenue">Nessun gruppo attivo: scegli i gruppi nel pannello Fauna della mappa.</p>';
      return;
    }
    const comuni = { stagione: f.stagione.value, anni: Number(f.anni.value), soloVerificate: f.soloVerificate.checked };
    const normali = gruppi.filter((g) => GRUPPI_FAUNA[g]?.inat);
    const ricerche = [...(normali.length ? [{ specie: 'notevoli', gruppi: normali, ...comuni }] : []), ...(gruppi.includes('rare') ? [{ specie: 'notevoli', gruppi: ['rare'], ...comuni }] : [])];
    const raggio = Number(f.raggio.value);
    esito.innerHTML = '<p class="messaggio">Cerco su iNaturalist…</p>';
    let r;
    try {
      r = await scarica(pezzi, ricerche, raggio);
    } catch (err) {
      esito.innerHTML = `<p class="errore">Osservazioni non disponibili (${escapeHtml(err.message)}).</p>`;
      return;
    }
    const ordinate = r.dentro.sort((a, b) => String(b.data).localeCompare(String(a.data)));
    mostraPunti(ordinate);
    const specie = raggruppaPerSpecie(ordinate);
    const riga = (g) => `<li><details>
        <summary><span class="sp-icona">${iconaAnimale(g.icona ?? iconaPerOsservazione(g.oss[0]))}</span><b>${escapeHtml(g.nome)}</b> <i class="tenue">${escapeHtml(g.scientifico)}</i> · ${g.n} ${g.n === 1 ? 'osservazione' : 'osservazioni'} · ultima ${escapeHtml(dataBreve(g.ultima))}</summary>
        <ul class="elenco-oss">${g.oss.map((o) => htmlVoceOsservazione(o, { extra: `a ${Math.round(o.distanzaM)} m dalla traccia`, conNome: false })).join('')}</ul>
      </details></li>`;
    esito.innerHTML = `
      <p><b>${ordinate.length}</b> ${ordinate.length === 1 ? 'osservazione' : 'osservazioni'} di <b>${specie.length}</b> ${specie.length === 1 ? 'specie' : 'specie'} entro ${raggio} m dalla traccia.</p>
      ${r.totale > r.scaricate ? `<p class="tenue piccolo">Nella zona ce ne sono ${r.totale}: ho controllato le ${r.scaricate} più recenti.</p>` : ''}
      ${notaSfumate(r.sfumate)}
      <ul class="specie-oss">${specie.slice(0, SPECIE_VISIBILI).map(riga).join('')}</ul>
      ${specie.length > SPECIE_VISIBILI ? `<button type="button" class="bottone testo" data-mostra-tutte>Mostra tutte le ${specie.length} specie</button><ul class="specie-oss specie-altre" hidden>${specie.slice(SPECIE_VISIBILI).map(riga).join('')}</ul>` : ''}
      <p class="tenue piccolo">Dati e foto © degli autori su iNaturalist (licenze Creative Commons).</p>`;
    esito.querySelector('[data-mostra-tutte]')?.addEventListener('click', (ev) => {
      esito.querySelector('.specie-altre').hidden = false;
      ev.currentTarget.remove();
    });
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
