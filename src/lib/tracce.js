// Ricostruzione del percorso di una traccia e unione delle tappe di un giro.
// Le coordinate sono [lon, lat] oppure [lon, lat, quota].
import { distanzaKm, direzioneGradi } from './geo.js';

export const TOLLERANZA_UNIONE_M = 30;
export const SOGLIA_SALTO_M = 200;

const distanzaM = (a, b) => distanzaKm(a, b) * 1000;
const primo = (linea) => linea[0];
const ultimo = (linea) => linea[linea.length - 1];
const inverti = (linea) => [...linea].reverse();

// Unisce i tratti che si toccano (estremi entro la tolleranza) in catene continue,
// girando i tratti quando serve. Il primo tratto mantiene il suo verso.
export function concatenaLinee(linee, tolleranzaM = TOLLERANZA_UNIONE_M) {
  const restanti = linee.filter((l) => l?.length > 1).map((l) => [...l]);
  const catene = [];
  while (restanti.length) {
    let catena = restanti.shift();
    let attaccato = true;
    while (attaccato) {
      attaccato = false;
      let migliore = null;
      for (let i = 0; i < restanti.length; i++) {
        const l = restanti[i];
        const opzioni = [
          { d: distanzaM(ultimo(catena), primo(l)), dove: 'fine', gira: false },
          { d: distanzaM(ultimo(catena), ultimo(l)), dove: 'fine', gira: true },
          { d: distanzaM(primo(catena), ultimo(l)), dove: 'inizio', gira: false },
          { d: distanzaM(primo(catena), primo(l)), dove: 'inizio', gira: true },
        ];
        for (const o of opzioni) {
          if (o.d <= tolleranzaM && (!migliore || o.d < migliore.d)) migliore = { ...o, i };
        }
      }
      if (migliore) {
        let l = restanti.splice(migliore.i, 1)[0];
        if (migliore.gira) l = inverti(l);
        // se i due punti coincidono non li ripeto
        const tocca = migliore.d < 0.5;
        catena =
          migliore.dove === 'fine'
            ? [...catena, ...(tocca ? l.slice(1) : l)]
            : [...(tocca ? l.slice(0, -1) : l), ...catena];
        attaccato = true;
      }
    }
    catene.push(catena);
  }
  return catene;
}

// Mette in fila i pezzi non collegati: dopo il primo, ogni volta il pezzo più vicino.
// Restituisce i pezzi orientati e le distanze dei salti tra un pezzo e il successivo.
export function ordinaPezzi(catene) {
  if (!catene.length) return { pezzi: [], salti: [] };
  const restanti = [...catene];
  const pezzi = [restanti.shift()];
  const salti = [];
  while (restanti.length) {
    const fine = ultimo(pezzi[pezzi.length - 1]);
    let migliore = null;
    restanti.forEach((c, i) => {
      for (const gira of [false, true]) {
        const d = distanzaM(fine, gira ? ultimo(c) : primo(c));
        if (!migliore || d < migliore.d) migliore = { d, i, gira };
      }
    });
    const c = restanti.splice(migliore.i, 1)[0];
    pezzi.push(migliore.gira ? inverti(c) : c);
    salti.push(migliore.d);
  }
  return { pezzi, salti };
}

// Percorso di un sentiero: pezzi continui in ordine, dall'inizio alla fine
export function percorsoSentiero(geojson) {
  return ordinaPezzi(concatenaLinee(geojson?.coordinates ?? []));
}

export function invertiPercorso({ pezzi, salti }) {
  return { pezzi: pezzi.map(inverti).reverse(), salti: [...salti].reverse() };
}

export function inizioPercorso(p) {
  return p.pezzi.length ? primo(p.pezzi[0]) : null;
}

export function finePercorso(p) {
  return p.pezzi.length ? ultimo(p.pezzi[p.pezzi.length - 1]) : null;
}

// Unisce le tappe di un giro.
// tappe: [{ etichetta, geojson, alContrario }]
// Restituisce i pezzi in ordine (con l'indice della tappa) e i salti oltre la soglia.
export function unisciTappe(tappe, sogliaM = SOGLIA_SALTO_M) {
  const pezzi = [];
  const salti = [];
  let finePrecedente = null;
  let etichettaPrecedente = null;
  tappe.forEach((tappa, indice) => {
    let percorso = percorsoSentiero(tappa.geojson);
    if (!percorso.pezzi.length) return;
    if (tappa.alContrario) percorso = invertiPercorso(percorso);

    if (finePrecedente) {
      const inizio = inizioPercorso(percorso);
      const d = distanzaM(finePrecedente, inizio);
      if (d > sogliaM) {
        salti.push({ tipo: 'tra', da: etichettaPrecedente, a: tappa.etichetta, distanzaM: d, punti: [finePrecedente, inizio] });
      }
    }
    percorso.pezzi.forEach((p, i) => {
      if (i > 0 && percorso.salti[i - 1] > sogliaM) {
        salti.push({
          tipo: 'interno',
          da: tappa.etichetta,
          a: tappa.etichetta,
          distanzaM: percorso.salti[i - 1],
          punti: [ultimo(percorso.pezzi[i - 1]), primo(p)],
        });
      }
      pezzi.push({ tappa: indice, linea: p });
    });
    finePrecedente = finePercorso(percorso);
    etichettaPrecedente = tappa.etichetta;
  });
  return { pezzi, salti };
}

// Distanza sotto la quale partenza e arrivo coincidono (giro ad anello)
export const SOGLIA_ANELLO_M = 150;

// Partenza e arrivo di una traccia, e se è un anello
export function estremiTraccia(geojson) {
  const p = percorsoSentiero(geojson);
  const inizio = inizioPercorso(p);
  const fine = finePercorso(p);
  if (!inizio) return null;
  return { inizio, fine, anello: distanzaM(inizio, fine) <= SOGLIA_ANELLO_M };
}

// Punti per le frecce del verso di percorrenza: circa "quante" frecce distribuite
// lungo i pezzi. La direzione è calcolata tra ~80 m prima e ~80 m dopo la freccia,
// così sui tornanti indica il verso generale e non quello della singola curva.
export function frecceLungoPercorso(pezzi, quante = 8, finestraM = 80) {
  const frecce = [];
  const misurati = misuraPezzi(pezzi);
  const totale = misurati.reduce((s, m) => s + m.lunghezza, 0);
  if (!totale) return frecce;
  const passo = totale / (quante + 1);
  for (let k = 1; k <= quante; k++) {
    let d = passo * k;
    const m = misurati.find((x) => d <= x.inizio + x.lunghezza) ?? misurati[misurati.length - 1];
    d -= m.inizio;
    const punto = puntoAllaDistanza(m, d);
    const prima = puntoAllaDistanza(m, Math.max(0, d - finestraM));
    const dopo = puntoAllaDistanza(m, Math.min(m.lunghezza, d + finestraM));
    frecce.push({ punto, direzione: direzioneGradi(prima, dopo) });
  }
  return frecce;
}

function misuraPezzi(pezzi) {
  let inizio = 0;
  return pezzi.map((linea) => {
    const prog = [0];
    for (let i = 1; i < linea.length; i++) prog.push(prog[i - 1] + distanzaM(linea[i - 1], linea[i]));
    const m = { linea, prog, inizio, lunghezza: prog[prog.length - 1] };
    inizio += m.lunghezza;
    return m;
  });
}

function puntoAllaDistanza({ linea, prog }, d) {
  let i = 1;
  while (i < prog.length - 1 && prog[i] < d) i++;
  const tratto = prog[i] - prog[i - 1];
  const t = tratto ? Math.max(0, Math.min(1, (d - prog[i - 1]) / tratto)) : 0;
  const a = linea[i - 1];
  const b = linea[i];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// Traccia con partenza e arrivo scambiati
export function invertiGeojson(geojson) {
  return { ...geojson, coordinates: [...geojson.coordinates].reverse().map(inverti) };
}

// Stato della traccia di un sentiero, per la scheda:
// - "nessuna": nessuna traccia; serve un GPX se il sentiero non ha codici da cercare su OSM
// - "parziale": da OSM ma mancano alcuni codici (es. B5 non mappato) → GPX per quelli
// - "completa": GPX mio, oppure OSM con tutti i codici
export function statoTraccia(sentiero, traccia) {
  const codici = (sentiero.codici ?? []).map((c) => c.toUpperCase());
  if (!traccia?.geojson?.coordinates?.length) {
    return { tipo: 'nessuna', mancanti: codici, serveGpx: codici.length === 0 };
  }
  if (traccia.origine !== 'osm') return { tipo: 'completa', mancanti: [], serveGpx: false };
  // tratti noti ma non coperti dalla traccia (es. una strada senza codice)
  if (traccia.dettagli?.notaParziale) {
    return { tipo: 'parziale', mancanti: traccia.dettagli.mancanti ?? [], serveGpx: true, nota: traccia.dettagli.notaParziale };
  }
  const trovati = new Set((traccia.dettagli?.codici ?? []).map((c) => c.toUpperCase()));
  const mancanti = traccia.dettagli?.mancanti ?? (trovati.size ? codici.filter((c) => !trovati.has(c)) : []);
  return mancanti.length
    ? { tipo: 'parziale', mancanti, serveGpx: true }
    : { tipo: 'completa', mancanti: [], serveGpx: false };
}

// Dalla ricerca OSM: scelta automatica solo se ogni codice trovato ha un solo risultato
export function sceltaAutomatica(codici, gruppi) {
  const scelti = [];
  const mancanti = [];
  const ambigui = [];
  for (const c of codici) {
    const g = gruppi[c] ?? [];
    if (g.length === 1) scelti.push(g[0]);
    else if (g.length === 0) mancanti.push(c);
    else ambigui.push(c);
  }
  return { scelti, mancanti, ambigui };
}

// Tratto di una linea dall'inizio fino al punto più vicino a "fino" (oppure tra "da" e "fino").
// Serve per ricostruire percorsi descritti a parole ("fino al rifugio", "fino alla sorgente").
export function tagliaLinea(linea, { da = null, fino = null } = {}) {
  const misurati = misuraPezzi([linea])[0];
  const posizione = (p) => {
    let migliore = { d: Infinity, s: 0 };
    for (let i = 1; i < linea.length; i++) {
      const a = linea[i - 1];
      const b = linea[i];
      // proiezione piana locale, sufficiente su distanze di pochi km
      const k = Math.cos((p[1] * Math.PI) / 180);
      const ax = (a[0] - p[0]) * k;
      const ay = a[1] - p[1];
      const bx = (b[0] - p[0]) * k;
      const by = b[1] - p[1];
      const dx = bx - ax;
      const dy = by - ay;
      const l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
      const d = Math.hypot(ax + t * dx, ay + t * dy);
      if (d < migliore.d) migliore = { d, s: misurati.prog[i - 1] + t * (misurati.prog[i] - misurati.prog[i - 1]) };
    }
    return migliore.s;
  };
  const inizio = da ? posizione(da) : 0;
  const fine = fino ? posizione(fino) : misurati.lunghezza;
  const [s0, s1] = inizio <= fine ? [inizio, fine] : [fine, inizio];
  const tratto = [puntoAllaDistanza(misurati, s0)];
  for (let i = 0; i < linea.length; i++) {
    if (misurati.prog[i] > s0 && misurati.prog[i] < s1) tratto.push(linea[i].slice(0, 2));
  }
  tratto.push(puntoAllaDistanza(misurati, s1));
  return inizio <= fine ? tratto : tratto.reverse();
}
