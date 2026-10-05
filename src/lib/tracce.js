// Ricostruzione del percorso di una traccia e unione delle tappe di un giro.
// Le coordinate sono [lon, lat] oppure [lon, lat, quota].
import { distanzaKm } from './geo.js';

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
