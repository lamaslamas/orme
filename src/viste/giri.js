import { tuttiIGiri, leggiGiro, salvaGiro, tuttiISentieri, tutteLeTracce } from '../db.js';
import { calcolaGiro } from '../lib/giro.js';
import { SPIEGAZIONE_DURATA } from '../lib/durata.js';
import { escapeHtml, durata } from '../lib/formato.js';
import { htmlPortamiAllaPartenza } from './scheda.js';

export async function caricaContesto() {
  const [sentieri, tracce] = await Promise.all([tuttiISentieri(), tutteLeTracce()]);
  return { sentieri: new Map(sentieri.map((s) => [s.id, s])), tracce, elenco: sentieri };
}

export function testoKm(km) {
  return `${km.toFixed(1).replace('.', ',')} km`;
}

export function testoDislivello(d) {
  return d ? `+${d.salita} m / −${d.discesa} m` : 'non disponibile';
}

function oggi() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Riquadro con lunghezza, dislivello, durata e avvisi (usato anche nell'anteprima del modulo)
export function htmlMisure(calcolo) {
  if (!calcolo.pezzi.length) {
    return '<p class="tenue">Nessuna traccia disponibile: aggiungi sentieri che hanno una traccia salvata.</p>';
  }
  const salti = calcolo.salti
    .map((s) =>
      s.tipo === 'tra'
        ? `<li>Salto di <b>${Math.round(s.distanzaM)} m</b> in linea d'aria tra la fine di <i>${escapeHtml(s.da)}</i> e l'inizio di <i>${escapeHtml(s.a)}</i>.</li>`
        : `<li>La traccia di <i>${escapeHtml(s.da)}</i> è spezzata: salto di <b>${Math.round(s.distanzaM)} m</b> in linea d'aria.</li>`,
    )
    .join('');
  const problemi = calcolo.problemi
    .map((t) =>
      t.mancante
        ? '<li>Un sentiero del giro è stato eliminato.</li>'
        : `<li><i>${escapeHtml(t.etichetta)}</i> non ha una traccia: non è compreso nelle misure.</li>`,
    )
    .join('');
  return `
    <dl>
      <div class="riga"><dt>Lunghezza</dt><dd>${testoKm(calcolo.lunghezzaKm)}</dd></div>
      <div class="riga"><dt>Dislivello</dt><dd>${testoDislivello(calcolo.dislivello)}${calcolo.dislivello ? ' <span class="tenue">(stima)</span>' : ''}</dd></div>
      <div class="riga"><dt>Durata</dt><dd>${durata(calcolo.durataMin)} <span class="tenue">${calcolo.dislivello ? '(stima, soste escluse)' : '(solo distanza)'}</span></dd></div>
    </dl>
    ${
      calcolo.dislivello
        ? ''
        : `<p class="tenue">Dislivello non disponibile: ${
            calcolo.tappeSenzaQuote.length
              ? `mancano le quote in ${calcolo.tappeSenzaQuote.map(escapeHtml).join(', ')}. Puoi aggiungerle dalla mappa di ciascun sentiero.`
              : 'le tracce non hanno le quote.'
          }</p>`
    }
    <details class="spiegazione"><summary>Come si calcola la durata</summary><p>${SPIEGAZIONE_DURATA}</p></details>
    ${salti || problemi ? `<div class="avvisi"><b>Attenzione</b><ul>${salti}${problemi}</ul></div>` : ''}
  `;
}

export async function vistaGiri(app) {
  const [giri, contesto] = await Promise.all([tuttiIGiri(), caricaContesto()]);
  giri.sort((a, b) => (a.stato === b.stato ? a.nome.localeCompare(b.nome, 'it') : a.stato === 'da_fare' ? -1 : 1));

  app.innerHTML = `
    <h1 class="titolo-pagina">Giri combinati</h1>
    <p class="tenue">Più sentieri in fila, anche percorsi al contrario, con lunghezza, dislivello e durata stimata.</p>
    <ul class="lista">
      ${
        giri.length
          ? giri
              .map((g) => {
                const c = calcolaGiro(g, contesto.sentieri, contesto.tracce);
                const avvisi = c.salti.length + c.problemi.length;
                return `<li><a class="carta ${g.stato === 'fatto' ? 'fatto' : ''}" href="#/giro/${encodeURIComponent(g.id)}">
                  <div class="carta-titolo"><span class="nome">${escapeHtml(g.nome)}</span></div>
                  <div class="carta-dati">${g.tappe.length} sentieri · ${testoKm(c.lunghezzaKm)}${
                    c.dislivello ? ` · +${c.dislivello.salita} m` : ''
                  } · ${durata(c.durataMin) || '–'}</div>
                  <div class="chips">
                    ${g.stato === 'fatto' ? '<span class="chip chip-fatto">Fatto</span>' : ''}
                    ${avvisi ? `<span class="chip chip-accesso">${avvisi} ${avvisi === 1 ? 'avviso' : 'avvisi'}</span>` : ''}
                  </div>
                </a></li>`;
              })
              .join('')
          : '<li class="vuoto">Nessun giro. Tocca + per crearne uno.</li>'
      }
    </ul>
    <a class="fab" href="#/giro-nuovo" aria-label="Nuovo giro">+</a>
  `;
}

export async function vistaGiro(app, id) {
  const [giro, contesto] = await Promise.all([leggiGiro(id), caricaContesto()]);
  if (!giro) {
    app.innerHTML = '<p class="vuoto">Giro non trovato. <a href="#/giri">Torna ai giri</a></p>';
    return;
  }
  const calcolo = calcolaGiro(giro, contesto.sentieri, contesto.tracce);

  app.innerHTML = `
    <a class="indietro" href="#/giri">‹ Tutti i giri</a>
    <article class="scheda">
      <h1>${escapeHtml(giro.nome)}</h1>
      <p class="zona">Giro di ${giro.tappe.length} sentieri</p>
      <div class="azioni">
        <a class="bottone primario" href="#/giro/${encodeURIComponent(id)}/mappa">Mappa del giro</a>
        <a class="bottone" href="#/giro/${encodeURIComponent(id)}/modifica">Modifica</a>
      </div>

      <section class="riquadro">
        <h2>Misure</h2>
        ${htmlMisure(calcolo)}
      </section>

      ${(() => {
        const inizio = calcolo.pezzi[0]?.linea[0];
        return inizio ? htmlPortamiAllaPartenza({ lat: inizio[1], lon: inizio[0], fonte: 'traccia' }) : '';
      })()}

      <section class="riquadro">
        <h2>Sentieri, in ordine</h2>
        <ol class="tappe">
          ${calcolo.tappe
            .map((t) =>
              t.mancante
                ? '<li class="tenue">Sentiero eliminato</li>'
                : `<li><a href="#/sentiero/${encodeURIComponent(t.sentieroId)}">${escapeHtml(t.etichetta)}</a>${
                    t.alContrario ? ' <span class="chip">al contrario</span>' : ''
                  }</li>`,
            )
            .join('')}
        </ol>
      </section>

      <section class="riquadro">
        <h2>Il mio diario</h2>
        <div class="stato-riga">
          <label class="interruttore">
            <input type="checkbox" id="fatto" ${giro.stato === 'fatto' ? 'checked' : ''} />
            <span>Giro fatto</span>
          </label>
          <input type="date" id="dataPercorso" value="${escapeHtml(giro.dataPercorso ?? '')}" ${giro.stato === 'fatto' ? '' : 'hidden'} aria-label="Data in cui l'ho percorso" />
        </div>
        <p class="salvato" id="salvato" hidden>Salvato</p>
        ${giro.notePersonali ? `<p class="note">${escapeHtml(giro.notePersonali)}</p>` : '<p class="tenue">Nessuna nota personale.</p>'}
      </section>
    </article>
  `;

  const casella = app.querySelector('#fatto');
  const campoData = app.querySelector('#dataPercorso');
  const avviso = app.querySelector('#salvato');
  let attuale = giro;
  let timer;

  async function salva(modifiche) {
    attuale = await salvaGiro({ ...attuale, ...modifiche });
    avviso.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(() => (avviso.hidden = true), 1500);
  }

  casella.addEventListener('change', () => {
    if (casella.checked) {
      if (!campoData.value) campoData.value = oggi();
      campoData.hidden = false;
      salva({ stato: 'fatto', dataPercorso: campoData.value });
    } else {
      campoData.hidden = true;
      salva({ stato: 'da_fare' });
    }
  });
  campoData.addEventListener('change', () => salva({ dataPercorso: campoData.value || null }));
}
