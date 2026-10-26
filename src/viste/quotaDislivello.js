// "Quota e dislivello": lo stesso componente in Filtri (Percorsi qui, parchi, I miei percorsi) e in Suggerisci.
// Due slider a due cursori (quota massima 0–3000 m, dislivello in salita 0–2000 m, a passi di 50 m) con il valore
// scelto in chiaro sopra; a valori estremi il filtro è spento. c: { quota, salita, senzaQuote } (testi "da-a").
import { PASSI, LIMITI, intervalloDi, testoIntervallo, testoQuota, testoSalita, testoLunghezza } from '../lib/quotaDislivello.js';
import { escapeHtml } from '../lib/formato.js';

// chiave nelle scelte → tipo di intervallo (limiti e unità) e testi
const SLIDER = {
  quota: { tipo: 'quota', titolo: 'Quota massima raggiunta', etichetta: testoQuota },
  salita: { tipo: 'salita', titolo: 'Dislivello in salita', etichetta: testoSalita },
  lunghezzaKm: { tipo: 'km', titolo: 'Lunghezza', etichetta: testoLunghezza },
};

function htmlSlider(chiave, c) {
  const { tipo } = SLIDER[chiave];
  const [da, a] = intervalloDi(c[chiave], tipo);
  const max = LIMITI[tipo];
  const passo = PASSI[tipo];
  return `<div class="qd-slider" data-qd="${chiave}" style="--da:${(da / max) * 100}%;--a:${(a / max) * 100}%">
      <p class="qd-valore" aria-live="polite">${escapeHtml(SLIDER[chiave].etichetta(c))}</p>
      <div class="qd-cursori">
        <span class="qd-binario"></span>
        <input type="range" min="0" max="${max}" step="${passo}" value="${da}" data-estremo="da" aria-label="${SLIDER[chiave].titolo}: da" />
        <input type="range" min="0" max="${max}" step="${passo}" value="${a}" data-estremo="a" aria-label="${SLIDER[chiave].titolo}: fino a" />
      </div>
    </div>`;
}

// sezione completa: titolo, i due slider e la scelta per i percorsi senza quote
// solo quota: in Suggerisci c'è la sola quota massima (niente dislivello né «senza dati di quota»)
export const htmlQuotaDislivello = (c, { soloQuota = false } = {}) => `<section class="sezione-filtro quota-dislivello"><h3>${soloQuota ? 'Quota massima' : 'Quota e dislivello'}</h3>
    ${htmlSlider('quota', c)}
    ${soloQuota ? '' : `${htmlSlider('salita', c)}
    <label class="qd-senza"><input type="checkbox" data-qd-senza ${c.senzaQuote ? 'checked' : ''} /> Includi anche quelli senza dati di quota</label>`}
  </section>`;

// «Lunghezza»: i km da percorrere davvero (un anello, o andata e ritorno; «Solo andata» conta l'andata)
export const htmlLunghezza = (c) => `<section class="sezione-filtro lunghezza-filtro"><h3>Lunghezza</h3>
    <p class="tenue piccolo">km da percorrere (andata e ritorno inclusi)</p>
    ${htmlSlider('lunghezzaKm', c)}
  </section>`;

// radice: un contenitore stabile (la sezione può essere ridisegnata); alCambio(c) quando una scelta è finita
// c: l'oggetto delle scelte, o una funzione che lo restituisce (se chi lo usa lo sostituisce)
export function collegaQuotaDislivello(radice, scelte, alCambio) {
  const corrente = () => (typeof scelte === 'function' ? scelte() : scelte);
  const leggi = (slider) => {
    const [da, a] = [...slider.querySelectorAll('input')].map((i) => Number(i.value));
    return [Math.min(da, a), Math.max(da, a)];
  };
  const mostra = (slider, chiave) => {
    const { tipo } = SLIDER[chiave];
    const [da, a] = leggi(slider);
    const max = LIMITI[tipo];
    slider.style.setProperty('--da', `${(da / max) * 100}%`);
    slider.style.setProperty('--a', `${(a / max) * 100}%`);
    // il cursore di sinistra sta sopra quando i due si toccano nella metà alta (altrimenti non si potrebbe spostare)
    slider.querySelector('[data-estremo=da]').style.zIndex = da >= max / 2 ? 3 : 1;
    slider.querySelector('.qd-valore').textContent = SLIDER[chiave].etichetta({ [chiave]: testoIntervallo(da, a, tipo) });
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
