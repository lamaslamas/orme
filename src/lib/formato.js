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
