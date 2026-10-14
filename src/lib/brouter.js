// Percorsi disegnati seguendo i sentieri, con il server pubblico di BRouter (brouter.de).
// Restituisce anche le quote (modello del terreno SRTM) e i tag OSM di ogni tratto.

export const URL_BROUTER = 'https://brouter.de/brouter';
export const PROFILO_ESCURSIONE = 'hiking-mountain';

// "Crea un anello" chiede di preferire i sentieri segnati: nel profilo le vie fuori dai percorsi
// escursionistici costano 1 + preferenza volte (parametro del profilo, da 0,1 a 2; di base 0,2).
// Non troppo: con 2 conviene tornare indietro sul segnato invece di fare un tratto di strada
export const PREFERENZA_SEGNATI = 0.6;
export function urlBrouter(punti, profilo = PROFILO_ESCURSIONE, { preferenzaSegnati = null } = {}) {
  const lonlats = punti.map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join('|');
  const extra = preferenzaSegnati ? `&profile:hiking_routes_preference=${preferenzaSegnati}` : '';
  return `${URL_BROUTER}?lonlats=${encodeURIComponent(lonlats)}&profile=${profilo}&alternativeidx=0&format=geojson${extra}`;
}

// "highway=path surface=ground" → { highway: 'path', surface: 'ground' }
export function leggiTag(testo) {
  const tag = {};
  for (const parte of String(testo ?? '').split(' ')) {
    const i = parte.indexOf('=');
    if (i > 0) tag[parte.slice(0, i)] = parte.slice(i + 1);
  }
  return tag;
}

// Dalla risposta GeoJSON: coordinate [lon, lat, quota] e tratti con i tag OSM
export function interpretaBrouter(json) {
  const f = json?.features?.[0];
  if (!f?.geometry?.coordinates?.length) throw new Error('BRouter non ha trovato un percorso tra questi punti.');
  const coordinate = f.geometry.coordinates.map(([lon, lat, ele]) => (Number.isFinite(ele) ? [lon, lat, ele] : [lon, lat]));
  const messaggi = f.properties?.messages ?? [];
  const intestazione = messaggi[0] ?? [];
  const iDistanza = intestazione.indexOf('Distance');
  const iTag = intestazione.indexOf('WayTags');
  const terreno = [];
  let percorsi = 0;
  for (const riga of messaggi.slice(1)) {
    const d = Number(riga[iDistanza]) || 0;
    if (d <= 0) continue;
    terreno.push({ daM: percorsi, aM: percorsi + d, tag: leggiTag(riga[iTag]) });
    percorsi += d;
  }
  return {
    coordinate,
    terreno,
    lunghezzaM: Number(f.properties?.['track-length']) || percorsi,
    salitaM: Number(f.properties?.['filtered ascend']) || null,
  };
}

export async function calcolaPercorso(punti, { fetchFn = fetch, preferenzaSegnati = null } = {}) {
  if (punti.length < 2) throw new Error('Servono almeno due punti.');
  let risposta;
  try {
    risposta = await fetchFn(urlBrouter(punti, PROFILO_ESCURSIONE, { preferenzaSegnati }));
  } catch {
    throw new Error('BRouter non risponde: controlla la connessione.');
  }
  if (!risposta.ok) {
    const testo = await risposta.text().catch(() => '');
    // troppe richieste: il server pubblico chiede di riprovare più tardi
    if (risposta.status === 403 || risposta.status === 429) throw Object.assign(new Error('BRouter è occupato: riprova tra qualche minuto.'), { occupato: true });
    throw new Error(/not.*found|position/i.test(testo) ? 'Uno dei punti è troppo lontano da un sentiero o da una strada.' : `BRouter ha risposto ${risposta.status}.`);
  }
  return interpretaBrouter(await risposta.json());
}
