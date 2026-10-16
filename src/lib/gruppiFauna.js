// Gruppi di animali di "Intorno a me" (src/lib/costanti.js, GRUPPI_FAUNA): quali taxa cercare su
// GBIF e iNaturalist per i gruppi scelti, e se aggiungere le specie minacciate.
import { GRUPPI_FAUNA, GRUPPI_FAUNA_PREDEFINITI } from './costanti.js';

export const gruppiScelti = (filtri = {}) => (Array.isArray(filtri.gruppi) ? filtri.gruppi : GRUPPI_FAUNA_PREDEFINITI).filter((g) => GRUPPI_FAUNA[g]);

// fonte: 'gbif' | 'inat'
export const taxaDeiGruppi = (filtri, fonte) => [...new Set(gruppiScelti(filtri).flatMap((g) => GRUPPI_FAUNA[g][fonte] ?? []))];

export const conMinacciate = (filtri) => gruppiScelti(filtri).includes('rare');

// I gruppi scelti sono una preferenza del telefono, la stessa in tutte le mappe e nel pannello Fauna:
// di base ci sono tutti. Nessun gruppo = nessuna heatmap (non una heatmap piena).
export const CHIAVE_GRUPPI = 'orme.gruppiIntorno';
export function leggiGruppiSalvati(memoria = globalThis.localStorage) {
  try {
    const g = JSON.parse(memoria?.getItem(CHIAVE_GRUPPI) ?? 'null');
    return Array.isArray(g) ? g.filter((x) => GRUPPI_FAUNA[x]) : [...GRUPPI_FAUNA_PREDEFINITI];
  } catch {
    return [...GRUPPI_FAUNA_PREDEFINITI];
  }
}
export function salvaGruppiSalvati(gruppi, memoria = globalThis.localStorage) {
  try {
    memoria?.setItem(CHIAVE_GRUPPI, JSON.stringify(gruppi));
  } catch {
    // memoria non disponibile: la scelta vale per questa visita
  }
}
// La scritta sopra la scala: "Tutti gli animali", "Rapaci, Mammiferi", "Nessun gruppo scelto"
export function testoGruppi(gruppi) {
  const scelti = (gruppi ?? []).filter((g) => GRUPPI_FAUNA[g]);
  if (!scelti.length) return 'Nessun gruppo scelto';
  if (Object.keys(GRUPPI_FAUNA).every((g) => scelti.includes(g))) return 'Tutti gli animali';
  return Object.keys(GRUPPI_FAUNA).filter((g) => scelti.includes(g)).map((g) => GRUPPI_FAUNA[g].nome).join(', ');
}
