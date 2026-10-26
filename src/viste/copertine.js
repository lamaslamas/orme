// Copertina di un percorso nelle schede in lista: la miniatura della mia prima foto del sentiero (salvata sul telefono).
// Senza una mia foto la scheda mostra il disegno della traccia.
import { tutteLeFoto } from '../db.js';

let mie = null; // sentiero → { url } con la miniatura della mia prima foto
export async function caricaCopertine() {
  if (mie) return mie;
  const nuove = new Map();
  try {
    const tutte = (await tutteLeFoto()).sort((x, y) => (x.aggiunta ?? '').localeCompare(y.aggiunta ?? ''));
    for (const f of tutte) if (!nuove.has(f.sentieroId) && f.miniatura) nuove.set(f.sentieroId, { url: URL.createObjectURL(new Blob([f.miniatura], { type: f.tipo || 'image/jpeg' })) });
  } catch {
    // senza foto personali le schede mostrano la traccia
  }
  mie = nuove;
  return mie;
}
// dopo aver aggiunto o tolto una mia foto: le copertine si rileggono
export function azzeraCopertine() {
  mie?.forEach((f) => URL.revokeObjectURL(f.url));
  mie = null;
}
export const copertina = (s) => mie?.get(s.id) ?? null;
export const copertineCaricate = () => Boolean(mie);
