import { SCALE_MTB } from './costanti.js';

const BICI_SI = new Set(['yes', 'designated', 'permissive', 'official']);
const BICI_NO = new Set(['no', 'private', 'use_sidepath']);

// "2+" -> 2, "0-" -> 0, "S3" -> 3
export function numeroMtb(valore) {
  const trovato = String(valore ?? '').match(/\d/);
  return trovato ? Number(trovato[0]) : null;
}

// Riassunto dei tag bici di un insieme di tratti OSM (oggetti con i tag delle way)
export function riassumiTagBici(listaTag) {
  const riassunto = { tratti: 0, bicycle: { si: 0, no: 0, a_spinta: 0, nonIndicato: 0 }, mtbScale: null };
  for (const tag of listaTag) {
    riassunto.tratti++;
    const b = String(tag?.bicycle ?? '').toLowerCase();
    if (!b) riassunto.bicycle.nonIndicato++;
    else if (BICI_SI.has(b)) riassunto.bicycle.si++;
    else if (BICI_NO.has(b)) riassunto.bicycle.no++;
    else if (b === 'dismount') riassunto.bicycle.a_spinta++;
    else riassunto.bicycle.nonIndicato++;
    const scala = numeroMtb(tag?.['mtb:scale']);
    if (scala != null) {
      riassunto.mtbScale = riassunto.mtbScale
        ? { min: Math.min(riassunto.mtbScale.min, scala), max: Math.max(riassunto.mtbScale.max, scala) }
        : { min: scala, max: scala };
    }
  }
  return riassunto;
}

export function unisciRiassunti(riassunti) {
  const validi = riassunti.filter(Boolean);
  if (!validi.length) return null;
  const totale = { tratti: 0, bicycle: { si: 0, no: 0, a_spinta: 0, nonIndicato: 0 }, mtbScale: null };
  for (const r of validi) {
    totale.tratti += r.tratti;
    for (const k of Object.keys(totale.bicycle)) totale.bicycle[k] += r.bicycle?.[k] ?? 0;
    if (r.mtbScale) {
      totale.mtbScale = totale.mtbScale
        ? { min: Math.min(totale.mtbScale.min, r.mtbScale.min), max: Math.max(totale.mtbScale.max, r.mtbScale.max) }
        : { ...r.mtbScale };
    }
  }
  return totale;
}

export function haInformazioniBici(r) {
  return Boolean(r && (r.tratti > r.bicycle.nonIndicato || r.mtbScale));
}

// Testo leggibile, es. "vietata su 3 tratti su 12 · scala MTB S1–S3"
export function descriviSuggerimento(r) {
  if (!haInformazioniBici(r)) return 'nessuna informazione sulla bici nei tratti di OpenStreetMap.';
  const parti = [];
  const { si, no, a_spinta: spinta } = r.bicycle;
  if (no) parti.push(`vietata su ${no} ${no === 1 ? 'tratto' : 'tratti'} su ${r.tratti}`);
  if (spinta) parti.push(`a spinta su ${spinta} su ${r.tratti}`);
  if (si) parti.push(`consentita su ${si} su ${r.tratti}`);
  if (r.mtbScale) {
    const { min, max } = r.mtbScale;
    parti.push(min === max ? `scala MTB S${min}` : `scala MTB S${min}–S${max}`);
  }
  return parti.join(' · ');
}

// Valori proposti, in modo prudente: "vietata" se anche un solo tratto lo è,
// "consentita" solo se tutti i tratti lo dicono; altrimenti nessuna proposta.
export function valoriSuggeriti(r) {
  if (!haInformazioniBici(r)) return {};
  const valori = {};
  if (r.bicycle.no > 0) valori.consentita = 'no';
  else if (r.bicycle.si + r.bicycle.a_spinta === r.tratti && r.bicycle.si > 0) valori.consentita = 'si';
  if (r.mtbScale && valori.consentita !== 'no') {
    valori.scalaMtb = SCALE_MTB[Math.min(r.mtbScale.max, SCALE_MTB.length - 1)];
  }
  return valori;
}
