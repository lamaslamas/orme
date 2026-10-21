// "Quota e dislivello": lo stesso componente in Filtri (Percorsi qui, parchi, I miei percorsi) e in Suggerisci.
// Due slider a due cursori (quota massima 0–3000 m, dislivello in salita 0–2000 m, a passi di 50 m) con il valore
// scelto in chiaro sopra; a valori estremi il filtro è spento. c: { quota, salita, senzaQuote } (testi "da-a").
import { PASSO, LIMITI, intervalloDi, testoIntervallo, testoQuota, testoSalita } from '../lib/quotaDislivello.js';
import { escapeHtml } from '../lib/formato.js';

const SLIDER = {
  quota: { titolo: 'Quota massima raggiunta', etichetta: testoQuota },
  salita: { titolo: 'Dislivello in salita', etichetta: testoSalita },
};

function htmlSlider(tipo, c) {
  const [da, a] = intervalloDi(c[tipo], tipo);
  const max = LIMITI[tipo];
  return `<div class="qd-slider" data-qd="${tipo}" style="--da:${(da / max) * 100}%;--a:${(a / max) * 100}%">
      <p class="qd-valore" aria-live="polite">${escapeHtml(SLIDER[tipo].etichetta(c))}</p>
      <div class="qd-cursori">
        <span class="qd-binario"></span>
        <input type="range" min="0" max="${max}" step="${PASSO}" value="${da}" data-estremo="da" aria-label="${SLIDER[tipo].titolo}: da" />
        <input type="range" min="0" max="${max}" step="${PASSO}" value="${a}" data-estremo="a" aria-label="${SLIDER[tipo].titolo}: fino a" />
      </div>
    </div>`;
}

// sezione completa: titolo, i due slider e la scelta per i percorsi senza quote
export const htmlQuotaDislivello = (c) => `<section class="sezione-filtro quota-dislivello"><h3>Quota e dislivello</h3>
    ${htmlSlider('quota', c)}
    ${htmlSlider('salita', c)}
    <label class="qd-senza"><input type="checkbox" data-qd-senza ${c.senzaQuote ? 'checked' : ''} /> Includi anche quelli senza dati di quota</label>
  </section>`;

// radice: un contenitore stabile (la sezione può essere ridisegnata); alCambio(c) quando una scelta è finita
// c: l'oggetto delle scelte, o una funzione che lo restituisce (se chi lo usa lo sostituisce)
export function collegaQuotaDislivello(radice, scelte, alCambio) {
  const corrente = () => (typeof scelte === 'function' ? scelte() : scelte);
  const leggi = (slider) => {
    const [da, a] = [...slider.querySelectorAll('input')].map((i) => Number(i.value));
    return [Math.min(da, a), Math.max(da, a)];
  };
  const mostra = (slider, tipo) => {
    const [da, a] = leggi(slider);
    const max = LIMITI[tipo];
    slider.style.setProperty('--da', `${(da / max) * 100}%`);
    slider.style.setProperty('--a', `${(a / max) * 100}%`);
    // il cursore di sinistra sta sopra quando i due si toccano nella metà alta (altrimenti non si potrebbe spostare)
    slider.querySelector('[data-estremo=da]').style.zIndex = da >= max / 2 ? 3 : 1;
    slider.querySelector('.qd-valore').textContent = SLIDER[tipo].etichetta({ [tipo]: testoIntervallo(da, a, tipo) });
    return testoIntervallo(da, a, tipo);
  };
  radice.addEventListener('input', (e) => {
    const slider = e.target.closest?.('.qd-slider');
    if (slider && e.target.type === 'range') mostra(slider, slider.dataset.qd);
  });
  radice.addEventListener('change', (e) => {
    const slider = e.target.closest?.('.qd-slider');
    if (slider && e.target.type === 'range') {
      const c = corrente();
      c[slider.dataset.qd] = mostra(slider, slider.dataset.qd);
      alCambio(c);
    } else if (e.target.matches?.('[data-qd-senza]')) {
      const c = corrente();
      c.senzaQuote = e.target.checked ? 'si' : '';
      alCambio(c);
    }
  });
}
