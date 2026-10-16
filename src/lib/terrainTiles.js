// Quote dalle "Terrain Tiles" (AWS Open Data, gratuite, senza chiavi, con CORS aperto e servite da una CDN):
// tessere PNG in cui ogni pixel porta la quota (formato Terrarium: R*256 + G + B/256 − 32768 metri).
// In Italia vengono dal modello EU-DEM (~25-30 m). Sono la fonte del telefono per il disegno, le tracce
// importate e le zone fuori dai parchi; per le tracce dell'archivio c'è il profilo TINITALY del robot.
// Qui solo i calcoli: indirizzi, decodifica, lettura con interpolazione; le tessere le scarica la vista.
export const URL_TERRAIN = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
// zoom 12: ~28 m per pixel a 42°N, come la risoluzione dei dati (~25-30 m) e 4 volte meno tessere (~100 KB l'una)
// dello zoom 13; nei confronti con TINITALY lo zoom 12 è stato il più vicino (13 e 14 aggiungono solo rumore)
export const ZOOM_TERRAIN = 12;
export const LATO_TESSERA = 256;
export const CREDITO_TERRAIN = 'Terrain Tiles ~30 m (AWS Open Data, EU-DEM)';

export const urlTessera = (z, x, y) => `${URL_TERRAIN}/${z}/${x}/${y}.png`;

// Web Mercator: coordinate di tessera (frazionarie) di un punto
export function tessereDi(lon, lat, z) {
  const n = 2 ** z;
  const r = (lat * Math.PI) / 180;
  return { x: ((lon + 180) / 360) * n, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n };
}

export const quotaDaRgb = (r, g, b) => r * 256 + g + b / 256 - 32768;

// pixel RGBA (Uint8ClampedArray di 256×256×4) → quote in metri (Float32Array di 256×256)
export function decodificaTessera(rgba) {
  const q = new Float32Array(LATO_TESSERA * LATO_TESSERA);
  for (let i = 0; i < q.length; i++) q[i] = quotaDaRgb(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
  return q;
}

// Quota in un punto, interpolata tra i quattro pixel attorno; tessera(tx, ty) → quote | null | undefined
export function quotaInterpolata(tessera, z, lon, lat) {
  const t = tessereDi(lon, lat, z);
  const px = t.x * LATO_TESSERA - 0.5;
  const py = t.y * LATO_TESSERA - 0.5;
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const fx = px - x0;
  const fy = py - y0;
  const v = (x, y) => {
    const tx = Math.floor(x / LATO_TESSERA);
    const ty = Math.floor(y / LATO_TESSERA);
    const q = tessera(tx, ty);
    return q ? q[(y - ty * LATO_TESSERA) * LATO_TESSERA + (x - tx * LATO_TESSERA)] : null;
  };
  const a = v(x0, y0);
  const b = v(x0 + 1, y0);
  const c = v(x0, y0 + 1);
  const d = v(x0 + 1, y0 + 1);
  const presenti = [a, b, c, d].filter((q) => q != null);
  if (!presenti.length) return null;
  if (presenti.length < 4) return Math.round(presenti[0] * 10) / 10;
  return Math.round(((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy) * 10) / 10;
}

// Lettore: leggiTessera(z, x, y) → Float32Array | null (null = tessera che non c'è). Le tessere si
// scaricano poche alla volta e si tengono in memoria per la visita.
export function creaLettoreTerrain({ leggiTessera, z = ZOOM_TERRAIN, parallele = 6 } = {}) {
  const note = new Map(); // "x/y" → Promise
  const pronte = new Map(); // "x/y" → quote | null
  const carica = (x, y) => {
    const k = `${x}/${y}`;
    if (!note.has(k)) {
      note.set(
        k,
        Promise.resolve(leggiTessera(z, x, y)).then(
          (q) => pronte.set(k, q ?? null),
          (e) => {
            note.delete(k); // si riprova la prossima volta
            throw e;
          },
        ),
      );
    }
    return note.get(k);
  };
  // punti [[lon, lat]…] → quote (null dove manca)
  async function quote(punti) {
    const servono = new Set();
    for (const [lon, lat] of punti) {
      const t = tessereDi(lon, lat, z);
      const px = t.x * LATO_TESSERA - 0.5;
      const py = t.y * LATO_TESSERA - 0.5;
      for (const dx of [0, 1]) for (const dy of [0, 1]) servono.add(`${Math.floor((Math.floor(px) + dx) / LATO_TESSERA)}/${Math.floor((Math.floor(py) + dy) / LATO_TESSERA)}`);
    }
    const chiavi = [...servono];
    for (let i = 0; i < chiavi.length; i += parallele) await Promise.all(chiavi.slice(i, i + parallele).map((k) => carica(...k.split('/').map(Number))));
    const tessera = (tx, ty) => pronte.get(`${tx}/${ty}`);
    return punti.map(([lon, lat]) => quotaInterpolata(tessera, z, lon, lat));
  }
  return { quote };
}
