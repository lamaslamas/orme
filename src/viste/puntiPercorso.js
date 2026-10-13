// Pianifica: i punti (rifugi e acqua) per un percorso che può uscire dai parchi e da "Intorno a me".
// Se esce dalle zone coperte si chiedono a OpenStreetMap quelli del suo riquadro, salvati sul telefono.
import { leggiPuntiPercorso, salvaPuntiPercorso } from '../db.js';
import { zoneCoperte } from './copertura.js';
import { puntiDelRobot } from './puntiRobot.js';
import { percorsoCoperto, riquadroDeiPezzi } from '../lib/lungoIlPercorso.js';
import { queryPuntiParco, puntiDallaRisposta } from '../lib/puntiUtili.js';
import { interrogaOverpass } from '../lib/overpass.js';
import { improntaTraccia } from '../lib/panorama.js';
import { caricaPunti } from './puntiUtili.js';

export const AVVISO_MANCANTI = 'Dati su rifugi e acqua non scaricati per questa zona.';

// { punti, avviso }: punti null se non c'è nessun dato (offline)
export async function puntiPerIlPercorso(id, pezzi) {
  const parchi = await caricaPunti();
  const geojson = { type: 'MultiLineString', coordinates: pezzi };
  // i quadrati del robot (tutta Italia) per la zona del percorso
  const robot = await puntiDelRobot(riquadroDeiPezzi(pezzi), { max: 16 });
  // un punto dei parchi e dello stesso quadrato del robot: una volta sola
  const base = parchi || robot.punti.length ? [...new Map([...(parchi ?? []), ...robot.punti].map((p) => [p.id, p])).values()] : null;
  const zone = [...(await zoneCoperte(Boolean(parchi))), ...robot.coperti.map((bbox) => ({ bbox }))];
  if (percorsoCoperto(pezzi, zone)) return { punti: base, avviso: '' };
  const impronta = improntaTraccia(geojson);
  const salvati = await leggiPuntiPercorso(id).catch(() => null);
  const unisci = (altri) => [...new Map([...(base ?? []), ...altri].map((p) => [p.id, p])).values()];
  if (salvati?.impronta === impronta) return { punti: unisci(salvati.punti), avviso: '' };
  try {
    const json = await interrogaOverpass(queryPuntiParco({ bbox: riquadroDeiPezzi(pezzi) }), { timeoutMs: 90_000 });
    const punti = puntiDallaRisposta(json);
    await salvaPuntiPercorso(id, impronta, punti);
    return { punti: unisci(punti), avviso: '' };
  } catch (e) {
    console.warn('Punti del percorso', e);
    return { punti: base ?? [], avviso: AVVISO_MANCANTI };
  }
}
