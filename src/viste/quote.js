// Quote per tutta l'app: TINITALY (10 m, celle salvate sul telefono), Open-Meteo solo come riserva.
// Dislivello e tempi poi con il metodo CAI (src/lib/lungoIlPercorso.js), uguale ovunque.
import { leggiCellaDem, salvaCellaDem } from '../db.js';
import { creaLettoreTinitaly, pezziConQuoteTinitaly, profiloTinitaly, CREDITO_TINITALY } from '../lib/tinitaly.js';
import { aggiungiQuote } from '../lib/openMeteo.js';

let lettore = null;
const lettoreTinitaly = () => (lettore ??= creaLettoreTinitaly({ leggiCella: leggiCellaDem, salvaCella: salvaCellaDem }));

// pezzi [[lon, lat]…] → { pezzi con le quote, fonte: 'tinitaly' | 'open-meteo' }
export function quoteDeiPezzi(pezzi, opzioni = {}) {
  const riserva = async (pz) => (await aggiungiQuote({ type: 'MultiLineString', coordinates: pz }, { passoM: 100 })).coordinates;
  return pezziConQuoteTinitaly(pezzi, lettoreTinitaly(), riserva, opzioni);
}

// quote di punti sparsi (es. i rifugi): null dove non ci sono
export const quoteDeiPunti = (punti) => lettoreTinitaly().quote(punti).catch(() => punti.map(() => null));

export const testoFonteQuote = (fonte) => (fonte === 'tinitaly' ? CREDITO_TINITALY : fonte === 'open-meteo' ? 'Quote Open-Meteo (Copernicus 90 m)' : '');

// profilo di un sentiero (partenza, minima, massima, dislivello) come quello del robot; null se manca
export const profiloDaTinitaly = (geojson) => profiloTinitaly(geojson, lettoreTinitaly()).catch(() => null);
