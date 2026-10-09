// "Da vedere" lungo un percorso: voci di Wikipedia (luoghi con coordinate entro 1 km dalla
// traccia) e foto di Wikimedia Commons (entro 300 m), calcolate dal robot e salvate nell'archivio.
// Solo licenze libere che permettono il riuso (niente NC o ND), sempre con autore e licenza.
import { campionaPercorso } from './panorama.js';

export const RAGGIO_LUOGHI_M = 1000;
export const RAGGIO_FOTO_M = 300;
export const MAX_LUOGHI = 5;
export const MAX_FOTO = 6;
export const LICENZA_LIBERA = /^(cc[ -]by|cc0|public domain|pd)/i;
const API_WIKIPEDIA = 'https://it.wikipedia.org/w/api.php';
const API_COMMONS = 'https://commons.wikimedia.org/w/api.php';

// Centri delle ricerche lungo la traccia: ogni passoM, con un raggio che copre la fascia voluta
export function centriRicerca(geojson, passoM) {
  return campionaPercorso(geojson, passoM).map((p) => ({ lat: p.lat, lon: p.lon, km: p.km }));
}

export function urlLuoghiVicini({ lat, lon }, raggioM) {
  return `${API_WIKIPEDIA}?action=query&format=json&list=geosearch&gsradius=${Math.round(raggioM)}&gslimit=100&gscoord=${lat.toFixed(5)}|${lon.toFixed(5)}`;
}
export function urlFotoVicine({ lat, lon }, raggioM) {
  return `${API_COMMONS}?action=query&format=json&list=geosearch&gsnamespace=6&gsradius=${Math.round(raggioM)}&gslimit=500&gscoord=${lat.toFixed(5)}|${lon.toFixed(5)}`;
}
export function urlInfoFoto(idPagine) {
  return `${API_COMMONS}?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata|mime&iiurlwidth=480&pageids=${idPagine.join('|')}`;
}
export function urlEstratti(titoli) {
  return `${API_WIKIPEDIA}?action=query&format=json&prop=extracts|pageimages&exintro=1&explaintext=1&exsentences=1&piprop=thumbnail&pithumbsize=160&titles=${encodeURIComponent(titoli.join('|'))}`;
}

// Distanza (m) dalla traccia e chilometro più vicino, sui campioni fitti del percorso
function posizioneSulPercorso(campioni, lat, lon) {
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
  let migliore = { distanzaM: Infinity, km: 0 };
  for (const c of campioni) {
    const d = Math.hypot((c.lon - lon) * kx, (c.lat - lat) * 110_570);
    if (d < migliore.distanzaM) migliore = { distanzaM: d, km: c.km };
  }
  return migliore;
}

// Dai risultati delle ricerche (liste geosearch) ai candidati vicini alla traccia, senza doppioni
function vicini(risultati, geojson, raggioM) {
  const campioni = campionaPercorso(geojson, 50);
  const visti = new Map();
  for (const r of risultati.flat()) {
    if (!r || visti.has(r.pageid)) continue;
    const { distanzaM, km } = posizioneSulPercorso(campioni, r.lat, r.lon);
    if (distanzaM > raggioM) continue;
    visti.set(r.pageid, { id: r.pageid, titolo: r.title, lat: r.lat, lon: r.lon, distanzaM: Math.round(distanzaM), km: Math.round(km * 10) / 10 });
  }
  return [...visti.values()];
}

// Luoghi: i più vicini alla traccia (al massimo MAX_LUOGHI), poi in ordine lungo il percorso
export function sceltaLuoghi(risultati, geojson) {
  return vicini(risultati, geojson, RAGGIO_LUOGHI_M)
    .sort((a, b) => a.distanzaM - b.distanzaM)
    .slice(0, MAX_LUOGHI)
    .sort((a, b) => a.km - b.km);
}

// Foto: distribuite lungo tutto il percorso (una per tratto, la più vicina alla traccia);
// restituisce più candidate del necessario, perché alcune avranno licenze non adatte
export function candidateFoto(risultati, geojson, lunghezzaKm) {
  const tutte = vicini(risultati, geojson, RAGGIO_FOTO_M).filter((f) => /\.(jpe?g|webp)$/i.test(f.titolo));
  const tratti = MAX_FOTO * 2;
  const perTratto = new Map();
  for (const f of tutte) {
    const t = Math.min(tratti - 1, Math.floor((f.km / Math.max(lunghezzaKm, 0.1)) * tratti));
    const lista = perTratto.get(t) ?? [];
    lista.push(f);
    perTratto.set(t, lista);
  }
  return [...perTratto.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, lista]) => lista.sort((a, b) => a.distanzaM - b.distanzaM));
}

const testo = (html = '') => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

// Informazioni di una foto (imageinfo di Commons) → foto da mostrare, o null se la licenza non va bene
export function fotoDaInfo(pagina, candidata) {
  const i = pagina?.imageinfo?.[0];
  const m = i?.extmetadata ?? {};
  const licenza = m.LicenseShortName?.value ?? '';
  if (!i?.thumburl || !LICENZA_LIBERA.test(licenza) || /\b(nc|nd)\b/i.test(licenza)) return null;
  if (i.mime && !/^image\/(jpeg|webp)$/.test(i.mime)) return null;
  return {
    url: i.thumburl.split('?')[0],
    pagina: i.descriptionurl,
    autore: testo(m.Artist?.value).slice(0, 80) || 'autore su Commons',
    licenza,
    km: candidata.km,
    lat: candidata.lat,
    lon: candidata.lon,
  };
}

// Dalle candidate per tratto: una foto per tratto, fino a MAX_FOTO, in ordine lungo il percorso
export function sceltaFoto(tratti, info) {
  const scelte = [];
  for (const lista of tratti) {
    for (const c of lista) {
      const f = fotoDaInfo(info.get(c.id), c);
      if (f) {
        scelte.push(f);
        break;
      }
    }
    if (scelte.length >= MAX_FOTO) break;
  }
  return scelte;
}

// Luogo con la frase iniziale di Wikipedia (testo CC BY-SA) e il link
export function luogoConEstratto(luogo, pagina) {
  return {
    titolo: luogo.titolo,
    url: `https://it.wikipedia.org/wiki/${encodeURIComponent(luogo.titolo.replace(/ /g, '_'))}`,
    frase: testo(pagina?.extract).slice(0, 220),
    miniatura: pagina?.thumbnail?.source ?? null,
    distanzaM: luogo.distanzaM,
    km: luogo.km,
  };
}

// Riassunto della scheda chiusa: "2 luoghi · 6 foto"
export function riassuntoDaVedere(d) {
  const parti = [];
  if (d?.luoghi?.length) parti.push(`${d.luoghi.length} ${d.luoghi.length === 1 ? 'luogo' : 'luoghi'}`);
  if (d?.foto?.length) parti.push(`${d.foto.length} ${d.foto.length === 1 ? 'foto' : 'foto'}`);
  return parti.join(' · ');
}
