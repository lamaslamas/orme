// Selettore "Come vuoi esplorare?": trekking, MTB, e-MTB (resta valido in tutte le sezioni)
import { stato } from '../stato.js';
import { ATTIVITA } from '../lib/compatibilita.js';

const ICONE = {
  trekking:
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="13" cy="4" r="2" fill="currentColor"/><path d="M11 22l2-7 3 3v4M9 12l2-4 3 1 2 3h3M8 22l3-10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  mtb: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="5.5" cy="17" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18.5" cy="17" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5.5 17 9 9h6l3.5 8M9 9l3 8h-1M15 6h2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  emtb: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="5.5" cy="17" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18.5" cy="17" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5.5 17 9 9h6l3.5 8M9 9l3 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 2l-2 4h3l-2 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
};

export function htmlSelettoreAttivita({ titolo = true } = {}) {
  const attuale = stato.leggi().attivita;
  return `<div class="selettore-attivita">
    ${titolo ? '<p class="etichetta-attivita">Come vuoi esplorare?</p>' : ''}
    <div class="segmenti" role="radiogroup" aria-label="Come vuoi esplorare">
      ${Object.entries(ATTIVITA)
        .map(
          ([k, nome]) =>
            `<button type="button" role="radio" aria-checked="${attuale === k}" class="segmento ${attuale === k ? 'attivo' : ''}" data-attivita="${k}">${ICONE[k]}<span>${nome}</span></button>`,
        )
        .join('')}
    </div>
  </div>`;
}

export function collegaSelettoreAttivita(contenitore) {
  const el = contenitore.querySelector('.selettore-attivita');
  if (!el) return () => {};
  el.addEventListener('click', (e) => {
    const k = e.target.closest('[data-attivita]')?.dataset.attivita;
    if (k) stato.imposta({ attivita: k });
  });
  return stato.ascolta((s) => {
    for (const b of el.querySelectorAll('[data-attivita]')) {
      const attivo = b.dataset.attivita === s.attivita;
      b.classList.toggle('attivo', attivo);
      b.setAttribute('aria-checked', String(attivo));
    }
  });
}
