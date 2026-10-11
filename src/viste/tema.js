// Modalità chiara o scura: "auto" segue il telefono, oppure una scelta fissa (Altro > Aspetto).
// La scelta resta su questo dispositivo. Lo script in index.html la applica già prima del primo
// disegno (niente lampo chiaro); qui si tiene aggiornata e si cambia.
const CHIAVE = 'orme.tema';
const scuroDelTelefono = globalThis.matchMedia?.('(prefers-color-scheme: dark)');

export function leggiTema() {
  try {
    const t = localStorage.getItem(CHIAVE);
    return t === 'chiaro' || t === 'scuro' ? t : 'auto';
  } catch {
    return 'auto';
  }
}

function applica() {
  const t = leggiTema();
  const scuro = t === 'scuro' || (t === 'auto' && Boolean(scuroDelTelefono?.matches));
  document.documentElement.toggleAttribute('data-scuro', scuro);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', scuro ? '#10171a' : '#0f6e56');
}

export function impostaTema(t) {
  try {
    if (t === 'auto') localStorage.removeItem(CHIAVE);
    else localStorage.setItem(CHIAVE, t);
  } catch {
    // memoria non disponibile: vale fino alla chiusura
  }
  applica();
}

export function preparaTema() {
  applica();
  // in automatico: se il telefono passa da chiaro a scuro (o viceversa), l'app lo segue
  scuroDelTelefono?.addEventListener?.('change', applica);
}
