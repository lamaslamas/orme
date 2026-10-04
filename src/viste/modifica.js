import { leggiSentiero, salvaSentiero, eliminaSentiero, tuttiISentieri } from '../db.js';
import { ANIMALI, ACCESSI, STATI, LINK_PARCO } from '../lib/costanti.js';
import { paesiDiPartenza } from '../lib/filtri.js';
import { sentieroDaModulo } from '../lib/modulo.js';
import { escapeHtml, creaId } from '../lib/formato.js';

const NUOVO = {
  codici: [],
  nome: '',
  zona: '',
  descrizione: '',
  animali: [],
  escursione: { associazione: '', nomeUscita: '', periodo: '' },
  lunghezzaKm: null,
  dislivelloM: null,
  durataMin: null,
  partenza: { paese: '', descrizione: '', lat: null, lon: null },
  accesso: { tipo: 'nessuno', nota: '', link: LINK_PARCO },
  stato: 'da_fare',
  dataPercorso: null,
  notePersonali: '',
  daVerificare: false,
};

const v = (valore) => escapeHtml(valore ?? '');

function campo(etichetta, html, aiuto = '') {
  return `<label class="campo"><span>${etichetta}</span>${html}${aiuto ? `<small>${aiuto}</small>` : ''}</label>`;
}

export async function vistaModifica(app, id) {
  const esistente = id ? await leggiSentiero(id) : null;
  if (id && !esistente) {
    app.innerHTML = '<p class="vuoto">Sentiero non trovato. <a href="#/">Torna alla lista</a></p>';
    return;
  }
  const s = esistente ?? NUOVO;
  const tutti = await tuttiISentieri();
  const paesi = paesiDiPartenza(tutti);
  const ore = s.durataMin != null ? Math.floor(s.durataMin / 60) : '';
  const minuti = s.durataMin != null ? s.durataMin % 60 : '';
  const indietro = esistente ? `#/sentiero/${encodeURIComponent(esistente.id)}` : '#/';

  app.innerHTML = `
    <a class="indietro" href="${indietro}">‹ Annulla</a>
    <h1 class="titolo-pagina">${esistente ? 'Modifica sentiero' : 'Nuovo sentiero'}</h1>
    <form class="modulo" novalidate>
      <fieldset>
        <legend>Sentiero</legend>
        <div class="due">
          ${campo('Codici PNALM', `<input name="codici" value="${v((s.codici ?? []).join(', '))}" placeholder="F10, B4" autocapitalize="characters" />`, 'Separati da virgola')}
          ${campo('Zona', `<input name="zona" value="${v(s.zona)}" />`)}
        </div>
        ${campo('Nome *', `<input name="nome" value="${v(s.nome)}" required />`)}
        ${campo('Descrizione del percorso', `<textarea name="descrizione" rows="2">${v(s.descrizione)}</textarea>`)}
        <div class="campo"><span>Animali di riferimento</span>
          <div class="scelte">
            ${Object.entries(ANIMALI)
              .map(
                ([k, et]) =>
                  `<label class="scelta"><input type="checkbox" name="animali" value="${k}" ${s.animali?.includes(k) ? 'checked' : ''} /> ${et}</label>`,
              )
              .join('')}
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>Escursione d'origine</legend>
        ${campo('Associazione', `<input name="associazione" value="${v(s.escursione?.associazione)}" />`)}
        <div class="due">
          ${campo("Nome dell'uscita", `<input name="nomeUscita" value="${v(s.escursione?.nomeUscita)}" />`)}
          ${campo("Periodo dell'anno", `<input name="periodo" value="${v(s.escursione?.periodo)}" placeholder="es. ottobre" />`)}
        </div>
      </fieldset>

      <fieldset>
        <legend>Percorso</legend>
        <div class="tre">
          ${campo('Lunghezza (km)', `<input name="lunghezzaKm" inputmode="decimal" value="${v(s.lunghezzaKm)}" />`)}
          ${campo('Dislivello (m)', `<input name="dislivelloM" inputmode="numeric" value="${v(s.dislivelloM)}" />`)}
          <div class="campo"><span>Durata</span>
            <div class="durata">
              <input name="durataOre" inputmode="numeric" value="${v(ore)}" aria-label="Ore" placeholder="h" />
              <input name="durataMin" inputmode="numeric" value="${v(minuti)}" aria-label="Minuti" placeholder="min" />
            </div>
          </div>
        </div>
        <div class="due">
          ${campo('Paese di partenza', `<input name="paese" value="${v(s.partenza?.paese)}" list="paesi" />`)}
          ${campo('Punto di partenza', `<input name="partenzaDescrizione" value="${v(s.partenza?.descrizione)}" placeholder="es. parcheggio, valico…" />`)}
        </div>
        <datalist id="paesi">${paesi.map((p) => `<option value="${v(p)}"></option>`).join('')}</datalist>
        <div class="due">
          ${campo('Latitudine partenza', `<input name="lat" inputmode="decimal" value="${v(s.partenza?.lat)}" placeholder="41.80000" />`)}
          ${campo('Longitudine partenza', `<input name="lon" inputmode="decimal" value="${v(s.partenza?.lon)}" placeholder="13.80000" />`)}
        </div>
        <button type="button" class="link" id="usaPosizione">Usa la mia posizione attuale come partenza</button>
        <small class="aiuto">Solo il punto di partenza del sentiero (parcheggio o inizio del tracciato).</small>
      </fieldset>

      <fieldset>
        <legend>Accesso</legend>
        ${campo(
          'Tipo di accesso',
          `<select name="accessoTipo">${Object.entries(ACCESSI)
            .map(([k, et]) => `<option value="${k}" ${(s.accesso?.tipo || 'nessuno') === k ? 'selected' : ''}>${et}</option>`)
            .join('')}</select>`,
        )}
        ${campo('Nota sull\'accesso', `<textarea name="accessoNota" rows="2">${v(s.accesso?.nota)}</textarea>`)}
        ${campo('Link per la verifica', `<input name="accessoLink" type="url" value="${v(s.accesso?.link)}" placeholder="${LINK_PARCO}" />`)}
      </fieldset>

      <fieldset>
        <legend>Il mio diario</legend>
        <div class="due">
          ${campo(
            'Stato',
            `<select name="stato">${Object.entries(STATI)
              .map(([k, et]) => `<option value="${k}" ${s.stato === k ? 'selected' : ''}>${et}</option>`)
              .join('')}</select>`,
          )}
          ${campo('Data in cui l\'ho percorso', `<input name="dataPercorso" type="date" value="${v(s.dataPercorso)}" />`)}
        </div>
        ${campo(
          'Note personali',
          `<textarea name="notePersonali" rows="4">${v(s.notePersonali)}</textarea>`,
          'Non annotare punti esatti di avvistamento o appostamento di orso e lupo.',
        )}
        <label class="scelta"><input type="checkbox" name="daVerificare" ${s.daVerificare ? 'checked' : ''} /> Dati da verificare</label>
      </fieldset>

      <p class="errore" id="erroreModulo" role="alert" hidden></p>
      <div class="azioni">
        <a class="bottone" href="${indietro}">Annulla</a>
        <button type="submit" class="bottone primario">Salva</button>
      </div>
      ${esistente ? '<button type="button" class="bottone pericolo pieno" id="elimina">Elimina sentiero</button>' : ''}
    </form>
  `;

  const form = app.querySelector('.modulo');
  const errore = app.querySelector('#erroreModulo');

  function mostraErrore(messaggio) {
    errore.textContent = messaggio;
    errore.hidden = false;
    errore.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const dati = Object.fromEntries(new FormData(form));
    dati.animali = new FormData(form).getAll('animali');
    dati.daVerificare = form.elements.daVerificare.checked;
    let sentiero;
    try {
      sentiero = sentieroDaModulo(dati, esistente ?? {});
    } catch (e) {
      mostraErrore(e.message);
      return;
    }
    if (!esistente) {
      const ids = new Set(tutti.map((t) => t.id));
      const base = creaId(sentiero.codici, sentiero.nome);
      let nuovoId = base;
      for (let n = 2; ids.has(nuovoId); n++) nuovoId = `${base}-${n}`;
      sentiero.id = nuovoId;
    }
    await salvaSentiero(sentiero);
    location.hash = `#/sentiero/${encodeURIComponent(sentiero.id)}`;
  });

  app.querySelector('#usaPosizione').addEventListener('click', (evento) => {
    const bottone = evento.currentTarget;
    if (!navigator.geolocation) {
      mostraErrore('Questo dispositivo non fornisce la posizione.');
      return;
    }
    bottone.textContent = 'Cerco la posizione…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        form.elements.lat.value = pos.coords.latitude.toFixed(5);
        form.elements.lon.value = pos.coords.longitude.toFixed(5);
        bottone.textContent = 'Usa la mia posizione attuale come partenza';
      },
      () => {
        mostraErrore('Posizione non disponibile: controlla che il GPS e i permessi siano attivi.');
        bottone.textContent = 'Usa la mia posizione attuale come partenza';
      },
      { enableHighAccuracy: true, timeout: 20000 },
    );
  });

  app.querySelector('#elimina')?.addEventListener('click', async () => {
    if (!confirm(`Eliminare "${esistente.nome}" e la sua traccia? L'operazione non si può annullare.`)) return;
    await eliminaSentiero(esistente.id);
    location.hash = '#/';
  });
}
