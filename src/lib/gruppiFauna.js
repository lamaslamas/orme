// Gruppi di animali di "Intorno a me" (src/lib/costanti.js, GRUPPI_FAUNA): quali taxa cercare su
// GBIF e iNaturalist per i gruppi scelti, e se aggiungere le specie minacciate.
import { GRUPPI_FAUNA, GRUPPI_FAUNA_PREDEFINITI } from './costanti.js';

export const gruppiScelti = (filtri = {}) => (Array.isArray(filtri.gruppi) ? filtri.gruppi : GRUPPI_FAUNA_PREDEFINITI).filter((g) => GRUPPI_FAUNA[g]);

// fonte: 'gbif' | 'inat'
export const taxaDeiGruppi = (filtri, fonte) => [...new Set(gruppiScelti(filtri).flatMap((g) => GRUPPI_FAUNA[g][fonte] ?? []))];

export const conMinacciate = (filtri) => gruppiScelti(filtri).includes('rare');

// Non ci sono più gruppi da scegliere: la Fauna mostra tutti gli animali selvatici, oppure solo le rare (interruttore
// «Solo rare», una preferenza del telefono, la stessa in tutte le mappe). I «gruppi» sono quindi uno solo dei due.
export const CHIAVE_SOLO_RARE = 'orme.soloRare';
export function leggiSoloRare(memoria = globalThis.localStorage) {
  try {
    return memoria?.getItem(CHIAVE_SOLO_RARE) === '1';
  } catch {
    return false;
  }
}
export function salvaSoloRare(si, memoria = globalThis.localStorage) {
  try {
    memoria?.setItem(CHIAVE_SOLO_RARE, si ? '1' : '0');
  } catch {
    // la scelta vale per questa visita
  }
}
export const leggiGruppiSalvati = (memoria = globalThis.localStorage) => (leggiSoloRare(memoria) ? ['rare'] : ['selvatici']);

// La scritta sopra la scala: "Tutti gli animali", "Solo rare"; con delle specie nascoste in più: "Tutti gli animali · 5 nascoste"
export function testoGruppi(gruppi, nascoste = 0) {
  const scelti = (gruppi ?? []).filter((g) => GRUPPI_FAUNA[g]);
  if (!scelti.length) return 'Nessun gruppo scelto';
  const nomi = scelti.includes('rare') && !scelti.includes('selvatici') ? 'Solo rare' : 'Tutti gli animali';
  return nascoste > 0 ? `${nomi} · ${nascoste} ${nascoste === 1 ? 'nascosta' : 'nascoste'}` : nomi;
}
