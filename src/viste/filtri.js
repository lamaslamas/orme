// Filtri condivisi tra Parchi e Mappa: barra di ricerca e pillole che aprono
// un pannello dal basso. I filtri scelti valgono per entrambe le schermate.
import { ANIMALI, STATI, ACCESSI, DIFFICOLTA } from '../lib/costanti.js';
import { FILTRI_VUOTI, paesiDiPartenza } from '../lib/filtri.js';
import { escapeHtml } from '../lib/formato.js';
import { PARCHI, parcoDa } from '../datiParchi.js';
import { stato } from '../stato.js';

// I filtri vivono nello stato condiviso: parco e animale sono gli stessi della
// heatmap e restano scelti passando da una sezione all'altra.
export function leggiFiltri(parcoFisso = null) {
  const st = stato.leggi();
  return { ...FILTRI_VUOTI, ...st.filtri, parco: parcoFisso ?? st.parco, animale: st.specie };
}

function salvaFiltri(filtri) {
  const { parco, animale, ...altri } = filtri;
  const voci = Object.fromEntries(Object.keys(stato.leggi().filtri).map((k) => [k, altri[k] ?? '']));
  stato.imposta({ parco: parco ?? '', specie: animale ?? '', filtri: voci });
}

// Animali da proporre: quelli del parco scelto, oppure di tutti i parchi
function vociAnimali(idParco) {
  const ammessi = new Set(idParco ? parcoDa(idParco)?.animali ?? [] : PARCHI.flatMap((p) => p.animali));
  return Object.entries(ANIMALI).filter(([k]) => ammessi.has(k));
}

function definizioni(sentieri, parcoFisso) {
  return [
    ...(parcoFisso
      ? []
      : [{ chiave: 'parco', titolo: 'Parco', voci: PARCHI.map((p) => [p.id, p.nomeBreve]) }]),
    { chiave: 'animale', titolo: 'Animale', voci: vociAnimali(parcoFisso) },
    { chiave: 'stato', titolo: 'Stato', voci: Object.entries(STATI) },
    {
      chiave: 'difficolta',
      titolo: 'Difficoltà',
      voci: [...Object.entries(DIFFICOLTA), ['nessuna', 'Non indicata']],
      breve: (v) => (v === 'nessuna' ? 'Non indicata' : v),
    },
    { chiave: 'accesso', titolo: 'Accesso', voci: Object.entries(ACCESSI) },
    { chiave: 'paese', titolo: 'Paese', voci: paesiDiPartenza(sentieri).map((p) => [p, p]) },
    {
      chiave: 'bici',
      titolo: 'Bici',
      voci: [
        ['si', 'Consentita'],
        ['no', 'Vietata'],
        ['da_verificare', 'Da verificare'],
      ],
      breve: (v, et) => `Bici: ${et.toLowerCase()}`,
    },
  ];
}

const freccina =
  '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';

export function htmlFiltri(sentieri, filtri) {
  return `
    <div class="filtri">
      <label class="ricerca">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16.5 16.5 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <input type="search" name="testo" placeholder="Cerca sentiero, codice, zona…" value="${escapeHtml(filtri.testo)}" aria-label="Cerca" autocomplete="off" />
      </label>
      <div class="pillole" role="group" aria-label="Filtri"></div>
      <dialog class="foglio" aria-label="Scegli un filtro">
        <form method="dialog">
          <div class="foglio-maniglia" aria-hidden="true"></div>
          <h2 class="foglio-titolo"></h2>
          <div class="foglio-voci"></div>
          <button class="bottone pieno-largo" value="chiudi">Chiudi</button>
        </form>
      </dialog>
    </div>`;
}

// Collega i filtri: alAggiornamento(filtri) viene chiamata a ogni modifica
export function collegaFiltri(contenitore, sentieri, filtri, alAggiornamento, { parcoFisso = null } = {}) {
  const defs = definizioni(sentieri, parcoFisso);
  const pillole = contenitore.querySelector('.pillole');
  const ricerca = contenitore.querySelector('input[name=testo]');
  const foglio = contenitore.querySelector('.foglio');
  // un paese salvato che non esiste più viene ignorato
  if (filtri.paese && !defs.find((d) => d.chiave === 'paese').voci.some(([v]) => v === filtri.paese)) filtri.paese = '';

  function etichettaPillola(d) {
    const valore = filtri[d.chiave];
    if (!valore) return d.titolo;
    const et = d.voci.find(([v]) => v === valore)?.[1] ?? valore;
    return d.breve ? d.breve(valore, et) : et;
  }

  function disegnaPillole() {
    const attivi = filtriAttivi(filtri) - (filtri.testo ? 1 : 0) - (parcoFisso ? 1 : 0);
    pillole.innerHTML =
      (attivi
        ? `<button type="button" class="pillola azzera" data-azione="azzera" aria-label="Azzera filtri">✕ Azzera</button>`
        : '') +
      defs
        .filter((d) => d.voci.length)
        .map(
          (d) => `<button type="button" class="pillola ${filtri[d.chiave] ? 'attiva' : ''}" data-chiave="${d.chiave}">
            ${escapeHtml(etichettaPillola(d))} ${freccina}</button>`,
        )
        .join('');
  }

  function aggiorna() {
    salvaFiltri(filtri);
    disegnaPillole();
    alAggiornamento(filtri);
  }

  // una scelta fatta altrove (es. l'animale della heatmap) aggiorna anche questi filtri
  const scollega = stato.ascolta(() => {
    const nuovi = leggiFiltri(parcoFisso);
    if (JSON.stringify(nuovi) === JSON.stringify(filtri)) return;
    Object.assign(filtri, nuovi);
    if (ricerca.value !== filtri.testo) ricerca.value = filtri.testo;
    disegnaPillole();
    alAggiornamento(filtri);
  });

  function apriFoglio(d) {
    foglio.querySelector('.foglio-titolo').textContent = d.titolo;
    foglio.querySelector('.foglio-voci').innerHTML = [['', 'Tutti'], ...d.voci]
      .map(
        ([v, et]) => `<label class="voce">
          <input type="radio" name="voce" value="${escapeHtml(v)}" ${filtri[d.chiave] === v ? 'checked' : ''} />
          <span>${escapeHtml(et)}</span>
        </label>`,
      )
      .join('');
    foglio.dataset.chiave = d.chiave;
    foglio.showModal();
  }

  pillole.addEventListener('click', (e) => {
    const bottone = e.target.closest('button');
    if (!bottone) return;
    if (bottone.dataset.azione === 'azzera') {
      for (const d of defs) filtri[d.chiave] = '';
      if (parcoFisso) filtri.parco = parcoFisso;
      aggiorna();
      return;
    }
    apriFoglio(defs.find((d) => d.chiave === bottone.dataset.chiave));
  });

  foglio.addEventListener('change', (e) => {
    if (e.target.name !== 'voce') return;
    filtri[foglio.dataset.chiave] = e.target.value;
    foglio.close();
    aggiorna();
  });
  // tocco fuori dal pannello: si chiude
  foglio.addEventListener('click', (e) => {
    if (e.target === foglio) foglio.close();
  });

  ricerca.addEventListener('input', () => {
    filtri.testo = ricerca.value;
    aggiorna();
  });

  aggiorna();
  return {
    azzera() {
      Object.assign(filtri, FILTRI_VUOTI, parcoFisso ? { parco: parcoFisso } : {});
      ricerca.value = '';
      aggiorna();
    },
    scollega,
  };
}

export const filtriAttivi = (filtri) => Object.values(filtri).filter(Boolean).length;
