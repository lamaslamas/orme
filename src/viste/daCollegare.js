// "Uscite da collegare": per ogni uscita senza traccia il sentiero probabile migliore, da confermare
// con un tocco ("È questo" copia la traccia sul telefono, come nella scheda), da cambiare ("Altri")
// o da scartare ("Nessuno"). Le uscite con lo stesso ritrovo propongono per primo il sentiero già scelto.
import { leggiTraccia, salvaTraccia, aggiornaCalcolati } from '../db.js';
import { sentieriProbabili, tracciaConfermata } from '../lib/sentieriProbabili.js';
import { conStessoRitrovo, statoCollegamenti, collegamentoDi } from '../lib/collegamenti.js';
import { escapeHtml, codici } from '../lib/formato.js';
import { parcoDa } from '../datiParchi.js';

const PRIME = 3; // righe mostrate prima di "Mostra tutte"

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
