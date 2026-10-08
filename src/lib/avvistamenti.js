// I miei avvistamenti: restano solo sul dispositivo (mai nei dati del codice).
import { ANIMALI } from './costanti.js';
import { parcoDa } from '../datiParchi.js';
import { distanzaDallaTracciaM } from './geo.js';
import { parcoDelPunto } from './confini.js';

export const RAGGIO_SENTIERO_VICINO_M = 300;

export function completaAvvistamento(a) {
  return {
    animale: 'altro',
    dataOra: null,
    punto: { lat: null, lon: null, precisioneM: null, origine: 'mappa' },
    individui: null,
    note: '',
    sentieroId: null,
    parco: null,
    ...a,
  };
}

// Valori del modulo (stringhe) → avvistamento. Errore leggibile se qualcosa non va.
export function avvistamentoDaModulo(v, precedente = {}) {
  if (!Object.hasOwn(ANIMALI, v.animale ?? '')) throw new Error("Scegli l'animale.");
  if (!v.dataOra || Number.isNaN(Date.parse(v.dataOra))) throw new Error('Indica data e ora.');
  const lat = Number(String(v.lat ?? '').replace(',', '.'));
  const lon = Number(String(v.lon ?? '').replace(',', '.'));
  if (!(Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) || v.lat === '' || v.lon === '') {
    throw new Error('Manca il punto sulla mappa.');
  }
  let individui = null;
  if (String(v.individui ?? '').trim() !== '') {
    individui = Number(v.individui);
    if (!Number.isInteger(individui) || individui < 1 || individui > 500) throw new Error('Numero di individui non valido.');
  }
  const precisione = Number(v.precisioneM);
  return completaAvvistamento({
    ...precedente,
    animale: v.animale,
    dataOra: v.dataOra,
    punto: {
      lat,
      lon,
      precisioneM: Number.isFinite(precisione) && precisione > 0 ? Math.round(precisione) : null,
      origine: v.origine === 'gps' ? 'gps' : 'mappa',
    },
    individui,
    note: (v.note ?? '').trim(),
    sentieroId: v.sentieroId || null,
    parco: parcoDa(v.parco) ? v.parco : null,
  });
}

// Sentieri con traccia entro il raggio, dal più vicino
export function sentieriVicini(punto, sentieri, tracce, raggioM = RAGGIO_SENTIERO_VICINO_M) {
  const p = [punto.lon, punto.lat];
  return sentieri
    .filter((s) => tracce.get(s.id)?.geojson)
    .map((s) => ({ sentiero: s, distanzaM: distanzaDallaTracciaM(p, tracce.get(s.id).geojson) }))
    .filter((x) => x.distanzaM <= raggioM)
    .sort((a, b) => a.distanzaM - b.distanzaM);
}

// Parco proposto: quello del confine che contiene il punto, altrimenti quello del sentiero vicino
export function parcoProposto(punto, confini, sentieroVicino = null) {
  return parcoDelPunto([punto.lon, punto.lat], confini) ?? sentieroVicino?.parco ?? null;
}

export function filtraAvvistamenti(avvistamenti, { parco = '', animale = '' } = {}) {
  return avvistamenti
    .filter((a) => (!parco || a.parco === parco) && (!animale || a.animale === animale))
    .sort((a, b) => String(b.dataOra).localeCompare(String(a.dataOra)));
}
