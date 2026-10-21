// Il giorno scelto in una pagina (Percorrenza e «Quando andare»): è uno solo. Cambiandolo in uno dei due riquadri
// cambia anche nell'altro.
let giorno = null;
const EVENTO = 'orme:giorno';

export const giornoScelto = () => giorno;
// all'apertura della pagina: il giorno iniziale (senza avvisare nessuno)
export function inizializzaGiorno(g) {
  giorno = g;
}
export function impostaGiorno(g) {
  if (!g || g === giorno) return;
  giorno = g;
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: g }));
}
// f(giorno) a ogni cambio; restituisce come smettere di ascoltare
export function ascoltaGiorno(f) {
  const h = (e) => f(e.detail);
  window.addEventListener(EVENTO, h);
  return () => window.removeEventListener(EVENTO, h);
}

// «Parti entro»: il limite per giorno che «Quando andare» ricava dal meteo (e dalla luce, con le sue soste); la pagina
// mostra un solo orario, il più restrittivo (src/lib/quandoAndare.js, partiEntro)
const limiti = new Map();
export const limiteMeteoDi = (g) => limiti.get(g) ?? null;
export function pubblicaLimiteMeteo(g, lim) {
  limiti.set(g, lim);
  window.dispatchEvent(new CustomEvent('orme:limite', { detail: g }));
}
export const ascoltaLimiti = (f) => {
  const h = (e) => f(e.detail);
  window.addEventListener('orme:limite', h);
  return () => window.removeEventListener('orme:limite', h);
};
export const azzeraLimiti = () => limiti.clear();
