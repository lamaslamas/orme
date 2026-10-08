import { ANIMALI, ACCESSI, BICI_CONSENTITA } from '../lib/costanti.js';
import { preparaPercorsi, filtraPercorsi } from '../lib/motore.js';
import { STATI_COMPATIBILITA, ATTIVITA } from '../lib/compatibilita.js';
import { stato } from '../stato.js';
import { misureSentiero } from '../lib/riassunto.js';
import { sagomaSvg } from '../lib/sagoma.js';
import { escapeHtml, codici, durata } from '../lib/formato.js';
import { leggiFiltri, htmlFiltri, collegaFiltri, filtriAttivi } from './filtri.js';
import improntaSvg from '../impronta.svg?raw';
import { parcoDa } from '../datiParchi.js';

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

export function bollinoCompatibilita(compat, attivita) {
  if (!compat || attivita === 'trekking') return '';
  const c = compat[attivita];
  return `<span class="chip compat compat-${c.stato}">${ATTIVITA[attivita]}: ${STATI_COMPATIBILITA[c.stato].toLowerCase()}</span>`;
}

export function schedaInLista(s, traccia, mostraParco = true, compat = null) {
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
          ${mostraParco ? `<div class="carta-parco-nome">${escapeHtml((s.parchi ?? [s.parco]).map((id) => parcoDa(id)?.nomeBreve).filter(Boolean).join(' · '))}</div>` : ''}
          ${numeri ? `<div class="numeri">${numeri}</div>` : ''}
          <div class="chips">
            ${bollinoCompatibilita(compat, stato.leggi().attivita)}
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
export function montaElenco(contenitore, sentieri, tracce, { parcoFisso = null, ricerca = true } = {}) {
  const filtri = leggiFiltri(parcoFisso);
  contenitore.innerHTML = `
    ${htmlFiltri(sentieri, filtri, { ricerca })}
    <div class="riga-conteggio"><span class="conteggio"></span></div>
    <ul class="lista"></ul>
  `;
  const lista = contenitore.querySelector('.lista');
  const conteggio = contenitore.querySelector('.conteggio');
  const preparati = preparaPercorsi(sentieri, tracce);
  lista.addEventListener('click', (e) => {
    if (e.target.closest('[data-azione="reimposta"]')) controlli.azzera();
  });
  const controlli = collegaFiltri(
    contenitore.querySelector('.filtri'),
    sentieri,
    filtri,
    () => {
      const attivita = stato.leggi().attivita;
      const risultato = filtraPercorsi(preparati, filtri, attivita);
      const attivi = filtriAttivi(filtri) - (parcoFisso ? 1 : 0) || attivita !== 'trekking';
      conteggio.textContent = attivi ? `${risultato.length} di ${sentieri.length} percorsi` : `${sentieri.length} percorsi`;
      lista.innerHTML = risultato.length
        ? risultato.map((p) => schedaInLista(p.sentiero, p.traccia, !parcoFisso, p.compat)).join('')
        : `<li class="vuoto">Nessun percorso corrisponde ai filtri${attivita !== 'trekking' ? ` per ${ATTIVITA[attivita]}` : ''}. <button type="button" class="link" data-azione="reimposta">Reimposta filtri</button></li>`;
    },
    { parcoFisso },
  );
  return controlli;
}
