// Filtro "Quota e dislivello": quota massima raggiunta (il punto più alto del percorso) e dislivello in
// salita, ciascuno con un intervallo da–a a passi di 50 m. A valori estremi il filtro è spento.
// Le scelte sono testi "da-a" (come gli altri filtri a intervallo): '' = spento.
import { migliaia } from './formato.js';

export const PASSO = 50;
export const QUOTA_MAX = 3000;
export const SALITA_MAX = 2000;
export const KM_MAX = 40; // «Lunghezza»: 0–40 km a passi di 1 km
export const LIMITI = { quota: QUOTA_MAX, salita: SALITA_MAX, km: KM_MAX };
export const PASSI = { quota: PASSO, salita: PASSO, km: 1 };
export const UNITA = { quota: 'm', salita: 'm', km: 'km' };
export const QD_VUOTO = { quota: '', salita: '', senzaQuote: '', lunghezzaKm: '' };


// '300-800' → [300, 800] (estremi compresi); '' → [0, max]
export function intervalloDi(testo, tipo) {
  const max = LIMITI[tipo];
  const [da, a] = String(testo || '').split('-').map(Number);
  return testo && Number.isFinite(da) && Number.isFinite(a) ? [Math.max(0, da), Math.min(max, a)] : [0, max];
}
// [da, a] → testo da salvare: spento ('') se copre tutto l'intervallo
export function testoIntervallo(da, a, tipo) {
  const max = LIMITI[tipo];
  const lo = Math.max(0, Math.min(da, a));
  const hi = Math.min(max, Math.max(da, a));
  return lo <= 0 && hi >= max ? '' : `${lo}-${hi}`;
}
export const quotaAttiva = (c) => Boolean(c?.quota);
export const salitaAttiva = (c) => Boolean(c?.salita);
export const lunghezzaAttiva = (c) => Boolean(c?.lunghezzaKm);
export const qdAttivo = (c) => quotaAttiva(c) || salitaAttiva(c);

// il valore scelto in chiaro: «fino a 1.200 m», «da 1.800 m», «300–800 m»
export function testoValore(testo, tipo) {
  const [da, a] = intervalloDi(testo, tipo);
  const max = LIMITI[tipo];
  if (da <= 0 && a >= max) return 'qualsiasi';
  const u = UNITA[tipo] ?? 'm';
  if (da <= 0) return `fino a ${migliaia(a)} ${u}`;
  if (a >= max) return `da ${migliaia(da)} ${u}`;
  return `${migliaia(da)}–${migliaia(a)} ${u}`;
}
export const testoQuota = (c) => `Quota massima: ${testoValore(c?.quota, 'quota')}`;
export const testoSalita = (c) => `Dislivello: ${testoValore(c?.salita, 'salita')}`;
export const testoLunghezza = (c) => `Lunghezza: ${testoValore(c?.lunghezzaKm, 'km')}`;

// I km da percorrere davvero: un anello è la sua lunghezza, un percorso lineare è andata e ritorno (il doppio), salvo
// con «Solo andata» (modo 'andata'), che conta l'andata. misure: { km, anello }
export function kmPercorsi(misure, modo = 'ar') {
  if (!Number.isFinite(misure?.km)) return null;
  return misure.anello || modo === 'andata' ? misure.km : misure.km * 2;
}
// il filtro «Lunghezza» (km da percorrere): spento se non è scelto; un percorso senza i km è escluso quando è acceso
export function passaLunghezza(c, km) {
  if (!lunghezzaAttiva(c)) return true;
  return Number.isFinite(km) && dentro(km, c.lunghezzaKm, 'km');
}

const dentro = (valore, testo, tipo) => {
  const [da, a] = intervalloDi(testo, tipo);
  return valore >= da && valore <= a;
};

// valori: { quotaMax, salita } (null se non noti). Un percorso senza il dato è escluso dal filtro acceso,
// salvo la scelta «Includi anche quelli senza dati di quota».
export function passaQuotaDislivello(c, { quotaMax = null, salita = null } = {}) {
  const senza = Boolean(c?.senzaQuote);
  if (quotaAttiva(c) && !(Number.isFinite(quotaMax) ? dentro(quotaMax, c.quota, 'quota') : senza)) return false;
  if (salitaAttiva(c) && !(Number.isFinite(salita) ? dentro(salita, c.salita, 'salita') : senza)) return false;
  return true;
}

// le scelte lette da un oggetto qualsiasi (valori non validi → spento)
export function pulisciQd(c = {}) {
  const ok = (t, tipo) => (t && Number.isFinite(Number(String(t).split('-')[0])) && String(t).includes('-') ? testoIntervallo(...intervalloDi(t, tipo), tipo) : '');
  return { quota: ok(c.quota, 'quota'), salita: ok(c.salita, 'salita'), senzaQuote: c.senzaQuote ? 'si' : '', lunghezzaKm: ok(c.lunghezzaKm, 'km') };
}

// memoria sul telefono: una chiave per gli elenchi e una per Suggerisci
export const CHIAVE_QD_ELENCHI = 'orme.quotaDislivello';
export function leggiQd(chiave, memoria = globalThis.localStorage) {
  try {
    return pulisciQd(JSON.parse(memoria.getItem(chiave) ?? '{}'));
  } catch {
    return { ...QD_VUOTO };
  }
}
export function salvaQd(chiave, c, memoria = globalThis.localStorage) {
  try {
    memoria.setItem(chiave, JSON.stringify(pulisciQd(c)));
  } catch {
    // senza memoria vale solo per questa pagina
  }
}
