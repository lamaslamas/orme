// Specie che non voglio vedere (le più comuni, quelle che coprono tutto il resto): una preferenza del telefono, nel
// backup, valida in tutta la Fauna (heatmap, segnaposto, «Cosa vedere qui», «Ricco di fauna», Suggerisci…).
// Una specie si riconosce dal nome scientifico (due parole); gli animali della lista di Orme anche dalla loro chiave.
import { TAXON_INATURALIST, ANIMALI } from './costanti.js';
import { eDomestico } from './domestici.js';

export const CHIAVE_NASCOSTE = 'orme.specieNascoste';

const binomio = (testo) =>
  String(testo ?? '')
    .replace(/\(.*?\)/g, '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');
const SCIENTIFICO_DI = Object.fromEntries(Object.entries(TAXON_INATURALIST).map(([k, t]) => [k, binomio(t.nome)]));

// La chiave di una specie: { animale?, scientifico? | nomeScientifico? } → «ursus arctos» (o null se non si capisce)
export function chiaveSpecie({ animale = null, scientifico = null, nomeScientifico = null } = {}) {
  if (animale && SCIENTIFICO_DI[animale]) return SCIENTIFICO_DI[animale];
  return binomio(scientifico ?? nomeScientifico) || null;
}

// Una voce da ricordare: chiave, nome da mostrare e, se si sanno, l'animale di Orme e il taxon iNaturalist (per la heatmap)
export function voceSpecie({ animale = null, scientifico = null, nomeScientifico = null, nome = null, inat = null } = {}) {
  const chiave = chiaveSpecie({ animale, scientifico, nomeScientifico });
  if (!chiave) return null;
  const idInat = Number(inat) || TAXON_INATURALIST[animale]?.id || null;
  return { chiave, nome: nome || (animale ? ANIMALI[animale] : null) || scientifico || nomeScientifico || chiave, ...(animale ? { animale } : {}), ...(idInat ? { inat: idInat } : {}) };
}

// «Nascondi le più comuni» è accesa di base (l'elenco si calcola alla prima apertura); chi l'ha spenta la ritrova spenta
const VUOTO = () => ({ versione: 1, specie: [], comuni: { attive: true, specie: [] } });

// Qualunque cosa sia stata salvata → { specie: [voce], comuni: { attive, specie: [voce] } }
export function normalizzaNascoste(grezzo) {
  const g = grezzo && typeof grezzo === 'object' && !Array.isArray(grezzo) ? grezzo : {};
  const voci = (lista) => {
    const viste = new Set();
    return (Array.isArray(lista) ? lista : [])
      .map((v) => (v && typeof v === 'object' && typeof v.chiave === 'string' && v.chiave ? { chiave: v.chiave, nome: String(v.nome ?? v.chiave), ...(typeof v.animale === 'string' ? { animale: v.animale } : {}), ...(Number(v.inat) ? { inat: Number(v.inat) } : {}) } : null))
      .filter((v) => v && !viste.has(v.chiave) && viste.add(v.chiave));
  };
  const attive = g.comuni && typeof g.comuni === 'object' ? g.comuni.attive === true : true;
  return { versione: 1, specie: voci(g.specie), comuni: { attive, specie: voci(g.comuni?.specie), ...(typeof g.comuni?.calcolato === 'string' ? { calcolato: g.comuni.calcolato } : {}) } };
}

export function leggiNascosteSalvate(memoria = globalThis.localStorage) {
  try {
    return normalizzaNascoste(JSON.parse(memoria?.getItem(CHIAVE_NASCOSTE) ?? '{}'));
  } catch {
    return VUOTO();
  }
}
export function salvaNascosteSalvate(valore, memoria = globalThis.localStorage) {
  try {
    memoria?.setItem(CHIAVE_NASCOSTE, JSON.stringify(normalizzaNascoste(valore)));
  } catch {
    // vale solo per questa visita
  }
}

// Le specie di «Quale animale» (Suggerisci): sono quelle che cerco, quindi le «più comuni» non le toccano mai;
// si nascondono solo a mano
export const SEMPRE_VISIBILI = ['cervo', 'camoscio', 'lupo', 'orso', 'capriolo', 'cinghiale', 'volpe', 'daino', 'aquila_reale', 'nibbio_reale', 'cicogna_nera'];
// più tre che voglio sempre vedere: salamandra pezzata, svasso maggiore, ramarro occidentale
const CHIAVI_SEMPRE_VISIBILI = new Set([...SEMPRE_VISIBILI.map((a) => SCIENTIFICO_DI[a]), 'salamandra salamandra', 'podiceps cristatus', 'lacerta bilineata']);

// Le specie più comuni: le più osservate in tutta Italia tra gli animali selvatici (mammiferi, uccelli, rettili, anfibi;
// iNaturalist, osservazioni verificate, niente cattività), senza quelle sempre visibili e senza gli animali domestici
export const ITALIA_INAT = 6973;
export const CLASSI_COMUNI_INAT = [40151, 3, 26036, 20978]; // mammiferi, uccelli, rettili, anfibi
// Soggetti fotografici: non entrano mai tra le più comuni (rapaci, cicogne, aironi, cormorani, fenicotteri)
export const SOGGETTI_FOTOGRAFICI_INAT = [71261, 67570, 4730, 4929, 4262, 4255]; // Accipitriformes, Falconiformes, Ciconiidae, Ardeidae, Phalacrocoracidae, Phoenicopteridae
// Entrano sempre, se ci sono nei dati: cornacchia grigia, lucertola muraiola, lucertola campestre
const SEMPRE_INCLUSE = ['corvus cornix', 'podarcis muralis', 'podarcis siculus'];
export function urlSpecieComuni() {
  const p = new URLSearchParams({ place_id: String(ITALIA_INAT), taxon_id: CLASSI_COMUNI_INAT.join(','), without_taxon_id: SOGGETTI_FOTOGRAFICI_INAT.join(','), quality_grade: 'research', captive: 'false', locale: 'it', per_page: '100' });
  return `https://api.inaturalist.org/v1/observations/species_counts?${p}`;
}
// risposta di species_counts → le `massimo` con più osservazioni: [{ chiave, nome, scientifico, inat, osservazioni }]
export function specieComuniDaRisposta(json, { massimo = 30 } = {}) {
  const viste = new Set();
  const voci = [];
  for (const r of json?.results ?? []) {
    const t = r.taxon ?? {};
    const chiave = chiaveSpecie({ scientifico: t.name });
    if (!t.id || !chiave || viste.has(chiave) || CHIAVI_SEMPRE_VISIBILI.has(chiave) || [t.id, ...(t.ancestor_ids ?? [])].some((id) => SOGGETTI_FOTOGRAFICI_INAT.includes(id)) || eDomestico({ scientifico: t.name, nome: t.preferred_common_name })) continue;
    viste.add(chiave);
    voci.push({ chiave, nome: t.preferred_common_name ? t.preferred_common_name.replace(/^./, (c) => c.toUpperCase()) : t.name, scientifico: t.name, inat: t.id, osservazioni: r.count ?? 0 });
  }
  const ordinate = voci.sort((a, b) => b.osservazioni - a.osservazioni);
  const incluse = ordinate.filter((v) => SEMPRE_INCLUSE.includes(v.chiave));
  return [...ordinate.filter((v) => !incluse.includes(v)).slice(0, Math.max(0, massimo - incluse.length)), ...incluse].sort((a, b) => b.osservazioni - a.osservazioni);
}

// Le specie nascoste e il loro uso: memoria = localStorage (o un finto, nei test)
export function creaNascoste(memoria = globalThis.localStorage) {
  let dati = leggiNascosteSalvate(memoria);
  const ascoltatori = new Set();
  const comuniAttive = () => (dati.comuni.attive ? dati.comuni.specie.filter((v) => !CHIAVI_SEMPRE_VISIBILI.has(v.chiave)) : []);
  const chiavi = () => new Set([...dati.specie, ...comuniAttive()].map((v) => v.chiave));
  const cambia = (nuovo) => {
    dati = normalizzaNascoste(nuovo);
    salvaNascosteSalvate(dati, memoria);
    for (const f of ascoltatori) f(dati);
  };
  return {
    leggi: () => dati,
    // vero se la specie (un animale di Orme, un'osservazione, un taxon…) è tra quelle nascoste
    esclude: (x) => {
      if (!dati.specie.length && !comuniAttive().length) return false;
      const k = chiaveSpecie(x ?? {});
      return k != null && chiavi().has(k);
    },
    // la lista senza le specie nascoste; comeSpecie: come trovare la specie di un elemento
    senza(lista, comeSpecie = (x) => x) {
      if (!dati.specie.length && !comuniAttive().length) return lista;
      const k = chiavi();
      return lista.filter((x) => {
        const c = chiaveSpecie(comeSpecie(x) ?? {});
        return c == null || !k.has(c);
      });
    },
    nascondi(specie) {
      const v = voceSpecie(specie);
      if (!v || dati.specie.some((x) => x.chiave === v.chiave)) return v;
      cambia({ ...dati, specie: [...dati.specie, v] });
      return v;
    },
    // un taxon trovato dopo (per la heatmap) si aggiunge alla voce
    conTaxon(chiave, inat) {
      if (!Number(inat)) return;
      const aggiorna = (v) => (v.chiave === chiave && !v.inat ? { ...v, inat: Number(inat) } : v);
      if ([...dati.specie, ...dati.comuni.specie].some((v) => v.chiave === chiave && !v.inat)) cambia({ ...dati, specie: dati.specie.map(aggiorna), comuni: { ...dati.comuni, specie: dati.comuni.specie.map(aggiorna) } });
    },
    rimetti: (chiave) => cambia({ ...dati, specie: dati.specie.filter((x) => x.chiave !== chiave) }),
    rimettiTutte: () => cambia({ ...dati, specie: [], comuni: { ...dati.comuni, attive: false } }),
    // elenco: le specie comuni calcolate in questo momento (si ricordano, così non cambiano da sole)
    impostaComuni: (attive, elenco = dati.comuni.specie) => cambia({ ...dati, comuni: { attive: Boolean(attive), specie: attive ? elenco.map((e) => voceSpecie(e)).filter((v) => v && !CHIAVI_SEMPRE_VISIBILI.has(v.chiave)) : dati.comuni.specie, ...(attive ? { calcolato: new Date().toISOString().slice(0, 10) } : {}) } }),
    // quante specie sono escluse in tutto (senza contare due volte una nascosta e anche comune)
    conta: () => chiavi().size,
    // le voci escluse, per le liste «Nascoste» (le comuni a parte)
    nascoste: () => dati.specie,
    comuni: () => dati.comuni,
    // acceso ma l'elenco manca o è vecchio (più di 30 giorni): va rifatto
    comuniDaCalcolare: (oggi = new Date()) => dati.comuni.attive && (!dati.comuni.specie.length || !dati.comuni.calcolato || (oggi - new Date(dati.comuni.calcolato)) / 86_400_000 > 30),
    // taxon iNaturalist da escludere dalla heatmap (without_taxon_id)
    idInat: () => [...new Set([...dati.specie, ...comuniAttive()].map((v) => v.inat).filter(Boolean))].sort((a, b) => a - b),
    // cambia quando cambia l'esclusione: per rifare ciò che ne dipende
    firma: () => [...chiavi()].sort().join('|'),
    ascolta(f) {
      ascoltatori.add(f);
      return () => ascoltatori.delete(f);
    },
    // un backup che arriva: sostituisce le scelte
    ripristina: (grezzo) => cambia(grezzo),
  };
}

// L'unica istanza dell'app
export const nascoste = creaNascoste();
