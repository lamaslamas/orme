import { leggiGiro, salvaGiro, eliminaGiro, tuttiIGiri } from '../db.js';
import { STATI } from '../lib/costanti.js';
import { calcolaGiro, completaGiro, controllaGiro, etichettaSentiero } from '../lib/giro.js';
import { ordinaSentieri } from '../lib/filtri.js';
import { escapeHtml, creaId } from '../lib/formato.js';
import { caricaContesto, htmlMisure } from './giri.js';

export async function vistaModificaGiro(app, id) {
  const [esistente, contesto] = await Promise.all([id ? leggiGiro(id) : null, caricaContesto()]);
  if (id && !esistente) {
    app.innerHTML = '<p class="vuoto">Giro non trovato. <a href="#/giri">Torna ai giri</a></p>';
    return;
  }
  const giro = completaGiro(esistente ?? { id: null });
  // copia di lavoro delle tappe: si salva solo con "Salva"
  const tappe = giro.tappe.map((t) => ({ ...t }));
  const conTraccia = ordinaSentieri(contesto.elenco.filter((s) => contesto.tracce.has(s.id)));
  const indietro = esistente ? `#/giro/${encodeURIComponent(esistente.id)}` : '#/giri';

  app.innerHTML = `
    <a class="indietro" href="${indietro}">‹ Annulla</a>
    <h1 class="titolo-pagina">${esistente ? 'Modifica giro' : 'Nuovo giro'}</h1>
    <form class="modulo" novalidate>
      <fieldset>
        <legend>Giro</legend>
        <label class="campo"><span>Nome *</span><input name="nome" value="${escapeHtml(giro.nome)}" required /></label>
      </fieldset>

      <fieldset>
        <legend>Sentieri, in ordine</legend>
        <ol class="editor-tappe" id="tappe"></ol>
        ${
          conTraccia.length
            ? `<div class="aggiungi-tappa">
                <select id="nuovaTappa" aria-label="Sentiero da aggiungere">
                  ${conTraccia.map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(etichettaSentiero(s))}</option>`).join('')}
                </select>
                <button type="button" class="bottone" id="aggiungi">Aggiungi</button>
              </div>`
            : ''
        }
        <small class="aiuto">Si possono usare solo i sentieri con una traccia salvata${
          conTraccia.length ? '' : ': per ora nessuno ne ha una. Recuperala dalla mappa di un sentiero'
        }. Lo stesso sentiero può comparire più volte (es. andata e ritorno).</small>
      </fieldset>

      <fieldset>
        <legend>Anteprima</legend>
        <div id="anteprima"></div>
      </fieldset>

      <fieldset>
        <legend>Il mio diario</legend>
        <div class="due">
          <label class="campo"><span>Stato</span><select name="stato">${Object.entries(STATI)
            .map(([k, et]) => `<option value="${k}" ${giro.stato === k ? 'selected' : ''}>${et}</option>`)
            .join('')}</select></label>
          <label class="campo"><span>Data in cui l'ho percorso</span><input name="dataPercorso" type="date" value="${escapeHtml(giro.dataPercorso ?? '')}" /></label>
        </div>
        <label class="campo"><span>Note personali</span><textarea name="notePersonali" rows="4">${escapeHtml(giro.notePersonali)}</textarea>
          <small>Non annotare punti esatti di avvistamento o appostamento di orso e lupo.</small></label>
      </fieldset>

      <p class="errore" id="erroreModulo" role="alert" hidden></p>
      <div class="azioni">
        <a class="bottone" href="${indietro}">Annulla</a>
        <button type="submit" class="bottone primario">Salva</button>
      </div>
      ${esistente ? '<button type="button" class="bottone pericolo pieno" id="elimina">Elimina giro</button>' : ''}
    </form>
  `;

  const form = app.querySelector('.modulo');
  const lista = app.querySelector('#tappe');
  const anteprima = app.querySelector('#anteprima');
  const errore = app.querySelector('#erroreModulo');

  function disegnaTappe() {
    const calcolo = calcolaGiro({ tappe }, contesto.sentieri, contesto.tracce);
    lista.innerHTML = tappe.length
      ? calcolo.tappe
          .map(
            (t, i) => `
        <li data-i="${i}">
          <span class="etichetta-tappa ${t.mancante ? 'tenue' : ''}">${escapeHtml(t.etichetta)}</span>
          <div class="comandi-tappa">
            <label class="scelta"><input type="checkbox" data-azione="contrario" ${t.alContrario ? 'checked' : ''} /> al contrario</label>
            <button type="button" class="mini" data-azione="su" aria-label="Sposta su" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="mini" data-azione="giu" aria-label="Sposta giù" ${i === tappe.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="mini pericolo" data-azione="togli" aria-label="Togli">✕</button>
          </div>
        </li>`,
          )
          .join('')
      : '<li class="tenue">Nessun sentiero: aggiungine almeno due.</li>';
    anteprima.innerHTML = htmlMisure(calcolo);
  }

  lista.addEventListener('click', (e) => {
    const azione = e.target.closest('button[data-azione]')?.dataset.azione;
    if (!azione) return;
    const i = Number(e.target.closest('li').dataset.i);
    if (azione === 'su') [tappe[i - 1], tappe[i]] = [tappe[i], tappe[i - 1]];
    if (azione === 'giu') [tappe[i + 1], tappe[i]] = [tappe[i], tappe[i + 1]];
    if (azione === 'togli') tappe.splice(i, 1);
    disegnaTappe();
  });
  lista.addEventListener('change', (e) => {
    if (e.target.dataset.azione !== 'contrario') return;
    tappe[Number(e.target.closest('li').dataset.i)].alContrario = e.target.checked;
    disegnaTappe();
  });
  app.querySelector('#aggiungi')?.addEventListener('click', () => {
    tappe.push({ sentieroId: app.querySelector('#nuovaTappa').value, alContrario: false });
    disegnaTappe();
  });

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const dati = {
      ...giro,
      nome: form.elements.nome.value.trim(),
      tappe,
      stato: form.elements.stato.value === 'fatto' ? 'fatto' : 'da_fare',
      dataPercorso: form.elements.dataPercorso.value || null,
      notePersonali: form.elements.notePersonali.value.trim(),
    };
    try {
      controllaGiro(dati);
    } catch (e) {
      errore.textContent = e.message;
      errore.hidden = false;
      errore.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!dati.id) {
      const ids = new Set((await tuttiIGiri()).map((g) => g.id));
      const base = `giro-${creaId([], dati.nome)}`;
      let nuovo = base;
      for (let n = 2; ids.has(nuovo); n++) nuovo = `${base}-${n}`;
      dati.id = nuovo;
    }
    await salvaGiro(dati);
    location.hash = `#/giro/${encodeURIComponent(dati.id)}`;
  });

  app.querySelector('#elimina')?.addEventListener('click', async () => {
    if (!confirm(`Eliminare il giro "${esistente.nome}"? I sentieri e le loro tracce restano.`)) return;
    await eliminaGiro(esistente.id);
    location.hash = '#/giri';
  });

  disegnaTappe();
}
