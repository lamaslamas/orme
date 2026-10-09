import { ACCESSI, BICI_CONSENTITA } from '../lib/costanti.js';
import { preparaPercorsi, filtraPercorsi } from '../lib/motore.js';
import { STATI_COMPATIBILITA, ATTIVITA } from '../lib/compatibilita.js';
import { stato } from '../stato.js';
import { misureSentiero } from '../lib/riassunto.js';
import { sagomaSvg } from '../lib/sagoma.js';
import { escapeHtml, codici, durata } from '../lib/formato.js';
import { leggiFiltri, htmlFiltri, collegaFiltri, filtriAttivi, definizioni } from './filtri.js';
import improntaSvg from '../impronta.svg?raw';
import { parcoDa, PARCHI } from '../datiParchi.js';
import { COLORI } from './colori.js';
import { htmlFaunaBreve } from './faunaBreve.js';

const BOLLINO_BICI = { si: 'Bici sì', no: 'Bici no', da_verificare: 'Bici ?' };

export function bollinoBici(s) {
  const c = s.bici?.consentita || 'da_verificare';
  return `<span class="chip chip-bici-${c}" title="Bici: ${BICI_CONSENTITA[c]}">${BOLLINO_BICI[c]}</span>`;
}

export function bollinoDifficolta(s) {
  return s.difficolta ? `<span class="difficolta difficolta-${s.difficolta}" title="Difficoltà CAI">${s.difficolta}</span>` : '';
}

// impronta del logo, per le schede senza traccia
const IMPRONTA = improntaSvg.replace(/<svg[^>]*>/, '').replace('</svg>', '');

// Miniatura: la sagoma della traccia, oppure un segnaposto con l'impronta
export function miniatura(traccia, stato) {
  const d = traccia ? sagomaSvg(traccia.geojson, 88, 88, 12) : '';
  const colore = stato === 'fatto' ? COLORI.tracciaFatta : COLORI.traccia;
  return d
    ? `<svg class="miniatura" viewBox="0 0 88 88" aria-hidden="true"><path d="${d}" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${colore}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : `<div class="miniatura vuota" aria-hidden="true"><svg viewBox="0 0 116 138">${IMPRONTA}</svg><span>Nessuna traccia</span></div>`;
}

export function rigaNumeri(m) {
  const parti = [];
  if (m.km != null) parti.push(`<b>${m.km.toFixed(1).replace('.', ',')}</b> km`);
  if (m.salita != null) parti.push(`<b>+${m.salita}</b> m`);
  if (m.durataMin != null) parti.push(`${m.durataStimata ? '~' : ''}<b>${durata(m.durataMin)}</b>`);
  return parti.join('<span class="sep">·</span>');
}

export function bollinoCompatibilita(compat, attivita) {
  if (!compat || attivita === 'trekking') return '';
  const c = compat[attivita];
  return `<span class="chip compat compat-${c.stato}">${ATTIVITA[attivita]}: ${STATI_COMPATIBILITA[c.stato].toLowerCase()}</span>`;
}

export function schedaInLista(s, traccia, mostraParco = true, compat = null) {
  const m = misureSentiero(s, traccia);
  const luogo = [s.zona, s.partenza?.paese && `da ${s.partenza.paese}`].filter(Boolean).map(escapeHtml).join(' · ');
  const tipo = s.accesso?.tipo || 'nessuno';
  const numeri = rigaNumeri(m);
  return `
    <li>
      <a class="carta carta-sentiero ${s.stato === 'fatto' ? 'fatto' : ''}" href="#/sentiero/${encodeURIComponent(s.id)}">
        ${miniatura(traccia, s.stato)}
        <div class="carta-corpo">
          <div class="carta-titolo">
            ${bollinoDifficolta(s)}
            ${s.codici?.length ? `<span class="codice">${escapeHtml(codici(s))}</span>` : ''}
            ${s.stato === 'fatto' ? '<span class="spunta" title="Fatto">✓ Fatto</span>' : ''}
          </div>
          <div class="nome">${escapeHtml(s.nome)}</div>
          ${luogo ? `<div class="carta-dati">${luogo}</div>` : ''}
          ${mostraParco ? `<div class="carta-parco-nome">${escapeHtml((s.parchi ?? [s.parco]).map((id) => parcoDa(id)?.nomeBreve).filter(Boolean).join(' · '))}</div>` : ''}
          ${numeri ? `<div class="numeri">${numeri}</div>` : ''}
          ${htmlFaunaBreve(s)}
          <div class="chips">
            ${bollinoCompatibilita(compat, stato.leggi().attivita)}
            ${tipo !== 'nessuno' && tipo !== 'libero' ? `<span class="chip chip-accesso">${ACCESSI[tipo]}</span>` : ''}
            ${bollinoBici(s)}
            ${s.daVerificare ? '<span class="chip chip-verifica">Da verificare</span>' : ''}
          </div>
        </div>
      </a>
    </li>`;
}

// Elenco dei sentieri con ricerca e filtri, usato dalla pagina Parchi e da quella di ogni parco
// alRisultato(risultato): chiamata a ogni aggiornamento (es. per mostrare sulla mappa gli stessi percorsi)
// serveUnFiltro: l'elenco compare solo dopo aver scelto almeno un filtro (pagina iniziale)
export function montaElenco(contenitore, sentieri, tracce, { parcoFisso = null, ricerca = true, alRisultato = null, serveUnFiltro = false } = {}) {
  const filtri = leggiFiltri(parcoFisso);
  contenitore.innerHTML = `
    ${htmlFiltri(sentieri, filtri, { ricerca })}
    <div class="riga-conteggio"><span class="conteggio"></span></div>
    <ul class="lista"></ul>
  `;
  const lista = contenitore.querySelector('.lista');
  const conteggio = contenitore.querySelector('.conteggio');
  const preparati = preparaPercorsi(sentieri, tracce);
  const contaCon = (f) => filtraPercorsi(preparati, f, stato.leggi().attivita).length;
  // elenco a pagine: con centinaia di percorsi il telefono resta veloce
  const PAGINA = 40;
  let ultimoRisultato = [];
  let quanti = PAGINA;
  const htmlPagina = (da) => {
    const pezzo = ultimoRisultato.slice(da, quanti).map((p) => schedaInLista(p.sentiero, p.traccia, !parcoFisso, p.compat)).join('');
    const resto = ultimoRisultato.length - quanti;
    return pezzo + (resto > 0 ? `<li class="altri"><button type="button" class="bottone pieno-largo" data-azione="altri">Mostra altri ${Math.min(PAGINA, resto)} (ne restano ${resto})</button></li>` : '');
  };
  lista.addEventListener('click', (e) => {
    if (e.target.closest('[data-azione="reimposta"]')) controlli.azzera();
    if (e.target.closest('[data-azione="altri"]')) {
      const da = quanti;
      quanti += PAGINA;
      lista.querySelector('.altri')?.remove();
      lista.insertAdjacentHTML('beforeend', htmlPagina(da));
      return;
    }
    const parcoScelto = e.target.closest('[data-parco]')?.dataset.parco;
    if (parcoScelto) stato.imposta({ parco: parcoScelto });
    const togli = e.target.closest('[data-togli]')?.dataset.togli;
    if (togli) controlli.togli(togli);
  });
  // risultato vuoto: quali filtri, tolti uno alla volta, darebbero dei percorsi
  function suggerimenti() {
    return definizioni(sentieri, parcoFisso, stato.leggi().attivita)
      .filter((d) => filtri[d.chiave] && !(parcoFisso && d.chiave === 'parco'))
      .map((d) => ({ d, n: contaCon({ ...filtri, [d.chiave]: '' }) }))
      .filter((x) => x.n > 0)
      .map(({ d, n }) => {
        const et = d.voci.find(([v]) => v === filtri[d.chiave])?.[1] ?? filtri[d.chiave];
        return `<button type="button" class="pillola" data-togli="${d.chiave}">Togli ${escapeHtml(d.breve ? d.breve(filtri[d.chiave], et) : et)} (${n})</button>`;
      })
      .join('');
  }
  const controlli = collegaFiltri(
    contenitore.querySelector('.filtri'),
    sentieri,
    filtri,
    () => {
      const attivita = stato.leggi().attivita;
      const risultato = filtraPercorsi(preparati, filtri, attivita);
      conteggio.textContent = `${risultato.length} ${risultato.length === 1 ? 'percorso' : 'percorsi'}${
        attivita !== 'trekking' ? ` per ${ATTIVITA[attivita]}` : ''
      }`;
      alRisultato?.(risultato);
      ultimoRisultato = risultato;
      quanti = PAGINA;
      // nessun filtro scelto: invece di centinaia di percorsi, un invito a scegliere
      const scelti = Object.entries(filtri).filter(([k, v]) => v && !['soloBici', 'paese'].includes(k));
      if (serveUnFiltro && !scelti.length) {
        conteggio.textContent = `${risultato.length} percorsi disponibili`;
        lista.innerHTML = `<li class="invito-filtri">
            <p><b>Scegli da dove partire</b>: un parco, un animale, la ricerca qui sopra o un altro filtro.</p>
            <div class="suggerimenti-filtri">${PARCHI.map((p) => `<button type="button" class="pillola" data-parco="${p.id}">${escapeHtml(p.nomeBreve)}</button>`).join('')}</div>
          </li>`;
        alRisultato?.([]);
        return;
      }
      lista.innerHTML = risultato.length
        ? htmlPagina(0)
        : `<li class="vuoto">Nessun percorso corrisponde ai filtri${attivita !== 'trekking' ? ` per ${ATTIVITA[attivita]}` : ''}.
            <span class="suggerimenti-filtri">${suggerimenti()}</span>
            <button type="button" class="link" data-azione="reimposta">Reimposta filtri</button></li>`;
    },
    { parcoFisso, conta: contaCon },
  );
  return controlli;
}
