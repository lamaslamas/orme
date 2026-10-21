// Scelta del ritmo di cammino (Senza soste / Con soste / Fotografico), ricordata sul telefono (src/lib/ritmo.js)
import { RITMI, ritmoScelto, impostaRitmo } from '../lib/ritmo.js';

export const htmlRitmo = () => `<div class="ritmo" role="group" aria-label="Ritmo di cammino">
    <span class="tenue piccolo">Ritmo:</span>
    ${Object.entries(RITMI).map(([k, r]) => `<button type="button" class="chip-scorciatoia ${k === ritmoScelto() ? 'attiva' : ''}" data-ritmo="${k}" aria-pressed="${k === ritmoScelto()}" title="${r.testo}">${r.nome}</button>`).join('')}
  </div>`;

// contenitore: dove stanno i pulsanti; alCambio(): la pagina si ricalcola
export function collegaRitmo(contenitore, alCambio) {
  contenitore?.addEventListener('click', (e) => {
    const k = e.target.closest('[data-ritmo]')?.dataset.ritmo;
    if (!k || k === ritmoScelto()) return;
    impostaRitmo(k);
    alCambio();
  });
}
