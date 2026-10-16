// Un pannello in basso alla volta, chiudibile con la X e con Esc. Ogni pannello (tendine, strumenti)
// si registra qui: quando uno si apre gli altri si chiudono (o si riducono, se sono strumenti), e Esc
// chiude quello aperto. Il corpo della pagina porta la classe "pannello-aperto" finché ce n'è uno.
const EVENTO = 'orme:pannello';
const registrati = new Set(); // { id, aperto(), chiudi() }
let prossimo = 0;

export const nuovoIdPannello = () => `pannello-${++prossimo}`;

// p: { id, aperto(): bool, chiudi() }; restituisce la funzione che lo toglie
export function registraPannello(p) {
  registrati.add(p);
  return () => registrati.delete(p);
}

export const HTML_X = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';

// "id si è aperto": gli altri pannelli aperti si chiudono. Una tendina chiude solo le altre tendine (gli
// strumenti attivi, righello e percorsi da qui, si riducono a una riga); uno strumento chiude tutto
export function annunciaPannello(id, { strumento = false } = {}) {
  for (const p of [...registrati]) {
    if (p.id !== id && p.aperto() && (strumento || p.sheet !== false)) p.chiudi();
  }
  aggiornaClasse();
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: id }));
}

export function aggiornaClasse() {
  for (const p of [...registrati]) if (!p.collegato?.()) registrati.delete(p);
  document.body.classList.toggle('pannello-aperto', [...registrati].some((p) => p.sheet !== false && p.aperto()));
}

// Esc chiude il pannello aperto (non dentro un campo di testo o una finestra: lì Esc è loro)
let esc = false;
function tastoEsc(e) {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  if (e.target?.closest?.('input, textarea, select, dialog[open]')) return;
  const aperto = [...registrati].reverse().find((p) => p.aperto());
  if (!aperto) return;
  aperto.chiudi();
  e.preventDefault();
}
export function collegaEsc() {
  if (esc) return;
  esc = true;
  window.addEventListener('keydown', tastoEsc);
}
