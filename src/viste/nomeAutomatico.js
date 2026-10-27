// Il nome automatico di un percorso (vedi src/lib/nomePercorso.js): i luoghi di partenza e arrivo da Nominatim, una
// richiesta alla volta (al massimo una al secondo, come chiede la sua policy) e ricordati sul telefono.
import { urlReverse, luogoDaRisposta, nomeAutomatico } from '../lib/nomePercorso.js';
import { distanzaKm, lunghezzaKm } from '../lib/geo.js';
import { eAnelloPezzi } from '../lib/andataRitorno.js';
import { urlReverseTappa, luoghiDaRisposta } from '../lib/pianificatore.js';

const CHIAVE = 'orme.nomiLuoghi';
const PAUSA_MS = 1100;
let coda = Promise.resolve();
let ultimaRichiesta = 0;

const leggi = () => {
  try {
    return JSON.parse(localStorage.getItem(CHIAVE) ?? '{}');
  } catch {
    return {};
  }
};
const salva = (chiave, nome) => {
  try {
    const tutti = leggi();
    tutti[chiave] = nome;
    // si tengono gli ultimi 200 luoghi
    const voci = Object.entries(tutti).slice(-200);
    localStorage.setItem(CHIAVE, JSON.stringify(Object.fromEntries(voci)));
  } catch {
    // senza memoria si richiede ogni volta
  }
};

// il luogo più vicino a [lon, lat]: nome o null (se Nominatim non risponde; l'errore non si ricorda)
export function luogoVicino([lon, lat]) {
  const chiave = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const noto = leggi()[chiave];
  if (noto) return Promise.resolve(noto);
  const lavoro = coda.then(async () => {
    const atteso = ultimaRichiesta + PAUSA_MS - Date.now();
    if (atteso > 0) await new Promise((r) => setTimeout(r, atteso));
    ultimaRichiesta = Date.now();
    try {
      const r = await fetch(urlReverse(lat, lon), { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return null;
      const nome = luogoDaRisposta(await r.json());
      if (nome) salva(chiave, nome);
      return nome;
    } catch {
      return null;
    }
  });
  coda = lavoro.catch(() => {});
  return lavoro;
}

// via, località e paese di una tappa del pianificatore (Nominatim reverse a zoom 17): una richiesta per tappa, nella stessa
// coda del nome automatico (al massimo una al secondo) e ricordata sul telefono come i nomi delle zone
const CHIAVE_TAPPE = 'orme.luoghiTappe';
const leggiTappe = () => {
  try {
    return JSON.parse(localStorage.getItem(CHIAVE_TAPPE) ?? '{}');
  } catch {
    return {};
  }
};
export function luoghiTappa([lon, lat]) {
  const chiave = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const noto = leggiTappe()[chiave];
  if (noto) return Promise.resolve(noto);
  const lavoro = coda.then(async () => {
    const atteso = ultimaRichiesta + PAUSA_MS - Date.now();
    if (atteso > 0) await new Promise((r) => setTimeout(r, atteso));
    ultimaRichiesta = Date.now();
    try {
      const r = await fetch(urlReverseTappa(lat, lon), { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return null;
      const luoghi = luoghiDaRisposta(await r.json());
      if (luoghi) {
        try {
          const tutti = leggiTappe();
          tutti[chiave] = luoghi;
          localStorage.setItem(CHIAVE_TAPPE, JSON.stringify(Object.fromEntries(Object.entries(tutti).slice(-300))));
        } catch {
          // senza memoria si richiede ogni volta
        }
      }
      return luoghi;
    } catch {
      return null;
    }
  });
  coda = lavoro.catch(() => {});
  return lavoro;
}

// pezzi [[lon, lat]…] → il nome proposto, o null se non si trova il luogo di partenza
export async function nomeProposto(pezzi) {
  const linee = pezzi.filter((l) => l?.length > 1);
  if (!linee.length) return null;
  const inizio = linee[0][0];
  const fine = linee.at(-1).at(-1);
  const anello = eAnelloPezzi(linee);
  const km = lunghezzaKm({ coordinates: linee });
  const partenza = await luogoVicino(inizio);
  if (!partenza) return null;
  const arrivo = anello || distanzaKm(inizio, fine) < 0.3 ? partenza : await luogoVicino(fine);
  return nomeAutomatico({ anello, km, partenza, arrivo: arrivo ?? partenza });
}
