// Le specie più segnalate nella zona inquadrata sulla mappa (anche quelle fuori dall'elenco fisso di
// Orme: garzetta, airone, istrice…), con lo stesso calcolo per osservatori diversi. Le osservazioni
// vengono da GBIF (src/lib/gbif.js); qui solo conti, nessun nome di persona.
import { distanzaDallaTracciaM } from './geo.js';
import { eDomestico } from './domestici.js';
import { mesiVicini, affidabilita, GRUPPI_SPECIE, MINIMO_OSSERVAZIONI, MINIMO_PERSONE, RAGGIO_PERCORSO_M, RAGGIO_ZONA_M } from './faunaPercorso.js';
import { mesiMigliori } from './inaturalistTraccia.js';
import { ANIMALI } from './costanti.js';
import { API_INATURALIST } from './inaturalist.js';

export const PREFISSO_ZONA = 'zona:'; // valore di una specie scelta tra quelle della zona: "zona:Egretta garzetta"
export const SPECIE_DELLA_ZONA_MAX = 8;
const annoDi = (d) => Number(String(d ?? '').slice(0, 4)) || 0;
// I rapaci diurni e notturni (per le specie che GBIF dà senza una chiave di Orme)
const ORDINI_RAPACI = new Set(['Accipitriformes', 'Falconiformes', 'Strigiformes']);
// Un'osservazione ({ animale, classe, ordine }) è del gruppo scelto? Mammiferi: i mammiferi; rapaci: i rapaci
export function inGruppo(o, gruppo) {
  const membri = GRUPPI_SPECIE[gruppo]?.specie;
  if (!membri) return true; // non è un gruppo: nessun filtro
  if (o.animale) return membri.includes(o.animale);
  if (gruppo === 'mammiferi') return o.classe === 'Mammalia';
  if (gruppo === 'rapaci') return o.classe === 'Aves' && ORDINI_RAPACI.has(o.ordine);
  return false;
}

const mese = (d) => Number(String(d ?? '').slice(5, 7)) || 0;

// Le specie con più osservatori diversi nel mese scelto (e in quelli accanto), almeno 3 osservazioni di 2 persone.
// osservazioni: [{ nomeScientifico, specie, animale, data, osservatore }]
// gruppo: la scelta di «Quale animale» se è un gruppo («mammiferi», «rapaci»): solo le specie di quel gruppo
export function specieDellaZonaPerOsservatori(osservazioni, meseScelto = null, { max = SPECIE_DELLA_ZONA_MAX, raggioMesi = 1, gruppo = null } = {}) {
  const mesi = meseScelto ? mesiVicini(meseScelto, raggioMesi) : null;
  const perSpecie = new Map();
  for (const o of osservazioni ?? []) {
    const chiave = o.nomeScientifico;
    if (!chiave || eDomestico({ scientifico: chiave, nome: o.specie })) continue;
    if (gruppo && !inGruppo(o, gruppo)) continue;
    const s = perSpecie.get(chiave) ?? { chiave, nome: o.animale ? ANIMALI[o.animale] : o.specie, animale: o.animale ?? null, n: 0, persone: new Set(), nPeriodo: 0, personePeriodo: new Set(), ultimoAnno: 0 };
    s.n++;
    if (o.osservatore != null) s.persone.add(o.osservatore);
    s.ultimoAnno = Math.max(s.ultimoAnno, annoDi(o.data));
    if (!mesi || mesi.has(mese(o.data))) {
      s.nPeriodo++;
      if (o.osservatore != null) s.personePeriodo.add(o.osservatore);
    }
    perSpecie.set(chiave, s);
  }
  return [...perSpecie.values()]
    .filter((s) => s.nPeriodo >= MINIMO_OSSERVAZIONI && s.personePeriodo.size >= MINIMO_PERSONE)
    .map((s) => ({ chiave: s.chiave, nome: s.nome, animale: s.animale, persone: s.personePeriodo.size, osservazioni: s.nPeriodo, ultimoAnno: s.ultimoAnno || null }))
    .sort((a, b) => b.persone - a.persone || b.osservazioni - a.osservazioni)
    .slice(0, max);
}

// Quanto un percorso è adatto a una specie della zona, con lo stesso calcolo delle specie fisse (puntiSpecie):
// osservazioni del periodo × osservatori diversi (al massimo 10), doppio se lungo il percorso. null se non ce ne sono.
export function puntiSpecieZona(osservazioni, geojson, chiave, meseScelto, { raggioMesi = 1, nome = null } = {}) {
  const mesi = meseScelto ? mesiVicini(meseScelto, raggioMesi) : null;
  const nuovo = () => ({ n: 0, persone: new Set(), mesi: Array(12).fill(0), ultimo: 0 });
  const livelli = { percorso: nuovo(), zona: nuovo() };
  for (const o of osservazioni ?? []) {
    if (o.nomeScientifico !== chiave) continue;
    const d = distanzaDallaTracciaM([o.lon, o.lat], geojson);
    const vicino = !o.sfumata && d <= RAGGIO_PERCORSO_M;
    if (!vicino && d > RAGGIO_ZONA_M + (o.sfumata ? 10_000 : 0)) continue;
    for (const l of vicino ? ['percorso', 'zona'] : ['zona']) {
      const x = livelli[l];
      x.n++;
      if (o.osservatore != null) x.persone.add(o.osservatore);
      if (mese(o.data)) x.mesi[mese(o.data) - 1]++;
      x.ultimo = Math.max(x.ultimo, annoDi(o.data));
    }
  }
  const ok = (x) => x.n >= MINIMO_OSSERVAZIONI && x.persone.size >= MINIMO_PERSONE;
  const dove = ok(livelli.percorso) ? 'percorso' : ok(livelli.zona) ? 'zona' : null;
  if (!dove) return null;
  const x = livelli[dove];
  const nelPeriodo = mesi ? [...mesi].reduce((n, m) => n + x.mesi[m - 1], 0) : x.n;
  if (!nelPeriodo) return null;
  const punti = nelPeriodo * Math.min(1, x.persone.size / 10) * (dove === 'percorso' ? 2 : 1);
  return {
    punti: Math.round(punti * 10) / 10,
    animale: chiave,
    nomeSpecie: nome ?? chiave,
    dove,
    nelPeriodo,
    ...affidabilita({ persone: x.persone.size, ultimoAnno: x.ultimo || null, mesi: mesiMigliori(x.mesi) }),
  };
}

// --- Nomi italiani (iNaturalist, locale it): GBIF dà spesso il nome scientifico o inglese ---
export const urlNomeItaliano = (scientifico) => `${API_INATURALIST}/taxa?q=${encodeURIComponent(scientifico)}&rank=species&locale=it&per_page=3`;
export function nomeItalianoDaRisposta(json, scientifico) {
  const t = (json?.results ?? []).find((r) => String(r.name).toLowerCase() === String(scientifico).toLowerCase());
  const nome = t?.preferred_common_name;
  return nome ? nome.replace(/^./, (c) => c.toUpperCase()) : null;
}
