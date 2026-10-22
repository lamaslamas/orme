// Confini dei parchi: costruzione del poligono dalla relazione OSM e test "punto dentro".
// Gli anelli sono liste di punti [lon, lat].
import { concatenaLinee } from './tracce.js';

// osm: { relazione } oppure { way } (alcuni parchi su OSM sono una sola linea chiusa)
export function queryConfine(osm) {
  if (typeof osm === 'number') osm = { relazione: osm };
  return osm.way ? `[out:json][timeout:90];way(${Number(osm.way)});out geom;` : `[out:json][timeout:90];rel(${Number(osm.relazione)});out geom;`;
}

// Riserva quando Overpass non risponde: l'API principale di OpenStreetMap (lettura di un solo oggetto)
export function urlApiOsm(osm) {
  return osm.way ? `https://api.openstreetmap.org/api/0.6/way/${Number(osm.way)}/full.json` : `https://api.openstreetmap.org/api/0.6/relation/${Number(osm.relazione)}/full.json`;
}
// Dalla risposta "full" dell'API (nodi, linee e relazione separati) allo stesso formato di Overpass "out geom"
export function rispostaDaApiOsm(json) {
  const nodi = new Map();
  const linee = new Map();
  for (const e of json?.elements ?? []) if (e.type === 'node') nodi.set(e.id, { lat: e.lat, lon: e.lon });
  for (const e of json?.elements ?? []) if (e.type === 'way') linee.set(e.id, (e.nodes ?? []).map((n) => nodi.get(n)).filter(Boolean));
  const rel = (json?.elements ?? []).find((e) => e.type === 'relation');
  if (rel) {
    return { elements: [{ type: 'relation', id: rel.id, members: (rel.members ?? []).map((m) => (m.type === 'way' ? { ...m, geometry: linee.get(m.ref) } : m)) }] };
  }
  const [id, geometry] = [...linee][0] ?? [];
  return { elements: geometry ? [{ type: 'way', id, geometry }] : [] };
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

// Dalla risposta Overpass (relazione o linea chiusa con "out geom") agli anelli esterni del confine.
// ruoli: con ['outer', '', 'inner'] anche i buchi (San Marino e Vaticano nel confine dell'Italia);
// puntoNelPoligono li tratta da soli con la regola pari-dispari
export function anelliDaRelazione(json, tolleranza, ruoli = ['outer', '']) {
  const linea = (json?.elements ?? []).find((e) => e.type === 'way' && Array.isArray(e.geometry));
  if (linea) {
    const anello = linea.geometry.map((p) => [p.lon, p.lat]);
    return anello.length >= 4 ? [semplifica(anello, tolleranza)] : [];
  }
  const rel = (json?.elements ?? []).find((e) => e.type === 'relation');
  if (!rel) return [];
  // esterni e buchi si uniscono ciascuno per conto suo
  const gruppi = [ruoli.filter((r) => r !== 'inner'), ruoli.filter((r) => r === 'inner')].filter((g) => g.length);
  return gruppi.flatMap((g) =>
    concatenaLinee(
      (rel.members ?? []).filter((m) => m.type === 'way' && g.includes(m.role) && Array.isArray(m.geometry)).map((m) => m.geometry.map((p) => [p.lon, p.lat])),
      5,
    )
      .filter((anello) => anello.length >= 4)
      .map((anello) => semplifica(anello, tolleranza)),
  );
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

// ---------- ritaglio di una traccia sul confine di un parco ----------

// Distanza in metri di un punto dal bordo (qualsiasi anello), con un prefiltro sul riquadro per non contare tutto
function distanzaDalBordoM([x, y], anelli, limiteM) {
  const kx = 111_320 * Math.cos((y * Math.PI) / 180);
  const ky = 110_540;
  const dLat = limiteM / ky;
  const dLon = limiteM / kx;
  let min = Infinity;
  for (const anello of anelli) {
    for (let i = 0; i < anello.length - 1; i++) {
      const [ax, ay] = anello[i];
      const [bx, by] = anello[i + 1];
      if (Math.max(ax, bx) < x - dLon || Math.min(ax, bx) > x + dLon || Math.max(ay, by) < y - dLat || Math.min(ay, by) > y + dLat) continue;
      const vx = (bx - ax) * kx;
      const vy = (by - ay) * ky;
      const l2 = vx * vx + vy * vy;
      const px = (x - ax) * kx;
      const py = (y - ay) * ky;
      const t = l2 ? Math.max(0, Math.min(1, (px * vx + py * vy) / l2)) : 0;
      min = Math.min(min, Math.hypot(px - vx * t, py - vy * t));
    }
  }
  return min;
}

// Tiene i punti dentro il parco o a meno di margineM dal suo confine; il resto si taglia in pezzi separati.
// linee: [[lon, lat]…][] → { linee, ritagliata }
export function ritagliaSulConfine(linee, anelli, margineM = 200) {
  let ritagliata = false;
  const pezzi = [];
  for (const linea of linee) {
    let attuale = [];
    for (const p of linea) {
      if (puntoNelPoligono(p, anelli) || distanzaDalBordoM(p, anelli, margineM) <= margineM) attuale.push(p);
      else {
        ritagliata = true;
        if (attuale.length > 1) pezzi.push(attuale);
        attuale = [];
      }
    }
    if (attuale.length > 1) pezzi.push(attuale);
  }
  return { linee: pezzi, ritagliata };
}

// Quanta parte (0–1) della lunghezza sta dentro il confine (conta ogni tratto dal suo punto medio)
export function quotaDentroIlConfine(linee, anelli) {
  let dentro = 0;
  let tutto = 0;
  for (const linea of linee) {
    for (let i = 0; i < linea.length - 1; i++) {
      const [a, b] = [linea[i], linea[i + 1]];
      const kx = 111_320 * Math.cos((a[1] * Math.PI) / 180);
      const m = Math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * 110_540);
      tutto += m;
      if (puntoNelPoligono([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], anelli)) dentro += m;
    }
  }
  return tutto ? dentro / tutto : 0;
}
