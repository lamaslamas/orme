// Sezione «Luce e fotografia» della scheda: alba, tramonto e ora d'oro del giorno scelto e, per chi fotografa,
// «a che ora parto per essere al km X all'alba o al tramonto». Calcoli sul telefono (src/lib/fotografia.js).
import { escapeHtml, durata } from '../lib/formato.js';
import { km1, profiloTempi } from '../lib/lungoIlPercorso.js';
import { oraDaMinuti } from '../lib/andataRitorno.js';
import { orariDelGiorno, pianoFoto } from '../lib/fotografia.js';
import { testoTratto } from '../lib/trattoFauna.js';
import { ICONE } from './icone.js';

const oggiItalia = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const ora = (min) => (min == null ? '–' : oraDaMinuti(min));

// Una riga di sintesi per l'intestazione della sezione (oggi, nel punto dato)
export function riassuntoLuce(punto) {
  if (!punto) return 'Alba e tramonto';
  const o = orariDelGiorno(oggiItalia(), punto);
  return `Alba ${ora(o.alba)} · tramonto ${ora(o.tramonto)}`;
}

export function htmlFotografia({ conPercorso, tratto }) {
  return `<div class="foto-luce">
    <label class="scelta-ora">Giorno <input type="date" data-foto-giorno value="${oggiItalia()}" /></label>
    <dl class="luci-giorno" data-foto-luci></dl>
    ${
      conPercorso
        ? `<h3>Essere sul percorso con la luce giusta</h3>
    <div class="gruppo-scelte" role="radiogroup" aria-label="Quando">
      <button type="button" class="chip-scorciatoia attiva" role="radio" aria-checked="true" data-foto-evento="alba">All'alba</button>
      <button type="button" class="chip-scorciatoia" role="radio" aria-checked="false" data-foto-evento="tramonto">Al tramonto</button>
    </div>
    <div class="gruppo-scelte" role="radiogroup" aria-label="Dove">
      ${tratto ? `<button type="button" class="chip-scorciatoia attiva" role="radio" aria-checked="true" data-foto-dove="tratto">Nel tratto con più fauna (${escapeHtml(testoTratto(tratto))})</button>` : ''}
      <button type="button" class="chip-scorciatoia ${tratto ? '' : 'attiva'}" role="radio" aria-checked="${tratto ? 'false' : 'true'}" data-foto-dove="km">Al km <input type="number" class="campo-km" data-foto-km min="0" step="0.5" inputmode="decimal" aria-label="Chilometro" /></button>
    </div>
    <div class="foto-piano" aria-live="polite"></div>`
        : '<p class="tenue piccolo">Senza una traccia continua non posso dirti a che ora partire: qui trovi solo gli orari della luce.</p>'
    }
    <p class="tenue piccolo">Orari calcolati sul telefono, precisi a un paio di minuti. I tempi di cammino sono una stima (metodo CAI): in pratica aggiungi un margine.</p>
  </div>`;
}

// box: la sezione; punto: [lon, lat] (partenza); pezzi: la traccia in ordine (con le quote, se ci sono)
export function collegaFotografia(box, { punto, pezzi = [], tratto = null, linkParco = null }) {
  if (!box || !punto) return;
  const giornoEl = box.querySelector('[data-foto-giorno]');
  const luci = box.querySelector('[data-foto-luci]');
  const piano = box.querySelector('.foto-piano');
  const kmEl = box.querySelector('[data-foto-km]');
  const andata = pezzi.length ? profiloTempi(pezzi) : null;
  const ritorno = pezzi.length ? profiloTempi(pezzi.map((l) => [...l].reverse()).reverse()) : null;
  const kmTotale = andata?.km.at(-1) ?? 0;
  if (kmEl) kmEl.value = String(Math.round(kmTotale / 2));
  let evento = 'alba';
  let dove = tratto ? 'tratto' : 'km';

  function disegna() {
    const o = orariDelGiorno(giornoEl.value || oggiItalia(), punto);
    luci.innerHTML = `
      <dt>Alba</dt><dd>${ora(o.alba)}</dd>
      <dt>Ora d'oro del mattino</dt><dd>${ora(o.alba)}–${ora(o.oroMattinaFine)}</dd>
      <dt>Ora d'oro della sera</dt><dd>${ora(o.oroSeraInizio)}–${ora(o.tramonto)}</dd>
      <dt>Tramonto</dt><dd>${ora(o.tramonto)}</dd>
      <dt>Buio (fine crepuscolo)</dt><dd>${ora(o.tramontoCivile)}</dd>`;
    if (!piano) return;
    const km = dove === 'tratto' && tratto ? tratto.daKm : Math.max(0, Math.min(kmTotale, Number(kmEl?.value) || 0));
    const p = pianoFoto({ evento, km, kmTotale, serieAndata: andata, serieRitorno: ritorno, orari: o });
    if (!p) return void (piano.innerHTML = '');
    if (p.impossibile) return void (piano.innerHTML = `<p class="foto-risposta">${escapeHtml(p.impossibile)}</p>`);
    const dovE = km < 0.05 ? 'alla partenza' : `al km ${km1(km)}`;
    const dopo = p.partenzaMin < 0 ? ` (${ora(p.partenzaMin)} del giorno prima)` : '';
    const dettaglio =
      evento === 'alba'
        ? `per essere ${dovE} alle ${ora(p.arrivoMin)}, 20 minuti prima dell'alba (${ora(o.alba)}).`
        : `per essere ${dovE} alle ${ora(p.arrivoMin)}, quando inizia l'ora d'oro; tramonto alle ${ora(o.tramonto)}. Tornando indietro rientri verso le ${ora(p.rientro.fineMin)}.`;
    piano.innerHTML = `<p class="foto-risposta"><b>Parti alle ${ora(p.partenzaMin)}${dopo}</b> ${dettaglio}${km < 0.05 ? '' : ` Cammino fin lì: ${durata(p.andataMin)}.`}</p>
      ${p.avvisi
        .map((a) => `<p class="avviso-via">${ICONE.avviso}<span>${escapeHtml(a.testo)}${a.tipo === 'regole' && linkParco ? ` <a href="${escapeHtml(linkParco)}" target="_blank" rel="noopener noreferrer">Regole e chiusure del Parco ↗</a>` : ''}</span></p>`)
        .join('')}`;
  }

  box.addEventListener('input', (e) => e.target.matches('[data-foto-giorno],[data-foto-km]') && disegna());
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-foto-evento],[data-foto-dove]');
    if (!b) return;
    if (b.dataset.fotoEvento) evento = b.dataset.fotoEvento;
    if (b.dataset.fotoDove) dove = b.dataset.fotoDove;
    for (const x of box.querySelectorAll(b.dataset.fotoEvento ? '[data-foto-evento]' : '[data-foto-dove]')) {
      const on = x === b;
      x.classList.toggle('attiva', on);
      x.setAttribute('aria-checked', String(on));
    }
    disegna();
  });
  disegna();
}
