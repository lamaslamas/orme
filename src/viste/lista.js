import { tuttiISentieri, sentieriConTraccia } from '../db.js';
import { ANIMALI, STATI, ACCESSI } from '../lib/costanti.js';
import { FILTRI_VUOTI, filtraSentieri, paesiDiPartenza, ordinaSentieri } from '../lib/filtri.js';
import { escapeHtml, codici, km } from '../lib/formato.js';

const CHIAVE_FILTRI = 'orme.filtri';

function leggiFiltri() {
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
  const paesi = paesiDiPartenza(sentieri);
  if (filtri.paese && !paesi.includes(filtri.paese)) filtri.paese = '';

  app.innerHTML = `
    <form class="filtri" autocomplete="off">
      <input type="search" name="testo" placeholder="Cerca per nome, codice, zona…" value="${escapeHtml(filtri.testo)}" aria-label="Cerca" />
      <select name="animale" aria-label="Animale">${opzioni(Object.entries(ANIMALI), filtri.animale, 'Tutti gli animali')}</select>
      <select name="stato" aria-label="Stato">${opzioni(Object.entries(STATI), filtri.stato, 'Tutti gli stati')}</select>
      <select name="accesso" aria-label="Tipo di accesso">${opzioni(Object.entries(ACCESSI), filtri.accesso, 'Ogni accesso')}</select>
      <select name="paese" aria-label="Paese di partenza">${opzioni(paesi.map((p) => [p, p]), filtri.paese, 'Ogni paese')}</select>
    </form>
    <div class="riga-conteggio">
      <span id="conteggio"></span>
      <button type="button" class="link" id="azzera" hidden>Azzera filtri</button>
    </div>
    <ul class="lista" id="lista"></ul>
    <a class="fab" href="#/nuovo" aria-label="Aggiungi sentiero">+</a>
  `;

  const form = app.querySelector('.filtri');
  const lista = app.querySelector('#lista');
  const conteggio = app.querySelector('#conteggio');
  const azzera = app.querySelector('#azzera');

  function aggiorna() {
    for (const chiave of Object.keys(FILTRI_VUOTI)) filtri[chiave] = form.elements[chiave].value;
    salvaFiltri(filtri);
    const risultato = ordinaSentieri(filtraSentieri(sentieri, filtri));
    const attivi = Object.values(filtri).some(Boolean);
    azzera.hidden = !attivi;
    conteggio.textContent = attivi
      ? `${risultato.length} di ${sentieri.length} sentieri`
      : `${sentieri.length} sentieri`;
    lista.innerHTML = risultato.length
      ? risultato.map((s) => schedaInLista(s, conTraccia.has(s.id))).join('')
      : '<li class="vuoto">Nessun sentiero corrisponde ai filtri.</li>';
  }

  form.addEventListener('input', aggiorna);
  form.addEventListener('submit', (e) => e.preventDefault());
  azzera.addEventListener('click', () => {
    for (const chiave of Object.keys(FILTRI_VUOTI)) form.elements[chiave].value = '';
    aggiorna();
  });
  aggiorna();
}
