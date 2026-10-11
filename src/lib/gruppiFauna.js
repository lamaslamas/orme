// Gruppi di animali di "Intorno a me" (src/lib/costanti.js, GRUPPI_FAUNA): quali taxa cercare su
// GBIF e iNaturalist per i gruppi scelti, e se aggiungere le specie minacciate.
import { GRUPPI_FAUNA, GRUPPI_FAUNA_PREDEFINITI } from './costanti.js';

export const gruppiScelti = (filtri = {}) => (Array.isArray(filtri.gruppi) ? filtri.gruppi : GRUPPI_FAUNA_PREDEFINITI).filter((g) => GRUPPI_FAUNA[g]);

// fonte: 'gbif' | 'inat'
export const taxaDeiGruppi = (filtri, fonte) => [...new Set(gruppiScelti(filtri).flatMap((g) => GRUPPI_FAUNA[g][fonte] ?? []))];

export const conMinacciate = (filtri) => gruppiScelti(filtri).includes('rare');
