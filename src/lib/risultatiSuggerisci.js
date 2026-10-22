// Le card dei risultati di Suggerisci (e di «Dove vado domani?», che ne è la vista a pagina intera): cosa dire una volta
// sola in cima perché vale per tutti, cosa invece resta nella card perché cambia da un percorso all'altro, e un sentiero
// e il suo inverso (536 e 536A) che compaiono una volta sola.
import { distanzaKm } from './geo.js';

// Le specie lungo il percorso (non quelle del parco): quelle viste sulla traccia e quelle del tratto con più fauna
export function specieDelPercorso(s, tratto = null) {
  const lungo = (s?.faunaInat?.specie ?? []).filter((x) => x.livello === 'percorso' && x.animale);
  const ordinate = [...lungo].sort((a, b) => (b.osservazioni ?? 0) - (a.osservazioni ?? 0)).map((x) => x.animale);
  return [...new Set([...(tratto?.migliore?.specie ?? tratto?.specie ?? []), ...ordinate])].slice(0, 5);
}

// gli elementi presenti in tutte le liste (se ce ne sono almeno due: con un solo risultato non c'è niente di «comune»)
export function comuniATutti(liste, chiave = (x) => x) {
  if (liste.length < 2) return [];
  const [prima, ...altre] = liste;
  return [...new Map(prima.map((x) => [chiave(x), x])).values()].filter((x) => altre.every((l) => l.some((y) => chiave(y) === chiave(x))));
}

// I motivi del meteo di un percorso (fango, vento, pioggia, cielo sereno, caldo…): { chiave, livello, testo }
export const motiviMeteo = (giudizio) => (giudizio?.fattori ?? []).map((f) => ({ chiave: f.chiave, livello: f.livello, testo: f.testo }));

// → { comuni: [motivi uguali per tutti], perVoce: [[motivi che cambiano]] } nello stesso ordine delle voci
export function motiviDistintivi(giudizi) {
  const liste = giudizi.map(motiviMeteo);
  const k = (m) => `${m.chiave}:${m.livello}`;
  const conMeteo = liste.filter((_, i) => giudizi[i]);
  const comuni = comuniATutti(conMeteo, k);
  const chiaviComuni = new Set(comuni.map(k));
  return { comuni, perVoce: liste.map((l) => l.filter((m) => !chiaviComuni.has(k(m)))) };
}

// ---------- un sentiero e il suo inverso ----------
const baseCodice = (c) => String(c ?? '').trim().toUpperCase().replace(/[A-Z]$/, '');

// a, b: { codici: [..], km, inizio: [lon, lat], fine: [lon, lat] }
// Stesso codice a meno di una lettera finale (536 e 536A), stessa lunghezza e partenza/arrivo scambiati (o un anello
// percorso al contrario: stessa partenza)
export function eInverso(a, b) {
  const ca = (a.codici ?? []).map(baseCodice).filter(Boolean);
  const cb = (b.codici ?? []).map(baseCodice).filter(Boolean);
  if (!ca.length || !cb.length || !ca.some((c) => cb.includes(c))) return false;
  const codiciA = (a.codici ?? []).join(' ').toUpperCase();
  const codiciB = (b.codici ?? []).join(' ').toUpperCase();
  if (codiciA === codiciB) return false; // lo stesso codice: due sentieri diversi con lo stesso nome
  if (!(a.km > 0) || !(b.km > 0) || Math.abs(a.km - b.km) / Math.max(a.km, b.km) > 0.12) return false;
  const d = (p, q) => distanzaKm(p, q) * 1000;
  const scambiati = d(a.inizio, b.fine) <= 200 && d(a.fine, b.inizio) <= 200;
  const anelli = d(a.inizio, a.fine) <= 200 && d(b.inizio, b.fine) <= 200 && d(a.inizio, b.inizio) <= 200;
  return scambiati || anelli;
}

// Dalla classifica toglie gli inversi: resta il primo (il verso migliore) con `ancheAlContrario` = il codice dell'altro
export function unisciInversi(voci, estremiDi) {
  const tenute = [];
  for (const v of voci) {
    const e = estremiDi(v);
    const gemella = e ? tenute.find((t) => t._estremi && eInverso(t._estremi, e)) : null;
    if (gemella) {
      gemella.voce.ancheAlContrario = e.codici?.join(' ') || v.sentiero?.nome || true;
      continue;
    }
    tenute.push({ voce: v, _estremi: e });
  }
  return tenute.map((t) => t.voce);
}
