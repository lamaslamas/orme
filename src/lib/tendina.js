// Tendina con tre posizioni (chiusa, metà, aperta): dove si ferma quando si stacca il dito.
// altezza: px della tendina al rilascio; velocita: px/ms verso il basso (positiva) o l'alto;
// altezze: { meta, aperta } in px
export const SPINTA = 0.6; // px/ms: una spinta veloce
export function posizioneFinale({ altezza, velocita = 0, altezze }) {
  const { meta, aperta } = altezze;
  // una spinta veloce decide da sola: in giù chiude (o dall'aperta scende a metà se è ancora in alto)
  if (velocita > SPINTA) return altezza > (meta + aperta) / 2 ? 'meta' : 'chiusa';
  if (velocita < -SPINTA) return 'aperta';
  // altrimenti la posizione più vicina; sotto metà della "metà" si chiude
  if (altezza < meta / 2) return 'chiusa';
  return Math.abs(altezza - meta) <= Math.abs(altezza - aperta) ? 'meta' : 'aperta';
}

// altezze delle due posizioni per lo spazio disponibile (px tra la barra in alto e quella in basso)
export function altezzeTendina(spazio) {
  return { meta: Math.round(spazio * 0.48), aperta: Math.round(spazio - 8) };
}
