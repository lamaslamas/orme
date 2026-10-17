// "Importa file": si scelgono uno o più file (GPX, KML, KMZ, zip), si vede l'elenco dei percorsi trovati
// (si può togliere o rinominare), poi si salvano tra i miei percorsi. Resta tutto sul telefono.
import { ACCETTA, leggiFiles, riassuntoPercorso, MAX_PERCORSI } from '../lib/importaFile.js';
import { nuovoIdPercorso } from '../lib/percorso.js';
import { salvaPercorso } from '../db.js';
import { escapeHtml } from '../lib/formato.js';
import { finestraTrascinabile } from './tendina.js';

const FORMATO = { gpx: 'GPX', kml: 'KML' };
const km = (x) => x.toFixed(1).replace('.', ',');

// Apre il selettore dei file (da chiamare in un tocco) e poi il dialogo con i percorsi trovati
export function avviaImportazione() {
  const input = Object.assign(document.createElement('input'), { type: 'file', multiple: true, accept: ACCETTA, hidden: true });
  document.body.appendChild(input);
  input.addEventListener('change', async () => {
    const scelti = [...(input.files ?? [])];
    input.remove();
    if (scelti.length) await mostraDialogo(scelti);
  });
  input.addEventListener('cancel', () => input.remove());
  input.click();
}

async function mostraDialogo(scelti) {
  const dialogo = document.createElement('dialog');
  dialogo.className = 'foglio foglio-importa';
  document.body.appendChild(dialogo);
  finestraTrascinabile(dialogo);
  dialogo.addEventListener('close', () => dialogo.remove());
  dialogo.innerHTML = `<div class="foglio-maniglia"></div><h2 class="foglio-titolo">Importa percorsi</h2><p class="tenue">Leggo ${scelti.length === 1 ? 'il file' : `i ${scelti.length} file`}…</p>`;
  dialogo.showModal();
  const files = await Promise.all(scelti.map(async (f) => ({ nome: f.name, dati: new Uint8Array(await f.arrayBuffer()) })));
  const r = await leggiFiles(files);
  const righe = r.percorsi.map((p) => ({ p, ...riassuntoPercorso(p) }));
  const errori = r.errori.length
    ? `<details class="importa-errori" ${righe.length ? '' : 'open'}><summary>${r.errori.length === 1 ? '1 file non importato' : `${r.errori.length} file non importati`}</summary><ul>${r.errori
        .map((e) => `<li><b>${escapeHtml(e.file)}</b>: ${escapeHtml(e.motivo)}</li>`)
        .join('')}</ul></details>`
    : '';
  dialogo.innerHTML = `
    <div class="foglio-maniglia"></div>
    <h2 class="foglio-titolo">Importa percorsi</h2>
    ${
      righe.length
        ? `<p class="tenue">${righe.length === 1 ? 'Ho trovato 1 percorso' : `Ho trovato ${righe.length} percorsi`}${r.troppi ? ` (i primi ${MAX_PERCORSI}: gli altri restano fuori)` : ''}. Togli quelli che non vuoi o cambia il nome.</p>
    <ul class="importa-elenco">${righe
      .map(
        (x, i) => `<li class="importa-riga"><input type="checkbox" checked data-scelto="${i}" aria-label="Importa ${escapeHtml(x.p.nome)}" />
          <div><input type="text" class="importa-nome" data-nome="${i}" value="${escapeHtml(x.p.nome)}" aria-label="Nome del percorso" />
          <span class="tenue piccolo">${km(x.km)} km${x.salita != null ? ` · +${x.salita} m` : ''} · ${FORMATO[x.p.origine]} · ${escapeHtml(x.p.file.split(' › ').at(-1))}</span></div></li>`,
      )
      .join('')}</ul>`
        : '<p class="vuoto">Non ho trovato nessun percorso.</p>'
    }
    ${errori}
    <div class="azioni-salva">
      <button type="button" class="bottone" data-azione="annulla">${righe.length ? 'Annulla' : 'Chiudi'}</button>
      ${righe.length ? `<button type="button" class="bottone primario" data-azione="importa">Importa ${righe.length}</button>` : ''}
    </div>
    <p class="tenue piccolo importa-esito" aria-live="polite"></p>
    <p class="tenue piccolo">I file restano sul tuo telefono: non vengono caricati da nessuna parte.</p>`;

  const bottone = dialogo.querySelector('[data-azione="importa"]');
  const scelti2 = () => [...dialogo.querySelectorAll('[data-scelto]')].filter((c) => c.checked);
  dialogo.addEventListener('change', () => {
    if (!bottone) return;
    const n = scelti2().length;
    bottone.disabled = n === 0;
    bottone.textContent = n ? `Importa ${n}` : 'Importa';
  });
  dialogo.addEventListener('click', async (e) => {
    const azione = e.target.closest('[data-azione]')?.dataset.azione;
    if (e.target === dialogo || azione === 'annulla') return dialogo.close();
    if (azione !== 'importa') return;
    bottone.disabled = true;
    const adesso = Date.now();
    const salvati = [];
    try {
      for (const [k, c] of scelti2().entries()) {
        const i = Number(c.dataset.scelto);
        const { p } = righe[i];
        const nome = dialogo.querySelector(`[data-nome="${i}"]`).value.trim() || p.nome;
        const id = nuovoIdPercorso(adesso + k);
        await salvaPercorso({ id, nome, origine: p.origine, geojson: p.geojson, note: '', fileOrigine: p.file.split(' › ').at(-1) });
        salvati.push(id);
      }
    } catch (err) {
      dialogo.querySelector('.importa-esito').textContent = `Non riesco a salvare: ${err.message}`;
      bottone.disabled = false;
      return;
    }
    dialogo.close();
    // un percorso: si apre; più percorsi: l'elenco dei miei percorsi
    const destinazione = salvati.length === 1 ? `#/percorso/${encodeURIComponent(salvati[0])}` : '#/miei?scheda=percorsi';
    // già su quella pagina (es. I miei percorsi · Disegnati): si ridisegna con i percorsi nuovi
    if (location.hash === destinazione) window.dispatchEvent(new HashChangeEvent('hashchange'));
    else location.hash = destinazione;
  });
}
