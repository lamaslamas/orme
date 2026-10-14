// "Crea un anello": punti su un cerchio che passa per la partenza, instradati con BRouter; qui solo i
// calcoli, senza mappa né rete. Si scartano le varianti che ripassano troppo sulla stessa strada,
// quelle troppo lontane dalla lunghezza voluta e quelle che nei parchi escono dai sentieri segnati o
// passano su sentieri ad accesso regolato (chiusi, a numero chiuso, solo con guida). Fuori dai parchi
// i sentieri non segnati vanno bene, ma si evidenziano.
import { distanzaKm } from './geo.js';
import { terrenoSegnato } from './disegno.js';
import { adattoAllaFatica } from './suggerimenti.js';
import { PASSO_AVVISI_M } from './avvisiParco.js';

export const FATTORE_SENTIERI = 1.6; // i sentieri girano: il percorso è più lungo dei lati dritti
export const LUNGHEZZE = { 5: '5 km', 8: '8 km', 12: '12 km', 16: '16 km', 20: '20 km' };
// Il server pubblico di BRouter è di tutti: poche richieste, una alla volta. Ogni "Crea" prova 4
// direzioni (una ogni 90°), "Rigenera" le 4 di mezzo e poi altre ruotate; ci si ferma a 3 anelli buoni
export const DIREZIONI = 4;
export const direzioniDelGiro = (giro) => Array.from({ length: DIREZIONI }, (_, k) => (((giro % 2) * 45 + Math.floor(giro / 2) * 22.5 + k * 90) % 360));
export const MAX_SOVRAPPOSIZIONE = 0.18; // oltre il 18% di strada fatta due volte non è un anello
export const MAX_SCARTO_LUNGHEZZA = 0.35;
export const TOLLERANZA_NON_SEGNATI_M = 50; // raccordi minimi tra i sentieri segnati, nei parchi
const SENTIERI = new Set(['path', 'track', 'footway', 'bridleway', 'steps']);

const KM_GRADO = 111.32;
// punto a "km" da "da" verso "gradi" (0 = nord, in senso orario), con l'approssimazione piana
export function puntoA([lon, lat], km, gradi) {
  const a = (gradi * Math.PI) / 180;
  return [lon + (km * Math.sin(a)) / (KM_GRADO * Math.cos((lat * Math.PI) / 180)), lat + (km * Math.cos(a)) / KM_GRADO];
}

// Partenza più n punti sul cerchio che passa per la partenza, con il centro verso "gradi": un poligono
// regolare di n + 1 lati il cui perimetro, sui sentieri, fa circa lunghezzaKm. Si chiude sulla partenza.
export function puntiDellAnello(partenza, lunghezzaKm, gradi, n = 3) {
  const lati = n + 1;
  const perimetroSuRaggio = 2 * lati * Math.sin(Math.PI / lati);
  const raggio = lunghezzaKm / (FATTORE_SENTIERI * perimetroSuRaggio);
  const centro = puntoA(partenza, raggio, gradi);
  const punti = [partenza];
  for (let k = 1; k <= n; k++) punti.push(puntoA(centro, raggio, gradi + 180 + (360 * k) / lati));
  return [...punti, partenza];
}

// punti ogni passoM lungo la linea, con i metri dall'inizio
export function campiona(linea, passoM = 25) {
  const fuori = [];
  let m = 0;
  let prossimo = 0;
  for (let i = 1; i < linea.length; i++) {
    const d = distanzaKm(linea[i - 1], linea[i]) * 1000;
    while (prossimo <= m + d) {
      const t = d ? (prossimo - m) / d : 0;
      fuori.push({ m: prossimo, p: [linea[i - 1][0] + (linea[i][0] - linea[i - 1][0]) * t, linea[i - 1][1] + (linea[i][1] - linea[i - 1][1]) * t] });
      prossimo += passoM;
    }
    m += d;
  }
  return fuori;
}

// griglia per cercare i punti vicini senza confrontarli tutti (elementi con .p = [lon, lat])
export function griglia(campioni, latoM) {
  const lat0 = campioni[0]?.p[1] ?? 0;
  const kx = KM_GRADO * 1000 * Math.cos((lat0 * Math.PI) / 180);
  const ky = KM_GRADO * 1000;
  const cella = ([lon, lat]) => [Math.floor((lon * kx) / latoM), Math.floor((lat * ky) / latoM)];
  const celle = new Map();
  for (const c of campioni) {
    const [x, y] = cella(c.p);
    const k = `${x},${y}`;
    if (!celle.has(k)) celle.set(k, []);
    celle.get(k).push(c);
  }
  const vicini = (p) => {
    const [x, y] = cella(p);
    const fuori = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) fuori.push(...(celle.get(`${x + dx},${y + dy}`) ?? []));
    return fuori;
  };
  return { vicini };
}

// Quota della linea (0–1) percorsa due volte: punti che hanno, a più di staccoM lungo la linea, un
// altro punto entro vicinoM (andata e ritorno sulla stessa strada). Il gambo (primi e ultimi gamboM)
// non conta
export function sovrapposizione(linea, { passoM = 25, vicinoM = 20, staccoM = 200, gamboM = 0 } = {}) {
  const tutti = campiona(linea, passoM);
  if (tutti.length < 2) return 0;
  const totale = tutti.at(-1).m;
  const c = tutti.filter((a) => a.m > gamboM && a.m < totale - gamboM);
  if (c.length < 2) return 0;
  const g = griglia(c, vicinoM);
  // la partenza e l'arrivo coincidono: lì non conta
  const doppi = c.filter((a) =>
    g.vicini(a.p).some((b) => Math.abs(a.m - b.m) > staccoM && totale - Math.abs(a.m - b.m) > staccoM && distanzaKm(a.p, b.p) * 1000 <= vicinoM),
  );
  return doppi.length / c.length;
}

// Quota della linea b (0–1) che passa vicino alla linea a: per non proporre due anelli quasi uguali
export function quotaComune(a, b, { passoM = 50, vicinoM = 40 } = {}) {
  const ca = campiona(a, passoM);
  const cb = campiona(b, passoM);
  if (!ca.length || !cb.length) return 0;
  const g = griglia(ca, vicinoM);
  return cb.filter((x) => g.vicini(x.p).some((y) => distanzaKm(x.p, y.p) * 1000 <= vicinoM)).length / cb.length;
}

const nonSegnato = (tag) => SENTIERI.has(tag?.highway) && !terrenoSegnato(tag);

// Quota del percorso (0–1) su sentieri segnati o strade (tutto tranne i sentieri non segnati)
export function quotaSegnata(terreno) {
  const tot = terreno.reduce((s, t) => s + (t.aM - t.daM), 0);
  if (!tot) return 0;
  return 1 - terreno.filter((t) => nonSegnato(t.tag)).reduce((s, t) => s + (t.aM - t.daM), 0) / tot;
}

// Tratti su sentieri non segnati, da evidenziare: [{ daM, aM, linea }], uniti se si toccano
export function trattiNonSegnati(linea, terreno) {
  const intervalli = [];
  for (const t of terreno) {
    if (!nonSegnato(t.tag)) continue;
    const ultimo = intervalli.at(-1);
    if (ultimo && t.daM - ultimo.aM <= 1) ultimo.aM = t.aM;
    else intervalli.push({ daM: t.daM, aM: t.aM });
  }
  if (!intervalli.length) return [];
  // i metri di ogni punto della linea
  const metri = [0];
  for (let i = 1; i < linea.length; i++) metri.push(metri[i - 1] + distanzaKm(linea[i - 1], linea[i]) * 1000);
  return intervalli.map((x) => ({ ...x, linea: linea.filter((_, i) => metri[i] >= x.daM - 1 && metri[i] <= x.aM + 1).map(([lon, lat]) => [lon, lat]) })).filter((x) => x.linea.length >= 2);
}

// I tratti a rischio nei parchi (trattiARischio, in avvisiParco.js) permettono la variante?
// Mai su sentieri ad accesso regolato né a mano libera; dei non segnati in OSM valgono i punti sui
// sentieri del nostro archivio (suiSentieri), il resto solo per i raccordi minimi
export function ammessoNeiParchi(tratti, { tolleranzaM = TOLLERANZA_NON_SEGNATI_M, suiSentieri = () => false } = {}) {
  if (tratti.some((t) => t.motivo === 'regolato' || t.motivo === 'mano_libera')) return false;
  const fuori = tratti.filter((t) => t.motivo === 'non_segnato').reduce((s, t) => s + t.linea.filter((p) => !suiSentieri(p)).length * PASSO_AVVISI_M, 0);
  return fuori <= tolleranzaM;
}

// vertici: [[lon, lat]…] dei sentieri dell'archivio (senza accesso regolato) → p è su uno di loro?
export function vicinoAiSentieri(vertici, vicinoM = 40) {
  if (!vertici.length) return () => false;
  const g = griglia(vertici.map((p) => ({ p })), vicinoM);
  return (p) => g.vicini(p).some((x) => distanzaKm(p, x.p) * 1000 <= vicinoM);
}

// Il vertice di sentiero più vicino a p entro maxM, o null: nei parchi i punti dell'anello (e la
// partenza) si agganciano ai sentieri, così BRouter non è costretto a passare per i non segnati
export function agganciaAlSentiero(p, vertici, maxM = 1500) {
  let migliore = null;
  let d = maxM / 1000;
  for (const v of vertici) {
    const x = distanzaKm(p, v);
    if (x <= d) {
      d = x;
      migliore = v;
    }
  }
  return migliore ? { p: [migliore[0], migliore[1]], distanzaM: Math.round(d * 1000) } : null;
}

// v: { km, salita, durataMin, sovrapposizione, gamboM, segnata (0–1), acqua (n) }
// → null se la variante non va, altrimenti il punteggio (più alto è meglio)
export function valutaAnello(v, { volutaKm, fatica = 'media' }) {
  const scarto = Math.abs(v.km - volutaKm) / volutaKm;
  if (scarto > MAX_SCARTO_LUNGHEZZA) return null;
  const quotaGambo = (2 * (v.gamboM ?? 0)) / 1000 / v.km;
  if (quotaGambo > MAX_GAMBO) return null;
  if (v.sovrapposizione > MAX_SOVRAPPOSIZIONE) return null;
  if (!adattoAllaFatica({ salita: v.salita, durataMin: v.durataMin }, null, fatica)) return null;
  return Math.round(100 - 100 * scarto - 60 * v.sovrapposizione - 30 * quotaGambo + 20 * (v.segnata ?? 0) + 4 * Math.min(v.acqua ?? 0, 3));
}

// le migliori n varianti valide (con .punteggio e .linea), senza due quasi uguali
export function scegliAnelli(varianti, n = 3, massimoComune = 0.6) {
  const scelte = [];
  for (const v of [...varianti].filter((x) => x.punteggio != null).sort((a, b) => b.punteggio - a.punteggio)) {
    if (scelte.some((s) => quotaComune(s.linea, v.linea) > massimoComune)) continue;
    scelte.push(v);
    if (scelte.length === n) break;
  }
  return scelte;
}

// La lunghezza ottenuta corregge le prossime: media delle proporzioni voluta/ottenuta finora
export function correzioneLunghezza(ottenute, volutaKm) {
  const r = ottenute.filter((x) => x > 0).map((x) => volutaKm / x);
  if (!r.length) return 1;
  const media = r.reduce((s, x) => s + x, 0) / r.length;
  return Math.min(2, Math.max(0.5, media));
}

// "12,3 km · +640 m · 4 h 30 · 92% su sentieri segnati o strade"
export function testoQuotaSegnata(segnata) {
  return `${Math.round(segnata * 100)}% su sentieri segnati o strade`;
}

// Gambo: dalla partenza al giro e ritorno sulla stessa strada (partenza in fondo a una valle). Si
// misura a parte: non conta nella sovrapposizione, ma si mostra; andata e ritorno sul gambo non
// possono superare MAX_GAMBO del percorso
export const MAX_GAMBO = 0.4;
export function gambo(linea, { passoM = 25, vicinoM = 35, finestraM = 150 } = {}) {
  const c = campiona(linea, passoM);
  if (c.length < 3) return 0;
  const totale = c.at(-1).m;
  const g = griglia(c, vicinoM);
  let fine = 0;
  let mancati = 0; // come in senzaPunte: qualche campione senza ritorno non chiude il gambo
  for (const a of c) {
    if (a.m > totale / 2) break;
    const ritorno = g.vicini(a.p).some((b) => Math.abs(b.m - (totale - a.m)) <= finestraM && distanzaKm(a.p, b.p) * 1000 <= vicinoM);
    if (ritorno) {
      fine = a.m;
      mancati = 0;
    } else if (++mancati > 3) break;
  }
  return fine;
}

// Punte: per raggiungere un punto del giro BRouter a volte va e torna sullo stesso sentiero (il punto
// è in fondo a un sentiero cieco, a volte con un piccolo giro in cima). Per ogni punto intermedio si
// cerca la base della punta (dove andata e ritorno si separano); se la punta è lunga più di minM il
// punto si sposta alla base e si ricalcola. → nuove tappe, o null se non ci sono punte da togliere
export function senzaPunte(linea, tappe, { passoM = 25, vicinoM = 35, cimaM = 300, minM = 150 } = {}) {
  const c = campiona(linea, passoM);
  if (c.length < 3) return null;
  const totale = c.at(-1).m;
  const g = griglia(c, vicinoM);
  let cambiate = false;
  const nuove = tappe.map((t, k) => {
    if (k === 0 || k === tappe.length - 1) return t;
    // il passaggio della linea più vicino al punto
    const w = c.reduce((m, x) => (distanzaKm(t, x.p) < distanzaKm(t, m.p) ? x : m), c[0]);
    // all'indietro dal punto: finché c'è un ritorno dopo il punto, alla stessa distanza (± cimaM)
    let base = null;
    let mancati = 0; // campioni senza ritorno di fila (i punti dei due passaggi non sono allineati)
    for (let i = c.indexOf(w); i >= 0; i--) {
      const a = c[i];
      const d = w.m - a.m;
      const ritorno = g.vicini(a.p).some((b) => b.m > w.m && Math.abs(b.m - w.m - d) <= cimaM && distanzaKm(a.p, b.p) * 1000 <= vicinoM);
      if (ritorno) {
        base = a;
        mancati = 0;
      } else if ((base && ++mancati > 3) || (!base && d > cimaM)) break; // fine della punta, o nessuna punta
    }
    if (!base || w.m - base.m < minM || base.m < minM || totale - base.m < minM) return t;
    cambiate = true;
    return base.p;
  });
  return cambiate ? nuove : null;
}
