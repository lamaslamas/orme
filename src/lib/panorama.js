// Indice panoramico di Orme: stima da 0 a 100 di quanto un percorso è panoramico.
// Versione 1 ("preliminare"): orizzonte stimato dal modello del terreno lungo 16 direzioni,
// bosco (ESA WorldCover), belvedere e vette di OpenStreetMap, laghi e vette visibili
// (linea di vista sul terreno). È predisposta per la versione 2 ("viewshed"): stessi criteri,
// stessi campioni ogni 100 m, cambia solo il modo di stimare la visuale di ogni punto.
// Le funzioni ricevono quota(lon, lat) e bosco(lon, lat) dall'esterno: qui niente rete.
import { percorsoSentiero } from './tracce.js';
import { distanzaKm } from './geo.js';

// 1 = stima preliminare (orizzonte dalla forma del terreno), 2 = analisi di visibilità (viewshed)
export const VERSIONE_PANORAMA = 2;
// cambia quando si ritocca la taratura: l'archivio si ricalcola da solo
export const TARATURA_PANORAMA = 2;

// Impronta della traccia: l'indice si ricalcola solo se cambia. Serve anche all'app
// per sapere se l'indice è stato calcolato proprio sulla traccia che sto guardando.
export function improntaTraccia(geojson) {
  let h = 2166136261;
  for (const c of JSON.stringify(geojson?.coordinates ?? [])) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return `${VERSIONE_PANORAMA}.${TARATURA_PANORAMA}-${(h >>> 0).toString(36)}`;
}
export const PASSO_M = 100;

export const PESI = { orizzonte: 0.3, belvedere: 0.25, varieta: 0.2, elementi: 0.15, apertura: 0.1 };

export const NOMI_CRITERI = {
  orizzonte: 'Ampiezza della visuale e orizzonte',
  belvedere: 'Punti panoramici',
  varieta: 'Varietà del paesaggio',
  elementi: 'Vette e laghi visibili',
  apertura: 'Tratti con visuale aperta',
};

const DIREZIONI = 16;
const DISTANZE_M = [250, 500, 1000, 1500, 2500, 4000, 6000];
const ALTEZZA_OCCHI_M = 1.7;
// angolo dell'orizzonte: sotto 0° la vista è del tutto aperta, da 12° in su è chiusa
const ANGOLO_APERTO = 0;
const ANGOLO_CHIUSO = 12;
// nel bosco la vista è in gran parte coperta dagli alberi
const FATTORE_BOSCO = 0.3;
const RAGGIO_BELVEDERE_KM = 0.2;
const RAGGIO_VETTA_RAGGIUNTA_KM = 0.1;
const RAGGIO_ELEMENTI_KM = 6;

const rad = (g) => (g * Math.PI) / 180;

// Punto a "metri" di distanza in direzione "gradi" (approssimazione piana, va bene entro 10 km)
export function spostaPunto([lon, lat], metri, gradi) {
  const dLat = (metri * Math.cos(rad(gradi))) / 111_320;
  const dLon = (metri * Math.sin(rad(gradi))) / (111_320 * Math.cos(rad(lat)));
  return [lon + dLon, lat + dLat];
}

// Un punto ogni PASSO_M lungo i pezzi del percorso, con la distanza progressiva in km.
// Lo stesso campionamento si usa nell'app per colorare i tratti: deve restare identico.
export function campionaPercorso(geojson, passoM = PASSO_M) {
  const { pezzi } = percorsoSentiero(geojson);
  const punti = [];
  let km = 0;
  let prossimo = 0;
  for (const pezzo of pezzi) {
    for (let i = 0; i < pezzo.length; i++) {
      if (i > 0) {
        const tratto = distanzaKm(pezzo[i - 1], pezzo[i]);
        // punti intermedi lungo il segmento
        while (prossimo <= km + tratto) {
          const t = tratto ? (prossimo - km) / tratto : 0;
          punti.push({ lon: pezzo[i - 1][0] + t * (pezzo[i][0] - pezzo[i - 1][0]), lat: pezzo[i - 1][1] + t * (pezzo[i][1] - pezzo[i - 1][1]), km: prossimo });
          prossimo += passoM / 1000;
        }
        km += tratto;
      } else if (!punti.length) {
        punti.push({ lon: pezzo[0][0], lat: pezzo[0][1], km: 0 });
        prossimo = passoM / 1000;
      }
    }
  }
  // anche l'arrivo, se l'ultimo campione è lontano più di 30 m
  const fine = pezzi.at(-1)?.at(-1);
  if (fine && punti.length && km - punti.at(-1).km > 0.03) punti.push({ lon: fine[0], lat: fine[1], km });
  return punti;
}

// Apertura dell'orizzonte in un punto (0 = chiuso, 1 = aperto in tutte le direzioni)
export function aperturaOrizzonte(punto, quota) {
  const h0 = quota(punto.lon, punto.lat);
  if (h0 == null) return null;
  let somma = 0;
  for (let d = 0; d < DIREZIONI; d++) {
    let massimo = -90;
    for (const m of DISTANZE_M) {
      const [lon, lat] = spostaPunto([punto.lon, punto.lat], m, (360 / DIREZIONI) * d);
      const h = quota(lon, lat);
      if (h == null) continue;
      massimo = Math.max(massimo, (Math.atan2(h - h0 - ALTEZZA_OCCHI_M, m) * 180) / Math.PI);
    }
    somma += Math.min(1, Math.max(0, (ANGOLO_CHIUSO - massimo) / (ANGOLO_CHIUSO - ANGOLO_APERTO)));
  }
  return somma / DIREZIONI;
}

// --- Versione 2: analisi di visibilità (viewshed) ---
const RAGGI = 72; // una direzione ogni 5°
const RAGGIO_VISTA_M = 8000;
const ALTEZZA_CHIOMA_M = 15; // gli alberi vicini coprono la vista
const RAGGIO_CHIOMA_M = 1000;
// raggio terrestre "efficace" con la rifrazione dell'aria (coefficiente 0,13)
const RAGGIO_TERRA_EFF_M = 6_371_000 / (1 - 0.13);
// passi lungo ogni raggio: fitti vicino al punto, più radi lontano
const PASSI_M = [
  ...Array.from({ length: 25 }, (_, i) => 40 * (i + 1)),
  ...Array.from({ length: 70 }, (_, i) => 1000 + 100 * (i + 1)),
];

// tolleranza sull'angolo (circa 2,4 m a 8 km): l'errore verticale del modello del terreno
const TOLLERANZA_PENDENZA = 0.0003;

// Visibilità da un punto entro 8 km, con curvatura terrestre e chioma del bosco.
// visibile: parte di territorio visibile (0-1), pesata per area (una cella lontana conta di più);
// apertura: quanto è basso l'orizzonte tutto intorno (0 = chiuso, 1 = aperto).
export function visibilitaPunto(punto, quota, bosco) {
  const h0 = quota(punto.lon, punto.lat);
  if (h0 == null) return null;
  const occhi = h0 + ALTEZZA_OCCHI_M;
  let visibile = 0;
  let totale = 0;
  let mancanti = 0;
  let aperturaSomma = 0;
  for (let r = 0; r < RAGGI; r++) {
    const gradi = (360 / RAGGI) * r;
    let massimo = -Infinity;
    let precedente = 0;
    for (const d of PASSI_M) {
      const area = d * (d - precedente);
      precedente = d;
      totale += area;
      const [lon, lat] = spostaPunto([punto.lon, punto.lat], d, gradi);
      const h = quota(lon, lat);
      if (h == null) {
        mancanti += area;
        continue;
      }
      const superficie = h + (d <= RAGGIO_CHIOMA_M && bosco(lon, lat) ? ALTEZZA_CHIOMA_M : 0);
      const pendenza = (superficie - (d * d) / (2 * RAGGIO_TERRA_EFF_M) - occhi) / d;
      if (pendenza >= massimo - TOLLERANZA_PENDENZA) visibile += area;
      if (pendenza > massimo) massimo = pendenza;
    }
    const angolo = (Math.atan(massimo) * 180) / Math.PI;
    aperturaSomma += Math.min(1, Math.max(0, (ANGOLO_CHIUSO - angolo) / (ANGOLO_CHIUSO - ANGOLO_APERTO)));
  }
  if (mancanti > totale / 2) return null;
  return { visibile: visibile / (totale - mancanti), apertura: aperturaSomma / RAGGI };
}

// Visuale 0-1: serve vedere tanto territorio e avere l'orizzonte basso (dal fondo di una conca
// si vedono le pareti, non un panorama). Tarata su sentieri reali dell'Appennino: anche dai punti
// più panoramici si vede circa il 15-20% del territorio entro 8 km (versanti e cime nascondono il resto).
export const VISIBILE_PIENO = 0.15;
export const visualeDaVisibilita = ({ visibile, apertura }) => Math.min(1, Math.sqrt(visibile / VISIBILE_PIENO)) * (0.3 + 0.7 * apertura);

// Linea di vista tra il punto (occhi a 1,7 m) e un obiettivo (vetta o lago) sul terreno
// bosco (facoltativo): la chioma entro 1 km dal punto copre la vista anche verso vette e laghi
export function siVede(da, a, quota, bosco = null) {
  const h0 = quota(da.lon, da.lat);
  const h1 = quota(a.lon, a.lat);
  if (h0 == null || h1 == null) return false;
  const distanzaM = distanzaKm([da.lon, da.lat], [a.lon, a.lat]) * 1000;
  const passi = Math.max(2, Math.floor(distanzaM / 100));
  for (let i = 1; i < passi; i++) {
    const t = i / passi;
    const h = quota(da.lon + t * (a.lon - da.lon), da.lat + t * (a.lat - da.lat));
    const linea = h0 + ALTEZZA_OCCHI_M + t * (h1 + 2 - (h0 + ALTEZZA_OCCHI_M));
    const chioma = bosco && t * distanzaM <= RAGGIO_CHIOMA_M && bosco(da.lon + t * (a.lon - da.lon), da.lat + t * (a.lat - da.lat)) ? ALTEZZA_CHIOMA_M : 0;
    if (h != null && h + chioma > linea) return false;
  }
  return true;
}

const entro = (punti, obiettivo, km) => punti.some((p) => distanzaKm([p.lon, p.lat], [obiettivo.lon, obiettivo.lat]) <= km);

function percentile(valori, q) {
  if (!valori.length) return 0;
  const ordinati = [...valori].sort((a, b) => a - b);
  return ordinati[Math.min(ordinati.length - 1, Math.floor(q * ordinati.length))];
}

const CLASSE = (v) => (v < 0.35 ? 'limitata' : v < 0.65 ? 'intermedia' : 'panoramica');

// Tratti consecutivi della stessa classe (dopo una media mobile su 3 campioni)
export function trattiPanoramici(campioni) {
  const lisci = campioni.map((c, i) => {
    const vicini = campioni.slice(Math.max(0, i - 1), i + 2);
    return vicini.reduce((s, x) => s + x.visuale, 0) / vicini.length;
  });
  const tratti = [];
  campioni.forEach((c, i) => {
    const classe = CLASSE(lisci[i]);
    const ultimo = tratti.at(-1);
    if (ultimo?.classe === classe) ultimo.aKm = c.km;
    else tratti.push({ classe, daKm: c.km, aKm: c.km });
  });
  return tratti.map((t) => ({ ...t, daKm: Math.round(t.daKm * 10) / 10, aKm: Math.round(t.aKm * 10) / 10 }));
}

// Il chilometro più panoramico (o tutto il percorso se è più corto)
export function trattoMigliore(campioni, lunghezzaKm = 1) {
  if (!campioni.length) return null;
  const n = Math.max(1, Math.round((lunghezzaKm * 1000) / PASSO_M));
  let migliore = null;
  for (let i = 0; i + n <= campioni.length; i++) {
    const media = campioni.slice(i, i + n).reduce((s, c) => s + c.visuale, 0) / n;
    if (!migliore || media > migliore.media) migliore = { daKm: campioni[i].km, aKm: campioni[i + n - 1].km, media };
  }
  if (!migliore) migliore = { daKm: 0, aKm: campioni.at(-1).km, media: campioni.reduce((s, c) => s + c.visuale, 0) / campioni.length };
  return { daKm: Math.round(migliore.daKm * 10) / 10, aKm: Math.round(migliore.aKm * 10) / 10, visuale: Math.round(migliore.media * 100) };
}

// Varietà: quanti "ambienti" diversi si attraversano e quanto sono bilanciati (entropia normalizzata)
function varieta(campioni) {
  const conta = {};
  for (const c of campioni) {
    const tipo = c.acqua ? 'acqua' : c.bosco ? 'bosco' : c.visuale >= 0.7 ? 'cresta' : 'aperto';
    conta[tipo] = (conta[tipo] ?? 0) + 1;
  }
  const n = campioni.length;
  const entropia = -Object.values(conta).reduce((s, k) => s + (k / n) * Math.log(k / n), 0);
  return Math.max(0, entropia / Math.log(4));
}

export const etichettaIndice = (p) =>
  p >= 75 ? 'Panoramicità elevata' : p >= 55 ? 'Panoramicità buona' : p >= 35 ? 'Panoramicità moderata' : 'Panoramicità limitata';

// Calcolo completo per una traccia.
// luoghi: { belvedere: [{lon,lat,nome}], vette: [{lon,lat,nome,quota}], laghi: [{lon,lat,nome}] }
// opzioni.parziale: la traccia copre solo una parte del percorso
// metodo: 'viewshed' (versione 2, predefinito) o 'preliminare' (versione 1)
export function calcolaPanorama(geojson, { quota, bosco, luoghi = {}, parziale = false, oggi = null, metodo = 'viewshed' } = {}) {
  const punti = campionaPercorso(geojson);
  if (punti.length < 3) return null;
  let senzaQuota = 0;
  let senzaBosco = 0;
  const viewshed = metodo === 'viewshed';
  const campioni = punti.map((p) => {
    const b = bosco(p.lon, p.lat);
    if (b == null) senzaBosco++;
    if (viewshed) {
      const v = visibilitaPunto(p, quota, bosco);
      if (v == null) senzaQuota++;
      const visuale = v == null ? 0 : visualeDaVisibilita(v);
      // "apertura": quanto è aperto il punto, serve a scegliere da dove guardare vette e laghi
      return { ...p, apertura: v?.apertura ?? 0, bosco: Boolean(b), visuale, visibile: v?.visibile ?? 0 };
    }
    const apertura = aperturaOrizzonte(p, quota);
    if (apertura == null) senzaQuota++;
    const visuale = (apertura ?? 0) * (b ? FATTORE_BOSCO : 1);
    return { ...p, apertura: apertura ?? 0, bosco: Boolean(b), visuale };
  });
  if (senzaQuota > punti.length / 2) return null;

  // belvedere a meno di 200 m e vette raggiunte (il percorso ci passa a meno di 100 m)
  const belvedere = (luoghi.belvedere ?? []).filter((b) => entro(punti, b, RAGGIO_BELVEDERE_KM));
  const vetteRaggiunte = (luoghi.vette ?? []).filter((v) => entro(punti, v, RAGGIO_VETTA_RAGGIUNTA_KM));
  const nBelvedere = belvedere.length + vetteRaggiunte.length;

  // vette e laghi entro 6 km visibili da almeno un punto aperto del percorso
  // osservatori: i punti aperti; se non ce ne sono, il 10% con la visuale migliore
  const aperti = campioni.filter((c) => !c.bosco && c.apertura >= 0.4);
  const migliori = [...campioni].sort((a, b) => b.visuale - a.visuale).slice(0, Math.max(1, Math.ceil(campioni.length / 10)));
  const osservatori = (aperti.length ? aperti : migliori).filter((_, i, a) => a.length < 40 || i % Math.ceil(a.length / 40) === 0);
  const boscoVista = viewshed ? bosco : null;
  const visibili = (elenco) =>
    elenco.filter(
      (e) =>
        entro(osservatori, e, RAGGIO_ELEMENTI_KM) &&
        osservatori.some((o) => distanzaKm([o.lon, o.lat], [e.lon, e.lat]) <= RAGGIO_ELEMENTI_KM && siVede(o, e, quota, boscoVista)),
    );
  const vetteVisibili = visibili((luoghi.vette ?? []).filter((v) => !vetteRaggiunte.includes(v)));
  const laghiVisibili = visibili(luoghi.laghi ?? []);
  for (const c of campioni) c.acqua = laghiVisibili.some((l) => distanzaKm([c.lon, c.lat], [l.lon, l.lat]) <= 1);

  const visuali = campioni.map((c) => c.visuale);
  const media = visuali.reduce((s, v) => s + v, 0) / visuali.length;
  const criteri = {
    orizzonte: Math.round(100 * (0.5 * media + 0.5 * percentile(visuali, 0.9))),
    belvedere: [0, 55, 75, 90][nBelvedere] ?? 100,
    // ambienti attraversati (bosco, aperto, cresta, acqua) e tipi di elementi in vista
    varieta: Math.round(
      100 * (0.6 * varieta(campioni) + (0.4 * [vetteVisibili.length, laghiVisibili.length, vetteRaggiunte.length].filter(Boolean).length) / 3),
    ),
    // le vette contano sempre meno: in Appennino da quasi ovunque si vede qualche cima minore
    elementi: Math.min(100, Math.round(18 * Math.log2(1 + vetteVisibili.length) + 25 * laghiVisibili.length + 10 * vetteRaggiunte.length)),
    apertura: Math.round((100 * visuali.filter((v) => v >= 0.5).length) / visuali.length),
  };
  const punteggio = Math.round(Object.entries(PESI).reduce((s, [k, p]) => s + p * criteri[k], 0));

  // affidabilità: la stima preliminare non è mai "alta"; l'analisi di visibilità sì, se i dati sono completi
  const problemi = [];
  if (parziale) problemi.push('La traccia copre solo una parte del percorso');
  if (senzaBosco > punti.length * 0.2) problemi.push('Copertura del bosco non disponibile su parte del percorso');
  if (senzaQuota) problemi.push('Quote mancanti su parte del percorso');
  if (punti.length < 15) problemi.push('Percorso molto breve');
  const motivi = [
    viewshed
      ? 'Visibilità calcolata sul modello del terreno (circa 30 m) e sul bosco: edifici, singoli alberi, foschia e meteo non sono considerati'
      : 'Stima preliminare: visuale dedotta dalla forma del terreno, senza analisi di visibilità completa',
    ...problemi,
  ];
  const affidabilita = viewshed ? ['alta', 'media'][problemi.length] ?? 'bassa' : problemi.length ? 'bassa' : 'media';

  return {
    versione: viewshed ? 2 : 1,
    metodo,
    punteggio,
    etichetta: etichettaIndice(punteggio),
    affidabilita,
    motivi,
    criteri,
    belvedere: belvedere.map((b) => ({ lon: b.lon, lat: b.lat, nome: b.nome ?? '' })),
    vetteRaggiunte: vetteRaggiunte.map((v) => v.nome ?? '').filter(Boolean),
    vetteVisibili: vetteVisibili.length,
    laghiVisibili: laghiVisibili.map((l) => l.nome ?? '').filter(Boolean),
    boscoPercento: Math.round((100 * campioni.filter((c) => c.bosco).length) / campioni.length),
    ...(viewshed ? { visibileMedio: Math.round((100 * campioni.reduce((s, c) => s + c.visibile, 0)) / campioni.length) } : {}),
    // visuale stimata ogni 100 m (0-100): l'app la usa per colorare i tratti
    visuale: visuali.map((v) => Math.round(v * 100)),
    tratti: trattiPanoramici(campioni),
    migliore: trattoMigliore(campioni),
    calcolato: oggi,
  };
}

// Testi brevi per la scheda
export function riassuntoPanorama(p) {
  return {
    visuale: p.criteri.orizzonte >= 65 ? 'Ampia' : p.criteri.orizzonte >= 40 ? 'Media' : 'Ridotta',
    belvedere: p.belvedere.length + (p.vetteRaggiunte?.length ?? 0),
    paesaggio: p.criteri.varieta >= 60 ? 'Variegato' : p.criteri.varieta >= 30 ? 'Vario' : 'Uniforme',
  };
}
