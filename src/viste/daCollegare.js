// "Uscite da collegare": per ogni uscita senza traccia il sentiero probabile migliore, da confermare
// con un tocco ("È questo" copia la traccia sul telefono, come nella scheda), da cambiare ("Altri")
// o da scartare ("Nessuno"). Le uscite con lo stesso ritrovo propongono per primo il sentiero già scelto.
import { leggiTraccia, salvaTraccia, aggiornaCalcolati } from '../db.js';
import { sentieriProbabili, tracciaConfermata } from '../lib/sentieriProbabili.js';
import { conStessoRitrovo, statoCollegamenti, collegamentoDi, collegamentiDelTelefono, fileCollegamenti, testoFileCollegamenti, stessiCollegamenti } from '../lib/collegamenti.js';
import { escapeHtml, codici } from '../lib/formato.js';
import { parcoDa } from '../datiParchi.js';

const PRIME = 3; // righe mostrate prima di "Mostra tutte"
// il file nel repository: si modifica da GitHub incollando il testo esportato
const MODIFICA_SU_GITHUB = 'https://github.com/lamaslamas/orme/edit/main/public/dati/collegamenti.json';
const FILE_PUBBLICATO = `${import.meta.env.BASE_URL}dati/collegamenti.json`;

const nomeCandidato = (c) => `${c.codici?.length ? `<span class="codice">${escapeHtml(codici(c))}</span> ` : ''}${escapeHtml(c.nome)}`;
const sottotitolo = (s) =>
  [s.escursione?.associazione || s.organizzatori?.[0], s.escursione?.periodo, parcoDa(s.parco)?.nomeBreve].filter(Boolean).map(escapeHtml).join(' · ');

// sentieri: tutti i sentieri sul telefono; alCambio(): ridisegna la sezione dopo una scelta
export function montaDaCollegare(contenitore, { uscite, sentieri, tracce, alCambio }) {
  const percorsi = sentieri.filter((x) => tracce.has(x.id)).map((x) => ({ sentiero: x, traccia: tracce.get(x.id) }));
  const collegati = uscite
    .map((u) => ({ u, c: collegamentoDi(u, tracce.get(u.id)) }))
    .filter((x) => x.c)
    .map(({ u, c }) => ({ uscita: u, sentiero: { id: c.sentiero, nome: c.nome, codici: sentieri.find((x) => x.id === c.sentiero)?.codici ?? [] } }));
  const { daCollegare, collegate, nessuno } = statoCollegamenti(uscite, tracce);
  const candidati = new Map(daCollegare.map((u) => [u.id, conStessoRitrovo(u, sentieriProbabili(u, percorsi), collegati)]));
  let tutte = false;
  const dalTelefono = collegamentiDelTelefono(uscite, tracce);

  // "Esporta collegamenti": il file del repository con in più quelli del telefono, da incollare su GitHub
  async function esporta(box) {
    box.hidden = false;
    box.innerHTML = '<p class="tenue piccolo">Preparo il file…</p>';
    let prima = null;
    try {
      const r = await fetch(FILE_PUBBLICATO, { cache: 'no-cache' });
      if (r.ok) prima = await r.json();
    } catch {
      // senza rete: il file contiene solo i collegamenti del telefono
    }
    const file = fileCollegamenti(prima, dalTelefono);
    const testo = testoFileCollegamenti(file);
    if (stessiCollegamenti(prima, file)) {
      box.innerHTML = '<p class="tenue piccolo">I collegamenti di questo telefono sono già tutti nell\'archivio comune.</p>';
      return;
    }
    const url = URL.createObjectURL(new Blob([testo], { type: 'application/json' }));
    box.innerHTML = `
      <p class="piccolo">${file.collegamenti.length === 1 ? '1 collegamento' : `${file.collegamenti.length} collegamenti`} nel file${prima ? '' : ' (non ho potuto leggere quello pubblicato: controlla di non perderne)'}. Per salvarli nell'archivio comune:</p>
      <ol class="piccolo">
        <li>tocca «Copia e apri GitHub»;</li>
        <li>su GitHub seleziona tutto il testo del file e incolla;</li>
        <li>tocca «Commit changes»: dopo qualche minuto valgono nell'app pubblicata, su tutti i telefoni.</li>
      </ol>
      <div class="dc-azioni">
        <a class="bottone primario" data-copia href="${MODIFICA_SU_GITHUB}" target="_blank" rel="noopener">Copia e apri GitHub</a>
        <a class="bottone testo" href="${url}" download="collegamenti.json">Scarica il file</a>
      </div>
      <p class="tenue piccolo" data-esito role="status"></p>`;
    // il link apre GitHub da solo (un'apertura dopo un'attesa verrebbe bloccata dal telefono); la copia parte subito
    box.querySelector('[data-copia]').addEventListener('click', () => {
      const esito = box.querySelector('[data-esito]');
      navigator.clipboard
        ?.writeText(testo)
        .then(() => (esito.textContent = 'Copiato: su GitHub seleziona tutto e incolla.'))
        .catch(() => (esito.textContent = 'Non riesco a copiare: usa «Scarica il file» e caricalo su GitHub.'));
    });
  }

  const riga = (u) => {
    const [primo, ...altri] = candidati.get(u.id);
    return `<li class="dc-riga" data-uscita="${escapeHtml(u.id)}">
      <a class="dc-nome" href="#/sentiero/${encodeURIComponent(u.id)}">${escapeHtml(u.escursione?.nomeUscita || u.nome)}</a>
      <span class="tenue piccolo">${sottotitolo(u)}</span>
      ${
        primo
          ? `<div class="dc-candidato"><span class="tenue piccolo">Probabile</span> <a href="#/sentiero/${encodeURIComponent(primo.id)}">${nomeCandidato(primo)}</a>
             <span class="tenue piccolo">${escapeHtml(primo.motivi.join(' · '))}</span></div>`
          : '<div class="dc-candidato tenue piccolo">Nessun sentiero probabile nell\'archivio.</div>'
      }
      <div class="dc-azioni">
        ${primo ? `<button type="button" class="bottone" data-conferma="${escapeHtml(primo.id)}">È questo</button>` : ''}
        ${altri.length ? `<button type="button" class="bottone testo" data-altri aria-expanded="false">Altri (${altri.length})</button>` : ''}
        <button type="button" class="bottone testo" data-nessuno>Nessuno</button>
      </div>
      ${
        altri.length
          ? `<ul class="dc-altri" hidden>${altri
              .map(
                (c) => `<li><a href="#/sentiero/${encodeURIComponent(c.id)}">${nomeCandidato(c)}</a> <span class="tenue piccolo">${escapeHtml(c.motivi.join(' · '))}</span>
                  <button type="button" class="bottone" data-conferma="${escapeHtml(c.id)}">È questo</button></li>`,
              )
              .join('')}</ul>`
          : ''
      }
    </li>`;
  };

  function disegna() {
    // prima le uscite con un candidato
    const ordinate = [...daCollegare].sort((a, b) => Number(!candidati.get(a.id).length) - Number(!candidati.get(b.id).length));
    const mostrate = tutte ? ordinate : ordinate.slice(0, PRIME);
    contenitore.innerHTML = `
      <section class="da-collegare riquadro">
        <h2 class="titolo-sezione">Uscite da collegare</h2>
        <p class="tenue piccolo">${daCollegare.length} da collegare · ${collegate.length} collegate${nessuno.length ? ` · ${nessuno.length} senza sentiero adatto` : ''}. Scegli il sentiero che l'uscita usa: la sua traccia resta sul telefono.</p>
        ${daCollegare.length ? `<ul class="dc-elenco">${mostrate.map(riga).join('')}</ul>` : '<p>Tutte le uscite sono collegate.</p>'}
        ${ordinate.length > mostrate.length ? `<button type="button" class="bottone testo" data-tutte>Mostra tutte (${ordinate.length})</button>` : ''}
        ${dalTelefono.length ? `<button type="button" class="bottone" data-esporta>Esporta collegamenti (${dalTelefono.length})</button>` : ''}
        <div class="dc-esporta" hidden></div>
        ${
          nessuno.length
            ? `<details class="dc-nessuno"><summary class="tenue piccolo">Senza sentiero adatto (${nessuno.length})</summary><ul>${nessuno
                .map((u) => `<li data-uscita="${escapeHtml(u.id)}">${escapeHtml(u.escursione?.nomeUscita || u.nome)} <button type="button" class="bottone testo" data-riprova>Riprova</button></li>`)
                .join('')}</ul></details>`
            : ''
        }
      </section>`;
  }

  contenitore.addEventListener('click', async (e) => {
    if (e.target.closest('[data-esporta]')) return esporta(contenitore.querySelector('.dc-esporta'));
    if (e.target.closest('[data-tutte]')) {
      tutte = true;
      return disegna();
    }
    const id = e.target.closest('[data-uscita]')?.dataset.uscita;
    if (!id) return;
    const altri = e.target.closest('[data-altri]');
    if (altri) {
      const lista = altri.closest('.dc-riga').querySelector('.dc-altri');
      lista.hidden = !lista.hidden;
      altri.setAttribute('aria-expanded', String(!lista.hidden));
      return;
    }
    const oggi = new Date().toISOString().slice(0, 10);
    const conferma = e.target.closest('[data-conferma]')?.dataset.conferma;
    if (conferma) {
      const c = candidati.get(id).find((x) => x.id === conferma);
      const t = await leggiTraccia(conferma);
      if (!t?.geojson || (await leggiTraccia(id))) return alCambio(); // nel frattempo è arrivata una traccia (es. il mio GPX)
      await salvaTraccia(tracciaConfermata(id, c, t, oggi));
      await aggiornaCalcolati(id, { collegamento: null });
      return alCambio();
    }
    if (e.target.closest('[data-nessuno]')) {
      await aggiornaCalcolati(id, { collegamento: { nessuno: true, data: oggi } });
      return alCambio();
    }
    if (e.target.closest('[data-riprova]')) {
      await aggiornaCalcolati(id, { collegamento: null });
      return alCambio();
    }
  });
  disegna();
}
