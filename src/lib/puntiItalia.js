// Rifugi e acqua per tutta Italia, a quadrati fissi di 0,5° (circa 55 × 42 km), un file per quadrato
// (public/dati/punti/<id>.json) più un indice. Li prepara il robot qualche quadrato per notte; il
// telefono scarica solo quelli della zona che guarda. Un quadrato troppo pesante (città piene di
// fontanelle) si divide in quattro da 0,25°.
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

// tutti i quadrati del riquadro dell'Italia (mare ed estero compresi: la richiesta è limitata
// all'Italia, quelli vuoti si segnano e si saltano)
export function quadratiItalia() {
  const ids = [];
  for (let la = Math.floor(ITALIA.sud / LATO_QUADRATO); la * LATO_QUADRATO < ITALIA.nord; la++) {
    for (let lo = Math.floor(ITALIA.ovest / LATO_QUADRATO); lo * LATO_QUADRATO < ITALIA.est; lo++) ids.push(`${la}_${lo}`);
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
export function quadratiDaFare(indice, oggi, max) {
  const prima = ZONE_PRIMA.map(([, [lat, lon]]) => idQuadrato(lon, lat));
  const giorni = (d) => (d ? (new Date(oggi) - new Date(d)) / 86_400_000 : Infinity);
  const dovuto = (id) => {
    const x = indice[id];
    if (!x) return true;
    return x.n === 0 ? giorni(x.aggiornato) >= GIORNI_VUOTO : true;
  };
  const tutti = quadratiItalia().filter(dovuto);
  const priorita = (id) => (indice[id] ? 1 : prima.includes(id) ? 0 : 1);
  return tutti
    .sort((a, b) => priorita(a) - priorita(b) || giorni(indice[b]?.aggiornato) - giorni(indice[a]?.aggiornato) || prima.indexOf(a) - prima.indexOf(b))
    .slice(0, max);
}

// richiesta Overpass per un riquadro, solo in territorio italiano (il mare e l'estero tornano vuoti)
export function queryQuadrato([s, o, n, e]) {
  const b = `(${s},${o},${n},${e})`;
  return `[out:json][timeout:180];
area["ISO3166-1"="IT"][admin_level=2]->.it;
(
nwr["tourism"~"^(wilderness_hut|alpine_hut)$"](area.it)${b};
nwr["amenity"="shelter"]["shelter_type"~"^(basic_hut|lean_to)$"](area.it)${b};
node["natural"="spring"](area.it)${b};
nwr["amenity"="drinking_water"](area.it)${b};
);
out center tags;
node["place"~"^(city|town|village|hamlet)$"](area.it)${b};
out count;`;
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
