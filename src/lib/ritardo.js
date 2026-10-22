// Ritardo con una sola esecuzione: se la funzione viene chiamata più volte di fila (più scelte cambiate una dopo l'altra),
// parte una sola volta, dopo `ms` dall'ultima chiamata.
export const RITARDO_RICERCA_MS = 400;

export function conRitardo(fn, ms = RITARDO_RICERCA_MS, { imposta = (f, t) => setTimeout(f, t), togli = (id) => clearTimeout(id) } = {}) {
  let id = null;
  const chiama = (...args) => {
    togli(id);
    id = imposta(() => {
      id = null;
      fn(...args);
    }, ms);
  };
  chiama.annulla = () => {
    togli(id);
    id = null;
  };
  chiama.inAttesa = () => id !== null;
  return chiama;
}
