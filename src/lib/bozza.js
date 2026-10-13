// Bozza del percorso che si sta disegnando: i punti toccati, sul telefono (localStorage), così
// "Inizia percorso da qui" e "Aggiungi al percorso" dalla mappa la riprendono e la allungano.
const CHIAVE = 'orme.bozza';

function memoria() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function leggiBozza() {
  try {
    const b = JSON.parse(memoria()?.getItem(CHIAVE) ?? 'null');
    return Array.isArray(b?.punti) ? { punti: b.punti.filter((p) => Array.isArray(p) && p.length >= 2 && p.every(Number.isFinite)) } : null;
  } catch {
    return null;
  }
}

export function salvaBozza(punti) {
  try {
    if (punti?.length) memoria()?.setItem(CHIAVE, JSON.stringify({ punti: punti.map(([lon, lat]) => [Math.round(lon * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6]) }));
    else memoria()?.removeItem(CHIAVE);
  } catch {
    // memoria non disponibile: la bozza vale finché la pagina è aperta
  }
}

export const cancellaBozza = () => salvaBozza([]);
// [lon, lat]: una bozza nuova da quel punto
export const iniziaBozza = (punto) => salvaBozza([punto]);
// [lon, lat]: in fondo alla bozza (o una nuova se non c'è)
export function aggiungiABozza(punto) {
  const punti = leggiBozza()?.punti ?? [];
  salvaBozza([...punti, punto]);
  return punti.length + 1;
}
