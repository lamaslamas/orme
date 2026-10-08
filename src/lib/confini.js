// Confini dei parchi: costruzione del poligono dalla relazione OSM e test "punto dentro".
// Gli anelli sono liste di punti [lon, lat].
import { concatenaLinee } from './tracce.js';

export function queryConfine(idRelazione) {
  return `[out:json][timeout:90];rel(${Number(idRelazione)});out geom;`;
}

// Riduce i punti di un anello tenendo la forma (Douglas-Peucker, tolleranza in gradi)
export function semplifica(punti, tolleranza = 0.0003) {
  if (punti.length < 3) return punti;
  const dist = (p, a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  const tieni = new Uint8Array(punti.length);
  tieni[0] = tieni[punti.length - 1] = 1;
  const pila = [[0, punti.length - 1]];
  while (pila.length) {
    const [i, j] = pila.pop();
    let massimo = 0;
    let indice = -1;
    for (let k = i + 1; k < j; k++) {
      const d = dist(punti[k], punti[i], punti[j]);
      if (d > massimo) {
        massimo = d;
        indice = k;
      }
    }
    if (massimo > tolleranza) {
      tieni[indice] = 1;
      pila.push([i, indice], [indice, j]);
    }
  }
  return punti.filter((_, i) => tieni[i]);
}

// Dalla risposta Overpass (relazione con "out geom") agli anelli esterni del confine
export function anelliDaRelazione(json, tolleranza) {
  const rel = (json?.elements ?? []).find((e) => e.type === 'relation');
  if (!rel) return [];
  const tratti = (rel.members ?? [])
    .filter((m) => m.type === 'way' && (m.role === 'outer' || m.role === '') && Array.isArray(m.geometry))
    .map((m) => m.geometry.map((p) => [p.lon, p.lat]));
  return concatenaLinee(tratti, 5)
    .filter((anello) => anello.length >= 4)
    .map((anello) => semplifica(anello, tolleranza));
}

// Regola pari-dispari: funziona anche con più anelli
export function puntoNelPoligono([x, y], anelli) {
  let dentro = false;
  for (const anello of anelli) {
    for (let i = 0, j = anello.length - 1; i < anello.length; j = i++) {
      const [xi, yi] = anello[i];
      const [xj, yj] = anello[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
    }
  }
  return dentro;
}

// Il parco che contiene il punto, tra quelli con il confine disponibile
export function parcoDelPunto(punto, confini) {
  for (const c of confini) {
    if (puntoNelPoligono(punto, c.anelli)) return c.parco;
  }
  return null;
}
