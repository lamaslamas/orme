// Gruppi di animali di "Intorno a me" (src/lib/costanti.js, GRUPPI_FAUNA): quali taxa cercare su
// GBIF e iNaturalist per i gruppi scelti, e se aggiungere le specie minacciate.
import { GRUPPI_FAUNA, GRUPPI_FAUNA_PREDEFINITI } from './costanti.js';

export const gruppiScelti = (filtri = {}) => (Array.isArray(filtri.gruppi) ? filtri.gruppi : GRUPPI_FAUNA_PREDEFINITI).filter((g) => GRUPPI_FAUNA[g]);

// fonte: 'gbif' | 'inat'
export const taxaDeiGruppi = (filtri, fonte) => [...new Set(gruppiScelti(filtri).flatMap((g) => GRUPPI_FAUNA[g][fonte] ?? []))];

export const conMinacciate = (filtri) => gruppiScelti(filtri).includes('rare');

// I gruppi scelti sono una preferenza del telefono, la stessa in tutte le mappe e nel pannello Fauna:
// di base ci sono tutti. Nessun gruppo = nessuna heatmap (non una heatmap piena).
// Formato { v: 2, gruppi }: la chiave di prima ("orme.gruppiIntorno", un elenco semplice, a volte vuoto
// per un'altra storia) non si legge più, così "nessun gruppo" c'è solo se i gruppi li ha tolti chi usa l'app.
export const CHIAVE_GRUPPI = 'orme.gruppiFauna';
export function leggiGruppiSalvati(memoria = globalThis.localStorage) {
  try {
    const dato = JSON.parse(memoria?.getItem(CHIAVE_GRUPPI) ?? 'null');
    if (dato?.v === 2 && Array.isArray(dato.gruppi)) return dato.gruppi.filter((x) => GRUPPI_FAUNA[x]);
  } catch {
    // dato rovinato: si riparte da tutti
  }
  return [...GRUPPI_FAUNA_PREDEFINITI];
}
export function salvaGruppiSalvati(gruppi, memoria = globalThis.localStorage) {
  try {
    memoria?.setItem(CHIAVE_GRUPPI, JSON.stringify({ v: 2, gruppi }));
  } catch {
    // memoria non disponibile: la scelta vale per questa visita
  }
}
// La scritta sopra la scala: "Tutti gli animali", "Rapaci, Mammiferi", "Nessun gruppo scelto"; con delle specie
// nascoste in più: "Tutti gli animali · 5 nascoste"
export function testoGruppi(gruppi, nascoste = 0) {
  const scelti = (gruppi ?? []).filter((g) => GRUPPI_FAUNA[g]);
  if (!scelti.length) return 'Nessun gruppo scelto';
  const nomi = Object.keys(GRUPPI_FAUNA).every((g) => scelti.includes(g)) ? 'Tutti gli animali' : Object.keys(GRUPPI_FAUNA).filter((g) => scelti.includes(g)).map((g) => GRUPPI_FAUNA[g].nome).join(', ');
  return nascoste > 0 ? `${nomi} · ${nascoste} ${nascoste === 1 ? 'nascosta' : 'nascoste'}` : nomi;
}
