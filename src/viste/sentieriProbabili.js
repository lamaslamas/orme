// Scheda di un'uscita senza traccia: "Sentieri probabili" (al massimo 3, con i motivi).
// "È questo" copia sul telefono la traccia del sentiero scelto (entra nel backup con le tracce);
// "Non è questo" la toglie. Un mio GPX resta sempre prioritario.
import { tuttiISentieri, tutteLeTracce, leggiTraccia, salvaTraccia, eliminaTraccia } from '../db.js';
import { sentieriProbabili, tracciaConfermata } from '../lib/sentieriProbabili.js';
import { eUscita } from '../lib/filtri.js';
import { escapeHtml, codici } from '../lib/formato.js';

// Riga del riquadro "Traccia" per una traccia scelta tra i probabili
export function testoConferma(traccia) {
  const c = traccia?.dettagli?.conferma;
  if (!c) return '';
  return `<span>Presa dal sentiero <a href="#/sentiero/${encodeURIComponent(c.sentiero)}">${escapeHtml(c.nome)}</a>, che hai scelto tra i probabili: non è la traccia ufficiale dell'uscita.</span><span class="annulla-conferma"><button type="button" class="bottone testo" id="annullaConferma">Non è questo</button></span>`;
}

export const serveProbabili = (s, traccia) => !traccia && eUscita(s);

export const htmlProbabili = () => '<div class="probabili" id="sentieriProbabili" hidden></div>';

// ricarica(): ridisegna la scheda dopo una conferma o un annullamento
export async function collegaProbabili(app, s, traccia, ricarica) {
  app.querySelector('#annullaConferma')?.addEventListener('click', async () => {
    await eliminaTraccia(s.id);
    ricarica();
  });
  const box = app.querySelector('#sentieriProbabili');
  if (!box || !serveProbabili(s, traccia)) return;
  const [sentieri, tracce] = await Promise.all([tuttiISentieri(), tutteLeTracce()]);
  const percorsi = sentieri.filter((x) => tracce.has(x.id)).map((x) => ({ sentiero: x, traccia: tracce.get(x.id) }));
  const candidati = sentieriProbabili(s, percorsi);
  if (!candidati.length || !box.isConnected) return;
  box.innerHTML = `
    <h3>Sentieri probabili</h3>
    <p class="tenue piccolo">Dai luoghi nominati nell'uscita. Nessuno è la traccia ufficiale: scegli solo se sei sicuro.</p>
    <ul>${candidati
      .map(
        (c) => `<li>
          <a href="#/sentiero/${encodeURIComponent(c.id)}">${c.codici.length ? `<span class="codice">${escapeHtml(codici(c))}</span> ` : ''}${escapeHtml(c.nome)}</a>
          <span class="tenue piccolo">${escapeHtml(c.motivi.join(' · '))}</span>
          <button type="button" class="bottone" data-conferma="${escapeHtml(c.id)}">È questo</button>
        </li>`,
      )
      .join('')}</ul>`;
  box.hidden = false;
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-conferma]');
    if (!b) return;
    const c = candidati.find((x) => x.id === b.dataset.conferma);
    const t = await leggiTraccia(c.id);
    if (!t?.geojson || (await leggiTraccia(s.id))) return; // nel frattempo è arrivata una traccia (es. il mio GPX)
    await salvaTraccia(tracciaConfermata(s.id, c, t));
    ricarica();
  });
}
