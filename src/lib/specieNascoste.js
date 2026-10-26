// Specie che non voglio vedere (le più comuni, quelle che coprono tutto il resto): una preferenza del telefono, nel
// backup, valida in tutta la Fauna (heatmap, segnaposto, «Cosa vedere qui», «Ricco di fauna», Suggerisci…).
// Una specie si riconosce dal nome scientifico (due parole); gli animali della lista di Orme anche dalla loro chiave.
import { TAXON_INATURALIST, ANIMALI } from './costanti.js';

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

const VUOTO = () => ({ versione: 1, specie: [], comuni: { attive: false, specie: [] } });

// Qualunque cosa sia stata salvata → { specie: [voce], comuni: { attive, specie: [voce] } }
export function normalizzaNascoste(grezzo) {
  const g = grezzo && typeof grezzo === 'object' && !Array.isArray(grezzo) ? grezzo : {};
  const voci = (lista) => {
    const viste = new Set();
    return (Array.isArray(lista) ? lista : [])
      .map((v) => (v && typeof v === 'object' && typeof v.chiave === 'string' && v.chiave ? { chiave: v.chiave, nome: String(v.nome ?? v.chiave), ...(typeof v.animale === 'string' ? { animale: v.animale } : {}), ...(Number(v.inat) ? { inat: Number(v.inat) } : {}) } : null))
      .filter((v) => v && !viste.has(v.chiave) && viste.add(v.chiave));
  };
  return { versione: 1, specie: voci(g.specie), comuni: { attive: g.comuni?.attive === true, specie: voci(g.comuni?.specie) } };
}

export function leggiNascosteSalvate(memoria = globalThis.localStorage) {
  try {
    return normalizzaNascoste(JSON.parse(memoria?.getItem(CHIAVE_NASCOSTE) ?? 'null'));
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

// Le specie più comuni, calcolate dai percorsi: quelle segnalate (lungo il percorso o nella zona) sul maggior numero di
// percorsi che hanno dati di fauna. Entrano quelle sopra la soglia (di base un quarto dei percorsi), al massimo
// `massimo`, e almeno su `minimo` percorsi. → [{ animale, chiave, nome, percorsi, quota }] dalla più diffusa
export function specieComuni(sentieri, { soglia = 0.25, massimo = 30, minimo = 3 } = {}) {
  const conDati = sentieri.filter((s) => Array.isArray(s.faunaInat?.specie));
  if (!conDati.length) return [];
  const conti = new Map();
  for (const s of conDati) for (const animale of new Set(s.faunaInat.specie.map((x) => x.animale))) conti.set(animale, (conti.get(animale) ?? 0) + 1);
  return [...conti]
    .map(([animale, percorsi]) => ({ animale, chiave: chiaveSpecie({ animale }), nome: ANIMALI[animale] ?? animale, percorsi, quota: percorsi / conDati.length }))
    .filter((x) => x.chiave && x.percorsi >= minimo && x.quota >= soglia)
    .sort((a, b) => b.percorsi - a.percorsi || a.nome.localeCompare(b.nome))
    .slice(0, massimo);
}

// Le specie nascoste e il loro uso: memoria = localStorage (o un finto, nei test)
export function creaNascoste(memoria = globalThis.localStorage) {
  let dati = leggiNascosteSalvate(memoria);
  const ascoltatori = new Set();
  const chiavi = () => new Set([...dati.specie, ...(dati.comuni.attive ? dati.comuni.specie : [])].map((v) => v.chiave));
  const cambia = (nuovo) => {
    dati = normalizzaNascoste(nuovo);
    salvaNascosteSalvate(dati, memoria);
    for (const f of ascoltatori) f(dati);
  };
  return {
    leggi: () => dati,
    // vero se la specie (un animale di Orme, un'osservazione, un taxon…) è tra quelle nascoste
    esclude: (x) => {
      if (!dati.specie.length && !dati.comuni.attive) return false;
      const k = chiaveSpecie(x ?? {});
      return k != null && chiavi().has(k);
    },
    // la lista senza le specie nascoste; comeSpecie: come trovare la specie di un elemento
    senza(lista, comeSpecie = (x) => x) {
      if (!dati.specie.length && !dati.comuni.attive) return lista;
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
    impostaComuni: (attive, elenco = dati.comuni.specie) => cambia({ ...dati, comuni: { attive: Boolean(attive), specie: attive ? elenco.map((e) => voceSpecie(e)).filter(Boolean) : dati.comuni.specie } }),
    // quante specie sono escluse in tutto (senza contare due volte una nascosta e anche comune)
    conta: () => chiavi().size,
    // le voci escluse, per le liste «Nascoste» (le comuni a parte)
    nascoste: () => dati.specie,
    comuni: () => dati.comuni,
    // taxon iNaturalist da escludere dalla heatmap (without_taxon_id)
    idInat: () => [...new Set([...dati.specie, ...(dati.comuni.attive ? dati.comuni.specie : [])].map((v) => v.inat).filter(Boolean))].sort((a, b) => a - b),
    // cambia quando cambia l'esclusione: per rifare ciò che ne dipende
    firma: () => [...chiavi()].sort().join('|'),
    ascolta(f) {
      ascoltatori.add(f);
      return () => ascoltatori.delete(f);
    },
    // con le «più comuni» accese, l'elenco si rifà sui percorsi che ci sono ora (solo se cambia e se i dati ci sono)
    ricalcolaComuni(sentieri) {
      if (!dati.comuni.attive) return false;
      const nuove = specieComuni(sentieri);
      const k = (l) => l.map((v) => v.chiave).sort().join('|');
      if (!nuove.length || k(nuove) === k(dati.comuni.specie)) return false;
      cambia({ ...dati, comuni: { attive: true, specie: nuove.map((e) => voceSpecie(e)).filter(Boolean) } });
      return true;
    },
    // un backup che arriva: sostituisce le scelte
    ripristina: (grezzo) => cambia(grezzo),
  };
}

// L'unica istanza dell'app
export const nascoste = creaNascoste();
