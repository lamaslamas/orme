// Difficoltà sempre nella scala CAI (T, E, EE, EEA). Da OpenStreetMap: il tag cai_scale se c'è,
// altrimenti la scala SAC convertita; la SAC si mostra solo tra parentesi, mai da sola ("T2" si
// confonderebbe con i codici dei sentieri dei parchi).
export const NOMI_CAI = { T: 'turistico', E: 'escursionistico', EE: 'per esperti', EEA: 'esperti con attrezzatura' };

const SAC = {
  hiking: { cai: 'T', sac: 'T1' },
  mountain_hiking: { cai: 'E', sac: 'T2' },
  demanding_mountain_hiking: { cai: 'EE', sac: 'T3' },
  // T4–T6 sono già alpinismo: per il CAI almeno EE (EEA è per i tratti attrezzati)
  alpine_hiking: { cai: 'EE', sac: 'T4', alpinistico: true },
  demanding_alpine_hiking: { cai: 'EE', sac: 'T5', alpinistico: true },
  difficult_alpine_hiking: { cai: 'EE', sac: 'T6', alpinistico: true },
};

// tag OSM → { cai, sac, alpinistico } oppure null
export function difficoltaDaOsm(tag = {}) {
  const cai = String(tag.cai_scale ?? '').toUpperCase().match(/^(EEA|EE|E|T)\b/)?.[1];
  const sac = SAC[tag.sac_scale] ?? null;
  if (cai) return { cai, sac: sac?.sac ?? null, alpinistico: Boolean(sac?.alpinistico) };
  if (tag.highway === 'via_ferrata' || tag.via_ferrata_scale) return { cai: 'EEA', sac: sac?.sac ?? null, alpinistico: false };
  return sac ? { ...sac, alpinistico: Boolean(sac.alpinistico) } : null;
}

// "E · escursionistico (SAC T2)"; breve: senza la SAC
export function testoDifficolta(d, { breve = false } = {}) {
  if (!d?.cai) return '';
  const sac = !breve && d.sac ? ` (SAC ${d.sac}${d.alpinistico ? ', alpinistico' : ''})` : '';
  return `${d.cai} · ${NOMI_CAI[d.cai]}${sac}`;
}
