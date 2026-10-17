// Importazione di file di percorsi (GPX, KML, KMZ, zip con dentro file di questi tipi), anche tanti insieme:
// si leggono tutti, si propone l'elenco dei percorsi trovati e poi si salvano quelli scelti. Qui solo la
// lettura e i calcoli (src/viste/importaFile.js ha il dialogo). Resta tutto sul telefono.
import { leggiGpxTracce } from './gpx.js';
import { leggiKml } from './kml.js';
import { leggiZip } from './zip.js';
import { lunghezzaKm } from './geo.js';
import { dislivello } from './quote.js';

export const ESTENSIONI = ['gpx', 'kml', 'kmz', 'zip'];
export const ACCETTA = '.gpx,.kml,.kmz,.zip,application/gpx+xml,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,application/zip,application/xml,text/xml';
export const MAX_FILE = 30 * 1024 * 1024; // un file scelto
export const MAX_PERCORSI = 200; // in una sola importazione
const MAX_PROFONDITA = 2; // zip dentro zip

const estensione = (nome) => (/\.([a-z0-9]+)$/i.exec(nome)?.[1] ?? '').toLowerCase();
const senzaEstensione = (nome) => nome.replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '');
const decodifica = (dati) => new TextDecoder('utf-8').decode(dati);

// nomeFile: anche il percorso dentro lo zip; dati: Uint8Array
// → { percorsi: [{ nome, geojson, origine: 'gpx' | 'kml', file }], errori: [{ file, motivo }] }
export async function leggiFileDiPercorsi(nomeFile, dati, profondita = 0) {
  const ext = estensione(nomeFile);
  const base = senzaEstensione(nomeFile);
  const esito = { percorsi: [], errori: [] };
  const aggiungi = (lista, origine) => {
    lista.forEach((p, i) => esito.percorsi.push({ nome: p.nome || (lista.length > 1 ? `${base} · ${i + 1}` : base), geojson: p.geojson, origine, file: nomeFile }));
  };
  try {
    if (ext === 'gpx') aggiungi(leggiGpxTracce(decodifica(dati)), 'gpx');
    else if (ext === 'kml') aggiungi(leggiKml(decodifica(dati)), 'kml');
    else if (ext === 'zip' || ext === 'kmz') {
      if (profondita >= MAX_PROFONDITA) throw new Error('zip dentro zip dentro zip: non lo apro');
      const { file, saltati } = await leggiZip(dati);
      for (const s of saltati) esito.errori.push({ file: `${nomeFile} › ${s.nome}`, motivo: s.motivo });
      const utili = file.filter((f) => ESTENSIONI.includes(estensione(f.nome)) && !/(^|\/)(__MACOSX\/|\._)/.test(f.nome));
      if (!utili.length && !saltati.length) throw new Error(ext === 'kmz' ? 'Nel KMZ non c\'è nessun KML.' : 'Nello zip non ci sono file GPX o KML.');
      for (const f of utili) {
        const dentro = await leggiFileDiPercorsi(`${nomeFile} › ${f.nome}`, f.dati, profondita + 1);
        esito.percorsi.push(...dentro.percorsi);
        esito.errori.push(...dentro.errori);
      }
    } else throw new Error(`formato non supportato (${ext ? `.${ext}` : 'senza estensione'}): servono GPX, KML, KMZ o zip`);
  } catch (e) {
    esito.errori.push({ file: nomeFile, motivo: e.message });
  }
  return esito;
}

// Più file insieme: percorsi senza doppioni (stesso nome e stessa lunghezza), errori, e se si è arrivati al limite
export async function leggiFiles(files) {
  const tutti = { percorsi: [], errori: [], troppi: false };
  const visti = new Set();
  for (const { nome, dati } of files) {
    if (dati.length > MAX_FILE) {
      tutti.errori.push({ file: nome, motivo: `troppo grande (oltre ${MAX_FILE / 1024 / 1024} MB)` });
      continue;
    }
    const r = await leggiFileDiPercorsi(nome, dati);
    tutti.errori.push(...r.errori);
    for (const p of r.percorsi) {
      const chiave = `${p.nome}|${lunghezzaKm(p.geojson).toFixed(2)}`;
      if (visti.has(chiave)) continue;
      visti.add(chiave);
      if (tutti.percorsi.length >= MAX_PERCORSI) tutti.troppi = true;
      else tutti.percorsi.push(p);
    }
  }
  return tutti;
}

// Per l'anteprima: km, punti e dislivello (se il file ha le quote)
export function riassuntoPercorso(p) {
  const km = lunghezzaKm(p.geojson);
  const d = dislivello(p.geojson.coordinates);
  return { km, punti: p.geojson.coordinates.reduce((n, l) => n + l.length, 0), salita: d ? Math.round(d.salita) : null };
}
