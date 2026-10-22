// Il nome automatico di un percorso: «Anello da [luogo] · 7 km» oppure «Da [luogo] a [luogo] · 7 km», al posto della
// data o di un nome vuoto. Il luogo viene da Nominatim (OpenStreetMap), una richiesta per capo, ricordata sul telefono.
export const URL_REVERSE = 'https://nominatim.openstreetmap.org/reverse';

export const urlReverse = (lat, lon) =>
  `${URL_REVERSE}?${new URLSearchParams({ format: 'jsonv2', zoom: '14', addressdetails: '1', 'accept-language': 'it', lat: lat.toFixed(5), lon: lon.toFixed(5) })}`;

// risposta di Nominatim → il nome del luogo (frazione, paese, città) o null
export function luogoDaRisposta(json) {
  const a = json?.address;
  if (!a) return null;
  return a.hamlet || a.village || a.suburb || a.town || a.city_district || a.city || a.municipality || a.locality || a.isolated_dwelling || null;
}

const MESI = 'gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic|gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre';
const DATA_TESTO = new RegExp(`^(percorso\\s+)?\\d{1,2}\\s+(${MESI})\\.?\\s+\\d{2,4}(,?\\s+\\d{1,2}[:.]\\d{2})?$`, 'i');
// vero se il nome è vuoto, «Percorso senza nome» o solo una data («24 ott 26», «2026-10-24», «24/10/2026»)
export function nomeDaSostituire(nome) {
  const t = String(nome ?? '').trim();
  if (!t || /^percorso senza nome$/i.test(t) || /^senza nome$/i.test(t)) return true;
  return DATA_TESTO.test(t) || /^\d{4}-\d{2}-\d{2}([ t]\d{2}:\d{2}(:\d{2})?)?$/i.test(t) || /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(t);
}

export function testoKm(km) {
  const v = km >= 10 ? Math.round(km) : Math.round(km * 10) / 10;
  return `${String(v).replace('.', ',')} km`;
}

// anello: bool; partenza, arrivo: nomi dei luoghi (o null)
export function nomeAutomatico({ anello, km, partenza, arrivo }) {
  if (!partenza) return null;
  const k = testoKm(km);
  if (anello) return `Anello da ${partenza} · ${k}`;
  if (arrivo && arrivo !== partenza) return `Da ${partenza} a ${arrivo} · ${k}`;
  return `Da ${partenza} · ${k}`;
}
