// Modulo dei filtri condiviso tra la lista e la mappa generale.
// I filtri scelti valgono per entrambe le schermate (finché l'app resta aperta).
import { ANIMALI, STATI, ACCESSI } from '../lib/costanti.js';
import { FILTRI_VUOTI, paesiDiPartenza } from '../lib/filtri.js';
import { escapeHtml } from '../lib/formato.js';

const CHIAVE_FILTRI = 'orme.filtri';

export function leggiFiltri() {
  try {
    return { ...FILTRI_VUOTI, ...JSON.parse(sessionStorage.getItem(CHIAVE_FILTRI) ?? '{}') };
  } catch {
    return { ...FILTRI_VUOTI };
  }
}

function salvaFiltri(filtri) {
  try {
    sessionStorage.setItem(CHIAVE_FILTRI, JSON.stringify(filtri));
  } catch {
    // non importa: i filtri semplicemente non vengono ricordati
  }
}

function opzioni(voci, selezionato, etichettaTutti) {
  const righe = [`<option value="">${etichettaTutti}</option>`];
  for (const [valore, etichetta] of voci) {
    const sel = valore === selezionato ? ' selected' : '';
    righe.push(`<option value="${escapeHtml(valore)}"${sel}>${escapeHtml(etichetta)}</option>`);
  }
  return righe.join('');
}

export function htmlFiltri(sentieri, filtri) {
  const paesi = paesiDiPartenza(sentieri);
  if (filtri.paese && !paesi.includes(filtri.paese)) filtri.paese = '';
  return `
    <form class="filtri" autocomplete="off">
      <input type="search" name="testo" placeholder="Cerca per nome, codice, zona…" value="${escapeHtml(filtri.testo)}" aria-label="Cerca" />
      <select name="animale" aria-label="Animale">${opzioni(Object.entries(ANIMALI), filtri.animale, 'Tutti gli animali')}</select>
      <select name="stato" aria-label="Stato">${opzioni(Object.entries(STATI), filtri.stato, 'Tutti gli stati')}</select>
      <select name="accesso" aria-label="Tipo di accesso">${opzioni(Object.entries(ACCESSI), filtri.accesso, 'Ogni accesso')}</select>
      <select name="paese" aria-label="Paese di partenza">${opzioni(paesi.map((p) => [p, p]), filtri.paese, 'Ogni paese')}</select>
      <select name="bici" class="intera" aria-label="Bici">${opzioni(
        [['si', 'Bici consentita'], ['no', 'Bici vietata'], ['da_verificare', 'Bici da verificare']],
        filtri.bici,
        'Bici: tutte',
      )}</select>
    </form>`;
}

// Collega il modulo: alAggiornamento(filtri) viene chiamata a ogni modifica
export function collegaFiltri(form, filtri, alAggiornamento) {
  function aggiorna() {
    for (const chiave of Object.keys(FILTRI_VUOTI)) filtri[chiave] = form.elements[chiave].value;
    salvaFiltri(filtri);
    alAggiornamento(filtri);
  }
  form.addEventListener('input', aggiorna);
  form.addEventListener('submit', (e) => e.preventDefault());
  aggiorna();
  return {
    azzera() {
      for (const chiave of Object.keys(FILTRI_VUOTI)) form.elements[chiave].value = '';
      aggiorna();
    },
  };
}

export const filtriAttivi = (filtri) => Object.values(filtri).filter(Boolean).length;
