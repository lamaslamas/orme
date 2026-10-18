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

// Con quale vista si apre il disegno: sempre quella della mappa da cui lo si apre (centro e zoom, non meno di 12),
// oppure, con "Riprendi", quella della bozza. Si scrive prima di aprire il disegno e si legge una volta sola.
const CHIAVE_APERTURA = 'orme.aperturaDisegno';
export const ZOOM_MINIMO_DISEGNO = 12;
// vista: { centro: [lat, lng], zoom } oppure 'bozza'
export function impostaAperturaDisegno(vista) {
  try {
    const v = vista === 'bozza' ? { bozza: true } : { centro: vista.centro, zoom: Math.max(ZOOM_MINIMO_DISEGNO, Math.round(vista.zoom)) };
    globalThis.sessionStorage?.setItem(CHIAVE_APERTURA, JSON.stringify(v));
  } catch {
    // senza memoria il disegno si apre come prima
  }
}
// da una mappa Leaflet; punto: [lon, lat] se il disegno deve centrare su quel punto
export function aperturaDaMappa(mappa, punto = null) {
  const c = mappa.getCenter();
  return { centro: punto ? [punto[1], punto[0]] : [c.lat, c.lng], zoom: mappa.getZoom() };
}
export function consumaAperturaDisegno() {
  try {
    const v = JSON.parse(globalThis.sessionStorage?.getItem(CHIAVE_APERTURA) ?? 'null');
    globalThis.sessionStorage?.removeItem(CHIAVE_APERTURA);
    return v?.centro?.length === 2 && v.centro.every(Number.isFinite) && Number.isFinite(v.zoom) ? v : null;
  } catch {
    return null;
  }
}
// [lon, lat]: una bozza nuova da quel punto
export const iniziaBozza = (punto) => salvaBozza([punto]);
// [lon, lat]: in fondo alla bozza (o una nuova se non c'è)
export function aggiungiABozza(punto) {
  const punti = leggiBozza()?.punti ?? [];
  salvaBozza([...punti, punto]);
  return punti.length + 1;
}
