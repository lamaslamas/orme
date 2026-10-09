// Sezioni richiudibili della scheda del sentiero: titolo con icona e una riga di riassunto,
// il contenuto si apre al tocco. Quali sono aperte si ricorda su questo dispositivo.
import { ICONE } from './icone.js';

const CHIAVE = 'orme.sezioniAperte';
// aperte la prima volta: le più utili per scegliere
const PREDEFINITE = { fauna: true, davedere: true };

function lette() {
  try {
    return JSON.parse(localStorage.getItem(CHIAVE) ?? '{}');
  } catch {
    return {};
  }
}

// corpo vuoto → niente sezione. riassunto: HTML già sicuro (testi passati da escapeHtml)
export function htmlSezione(chiave, { icona, titolo, riassunto = '' }, corpo) {
  if (!corpo) return '';
  const aperta = lette()[chiave] ?? PREDEFINITE[chiave] ?? false;
  return `<details class="sezione sezione-${chiave}" data-sezione="${chiave}" ${aperta ? 'open' : ''}>
    <summary>
      <span class="sezione-icona">${ICONE[icona] ?? ''}</span>
      <span class="sezione-testo"><span class="sezione-titolo">${titolo}</span><span class="sezione-riassunto" data-riassunto>${riassunto}</span></span>
      <span class="sezione-freccia">${ICONE.freccia}</span>
    </summary>
    <div class="sezione-corpo">${corpo}</div>
  </details>`;
}

// Riassunto aggiornato dopo (per i contenuti che arrivano in seguito, es. rifugi e acqua)
export function impostaRiassunto(contenitore, chiave, html) {
  const r = contenitore.querySelector(`[data-sezione="${chiave}"] [data-riassunto]`);
  if (r) r.innerHTML = html;
}

export function collegaSezioni(contenitore) {
  contenitore.addEventListener(
    'toggle',
    (e) => {
      const chiave = e.target?.dataset?.sezione;
      if (!chiave) return;
      const stato = { ...lette(), [chiave]: e.target.open };
      try {
        localStorage.setItem(CHIAVE, JSON.stringify(stato));
      } catch {
        // memoria non disponibile: vale solo per questa visita
      }
    },
    true,
  );
}
