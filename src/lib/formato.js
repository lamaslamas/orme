export function escapeHtml(testo) {
  return String(testo ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function durata(minuti) {
  if (minuti == null || minuti === '') return '';
  const h = Math.floor(minuti / 60);
  const m = Math.round(minuti % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

export function data(iso) {
  if (!iso) return '';
  const [a, m, g] = iso.slice(0, 10).split('-');
  return `${g}/${m}/${a}`;
}

export function km(valore) {
  if (valore == null || valore === '') return '';
  return `${String(valore).replace('.', ',')} km`;
}

export function codici(sentiero) {
  return (sentiero.codici ?? []).join(' + ');
}

// Crea un identificativo leggibile a partire da codici e nome
export function creaId(codiciLista, nome) {
  const base = [...(codiciLista ?? []), nome ?? '']
    .join('-')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || `sentiero-${Date.now()}`;
}

// "1.240" (il punto separa le migliaia, anche con quattro cifre)
export const migliaia = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
// spazi non separabili: "1 h 02" resta su una riga
export const suUnaRiga = (t) => String(t ?? '').replace(/ /g, ' ');

// Titolo di un sentiero accanto al suo badge (il codice): senza ripetere il codice. "Sentiero 503A: Fontana Brecce"
// con badge 503A → "Fontana Brecce"; "Sentiero 717" con badge 717 → niente badge e titolo "Sentiero 717"
export function titoloConBadge(sentiero) {
  const badge = codici(sentiero);
  const nome = String(sentiero?.nome ?? '').trim();
  if (!badge) return { badge: null, titolo: nome };
  const esc = badge.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const resto = nome.replace(new RegExp(`^(sentiero\\s+)?${esc}\\s*[:–—-]?\\s*`, 'i'), '').trim();
  if (!resto) return { badge: null, titolo: nome || `Sentiero ${badge}` };
  return { badge, titolo: resto === nome ? nome : resto };
}
