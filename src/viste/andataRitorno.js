// Le scelte di «Quando» (Solo andata / Andata e ritorno e l'ora di partenza), ricordate sul telefono. Il blocco è in
// src/viste/quando.js.
import { minutiDaOra } from '../lib/andataRitorno.js';

const CHIAVE_MODO = 'orme.andataRitorno';
const CHIAVE_ORA = 'orme.oraPartenza';

export const ricordaModo = (modo) => ricorda(CHIAVE_MODO, modo);
export function modoScelto() {
  try {
    return localStorage.getItem(CHIAVE_MODO) === 'andata' ? 'andata' : 'ar';
  } catch {
    return 'ar';
  }
}
function ricorda(chiave, valore) {
  try {
    localStorage.setItem(chiave, valore);
  } catch {
    // senza memoria del browser vale solo per questa pagina
  }
}
export const oraPartenzaScelta = () => minutiDaOra(oraRicordata());
export const oraPartenzaTesto = () => oraRicordata();
export const ricordaOraPartenza = (valore) => ricorda(CHIAVE_ORA, valore);
function oraRicordata() {
  try {
    return localStorage.getItem(CHIAVE_ORA) || '09:00';
  } catch {
    return '09:00';
  }
}
