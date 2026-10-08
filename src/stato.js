// L'unico stato condiviso dell'app (vedi src/lib/statoApp.js)
import { creaStato } from './lib/statoApp.js';

let memoria = null;
try {
  memoria = globalThis.sessionStorage ?? null;
} catch {
  memoria = null;
}

export const stato = creaStato(memoria);
