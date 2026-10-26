// L'archivio dei percorsi diviso per parco: un file per parco (dati/archivio/<parco>.json) e un indice leggero
// (dati/archivio/indice.json) con, per ogni parco, nome, numero di sentieri, riquadro e confine semplificato.
// All'avvio si legge solo l'indice; il file di un parco si scarica quando serve.
import { distanzaKm } from './geo.js';
import { puntoNelPoligono, semplifica } from './confini.js';

export const CARTELLA_ARCHIVIO = 'dati/archivio/';
export const FILE_INDICE = `${CARTELLA_ARCHIVIO}indice.json`;
export const fileParco = (id) => `${CARTELLA_ARCHIVIO}${id}.json`;
export const APP_INDICE = 'orme-archivio-indice';
// sotto lo zoom 9 la mappa mostra mezza regione: non si scarica niente solo perché passa sopra un parco
export const ZOOM_MINIMO_SCARICO = 9;

const arrotonda = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

// Riquadro [sud, ovest, nord, est] di una lista di anelli [[lon, lat], …]
export function riquadroDegliAnelli(anelli) {
  let [s, o, n, e] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const a of anelli) for (const [lon, lat] of a) [s, o, n, e] = [Math.min(s, lat), Math.min(o, lon), Math.max(n, lat), Math.max(e, lon)];
  return Number.isFinite(s) ? [arrotonda(s), arrotonda(o), arrotonda(n), arrotonda(e)] : null;
}

// Confine ridotto per l'indice: pochi punti per anello (tolleranza ~1 km), niente anelli minuscoli
export function confineSemplificato(anelli, tolleranza = 0.01) {
  return (anelli ?? [])
    .map((a) => semplifica(a, tolleranza).map(([lon, lat]) => [arrotonda(lon), arrotonda(lat)]))
    .filter((a) => a.length >= 4);
}

// Un archivio intero → { indice, file: Map(parco → archivio di quel parco) }. nomi: { id: nome }; confini: { id: anelli };
// firma(testo) → impronta del contenuto di un file (cambia solo se cambiano i percorsi del parco)
export function dividiArchivio(archivio, { nomi = {}, confini = {}, parchi = [], firma }) {
  const gruppi = new Map(parchi.map((id) => [id, []]));
  for (const p of archivio.percorsi ?? []) {
    const id = p.parco || 'altro';
    if (!gruppi.has(id)) gruppi.set(id, []);
    gruppi.get(id).push(p);
  }
  const file = new Map();
  const elenco = [];
  for (const [id, percorsi] of gruppi) {
    const corpo = { app: archivio.app, versione: archivio.versione, parco: id, percorsi };
    const testo = JSON.stringify(corpo);
    if (percorsi.length) file.set(id, corpo);
    const anelli = confini[id] ?? [];
    elenco.push({
      id,
      nome: nomi[id] ?? id,
      sentieri: percorsi.length,
      riquadro: riquadroDegliAnelli(anelli) ?? null,
      confine: confineSemplificato(anelli),
      file: percorsi.length ? fileParco(id) : null,
      firma: percorsi.length ? firma(testo) : null,
      byte: percorsi.length ? Buffer.byteLength(testo) : 0,
    });
  }
  return { indice: { app: APP_INDICE, versione: 1, aggiornato: archivio.aggiornato, parchi: elenco }, file };
}

export function controllaIndice(dati) {
  if (!dati || dati.app !== APP_INDICE || !Array.isArray(dati.parchi)) throw new Error('Indice dei parchi non valido.');
  return dati;
}

// Distanza in km tra un punto [lon, lat] e il riquadro [s, o, n, e] (0 se dentro)
export function distanzaDalRiquadroKm([lon, lat], [s, o, n, e]) {
  const p = [Math.min(Math.max(lon, o), e), Math.min(Math.max(lat, s), n)];
  return distanzaKm([lon, lat], p);
}

// I parchi (con sentieri da scaricare o già scaricati) che toccano un cerchio: centro [lon, lat], raggio in km
export function parchiNelRaggio(indice, centro, raggioKm) {
  return indice.parchi.filter((p) => p.file && p.riquadro && distanzaDalRiquadroKm(centro, p.riquadro) <= raggioKm);
}

// Il parco su cui sta un punto (dentro il confine; se manca il confine, dentro il riquadro)
export function parcoSulPunto(indice, [lon, lat]) {
  return (
    indice.parchi.find((p) => {
      if (!p.file || !p.riquadro) return false;
      if (p.confine?.length) return puntoNelPoligono([lon, lat], p.confine);
      const [s, o, n, e] = p.riquadro;
      return lat >= s && lat <= n && lon >= o && lon <= e;
    }) ?? null
  );
}

// Parchi già sul telefono il cui file è cambiato: scaricati = Map(id → { firma })
export function parchiDaAggiornare(indice, scaricati) {
  return indice.parchi.filter((p) => p.file && scaricati.has(p.id) && scaricati.get(p.id).firma !== p.firma);
}

// «sul telefono» / «da scaricare»
export const statoParco = (p, scaricati) => (!p?.file ? 'vuoto' : scaricati.has(p.id) ? 'sul-telefono' : 'da-scaricare');

// Quali sentieri si tolgono con «Togli dal telefono»: quelli del parco che vengono dall'archivio (hanno la copia
// di base) e non hanno niente di mio: né fatto, né salvato, né note, né una data, né una traccia mia
export function sentieriDaTogliere(sentieri, parco, { basi, tracce }) {
  const mioDato = (s) => s.stato === 'fatto' || s.salvato || s.notePersonali || s.dataPercorso;
  const tracciaMia = (s) => {
    const t = tracce.get(s.id);
    return t && !(t.dettagli?.archivio || t.dettagli?.iniziale);
  };
  const daTogliere = [];
  const tenuti = [];
  for (const s of sentieri) {
    if ((s.parco ?? null) !== parco) continue;
    if (!basi.has(s.id) || mioDato(s) || tracciaMia(s)) tenuti.push(s.id);
    else daTogliere.push(s.id);
  }
  return { daTogliere, tenuti };
}
