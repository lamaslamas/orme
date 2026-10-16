// Quote per tutta l'app, sul telefono: le Terrain Tiles (AWS, ~30 m, tessere veloci e con CORS aperto),
// Open-Meteo (90 m) come riserva. TINITALY (10 m) lo usa solo il robot, per le tracce dell'archivio: il
// servizio dell'INGV è troppo lento e instabile per chiamarlo dal browser.
// Dislivello e tempi poi con il metodo CAI (src/lib/lungoIlPercorso.js), uguale ovunque.
import { pezziConQuoteTinitaly, profiloTinitaly, CREDITO_TINITALY } from '../lib/tinitaly.js';
import { aggiungiQuote } from '../lib/openMeteo.js';
import { creaLettoreTerrain, urlTessera, decodificaTessera, LATO_TESSERA, CREDITO_TERRAIN } from '../lib/terrainTiles.js';

const TEMPO_MAX_TESSERA_MS = 20_000;
// una tessera PNG → le sue quote (null = la tessera non c'è, es. in mare aperto)
async function leggiTessera(z, x, y) {
  const r = await fetch(urlTessera(z, x, y), { signal: AbortSignal.timeout(TEMPO_MAX_TESSERA_MS) });
  if (r.status === 404 || r.status === 403) return null;
  if (!r.ok) throw new Error(`Terrain Tiles ha risposto ${r.status}`);
  // senza conversione dei colori: i canali RGB sono la quota, non un'immagine
  const immagine = await createImageBitmap(await r.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const tela = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(LATO_TESSERA, LATO_TESSERA) : Object.assign(document.createElement('canvas'), { width: LATO_TESSERA, height: LATO_TESSERA });
  const ctx = tela.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(immagine, 0, 0);
  return decodificaTessera(ctx.getImageData(0, 0, LATO_TESSERA, LATO_TESSERA).data);
}

let lettore = null;
const lettoreTerrain = () => (lettore ??= creaLettoreTerrain({ leggiTessera }));

// pezzi [[lon, lat]…] → { pezzi con le quote, fonte: 'terrain' | 'open-meteo' }
export function quoteDeiPezzi(pezzi, opzioni = {}) {
  const riserva = async (pz) => (await aggiungiQuote({ type: 'MultiLineString', coordinates: pz }, { passoM: 100 })).coordinates;
  return pezziConQuoteTinitaly(pezzi, lettoreTerrain(), riserva, { ...opzioni, fonte: 'terrain' });
}

// quote di punti sparsi (es. i rifugi): null dove non ci sono
export const quoteDeiPunti = (punti) => lettoreTerrain().quote(punti).catch(() => punti.map(() => null));

// La fonte vera, scritta sotto il profilo ('terrarium' è il nome che il robot dà alle Terrain Tiles)
export const testoFonteQuote = (fonte) =>
  fonte === 'tinitaly' ? CREDITO_TINITALY : fonte === 'terrain' || fonte === 'terrarium' ? CREDITO_TERRAIN : fonte === 'open-meteo' ? 'Open-Meteo 90 m (Copernicus)' : '';

// profilo di un sentiero (partenza, minima, massima, dislivello, profilo a 100 punti) come quello del
// robot, ma dalle Terrain Tiles; null se manca
export const profiloDaTerrain = (geojson) => profiloTinitaly(geojson, lettoreTerrain()).catch(() => null);
