// Anelli nei parchi con i soli sentieri dell'archivio (segnati e aperti a tutti), senza BRouter: i
// sentieri diventano una rete (si spezzano dove un sentiero ne incontra un altro), e si cercano i giri
// che partono e tornano a un incrocio vicino alla partenza, con la lunghezza voluta.
import { distanzaKm } from './geo.js';
import { griglia, quotaComune } from './anello.js';

export const GIUNZIONE_M = 60; // la fine di un sentiero così vicina a un altro: si incontrano lì
export const COMUNE_M = 8; // vertici di due sentieri così vicini: tratto in comune
export const NODO_M = 120; // estremi così vicini sono lo stesso incrocio

const lunghezzaM = (linea) => linea.reduce((m, p, i) => (i ? m + distanzaKm(linea[i - 1], p) * 1000 : 0), 0);

// sentieri: [{ id, linee: [[[lon, lat]…]…] }] → { nodi: [{ id, p }], archi: [{ id, sentieri, da, a, linea, km }] }
// partenza: [lon, lat] facoltativo; gli incroci più vicini restano incroci anche con due soli rami
export function reteDeiSentieri(sentieri, { partenza = null, giunzioneM = GIUNZIONE_M, comuneM = COMUNE_M, nodoM = NODO_M } = {}) {
  const linee = [];
  for (const s of sentieri) for (const l of s.linee) if (l.length >= 2) linee.push({ sentiero: s.id, linea: l.map(([lon, lat]) => [lon, lat]) });
  const vertici = linee.flatMap((l, i) => l.linea.map((p, j) => ({ p, i, j })));
  const g = griglia(vertici, giunzioneM);
  const tagli = linee.map(() => new Set());
  // 1. la fine di una linea vicino al mezzo di un'altra (incrocio a T): l'altra si spezza lì
  linee.forEach((l, i) => {
    for (const e of [l.linea[0], l.linea.at(-1)]) {
      const migliori = new Map();
      for (const v of g.vicini(e)) {
        if (v.i === i) continue;
        const d = distanzaKm(e, v.p) * 1000;
        if (d <= giunzioneM && d < (migliori.get(v.i)?.d ?? Infinity)) migliori.set(v.i, { j: v.j, d });
      }
      for (const [k, { j }] of migliori) if (j > 0 && j < linee[k].linea.length - 1) tagli[k].add(j);
    }
  });
  // 2. tratti in comune (vertici quasi uguali): si spezza dove il tratto comincia e finisce
  linee.forEach((l, i) => {
    const comune = l.linea.map((p) => g.vicini(p).some((v) => v.i !== i && distanzaKm(p, v.p) * 1000 <= comuneM));
    comune.forEach((c, j) => {
      if (c && j > 0 && j < l.linea.length - 1 && (!comune[j - 1] || !comune[j + 1])) tagli[i].add(j);
    });
  });
  // 3. i pezzi tra un taglio e l'altro
  const pezzi = [];
  linee.forEach((l, i) => {
    const punti = [0, ...[...tagli[i]].sort((a, b) => a - b), l.linea.length - 1];
    for (let k = 1; k < punti.length; k++) {
      if (punti[k] === punti[k - 1]) continue;
      const linea = l.linea.slice(punti[k - 1], punti[k] + 1);
      pezzi.push({ sentiero: l.sentiero, linea, km: lunghezzaM(linea) / 1000 });
    }
  });
  // 4. gli incroci: estremi vicini fanno un nodo solo
  const nodi = [];
  const nodoDi = (p) => {
    let n = nodi.find((x) => distanzaKm(x.p, p) * 1000 <= nodoM);
    if (!n) nodi.push((n = { p, id: nodi.length }));
    return n.id;
  };
  const archi = [];
  for (const x of pezzi) {
    const da = nodoDi(x.linea[0]);
    const a = nodoDi(x.linea.at(-1));
    if (da === a && x.km * 1000 < nodoM * 3) continue; // pezzetto dentro un incrocio
    // tratti in comune tra due sentieri: un arco solo
    if (archi.some((y) => ((y.da === da && y.a === a) || (y.da === a && y.a === da)) && Math.abs(y.km - x.km) <= Math.max(0.05, 0.15 * x.km) && quotaComune(y.linea, x.linea) > 0.8)) continue;
    archi.push({ sentieri: [x.sentiero], da, a, linea: x.linea, km: x.km });
  }
  // 5. gli incroci con due soli rami non sono incroci (le tracce sono spesso in più pezzi): si uniscono
  const rami = new Map();
  const aggiungi = (n, x) => rami.set(n, [...(rami.get(n) ?? []), x]);
  const togli = (n, x) => rami.set(n, (rami.get(n) ?? []).filter((y) => y !== x));
  for (const x of archi) {
    aggiungi(x.da, x);
    if (x.a !== x.da) aggiungi(x.a, x);
  }
  const vivi = new Set(archi);
  const fissi = new Set(partenza ? nodiVicini({ nodi }, partenza, { n: 3 }).map((x) => x.id) : []);
  for (const [n] of rami) {
    const r = rami.get(n);
    if (r.length !== 2 || fissi.has(n)) continue;
    const [x, y] = r;
    if (x.da === x.a || y.da === y.a) continue;
    // x che finisce in n, y che parte da n
    const lx = x.a === n ? x.linea : [...x.linea].reverse();
    const ly = y.da === n ? y.linea : [...y.linea].reverse();
    const da = x.a === n ? x.da : x.a;
    const a = y.da === n ? y.a : y.da;
    const unito = { sentieri: [...new Set([...x.sentieri, ...y.sentieri])], da, a, linea: [...lx, ...ly.slice(1)], km: x.km + y.km };
    for (const z of [x, y]) {
      vivi.delete(z);
      togli(z.da, z);
      togli(z.a, z);
    }
    rami.delete(n);
    vivi.add(unito);
    aggiungi(da, unito);
    if (a !== da) aggiungi(a, unito);
  }
  const usati = new Set([...vivi].flatMap((x) => [x.da, x.a]));
  return { nodi: nodi.filter((x) => usati.has(x.id)), archi: [...vivi].map((x, id) => ({ ...x, id })) };
}

// Giri semplici (nessun incrocio ripetuto) da "partenza" (id del nodo) che tornano lì, lunghi tra
// minKm e maxKm. → [{ archi: [{ id, inverso }], km }], ognuno una volta sola (non anche al contrario)
export function anelliNellaRete(rete, partenza, { minKm, maxKm, maxArchi = 10, maxPassi = 200_000, maxRisultati = 300 } = {}) {
  const uscenti = new Map();
  for (const x of rete.archi) {
    for (const [da, a, inverso] of [
      [x.da, x.a, false],
      [x.a, x.da, true],
    ]) {
      if (!uscenti.has(da)) uscenti.set(da, []);
      uscenti.get(da).push({ x, a, inverso });
      if (x.da === x.a) break; // un sentiero ad anello: una volta sola
    }
  }
  const trovati = new Map();
  const percorso = [];
  const visti = new Set([partenza]);
  let passi = 0;
  (function cerca(nodo, km) {
    if (++passi > maxPassi || trovati.size >= maxRisultati) return;
    for (const { x, a, inverso } of uscenti.get(nodo) ?? []) {
      if (percorso.some((y) => y.id === x.id)) continue;
      const nuovo = km + x.km;
      if (nuovo > maxKm) continue;
      if (a === partenza) {
        if (nuovo >= minKm) {
          const giro = [...percorso, { id: x.id, inverso }];
          const chiave = giro.map((y) => y.id).sort((p, q) => p - q).join(',');
          if (!trovati.has(chiave)) trovati.set(chiave, { archi: giro, km: nuovo });
        }
        continue;
      }
      if (visti.has(a) || percorso.length + 1 >= maxArchi) continue;
      visti.add(a);
      percorso.push({ id: x.id, inverso });
      cerca(a, nuovo);
      percorso.pop();
      visti.delete(a);
    }
  })(partenza, 0);
  return [...trovati.values()];
}

// Distanze sulla rete dal nodo "da" (Dijkstra): Map nodo → { km, arco, inverso, prima }
export function distanzeDa(rete, da) {
  const vicini = new Map();
  for (const x of rete.archi) {
    if (x.da === x.a) continue;
    vicini.set(x.da, [...(vicini.get(x.da) ?? []), { x, a: x.a, inverso: false }]);
    vicini.set(x.a, [...(vicini.get(x.a) ?? []), { x, a: x.da, inverso: true }]);
  }
  const fuori = new Map([[da, { km: 0, arco: null, inverso: false, prima: null }]]);
  const fatti = new Set();
  for (;;) {
    let n = null;
    for (const [k, v] of fuori) if (!fatti.has(k) && (n === null || v.km < fuori.get(n).km)) n = k;
    if (n === null) break;
    fatti.add(n);
    for (const { x, a, inverso } of vicini.get(n) ?? []) {
      const km = fuori.get(n).km + x.km;
      if (km < (fuori.get(a)?.km ?? Infinity)) fuori.set(a, { km, arco: x.id, inverso, prima: n });
    }
  }
  return fuori;
}

// Giri dalla partenza: anelli che passano dalla partenza e "lecca-lecca", cioè un gambo fino a un
// incrocio vicino (al massimo maxGamboKm), il giro da lì e lo stesso gambo al ritorno.
// → [{ archi, km, gamboKm }]
export function giriDallaPartenza(rete, partenza, { minKm, maxKm, maxGamboKm = 0, maxNodi = 12 } = {}) {
  const distanze = distanzeDa(rete, partenza);
  const fuori = [];
  const visti = new Set();
  const nodi = [...distanze.entries()].filter(([, d]) => d.km <= maxGamboKm).sort((a, b) => a[1].km - b[1].km).slice(0, maxNodi);
  for (const [nodo, d] of nodi) {
    // il gambo: gli archi dalla partenza al nodo
    const gambo = [];
    for (let n = nodo; distanze.get(n).prima !== null; n = distanze.get(n).prima) gambo.unshift({ id: distanze.get(n).arco, inverso: distanze.get(n).inverso });
    const usati = new Set(gambo.map((x) => x.id));
    for (const giro of anelliNellaRete(rete, nodo, { minKm: minKm - 2 * d.km, maxKm: maxKm - 2 * d.km })) {
      if (giro.archi.some((x) => usati.has(x.id))) continue; // il giro non riusa il gambo
      const chiave = giro.archi.map((x) => x.id).sort((p, q) => p - q).join(',');
      if (visti.has(chiave)) continue;
      visti.add(chiave);
      const ritorno = [...gambo].reverse().map((x) => ({ id: x.id, inverso: !x.inverso }));
      fuori.push({ archi: [...gambo, ...giro.archi, ...ritorno], km: giro.km + 2 * d.km, gamboKm: d.km });
    }
  }
  return fuori;
}

// la linea del giro, con gli archi nel verso giusto
export function lineaDelGiro(rete, giro) {
  const linea = [];
  for (const { id, inverso } of giro.archi) {
    const l = rete.archi[id].linea;
    const pezzo = inverso ? [...l].reverse() : l;
    linea.push(...(linea.length ? pezzo.slice(1) : pezzo));
  }
  return linea;
}

// i sentieri usati, nell'ordine e senza ripetizioni
export const sentieriDelGiro = (rete, giro) => [...new Set(giro.archi.flatMap(({ id }) => rete.archi[id].sentieri))];

// gli incroci più vicini a p (fino a n, entro maxM), con la distanza
export function nodiVicini(rete, p, { n = 3, maxM = 2000 } = {}) {
  return rete.nodi
    .map((x) => ({ ...x, distanzaM: Math.round(distanzaKm(p, x.p) * 1000) }))
    .filter((x) => x.distanzaM <= maxM)
    .sort((a, b) => a.distanzaM - b.distanzaM)
    .slice(0, n);
}

// Punti per "Modifica nel disegno": uno ogni ogniKm lungo la linea (più partenza e arrivo), così
// BRouter, tra punti vicini, segue gli stessi sentieri
export function puntiLungo(linea, ogniKm = 0.8) {
  const fuori = [linea[0]];
  let km = 0;
  let prossimo = ogniKm;
  for (let i = 1; i < linea.length; i++) {
    km += distanzaKm(linea[i - 1], linea[i]);
    if (km >= prossimo) {
      fuori.push(linea[i]);
      prossimo = km + ogniKm;
    }
  }
  if (fuori.at(-1) !== linea.at(-1)) fuori.push(linea.at(-1));
  return fuori.map(([lon, lat]) => [lon, lat]);
}
