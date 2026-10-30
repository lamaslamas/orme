// «Fauna lungo il percorso»: le specie osservate entro 300 m dalla traccia e il tratto con più fauna, con gli stessi filtri della
// Fauna sulla mappa (stesso filtro per tutte le fonti, src/lib/filtroFauna.js). Cambiando il percorso si rifà.
import { cercaOsservazioniFauna, NOMI_IT } from './faunaComune.js';
import { osservazioniNellaFascia } from '../lib/inaturalistTraccia.js';
import { specieDalleOsservazioni } from '../lib/filtroFauna.js';
import { trattiFauna } from '../lib/trattoFauna.js';
import { riquadroDelPercorso } from '../lib/poiPianificatore.js';
import { creaBase } from '../lib/modificaTraccia.js';

export const FASCIA_FAUNA_M = 300;
const SPAN_MASSIMO_GRADI = 0.6; // oltre, la zona è troppo grande per una richiesta sola (circa 65 km)

// → { specie: [{ nome, osservazioni, rara }], altre, tratto: { daKm, aKm, persone, specie, linea } | null, osservazioni, approssimato } o null se non si può
export async function faunaLungoIlPercorso(linea, filtri, segnale) {
  if (!linea || linea.length < 2) return null;
  const r = riquadroDelPercorso(linea, 0.004);
  if (r[2] - r[0] > SPAN_MASSIMO_GRADI || r[3] - r[1] > SPAN_MASSIMO_GRADI) return { troppoLungo: true };
  const { osservazioni } = await cercaOsservazioniFauna(r, 300, segnale, filtri);
  const { dentro } = osservazioniNellaFascia(osservazioni, [linea], FASCIA_FAUNA_M);
  const tutte = specieDalleOsservazioni(dentro, 50);
  const specie = tutte.slice(0, 6).map((x) => ({ nome: x.animale ? x.nome : NOMI_IT.get(x.scientifico) || x.nome, osservazioni: x.osservazioni, rara: x.rara }));
  const t = trattiFauna(dentro, [linea]).migliore;
  let tratto = null;
  if (t) {
    const base = creaBase([linea]);
    const lim = (km) => Math.max(0, Math.min(base.totaleM, km * 1000));
    tratto = { ...t, daM: lim(t.daKm), aM: lim(t.aKm) };
  }
  return { specie, altre: Math.max(0, tutte.length - specie.length), tratto, osservazioni: dentro.length, approssimato: osservazioni.length >= 300 };
}
