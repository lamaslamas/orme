// Rifugi e acqua per tutta Italia, a quadrati fissi di 0,5° (circa 55 × 42 km), un file per quadrato
// (public/dati/punti/<id>.json) più un indice. Li prepara il robot qualche quadrato per notte; il
// telefono scarica solo quelli della zona che guarda. Un quadrato troppo pesante (città piene di
// fontanelle) si divide in quattro da 0,25°.
import { puntoNelPoligono } from './confini.js';

export const LATO_QUADRATO = 0.5;
export const ITALIA = { sud: 35.0, nord: 47.5, ovest: 6.5, est: 19.0 };
export const PESO_MASSIMO = 300_000; // byte del file di un quadrato prima di dividerlo
export const GIORNI_VUOTO = 90; // un quadrato senza punti (mare, estero) si ricontrolla ogni 3 mesi

// id del quadrato che contiene [lon, lat]: "83_27" = da 41,5° N e 13,5° E
export function idQuadrato(lon, lat) {
  return `${Math.floor(lat / LATO_QUADRATO)}_${Math.floor(lon / LATO_QUADRATO)}`;
}

// riquadro [sud, ovest, nord, est] di un quadrato o di un suo quarto ("83_27-b": a = sud-ovest,
// b = sud-est, c = nord-ovest, d = nord-est)
export function riquadroQuadrato(id) {
  const [base, quarto] = id.split('-');
  const [la, lo] = base.split('_').map(Number);
  let [s, o] = [la * LATO_QUADRATO, lo * LATO_QUADRATO];
  let lato = LATO_QUADRATO;
  if (quarto) {
    lato /= 2;
    if (quarto === 'b' || quarto === 'd') o += lato;
    if (quarto === 'c' || quarto === 'd') s += lato;
  }
  return [s, o, s + lato, o + lato];
}
export const quartiDi = (id) => ['a', 'b', 'c', 'd'].map((q) => `${id}-${q}`);

// Il quadrato tocca il confine dell'Italia? (anelli [lon, lat]): vero se un vertice del confine cade nel
// quadrato, se un lato del confine ne attraversa un bordo, o se il quadrato sta tutto dentro l'Italia.
// Serve a non interrogare Overpass per il mare aperto e per i paesi vicini.
export function quadratoTocca(id, anelli) {
  const [s, o, n, e] = riquadroQuadrato(id);
  const lati = [[[o, s], [e, s]], [[e, s], [e, n]], [[e, n], [o, n]], [[o, n], [o, s]]];
  const orient = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  const siIncrociano = ([a, b], [c, d]) => orient(a, b, c) !== orient(a, b, d) && orient(c, d, a) !== orient(c, d, b);
  const nelQuadrato = ([x, y]) => x >= o && x <= e && y >= s && y <= n;
  for (const anello of anelli) {
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of anello) [minX, minY, maxX, maxY] = [Math.min(minX, x), Math.min(minY, y), Math.max(maxX, x), Math.max(maxY, y)];
    if (maxX < o || minX > e || maxY < s || minY > n) continue; // lontano
    for (let i = 0; i < anello.length - 1; i++) {
      if (nelQuadrato(anello[i])) return true;
      const lato = [anello[i], anello[i + 1]];
      if (lati.some((l) => siIncrociano(lato, l))) return true;
    }
  }
  return puntoNelPoligono([(o + e) / 2, (s + n) / 2], anelli);
}

// tutti i quadrati del riquadro dell'Italia; con il confine (anelli) solo quelli che lo toccano: il
// mare aperto, l'Africa e gli altri paesi non si interrogano
export function quadratiItalia(anelli = null) {
  const ids = [];
  for (let la = Math.floor(ITALIA.sud / LATO_QUADRATO); la * LATO_QUADRATO < ITALIA.nord; la++) {
    for (let lo = Math.floor(ITALIA.ovest / LATO_QUADRATO); lo * LATO_QUADRATO < ITALIA.est; lo++) {
      const id = `${la}_${lo}`;
      if (!anelli || quadratoTocca(id, anelli)) ids.push(id);
    }
  }
  return ids;
}

// zone da fare per prime: i parchi del Sud e quelli dell'archivio
export const ZONE_PRIMA = [
  ['Pollino', [39.75, 16.1]],
  ['Salento', [40.2, 18.2]],
  ['Salento sud', [39.95, 18.3]],
  ['Cilento', [40.25, 15.3]],
  ['Sila', [39.3, 16.55]],
  ['Aspromonte', [38.15, 15.9]],
  ['Gargano', [41.8, 15.9]],
  ['Alta Murgia', [40.95, 16.4]],
  ['Majella', [42.1, 14.1]],
  ['Appennino Lucano', [40.35, 15.85]],
  ['PNALM', [41.8, 13.85]],
];

// ordine del giro: prima le zone prioritarie mai fatte, poi i quadrati dal più vecchio (mai fatti
// prima di tutti); i vuoti solo se è passato il loro tempo. indice: { id: { aggiornato, n } }
export function quadratiDaFare(indice, oggi, max, anelli = null) {
  const prima = ZONE_PRIMA.map(([, [lat, lon]]) => idQuadrato(lon, lat));
  const giorni = (d) => (d ? (new Date(oggi) - new Date(d)) / 86_400_000 : Infinity);
  const dovuto = (id) => {
    const x = indice[id];
    if (!x) return true;
    return x.n === 0 ? giorni(x.aggiornato) >= GIORNI_VUOTO : true;
  };
  const tutti = quadratiItalia(anelli).filter(dovuto);
  // prima i quadrati da riprovare (errore o calo sospetto la notte prima), poi le zone prioritarie mai fatte
  const priorita = (id) => (indice[id]?.calo || indice[id]?.errore ? -1 : indice[id] ? 1 : prima.includes(id) ? 0 : 1);
  return tutti
    .sort((a, b) => priorita(a) - priorita(b) || giorni(indice[b]?.aggiornato) - giorni(indice[a]?.aggiornato) || prima.indexOf(a) - prima.indexOf(b))
    .slice(0, max);
}

// richiesta Overpass per il solo rettangolo del quadrato (senza il filtro per area, molto più
// lento sui server): i punti all'estero si scartano dopo, con il confine salvato (soloInItalia)
export function queryQuadrato([s, o, n, e]) {
  const b = `(${s},${o},${n},${e})`;
  return `[out:json][timeout:180];
(
nwr["tourism"~"^(wilderness_hut|alpine_hut)$"]${b};
nwr["amenity"="shelter"]["shelter_type"~"^(basic_hut|lean_to)$"]${b};
node["natural"="spring"]${b};
nwr["amenity"="drinking_water"]${b};
);
out center tags;
node["place"~"^(city|town|village|hamlet)$"]${b};
out count;`;
}

// Solo i punti dentro il confine dell'Italia (anelli [lon, lat], buchi compresi). Il rettangolo di
// ogni anello evita il conto completo per i punti lontani
export function soloInItalia(punti, anelli) {
  const conRiquadro = anelli.map((a) => {
    let [o, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of a) [o, s, e, n] = [Math.min(o, x), Math.min(s, y), Math.max(e, x), Math.max(n, y)];
    return { a, o, s, e, n };
  });
  return punti.filter((p) => {
    const vicini = conRiquadro.filter((r) => p.lon >= r.o && p.lon <= r.e && p.lat >= r.s && p.lat <= r.n).map((r) => r.a);
    return vicini.length > 0 && puntoNelPoligono([p.lon, p.lat], vicini);
  });
}

// Abitati contati nella risposta (out count): un quadrato con paesi ma senza punti è una risposta
// incompleta di Overpass, non un quadrato di mare
export function abitatiNellaRisposta(json) {
  const c = (json?.elements ?? []).find((e) => e.type === 'count');
  return Number(c?.tags?.nodes ?? c?.tags?.total ?? 0) || 0;
}

// quadrati da caricare per una vista [sud, ovest, nord, est] (al massimo `max`), con i loro quarti
// se l'indice dice che sono divisi
export function fileDellaVista([s, o, n, e], indice, max = 6) {
  const ids = [];
  for (let la = Math.floor(s / LATO_QUADRATO); la * LATO_QUADRATO < n; la++) {
    for (let lo = Math.floor(o / LATO_QUADRATO); lo * LATO_QUADRATO < e; lo++) {
      const id = `${la}_${lo}`;
      const x = indice?.[id];
      if (!x || !x.n) continue;
      if (x.quarti) ids.push(...quartiDi(id).filter((q) => intersecano(riquadroQuadrato(q), [s, o, n, e])));
      else ids.push(id);
      if (ids.length > max) return [];
    }
  }
  return ids;
}
const intersecano = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

// Protezione dai cali improvvisi: se un quadrato già salvato perde più del 30% dei punti si tiene il
// file vecchio e si riprova; se il calo si ripete per 3 notti di fila si accetta (può essere una
// modifica vera su OSM). calo: { volte, ultima } dalla notte prima (o null).
export const CALO_MASSIMO = 0.3;
export const NOTTI_CALO = 3;
export function valutaCalo(primaN, nuovoN, calo, oggi) {
  if (!primaN || nuovoN >= primaN * (1 - CALO_MASSIMO)) return { accetta: true, calo: null };
  const giorni = calo?.ultima ? (new Date(oggi) - new Date(calo.ultima)) / 86_400_000 : Infinity;
  // "di fila": la notte prima (o al più due notti prima, se un giro è saltato)
  const volte = giorni >= 1 && giorni <= 2 ? calo.volte + 1 : giorni < 1 ? calo.volte : 1;
  if (volte >= NOTTI_CALO) return { accetta: true, calo: null, accettato: true };
  return { accetta: false, calo: { volte, ultima: oggi, da: primaN, a: nuovoN } };
}
