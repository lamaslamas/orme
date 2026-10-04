import { leggiSentiero, salvaSentiero, leggiTraccia } from '../db.js';
import { ANIMALI, ACCESSI, LINK_PARCO } from '../lib/costanti.js';
import { escapeHtml, codici, durata, km } from '../lib/formato.js';

function riga(etichetta, valore) {
  if (valore == null || valore === '') return '';
  return `<div class="riga"><dt>${etichetta}</dt><dd>${valore}</dd></div>`;
}

function oggi() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function linkSicuro(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

export async function vistaScheda(app, id) {
  const [s, traccia] = await Promise.all([leggiSentiero(id), leggiTraccia(id)]);
  if (!s) {
    app.innerHTML = '<p class="vuoto">Sentiero non trovato. <a href="#/">Torna alla lista</a></p>';
    return;
  }

  const tipo = s.accesso?.tipo || 'nessuno';
  const linkParco = linkSicuro(s.accesso?.link) ?? LINK_PARCO;
  const p = s.partenza ?? {};
  const haCoordinate = Number.isFinite(p.lat) && Number.isFinite(p.lon);
  const partenza = [p.paese, p.descrizione].filter(Boolean).map(escapeHtml).join(' – ');
  const e = s.escursione ?? {};
  const haEscursione = e.associazione || e.nomeUscita || e.periodo;

  app.innerHTML = `
    <a class="indietro" href="#/">‹ Tutti i sentieri</a>
    <article class="scheda">
      <h1>
        ${s.codici?.length ? `<span class="codice">${escapeHtml(codici(s))}</span>` : ''}
        ${escapeHtml(s.nome)}
      </h1>
      ${s.zona ? `<p class="zona">${escapeHtml(s.zona)}</p>` : ''}
      <div class="chips">
        ${(s.animali ?? []).map((a) => `<span class="chip chip-${a}">${ANIMALI[a] ?? escapeHtml(a)}</span>`).join('')}
        ${s.daVerificare ? '<span class="chip chip-verifica">Da verificare</span>' : ''}
      </div>
      ${s.descrizione ? `<p class="descrizione">${escapeHtml(s.descrizione)}</p>` : ''}

      <div class="azioni">
        <a class="bottone primario" href="#/sentiero/${encodeURIComponent(s.id)}/mappa">
          ${traccia ? 'Apri la mappa' : 'Mappa e traccia'}
        </a>
        <a class="bottone" href="#/sentiero/${encodeURIComponent(s.id)}/modifica">Modifica</a>
      </div>

      <section class="riquadro accesso accesso-${tipo}">
        <h2>Accesso: ${ACCESSI[tipo] ?? ACCESSI.nessuno}</h2>
        ${s.accesso?.nota ? `<p>${escapeHtml(s.accesso.nota)}</p>` : ''}
        <a href="${escapeHtml(linkParco)}" target="_blank" rel="noopener">Verifica sul sito del Parco ↗</a>
      </section>

      <section class="riquadro">
        <h2>Percorso</h2>
        <dl>
          ${riga('Lunghezza', escapeHtml(km(s.lunghezzaKm)))}
          ${riga('Dislivello', s.dislivelloM != null ? `${escapeHtml(s.dislivelloM)} m` : '')}
          ${riga('Durata', escapeHtml(durata(s.durataMin)))}
          ${riga('Partenza', partenza)}
          ${riga('Traccia', traccia ? (traccia.origine === 'osm' ? 'Salvata (da OpenStreetMap)' : 'Salvata (da file GPX)') : 'Non ancora salvata')}
        </dl>
        ${
          haCoordinate
            ? `<a class="bottone" href="geo:${p.lat},${p.lon}?q=${p.lat},${p.lon}(${encodeURIComponent('Partenza')})">Naviga alla partenza</a>`
            : ''
        }
      </section>

      ${
        haEscursione
          ? `<section class="riquadro">
              <h2>Escursione d'origine</h2>
              <dl>
                ${riga('Associazione', escapeHtml(e.associazione))}
                ${riga('Uscita', escapeHtml(e.nomeUscita))}
                ${riga('Periodo', escapeHtml(e.periodo))}
              </dl>
            </section>`
          : ''
      }

      <section class="riquadro">
        <h2>Il mio diario</h2>
        <div class="stato-riga">
          <label class="interruttore">
            <input type="checkbox" id="fatto" ${s.stato === 'fatto' ? 'checked' : ''} />
            <span>Percorso fatto</span>
          </label>
          <input type="date" id="dataPercorso" value="${escapeHtml(s.dataPercorso ?? '')}" ${s.stato === 'fatto' ? '' : 'hidden'} aria-label="Data in cui l'ho percorso" />
        </div>
        <p class="salvato" id="salvato" hidden>Salvato</p>
        ${s.notePersonali ? `<p class="note">${escapeHtml(s.notePersonali)}</p>` : '<p class="tenue">Nessuna nota personale.</p>'}
      </section>
    </article>
  `;

  const casella = app.querySelector('#fatto');
  const campoData = app.querySelector('#dataPercorso');
  const avviso = app.querySelector('#salvato');
  let attuale = s;

  async function salva(modifiche) {
    attuale = await salvaSentiero({ ...attuale, ...modifiche });
    avviso.hidden = false;
    clearTimeout(salva.timer);
    salva.timer = setTimeout(() => (avviso.hidden = true), 1500);
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
