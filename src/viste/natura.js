// iNaturalist lungo percorsi e sentieri (ricerca solo a richiesta: serve la rete)
import { urlOsservazioni, interpretaOsservazioni } from '../lib/inaturalist.js';
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
import { htmlNascondi } from './nascondiSpecie.js';
import { nascoste, chiaveSpecie } from '../lib/specieNascoste.js';
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

// --- Osservazioni vicine: la stessa sezione per i sentieri dell'archivio e per i percorsi disegnati o importati ---
// Osservazioni di iNaturalist entro 250 m dalla traccia, per i gruppi scelti nel pannello Fauna, raggruppate per
// specie (prime 5 e «Mostra tutte»). Si cercano da sole (nessun filtro da impostare).
const FASCIA_M = 250;

export function htmlNaturaVicina(chiave = 'natura') {
  return `<section class="riquadro" id="${chiave}">
    <h2>Osservazioni vicine</h2>
    <p class="tenue">Osservazioni di iNaturalist entro ${FASCIA_M} m dalla traccia, per i gruppi scelti nel pannello Fauna della mappa.</p>
    <p class="gruppi-attivi">Gruppi attivi: <b data-gruppi-attivi>${escapeHtml(testoGruppi(leggiGruppiSalvati()))}</b></p>
    <div class="risultati-natura" aria-live="polite"></div>
  </section>`;
}

// contenitore: la sezione; mostraPunti(osservazioni): per segnarle sulla mappa piccola
export function collegaNaturaVicina(contenitore, pezzi, mostraPunti = () => {}) {
  if (!contenitore) return;
  const esito = contenitore.querySelector('.risultati-natura');
  let fatta = false;
  async function cerca() {
    if (fatta) return;
    fatta = true;
    const gruppi = leggiGruppiSalvati();
    contenitore.querySelector('[data-gruppi-attivi]').textContent = testoGruppi(gruppi);
    if (!gruppi.length) {
      esito.innerHTML = '<p class="tenue">Nessun gruppo attivo: scegli i gruppi nel pannello Fauna della mappa.</p>';
      return;
    }
    const comuni = { stagione: 'tutto', anni: 0, soloVerificate: true };
    const normali = gruppi.filter((g) => GRUPPI_FAUNA[g]?.inat);
    const ricerche = [...(normali.length ? [{ specie: 'notevoli', gruppi: normali, ...comuni }] : []), ...(gruppi.includes('rare') ? [{ specie: 'notevoli', gruppi: ['rare'], ...comuni }] : [])];
    esito.innerHTML = '<p class="messaggio">Cerco su iNaturalist…</p>';
    let r;
    try {
      r = await scarica(pezzi, ricerche, FASCIA_M);
    } catch (err) {
      fatta = false;
      esito.innerHTML = `<p class="errore">Osservazioni non disponibili (${escapeHtml(err.message)}). <button type="button" class="bottone testo" data-riprova>Riprova</button></p>`;
      esito.querySelector('[data-riprova]')?.addEventListener('click', cerca);
      return;
    }
    // le specie nascoste non si mostrano (la lista si accorcia: si dice quante)
    const ordinate = r.dentro.filter((o) => !nascoste.esclude({ animale: o.animale, nomeScientifico: o.nomeScientifico })).sort((a, b) => String(b.data).localeCompare(String(a.data)));
    mostraPunti(ordinate);
    const specie = raggruppaPerSpecie(ordinate);
    const riga = (g) => `<li data-specie-chiave="${escapeHtml(chiaveSpecie({ animale: g.oss[0]?.animale, scientifico: g.scientifico }) ?? '')}"><details>
        <summary><span class="sp-icona">${iconaAnimale(g.icona ?? iconaPerOsservazione(g.oss[0]))}</span><b>${escapeHtml(g.nome)}</b> <i class="tenue">${escapeHtml(g.scientifico)}</i> · ${g.n} ${g.n === 1 ? 'osservazione' : 'osservazioni'} · ultima ${escapeHtml(dataBreve(g.ultima))}</summary>
        <ul class="elenco-oss">${g.oss.map((o) => htmlVoceOsservazione(o, { extra: `a ${Math.round(o.distanzaM)} m dalla traccia`, conNome: false })).join('')}</ul>
        ${htmlNascondi({ animale: g.oss[0]?.animale ?? null, scientifico: g.scientifico || null, nome: g.nome })}
      </details></li>`;
    esito.innerHTML = `
      <p><b>${ordinate.length}</b> ${ordinate.length === 1 ? 'osservazione' : 'osservazioni'} di <b>${specie.length}</b> ${specie.length === 1 ? 'specie' : 'specie'} entro ${FASCIA_M} m dalla traccia.</p>
      ${r.totale > r.scaricate ? `<p class="tenue piccolo">Nella zona ce ne sono ${r.totale}: ho controllato le ${r.scaricate} più recenti.</p>` : ''}
      ${notaSfumate(r.sfumate)}
      <ul class="specie-oss">${specie.slice(0, SPECIE_VISIBILI).map(riga).join('')}</ul>
      ${specie.length > SPECIE_VISIBILI ? `<button type="button" class="bottone testo" data-mostra-tutte>Mostra tutte le ${specie.length} specie</button><ul class="specie-oss specie-altre" hidden>${specie.slice(SPECIE_VISIBILI).map(riga).join('')}</ul>` : ''}
      <p class="tenue piccolo">Dati e foto © degli autori su iNaturalist (licenze Creative Commons).</p>`;
    esito.querySelector('[data-mostra-tutte]')?.addEventListener('click', (ev) => {
      esito.querySelector('.specie-altre').hidden = false;
      ev.currentTarget.remove();
    });
  }
  // dentro una sezione a tendina (scheda) si cerca alla prima apertura; altrove subito
  const dentro = contenitore.closest('details');
  if (dentro && !dentro.open) dentro.addEventListener('toggle', () => dentro.open && cerca(), { once: false });
  else cerca();
}

// i vecchi nomi (usati dalle pagine)
export const htmlNaturaPercorso = () => htmlNaturaVicina('natura');
export const collegaNaturaPercorso = collegaNaturaVicina;
export const htmlNaturaSentiero = () => htmlNaturaVicina('naturaSentiero');
export const collegaNaturaSentiero = (contenitore, pezzi) => collegaNaturaVicina(contenitore, pezzi);
