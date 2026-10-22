// Il paese più vicino al centro di una zona, ricordato sul telefono per zona (centro arrotondato a 2 decimali, circa 1 km):
// Nominatim si interroga una sola volta per zona, come chiedono le sue regole d'uso. Si salva solo il nome del paese.
export const CHIAVE_LUOGHI_ZONA = 'orme.luoghiZona';
const MAX_ZONE = 300;

export const chiaveZona = ([lon, lat]) => `${lat.toFixed(2)},${lon.toFixed(2)}`;

export function leggiLuoghiZona(archivio = globalThis.localStorage) {
  try {
    const x = JSON.parse(archivio.getItem(CHIAVE_LUOGHI_ZONA));
    if (!x || typeof x !== 'object' || Array.isArray(x)) return {};
    return Object.fromEntries(Object.entries(x).filter(([, v]) => typeof v === 'string' && v));
  } catch {
    return {};
  }
}

// aggiunge la zona e tiene le ultime MAX_ZONE; ritorna l'oggetto salvato
export function salvaLuogoZona(chiave, nome, archivio = globalThis.localStorage) {
  const tutti = leggiLuoghiZona(archivio);
  delete tutti[chiave];
  tutti[chiave] = nome;
  const voci = Object.entries(tutti).slice(-MAX_ZONE);
  const fuori = Object.fromEntries(voci);
  try {
    archivio.setItem(CHIAVE_LUOGHI_ZONA, JSON.stringify(fuori));
  } catch {
    // memoria piena o bloccata: il nome resta solo per questa sessione
  }
  return fuori;
}
