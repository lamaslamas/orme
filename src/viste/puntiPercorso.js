// Pianifica: i punti (rifugi e acqua) per un percorso che può uscire dai parchi e da "Intorno a me".
// Se esce dalle zone coperte si chiedono a OpenStreetMap quelli del suo riquadro, salvati sul telefono.
import { leggiIntorno, leggiPuntiIntorno, leggiPuntiPercorso, salvaPuntiPercorso } from '../db.js';
import { PARCHI } from '../datiParchi.js';
import { riquadroIntorno } from '../lib/intorno.js';
import { percorsoCoperto, riquadroDeiPezzi } from '../lib/lungoIlPercorso.js';
import { queryPuntiParco, puntiDallaRisposta } from '../lib/puntiUtili.js';
import { interrogaOverpass } from '../lib/overpass.js';
import { improntaTraccia } from '../lib/panorama.js';
import { caricaPunti } from './puntiUtili.js';

export const AVVISO_MANCANTI = 'Dati su rifugi e acqua non scaricati per questa zona.';

let confini = null;
const caricaConfini = () =>
  (confini ??= fetch(`${import.meta.env.BASE_URL}dati/confini.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => d?.confini ?? {})
    .catch(() => ((confini = null), {})));

// Zone di cui si hanno già i punti: i parchi (confine, o riquadro se manca) e "Intorno a me"
async function zoneCoperte(conParchi) {
  const zone = [];
  if (conParchi) {
    const c = await caricaConfini();
    for (const p of PARCHI.filter((x) => !x.zona)) zone.push(c[p.id]?.length ? { anelli: c[p.id] } : { bbox: p.bbox });
  }
  const [intorno, puntiIntorno] = await Promise.all([leggiIntorno().catch(() => null), leggiPuntiIntorno().catch(() => [])]);
  if (intorno?.centro && puntiIntorno.length) zone.push({ bbox: riquadroIntorno(intorno.centro, intorno.raggioKm) });
  return zone;
}

// { punti, avviso }: punti null se non c'è nessun dato (offline)
export async function puntiPerIlPercorso(id, pezzi) {
  const base = await caricaPunti();
  const geojson = { type: 'MultiLineString', coordinates: pezzi };
  if (percorsoCoperto(pezzi, await zoneCoperte(Boolean(base)))) return { punti: base, avviso: '' };
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
