import { tuttiISentieri, sentieriConTraccia } from '../db.js';
import { ANIMALI, ACCESSI, BICI_CONSENTITA } from '../lib/costanti.js';
import { filtraSentieri, ordinaSentieri } from '../lib/filtri.js';
import { escapeHtml, codici, km } from '../lib/formato.js';
import { leggiFiltri, htmlFiltri, collegaFiltri, filtriAttivi } from './filtri.js';

const BOLLINO_BICI = { si: 'Bici sì', no: 'Bici no', da_verificare: 'Bici ?' };

export function bollinoBici(s) {
  const c = s.bici?.consentita || 'da_verificare';
  return `<span class="chip chip-bici-${c}" title="Bici: ${BICI_CONSENTITA[c]}">${BOLLINO_BICI[c]}</span>`;
}

export function schedaInLista(s, haTraccia) {
  const dati = [s.zona, s.partenza?.paese && `da ${s.partenza.paese}`, km(s.lunghezzaKm)]
    .filter(Boolean)
    .map(escapeHtml)
    .join(' · ');
  const animali = (s.animali ?? [])
    .map((a) => `<span class="chip chip-${a}">${ANIMALI[a] ?? escapeHtml(a)}</span>`)
    .join('');
  const tipo = s.accesso?.tipo || 'nessuno';
  return `
    <li>
      <a class="carta ${s.stato === 'fatto' ? 'fatto' : ''}" href="#/sentiero/${encodeURIComponent(s.id)}">
        <div class="carta-titolo">
          ${s.codici?.length ? `<span class="codice">${escapeHtml(codici(s))}</span>` : ''}
          <span class="nome">${escapeHtml(s.nome)}</span>
        </div>
        ${dati ? `<div class="carta-dati">${dati}</div>` : ''}
        <div class="chips">
          ${animali}
          ${tipo !== 'nessuno' && tipo !== 'libero' ? `<span class="chip chip-accesso">${ACCESSI[tipo]}</span>` : ''}
          ${bollinoBici(s)}
          ${s.stato === 'fatto' ? '<span class="chip chip-fatto">Fatto</span>' : ''}
          ${haTraccia ? '<span class="chip chip-traccia">Traccia</span>' : ''}
          ${s.daVerificare ? '<span class="chip chip-verifica">Da verificare</span>' : ''}
        </div>
      </a>
    </li>`;
}

export async function vistaLista(app) {
  const [sentieri, conTraccia] = await Promise.all([tuttiISentieri(), sentieriConTraccia()]);
  const filtri = leggiFiltri();

  app.innerHTML = `
    ${htmlFiltri(sentieri, filtri)}
    <div class="riga-conteggio">
      <span id="conteggio"></span>
      <button type="button" class="link" id="azzera" hidden>Azzera filtri</button>
    </div>
    <ul class="lista" id="lista"></ul>
    <a class="fab" href="#/nuovo" aria-label="Aggiungi sentiero">+</a>
  `;

  const lista = app.querySelector('#lista');
  const conteggio = app.querySelector('#conteggio');
  const azzera = app.querySelector('#azzera');

  const controlli = collegaFiltri(app.querySelector('.filtri'), filtri, () => {
    const risultato = ordinaSentieri(filtraSentieri(sentieri, filtri));
    const attivi = filtriAttivi(filtri) > 0;
    azzera.hidden = !attivi;
    conteggio.textContent = attivi
      ? `${risultato.length} di ${sentieri.length} sentieri`
      : `${sentieri.length} sentieri`;
    lista.innerHTML = risultato.length
      ? risultato.map((s) => schedaInLista(s, conTraccia.has(s.id))).join('')
      : '<li class="vuoto">Nessun sentiero corrisponde ai filtri.</li>';
  });
  azzera.addEventListener('click', () => controlli.azzera());
}
