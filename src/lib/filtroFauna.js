// Il filtro della Fauna, uno solo per heatmap, icone, conteggio «N animali qui» ed elenco, da tutte le fonti
// (iNaturalist, GBIF, atlanti e le altre): animali selvatici (mammiferi, uccelli, rettili, anfibi), mai domestici né
// specie nascoste; con una specie scelta solo quella; con «Solo rare» solo le specie rare (minacciate).
import { eDomestico } from './domestici.js';
import { chiaveSpecie, nascoste } from './specieNascoste.js';
import { CATEGORIE_RARE, ESCLUSI_DALLE_RARE } from './costanti.js';

export const CLASSI_SELVATICI = new Set(['Mammalia', 'Aves', 'Reptilia', 'Amphibia']);

// «Rara»: Lista Rossa vulnerabile, in pericolo o in pericolo critico, tra mammiferi e uccelli, senza passeriformi e
// colombiformi (passera d'Italia, tortora…: a rischio ma non da cercare). Ogni fonte lo calcola sui suoi dati.
export const eRaraGbif = (o) => CATEGORIE_RARE.includes(o?.iucnRedListCategory) && ['Mammalia', 'Aves'].includes(o?.class) && !ESCLUSI_DALLE_RARE.ordini.includes(o?.order);
// iNaturalist: stato di conservazione IUCN 30 (VU) o peggio
export const eRaraInat = (t = {}) => (t.conservation_status?.iucn ?? 0) >= 30 && ['Mammalia', 'Aves'].includes(t.iconic_taxon_name) && ![t.id, ...(t.ancestor_ids ?? [])].some((id) => ESCLUSI_DALLE_RARE.inat.includes(id));

// filtri: { taxon: { scientifico } | null, gruppi: ['selvatici' | 'rare'] }
// rare: le chiavi delle specie rare. Una specie è rara per tutte le sue osservazioni, anche quando una fonte non riporta
// lo stato di conservazione (GBIF a volte lo omette): basta che lo dica un'osservazione
export const specieRare = (oss) => new Set((oss ?? []).filter((o) => o.rara === true).map((o) => chiaveSpecie({ animale: o.animale, nomeScientifico: o.nomeScientifico })));
export function osservazioneAmmessa(o, filtri = {}, esclude = (x) => nascoste.esclude(x), rare = null) {
  if (!o?.animale && !CLASSI_SELVATICI.has(o?.classe)) return false;
  if (eDomestico({ scientifico: o.nomeScientifico, nome: o.specie })) return false;
  if (esclude({ animale: o.animale, nomeScientifico: o.nomeScientifico })) return false;
  if (filtri.taxon?.scientifico) return chiaveSpecie({ animale: o.animale, nomeScientifico: o.nomeScientifico }) === chiaveSpecie({ scientifico: filtri.taxon.scientifico });
  if ((filtri.gruppi ?? []).includes('rare') && !(filtri.gruppi ?? []).includes('selvatici')) return o.rara === true || Boolean(rare?.has(chiaveSpecie({ animale: o.animale, nomeScientifico: o.nomeScientifico })));
  return true;
}
// Le specie dell'elenco «Cosa vedere qui» a partire dalle osservazioni ammesse (le stesse delle icone e del conteggio):
// [{ inat, nome, scientifico, animale, osservazioni, foto, rara, esempio }] dalla più osservata
export function specieDalleOsservazioni(oss, max = 8) {
  const per = new Map();
  for (const o of oss ?? []) {
    const k = chiaveSpecie({ animale: o.animale, nomeScientifico: o.nomeScientifico });
    if (!k) continue;
    const s = per.get(k) ?? { chiave: k, inat: o.taxonId ?? null, nome: o.specie, scientifico: o.nomeScientifico, animale: o.animale ?? null, osservazioni: 0, foto: null, rara: false, esempio: o };
    s.osservazioni++;
    s.inat ??= o.taxonId ?? null;
    s.foto ??= o.foto ?? null;
    s.rara ||= o.rara === true;
    per.set(k, s);
  }
  return [...per.values()].sort((a, b) => b.osservazioni - a.osservazioni).slice(0, max);
}
export function filtraOsservazioni(oss, filtri, esclude) {
  const rare = specieRare(oss);
  return (oss ?? []).filter((o) => osservazioneAmmessa(o, filtri, esclude, rare));
}
