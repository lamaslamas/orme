// Valutazione MTB (secondaria): stima prudente della pedalabilità per tratti.
// Ordine: divieti > mtb:scale > sac_scale > fondo e tipo di via > pendenza.
import { leggiTag } from './brouter.js';

export const CLASSI_MTB = ['facile', 'media', 'difficile', 'a_spinta', 'vietata', 'non_valutabile'];
export const NOMI_MTB = {
  facile: 'Facile',
  media: 'Media',
  difficile: 'Difficile',
  a_spinta: 'A spinta',
  vietata: 'Vietata',
  non_valutabile: 'Non valutabile',
};
export const COLORI_MTB = {
  facile: '#22c55e',
  media: '#eab308',
  difficile: '#f97316',
  a_spinta: '#b91c1c',
  vietata: '#111827',
  non_valutabile: '#cbd5e1',
};

const PEGGIORE = (a, b) => (CLASSI_MTB.indexOf(a) >= CLASSI_MTB.indexOf(b) ? a : b);

// tag: tag OSM del tratto; pendenza: pendenza media del tratto (%); vietataDalParco: regole del sentiero
export function valutaTratto(tag = {}, pendenza = 0, { vietataDalParco = false } = {}) {
  if (vietataDalParco || ['no', 'private', 'use_sidepath'].includes(tag.bicycle)) return 'vietata';
  let base = null;
  const mtb = tag['mtb:scale'] != null ? Number(String(tag['mtb:scale']).match(/\d/)?.[0]) : null;
  if (Number.isFinite(mtb)) base = mtb <= 1 ? 'facile' : mtb === 2 ? 'media' : mtb === 3 ? 'difficile' : 'a_spinta';
  else if (tag.sac_scale) {
    base =
      { hiking: 'media', mountain_hiking: 'difficile', demanding_mountain_hiking: 'a_spinta' }[tag.sac_scale] ?? 'a_spinta';
  } else if (tag.highway) {
    if (tag.highway === 'steps') base = 'a_spinta';
    else if (['asphalt', 'paved', 'concrete', 'compacted', 'fine_gravel', 'gravel'].includes(tag.surface)) base = 'facile';
    else if (['rock', 'scree', 'stone'].includes(tag.surface)) base = 'difficile';
    else if (tag.highway === 'track') base = ['grade4', 'grade5'].includes(tag.tracktype) ? 'media' : 'facile';
    else if (['path', 'footway', 'bridleway'].includes(tag.highway)) base = tag.surface ? 'media' : null;
    else base = 'facile';
  }
  if (['bad', 'horrible', 'no'].includes(tag.trail_visibility)) base = PEGGIORE(base ?? 'media', 'difficile');
  if (base == null) return 'non_valutabile';
  const p = Math.abs(pendenza);
  if (p > 25) return PEGGIORE(base, 'a_spinta');
  if (pendenza > 15) return PEGGIORE(base, 'difficile');
  if (pendenza < -30) return PEGGIORE(base, 'difficile');
  return base;
}

// tratti: [{ daM, aM, tag }]; pendenzaA(m): pendenza al metro m
export function valutaPercorsoMtb(tratti, pendenzaA = () => 0, opzioni = {}) {
  const valutati = tratti.map((t) => {
    const tag = typeof t.tag === 'string' ? leggiTag(t.tag) : t.tag;
    return { daM: t.daM, aM: t.aM, classe: valutaTratto(tag, pendenzaA((t.daM + t.aM) / 2), opzioni) };
  });
  const km = Object.fromEntries(CLASSI_MTB.map((c) => [c, 0]));
  for (const t of valutati) km[t.classe] += (t.aM - t.daM) / 1000;
  const totale = Object.values(km).reduce((a, b) => a + b, 0);
  return {
    tratti: valutati,
    km,
    affidabilita: totale ? 1 - km.non_valutabile / totale : 0,
    pedalabili: km.facile + km.media + km.difficile,
  };
}
