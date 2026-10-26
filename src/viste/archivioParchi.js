// L'archivio dei percorsi a parchi, dalla parte dell'app: all'avvio si legge solo l'indice (dati/archivio/indice.json);
// il file di un parco si scarica quando serve (lo apro, lo scelgo in Suggerisci, lo cerco, la mappa inquadra la sua
// zona) e poi resta sul telefono, aggiornato come prima. I dati personali non entrano mai in questi file.
import { leggiIndiceParchi, salvaIndiceParchi, parchiScaricati, parchiDaArchivioIntero, sincronizzaArchivio, togliParco } from '../db.js';
import { FILE_INDICE, controllaIndice, fileParco, parchiNelRaggio, parcoSulPunto, parchiDaAggiornare } from '../lib/parchiArchivio.js';
import { mostraAvviso } from './condividi.js';

const base = () => import.meta.env.BASE_URL;
export const EVENTO_ARCHIVIO = 'orme-archivio-aggiornato';

let indice = null;
let inCorsoIndice = null;
const inCorso = new Map(); // id → promessa del download

// L'indice dei parchi: quello della rete (e si salva sul telefono) o, senza rete, l'ultimo salvato
export function indiceParchi({ rete = false } = {}) {
  if (indice && !rete) return Promise.resolve(indice);
  inCorsoIndice ??= (async () => {
    try {
      const r = await fetch(`${base()}${FILE_INDICE}`, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`indice: ${r.status}`);
      indice = controllaIndice(await r.json());
      await salvaIndiceParchi(indice);
    } catch (e) {
      console.warn('Indice dei parchi non aggiornato', e);
      indice ??= await leggiIndiceParchi().catch(() => null);
    } finally {
      inCorsoIndice = null;
    }
    return indice;
  })();
  return inCorsoIndice;
}

const nomeDi = (p) => p.nome ?? p.id;

// Scarica (o aggiorna) il file di un parco, se serve. avviso: dice «Scarico i sentieri del parco…» la prima volta;
// segnala: a fine scarico la schermata si ridisegna con i sentieri nuovi. → true se qualcosa è cambiato
export function assicuraParco(id, { avviso = true, segnala = true } = {}) {
  if (inCorso.has(id)) return inCorso.get(id);
  const lavoro = (async () => {
    const ind = await indiceParchi();
    const p = ind?.parchi.find((x) => x.id === id);
    if (!p?.file) return false;
    const scaricati = await parchiScaricati();
    if (scaricati.get(id)?.firma === p.firma) return false;
    if (avviso && !scaricati.has(id)) mostraAvviso(`Scarico i sentieri del parco ${nomeDi(p)}…`, 6000);
    try {
      const r = await fetch(`${base()}${fileParco(id)}`, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`${id}: ${r.status}`);
      await sincronizzaArchivio(await r.json(), { firma: p.firma, parco: id });
      if (segnala) window.dispatchEvent(new CustomEvent(EVENTO_ARCHIVIO, { detail: { parco: id } }));
      return true;
    } catch (e) {
      console.warn('Parco non scaricato', id, e);
      if (avviso) mostraAvviso(`Non riesco a scaricare i sentieri del parco ${nomeDi(p)}: riprova con la rete.`, 5000);
      return false;
    }
  })().finally(() => inCorso.delete(id));
  inCorso.set(id, lavoro);
  return lavoro;
}

// I parchi che toccano un cerchio (centro [lon, lat], raggio km); raggioKm null = tutti. → true se ne ha scaricati
export async function assicuraParchiNelRaggio(centro, raggioKm, opzioni) {
  const ind = await indiceParchi();
  if (!ind) return false;
  const parchi = raggioKm == null ? ind.parchi.filter((p) => p.file) : parchiNelRaggio(ind, centro, raggioKm);
  const esiti = await Promise.all(parchi.map((p) => assicuraParco(p.id, opzioni)));
  return esiti.some(Boolean);
}

// La mappa inquadra un parco: lo si scarica (solo con la mappa abbastanza vicina, vedi ZOOM_MINIMO_SCARICO)
export async function assicuraParcoSulPunto(punto, opzioni) {
  const ind = await indiceParchi();
  const p = ind && parcoSulPunto(ind, punto);
  return p ? assicuraParco(p.id, opzioni) : false;
}

// All'avvio: l'indice nuovo e, dei parchi già sul telefono, solo quelli cambiati (in silenzio). → true se qualcosa è cambiato
export async function aggiornaArchivioParchi() {
  const ind = await indiceParchi({ rete: true });
  if (!ind) return false;
  await parchiDaArchivioIntero(ind.parchi.map((p) => p.id));
  const da = parchiDaAggiornare(ind, await parchiScaricati());
  const esiti = await Promise.all(da.map((p) => assicuraParco(p.id, { avviso: false, segnala: false })));
  return esiti.some(Boolean);
}

export async function statoParchi() {
  return { indice: await indiceParchi(), scaricati: await parchiScaricati() };
}

export async function togliDalTelefono(id) {
  const esito = await togliParco(id);
  window.dispatchEvent(new CustomEvent(EVENTO_ARCHIVIO, { detail: { parco: id, tolto: true } }));
  return esito;
}
