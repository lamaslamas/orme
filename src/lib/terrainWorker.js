// Web Worker delle Terrain Tiles: scarica la tessera PNG, la decodifica e ne ricava le quote fuori dal filo principale
// (decodifica e lettura dei pixel di ogni tessera costano alcuni ms, sei alla volta: sul telefono bloccavano lo schermo).
// Riceve { id, z, x, y }; risponde { id, quote: Float32Array | null } oppure { id, errore }.
import { urlTessera, decodificaTessera, LATO_TESSERA } from './terrainTiles.js';

const TEMPO_MAX_TESSERA_MS = 20_000;

self.onmessage = async ({ data: { id, z, x, y } }) => {
  try {
    const r = await fetch(urlTessera(z, x, y), { signal: AbortSignal.timeout(TEMPO_MAX_TESSERA_MS) });
    if (r.status === 404 || r.status === 403) return self.postMessage({ id, quote: null });
    if (!r.ok) throw new Error(`Terrain Tiles ha risposto ${r.status}`);
    // senza conversione dei colori: i canali RGB sono la quota, non un'immagine
    const immagine = await createImageBitmap(await r.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const ctx = new OffscreenCanvas(LATO_TESSERA, LATO_TESSERA).getContext('2d', { willReadFrequently: true });
    ctx.drawImage(immagine, 0, 0);
    const quote = decodificaTessera(ctx.getImageData(0, 0, LATO_TESSERA, LATO_TESSERA).data);
    self.postMessage({ id, quote }, [quote.buffer]);
  } catch (e) {
    self.postMessage({ id, errore: e?.message ?? String(e) });
  }
};
