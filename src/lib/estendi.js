// "Estendi": a un percorso si aggiungono i sentieri collegati, nel punto di contatto. Il percorso di lavoro è una
// lista di tratti in ordine di marcia: { parte, contro, linea }. «parte» dice da quale sentiero viene il tratto,
// «contro» se lo si percorre al contrario del verso consigliato (quello dell'archivio, se c'è).
// Contatto: un estremo del percorso o del candidato a meno di 50 m dall'altro, oppure un incrocio lungo la traccia.
import { distanzaKm, lunghezzaKm } from './geo.js';
import { percorsoSentiero, invertiPercorso, tracciaDaNonUsare } from './tracce.js';
import { stimaDurataMin } from './durata.js';
import { versoDi } from './verso.js';
import { codici } from './formato.js';

export const RAGGIO_CONTATTO_M = 50;
export const MIN_RAMO_M = 100; // un ramo più corto non vale la pena: non si propone
export const SOGLIA_SOVRAPPOSIZIONE_M = 150; // oltre, i due sentieri vanno insieme per un pezzo
const PASSO_M = 10;

const distanzaM = (a, b) => distanzaKm(a, b) * 1000;
const invertiLinea = (l) => [...l].reverse();
export const kmDeiTratti = (tratti) => lunghezzaKm({ coordinates: tratti.map((t) => t.linea) });

// pezzi (da percorsoSentiero) → tratti di una stessa parte
export const trattiDaPezzi = (pezzi, parte, contro = false) => pezzi.filter((l) => l?.length > 1).map((linea) => ({ parte, contro, linea }));

export const invertiTratti = (tratti) => [...tratti].reverse().map((t) => ({ ...t, contro: !t.contro, linea: invertiLinea(t.linea) }));

// Il percorso di un sentiero o di un percorso mio nel verso scelto («Inverti senso», o quello dell'archivio)
export function pezziNelVerso(geojson, id, sentiero = null) {
  const p = percorsoSentiero(geojson);
  return (versoDi(sentiero ?? { id }) ? invertiPercorso(p) : p).pezzi;
}

// ---------- geometria ----------

function proiezione(lat0) {
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  return ([lon, lat]) => [lon * kx, lat * 110_540];
}

// Punti a passo regolare lungo i tratti: { x, y, p, i (tratto), j (segmento), t }
function campiona(tratti, xy, passoM = PASSO_M) {
  const out = [];
  tratti.forEach((tr, i) => {
    const l = tr.linea;
    for (let j = 0; j < l.length - 1; j++) {
      const n = Math.max(1, Math.ceil(distanzaM(l[j], l[j + 1]) / passoM));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const p = [l[j][0] + (l[j + 1][0] - l[j][0]) * t, l[j][1] + (l[j + 1][1] - l[j][1]) * t];
        const [x, y] = xy(p);
        out.push({ x, y, p, i, j, t });
      }
    }
    const ult = l[l.length - 1];
    const [x, y] = xy(ult);
    out.push({ x, y, p: ult, i, j: l.length - 2, t: 1 });
  });
  return out;
}

// il punto del taglio, con la quota interpolata se c'è
function puntoTaglio(l, j, t) {
  const a = l[j];
  const b = l[j + 1];
  const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  if (Number.isFinite(a[2]) && Number.isFinite(b[2])) p.push(a[2] + (b[2] - a[2]) * t);
  return p;
}

// Divide i tratti nel punto (i, j, t): { prima, dopo }, entrambi in ordine di marcia, e il punto
export function tagliaTratti(tratti, { i, j, t }) {
  const tr = tratti[i];
  const punto = puntoTaglio(tr.linea, j, t);
  const sopra = [...tr.linea.slice(0, j + 1), punto];
  const sotto = [punto, ...tr.linea.slice(j + 1)];
  const valido = (l) => l.length > 1 && lunghezzaKm({ coordinates: [l] }) > 0.0005; // niente pezzi di mezzo metro
  return {
    punto,
    prima: [...tratti.slice(0, i), ...(valido(sopra) ? [{ ...tr, linea: sopra }] : [])],
    dopo: [...(valido(sotto) ? [{ ...tr, linea: sotto }] : []), ...tratti.slice(i + 1)],
  };
}

function griglia(campioni, latoM = RAGGIO_CONTATTO_M) {
  const g = new Map();
  campioni.forEach((c, k) => {
    const chiave = `${Math.floor(c.x / latoM)},${Math.floor(c.y / latoM)}`;
    if (!g.has(chiave)) g.set(chiave, []);
    g.get(chiave).push(k);
  });
  return g;
}
function piuVicino(g, campioni, c, latoM = RAGGIO_CONTATTO_M, raggioM = RAGGIO_CONTATTO_M) {
  const cx = Math.floor(c.x / latoM);
  const cy = Math.floor(c.y / latoM);
  let migliore = null;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (const k of g.get(`${cx + dx},${cy + dy}`) ?? []) {
        const d = Math.hypot(campioni[k].x - c.x, campioni[k].y - c.y);
        if (d <= raggioM && (!migliore || d < migliore.d)) migliore = { k, d };
      }
    }
  }
  return migliore;
}

// riquadro [minLon, minLat, maxLon, maxLat] di un insieme di linee
export function riquadro(linee) {
  const r = [Infinity, Infinity, -Infinity, -Infinity];
  for (const l of linee) for (const [lon, lat] of l) (r[0] = Math.min(r[0], lon)), (r[1] = Math.min(r[1], lat)), (r[2] = Math.max(r[2], lon)), (r[3] = Math.max(r[3], lat));
  return r;
}
const intersecano = (a, b, margineGradi) => a[0] <= b[2] + margineGradi && a[2] >= b[0] - margineGradi && a[1] <= b[3] + margineGradi && a[3] >= b[1] - margineGradi;

// ---------- contatti ----------

// percorso: tratti; candidato: pezzi nel suo verso → contatti [{ punto, dM, rami: [{ lato, tratti }] }]
// Un ramo parte dal contatto e va verso la fine ('dopo') o verso l'inizio ('prima', percorso al contrario) del candidato.
export function trovaContatti(percorso, candidato, parteCandidato = 'candidato') {
  const lat0 = percorso[0]?.linea[0]?.[1] ?? 0;
  const xy = proiezione(lat0);
  const mie = campiona(percorso, xy);
  const g = griglia(mie);
  const tCand = trattiDaPezzi(candidato, parteCandidato);
  const loro = campiona(tCand, xy);
  if (!loro.length || !mie.length) return [];

  // distanza progressiva lungo il candidato
  const arco = [0];
  for (let k = 1; k < loro.length; k++) arco.push(arco[k - 1] + Math.hypot(loro[k].x - loro[k - 1].x, loro[k].y - loro[k - 1].y));
  const totale = arco.at(-1);
  const vicino = loro.map((c) => piuVicino(g, mie, c));

  const contatti = [];
  const ramo = (k, lato) => {
    const taglio = tagliaTratti(tCand, loro[k]);
    if (lato === 'dopo') return { lato, tratti: taglio.dopo, km: kmDeiTratti(taglio.dopo) };
    const t = invertiTratti(taglio.prima);
    return { lato, tratti: t, km: kmDeiTratti(t) };
  };
  const aggiungi = (k, lati) => {
    const rami = lati.filter((lato) => (lato === 'dopo' ? totale - arco[k] : arco[k]) >= MIN_RAMO_M).map((lato) => ramo(k, lato));
    if (rami.length) contatti.push({ punto: loro[k].p, dM: vicino[k].d, r: mie[vicino[k].k], posCand: loro[k], rami });
  };

  let k = 0;
  while (k < loro.length) {
    if (!vicino[k]) {
      k++;
      continue;
    }
    let fine = k;
    while (fine + 1 < loro.length && vicino[fine + 1]) fine++;
    let migliore = k;
    for (let h = k; h <= fine; h++) if (vicino[h].d < vicino[migliore].d) migliore = h;
    if (arco[fine] - arco[k] <= SOGLIA_SOVRAPPOSIZIONE_M) aggiungi(migliore, ['dopo', 'prima']);
    else {
      aggiungi(k, ['prima']); // i due sentieri vanno insieme: dal capo dell'incontro si esce da una parte...
      aggiungi(fine, ['dopo']); // ...e dall'altro capo dall'altra
    }
    k = fine + 1;
  }
  return contatti;
}

// ---------- aggiungere un ramo ----------

// Le scelte possibili per un contatto: il ramo si attacca dove il percorso è stato toccato, e del percorso si tiene
// la parte dalla partenza (la coda si taglia) oppure quella verso l'arrivo (la testa si taglia).
// → [{ id, lato, ramo, tieni: 'inizio' | 'fine', tratti, aggiuntiKm, tagliatiKm }]
export function opzioniAggiunta(percorso, contatto) {
  const taglio = tagliaTratti(percorso, contatto.r);
  const prima = kmDeiTratti(taglio.prima) * 1000;
  const dopo = kmDeiTratti(taglio.dopo) * 1000;
  const raccordo = (da, a, parte, contro) => (distanzaM(da, a) > 1 ? [{ parte, contro, linea: [da, a] }] : []);
  const opzioni = [];
  for (const ramo of contatto.rami) {
    const inizioRamo = ramo.tratti[0].linea[0];
    const parte = ramo.tratti[0].parte;
    if (prima >= MIN_RAMO_M) {
      const tratti = [...taglio.prima, ...raccordo(taglio.punto, inizioRamo, parte, ramo.tratti[0].contro), ...ramo.tratti];
      opzioni.push({ id: `${ramo.lato}-inizio`, lato: ramo.lato, ramo, tieni: 'inizio', tratti, aggiuntiKm: ramo.km, tagliatiKm: dopo / 1000 });
    }
    if (dopo >= MIN_RAMO_M) {
      const rovescio = invertiTratti(ramo.tratti);
      const fineRamo = rovescio.at(-1).linea.at(-1);
      const tratti = [...rovescio, ...raccordo(fineRamo, taglio.punto, parte, rovescio.at(-1).contro), ...taglio.dopo];
      opzioni.push({ id: `${ramo.lato}-fine`, lato: ramo.lato, ramo, tieni: 'fine', tratti, aggiuntiKm: ramo.km, tagliatiKm: prima / 1000 });
    }
  }
  return opzioni;
}

// ---------- candidati ----------

const riquadriTracce = new WeakMap();
const riquadroDi = (geojson) => {
  let r = riquadriTracce.get(geojson);
  if (!r) riquadriTracce.set(geojson, (r = riquadro(geojson.coordinates ?? [])));
  return r;
};

// elenco: sentieri; tracce: Map id → traccia. Esclusi: già nel percorso, tracce incomplete o da non usare, reti di sentieri
// e uscite guidate (come in Suggerisci). → [{ sentiero, pezzi, contatti }] solo con almeno un contatto
export function candidatiEstendi(percorso, elenco, tracce, { esclusi = new Set() } = {}) {
  if (!percorso.length) return [];
  const r = riquadro(percorso.map((t) => t.linea));
  const margine = 0.0008; // circa 90 m
  const trovati = [];
  for (const s of elenco) {
    if (esclusi.has(s.id) || ['rete_sentieri', 'uscita_guidata'].includes(s.tipoPercorso)) continue;
    const traccia = tracce.get(s.id);
    if (!traccia?.geojson?.coordinates?.length) continue;
    if (!intersecano(riquadroDi(traccia.geojson), r, margine)) continue;
    if (tracciaDaNonUsare(s, traccia).incompleta) continue;
    const pezzi = pezziNelVerso(traccia.geojson, s.id, s);
    const contatti = trovaContatti(percorso, pezzi, s.id);
    if (contatti.length) trovati.push({ sentiero: s, pezzi, contatti });
  }
  return trovati;
}

// ---------- descrizione ----------

// Le parti del percorso in ordine, con i km e se vanno al contrario del verso consigliato
export function raggruppaParti(tratti) {
  const parti = [];
  for (const t of tratti) {
    const ultima = parti.at(-1);
    const km = kmDeiTratti([t]);
    if (ultima && ultima.parte === t.parte && ultima.contro === t.contro) ultima.km += km;
    else parti.push({ parte: t.parte, contro: t.contro, km });
  }
  return parti;
}

export const geojsonDaTratti = (tratti) => ({ type: 'MultiLineString', coordinates: tratti.map((t) => t.linea) });

// Il nome proposto: «713 + 709» (i codici, o il nome se manca)
export function nomeProposto(parti, etichette) {
  const visti = [];
  for (const p of parti) {
    const e = etichette[p.parte];
    if (e && !visti.includes(e)) visti.push(e);
  }
  return visti.join(' + ');
}
export const etichettaSentiero = (s) => (s.codici?.length ? codici(s) : s.nome);

// Dislivello stimato in proporzione ai km di ogni parte (finché non arrivano le quote del percorso intero).
// rif: { [parte]: { km, salita, discesa } } nel verso consigliato; al contrario salita e discesa si scambiano.
export function stimaDislivello(parti, rif) {
  let salita = 0;
  let discesa = 0;
  for (const p of parti) {
    const r = rif[p.parte];
    if (!r || !Number.isFinite(r.salita) || !Number.isFinite(r.discesa) || !(r.km > 0)) return null;
    const f = Math.min(1, p.km / r.km);
    salita += (p.contro ? r.discesa : r.salita) * f;
    discesa += (p.contro ? r.salita : r.discesa) * f;
  }
  return { salita: Math.round(salita), discesa: Math.round(discesa) };
}

export function totali(tratti, disl) {
  const km = kmDeiTratti(tratti);
  return { km, salita: disl?.salita ?? null, discesa: disl?.discesa ?? null, durataMin: stimaDurataMin(km, disl) };
}
