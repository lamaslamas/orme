import { tuttiISentieri, tutteLeTracce } from '../db.js';
import { ANIMALI, ACCESSI, BICI_CONSENTITA } from '../lib/costanti.js';
import { filtraSentieri, ordinaSentieri } from '../lib/filtri.js';
import { misureSentiero } from '../lib/riassunto.js';
import { sagomaSvg } from '../lib/sagoma.js';
import { escapeHtml, codici, durata } from '../lib/formato.js';
import { leggiFiltri, htmlFiltri, collegaFiltri, filtriAttivi } from './filtri.js';
import improntaSvg from '../impronta.svg?raw';
import { PARCHI, parcoDa } from '../datiParchi.js';

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
  const colore = stato === 'fatto' ? '#2f9e6b' : '#c2410c';
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

export function schedaInLista(s, traccia, mostraParco = true) {
  const m = misureSentiero(s, traccia);
  const luogo = [s.zona, s.partenza?.paese && `da ${s.partenza.paese}`].filter(Boolean).map(escapeHtml).join(' · ');
  const animali = (s.animali ?? [])
    .map((a) => `<span class="chip chip-${a}">${ANIMALI[a] ?? escapeHtml(a)}</span>`)
    .join('');
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
          ${mostraParco ? `<div class="carta-parco-nome">${escapeHtml(parcoDa(s.parco)?.nomeBreve ?? '')}</div>` : ''}
          ${numeri ? `<div class="numeri">${numeri}</div>` : ''}
          <div class="chips">
            ${animali}
            ${tipo !== 'nessuno' && tipo !== 'libero' ? `<span class="chip chip-accesso">${ACCESSI[tipo]}</span>` : ''}
            ${bollinoBici(s)}
            ${s.daVerificare ? '<span class="chip chip-verifica">Da verificare</span>' : ''}
          </div>
        </div>
      </a>
    </li>`;
}

// Elenco dei sentieri con ricerca e filtri, usato dalla pagina Parchi e da quella di ogni parco
export function montaElenco(contenitore, sentieri, tracce, { parcoFisso = null } = {}) {
  const filtri = leggiFiltri(parcoFisso);
  contenitore.innerHTML = `
    ${htmlFiltri(sentieri, filtri)}
    <div class="riga-conteggio"><span class="conteggio"></span></div>
    <ul class="lista"></ul>
  `;
  const lista = contenitore.querySelector('.lista');
  const conteggio = contenitore.querySelector('.conteggio');
  return collegaFiltri(
    contenitore.querySelector('.filtri'),
    sentieri,
    filtri,
    () => {
      const risultato = ordinaSentieri(filtraSentieri(sentieri, filtri));
      const attivi = filtriAttivi(filtri) - (parcoFisso ? 1 : 0);
      conteggio.textContent = attivi ? `${risultato.length} di ${sentieri.length} sentieri` : `${sentieri.length} sentieri`;
      lista.innerHTML = risultato.length
        ? risultato.map((s) => schedaInLista(s, tracce.get(s.id), !parcoFisso)).join('')
        : '<li class="vuoto">Nessun sentiero corrisponde ai filtri.</li>';
    },
    { parcoFisso },
  );
}

export function schedaParco(parco, sentieri) {
  const suoi = sentieri.filter((s) => s.parco === parco.id);
  const fatti = suoi.filter((s) => s.stato === 'fatto').length;
  return `
    <li>
      <a class="carta carta-parco" href="#/parco/${encodeURIComponent(parco.id)}">
        <div class="parco-segno" aria-hidden="true"><svg viewBox="0 0 116 138">${IMPRONTA}</svg></div>
        <div class="carta-corpo">
          <div class="nome">${escapeHtml(parco.nomeBreve)}</div>
          <div class="carta-dati">${escapeHtml(parco.regioni.join(' · '))}</div>
          <div class="numeri"><b>${suoi.length}</b> sentieri<span class="sep">·</span><b>${fatti}</b> fatti</div>
        </div>
      </a>
    </li>`;
}

export async function vistaLista(app) {
  const [sentieri, tracce] = await Promise.all([tuttiISentieri(), tutteLeTracce()]);

  app.innerHTML = `
    <h1 class="titolo-pagina">Parchi</h1>
    <div class="scorciatoie">
      <a class="pillola" href="#/giri">I miei giri</a>
      <a class="pillola" href="#/avvistamenti">I miei avvistamenti</a>
    </div>
    <ul class="parchi">${PARCHI.map((p) => schedaParco(p, sentieri)).join('')}</ul>
    <h2 class="titolo-sezione">Tutti i sentieri</h2>
    <div id="elenco"></div>
    <a class="fab" href="#/nuovo" aria-label="Aggiungi sentiero">+</a>
  `;
  const elenco = montaElenco(app.querySelector('#elenco'), sentieri, tracce);
  return () => elenco.scollega();
}
