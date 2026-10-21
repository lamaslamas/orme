// "Modifica traccia" su una carrareccia o un sentiero non segnato toccato sulla mappa: non basta il pezzetto toccato
// (un way di OpenStreetMap), si carica tutto il tratto con lo stesso nome o collegato senza incroci.
import { distanzaKm, distanzaDallaTracciaM } from './geo.js';

export const RAGGIO_CATENA_M = 2000;
export const MAX_CATENA_KM = 25;
const MAX_PASSI = 300;

// la via toccata e quelle attorno, più le località vicine (per dare un nome a una via senza nome)
export function queryViaCollegata(lat, lon, raggioM = RAGGIO_CATENA_M) {
  const l = `${lat.toFixed(6)},${lon.toFixed(6)}`;
  return `[out:json][timeout:25];
way(around:${raggioM},${l})[highway~"^(path|footway|bridleway|track|steps)$"];
out tags geom;
node(around:6000,${l})[place~"^(hamlet|village|town|suburb|locality|isolated_dwelling)$"];
out;`;
}

const chiave = (p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
const lung = (linea) => linea.reduce((m, p, i) => (i ? m + distanzaKm(linea[i - 1], p) : 0), 0);

// json di Overpass → vie [{ id, nome, highway, linea: [[lon, lat]…] }]
export function vieDallaRisposta(json) {
  return (json?.elements ?? [])
    .filter((e) => e.type === 'way' && e.geometry?.length > 1)
    .map((e) => ({ id: e.id, nome: e.tags?.name ?? null, highway: e.tags?.highway ?? null, linea: e.geometry.map((g) => [g.lon, g.lat]) }));
}

// La località più vicina a [lon, lat]: { nome, distanzaM } o null
export function localitaVicina(json, [lon, lat]) {
  const luoghi = (json?.elements ?? []).filter((e) => e.type === 'node' && e.tags?.name && Number.isFinite(e.lat));
  const migliore = luoghi.map((n) => ({ nome: n.tags.name, d: distanzaKm([lon, lat], [n.lon, n.lat]) * 1000 })).sort((a, b) => a.d - b.d)[0];
  return migliore ? { nome: migliore.nome, distanzaM: Math.round(migliore.d) } : null;
}

// La catena di vie che contiene `idPartenza`: da ogni capo si continua sulla via con lo stesso nome oppure, se non
// c'è un incrocio, sull'unica via che prosegue. Si ferma a un incrocio (senza nome in comune), a un anello o al limite.
// → { linea: [[lon, lat]…], ids, nome } nel verso della via di partenza
export function catenaVia(vie, idPartenza, { maxKm = MAX_CATENA_KM } = {}) {
  const partenza = vie.find((v) => v.id === idPartenza);
  if (!partenza) return null;
  // chi usa ogni punto: capo (inizio o fine) di una via, oppure vertice interno (incrocio con una via che passa)
  const usi = new Map();
  const segna = (k, uso) => usi.set(k, [...(usi.get(k) ?? []), uso]);
  for (const v of vie) {
    v.linea.forEach((p, i) => segna(chiave(p), { id: v.id, capo: i === 0 ? 'inizio' : i === v.linea.length - 1 ? 'fine' : null }));
  }
  const perId = new Map(vie.map((v) => [v.id, v]));
  const nome = partenza.nome;
  const usati = new Set([partenza.id]);
  const prossima = (punto, daId) => {
    const altri = (usi.get(chiave(punto)) ?? []).filter((u) => u.id !== daId && !usati.has(u.id));
    const stessoNome = nome ? altri.filter((u) => u.capo && perId.get(u.id).nome === nome) : [];
    if (stessoNome.length) return stessoNome[0];
    const conTutti = (usi.get(chiave(punto)) ?? []).filter((u) => u.id !== daId);
    // senza incroci: una sola altra via, e arriva con un capo
    return conTutti.length === 1 && conTutti[0].capo && !usati.has(conTutti[0].id) ? conTutti[0] : null;
  };

  let linea = partenza.linea.map((p) => [...p]);
  const ids = [partenza.id];
  const estendi = (inCoda) => {
    for (let passo = 0; passo < MAX_PASSI && lung(linea) < maxKm; passo++) {
      const capo = inCoda ? linea.at(-1) : linea[0];
      const idCorrente = inCoda ? ids.at(-1) : ids[0];
      const u = prossima(capo, idCorrente);
      if (!u) return;
      const v = perId.get(u.id);
      // la via si attacca col suo inizio o la sua fine: si gira se serve
      const pezzo = (inCoda ? u.capo === 'inizio' : u.capo === 'fine') ? v.linea : [...v.linea].reverse();
      usati.add(v.id);
      if (inCoda) {
        linea = [...linea, ...pezzo.slice(1)];
        ids.push(v.id);
      } else {
        linea = [...pezzo.slice(0, -1), ...linea];
        ids.unshift(v.id);
      }
    }
  };
  estendi(true);
  estendi(false);
  const nomeCatena = nome ?? ids.map((i) => perId.get(i).nome).find(Boolean) ?? null;
  return { linea, ids, nome: nomeCatena };
}

const TIPO_NOME = { track: 'Carrareccia', bridleway: 'Mulattiera', steps: 'Gradini' };
// il nome da proporre: quello della via, altrimenti «Carrareccia presso [luogo]»
export function nomeViaProposto({ nome, highway }, luogo) {
  if (nome) return nome;
  const tipo = TIPO_NOME[highway] ?? 'Sentiero';
  return luogo ? `${tipo} presso ${luogo}` : `${tipo} senza nome`;
}

// la via più vicina al punto toccato tra quelle trovate (se Overpass non ha ancora detto quale via è)
export function viaPiuVicina(vie, punto, maxM = 40) {
  const migliore = vie
    .map((v) => ({ v, d: distanzaDallaTracciaM(punto, { type: 'MultiLineString', coordinates: [v.linea] }) }))
    .sort((a, b) => a.d - b.d)[0];
  return migliore && migliore.d <= maxM ? migliore.v : null;
}
