// Il banner fisso mostra le regole del parco che sto guardando, altrimenti quella generale.
// Il richiamo a non uscire dai sentieri c'è sempre.
import { parcoDa, REGOLA_GENERALE } from '../datiParchi.js';

export function impostaBanner(idParco = null) {
  const testo = document.getElementById('testoBanner');
  if (!testo) return;
  const parco = idParco ? parcoDa(idParco) : null;
  testo.textContent = parco ? `${parco.nomeBreve}: ${parco.regole}` : REGOLA_GENERALE;
}
