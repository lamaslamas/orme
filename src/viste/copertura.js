// Zone di cui l'app ha già rifugi e acqua: i parchi (dentro il confine, o il riquadro se manca) e la
// zona cercata fuori dai parchi. Fuori da queste i punti si scaricano a parte (Pianifica, celle).
import { leggiIntorno, leggiPuntiIntorno } from '../db.js';
import { PARCHI } from '../datiParchi.js';
import { riquadroIntorno } from '../lib/intorno.js';

let confini = null;
export const caricaConfini = () =>
  (confini ??= fetch(`${import.meta.env.BASE_URL}dati/confini.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => d?.confini ?? {})
    .catch(() => ((confini = null), {})));

// Zone di cui si hanno già i punti: i parchi (confine, o riquadro se manca) e "Intorno a me"
export async function zoneCoperte(conParchi) {
  const zone = [];
  if (conParchi) {
    const c = await caricaConfini();
    for (const p of PARCHI.filter((x) => !x.zona)) zone.push(c[p.id]?.length ? { anelli: c[p.id] } : { bbox: p.bbox });
  }
  const [intorno, puntiIntorno] = await Promise.all([leggiIntorno().catch(() => null), leggiPuntiIntorno().catch(() => [])]);
  if (intorno?.centro && puntiIntorno.length) zone.push({ bbox: riquadroIntorno(intorno.centro, intorno.raggioKm) });
  return zone;
}

