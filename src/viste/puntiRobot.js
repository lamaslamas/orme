// Rifugi e acqua preparati dal robot per tutta Italia, a quadrati di 0,5° (src/lib/puntiItalia.js):
// prima l'indice (piccolo), poi solo i file dei quadrati che servono. Se mancano (robot non ancora
// passato, offline) restano le celle da Overpass come riserva.
import { fileDellaVista, riquadroQuadrato, idQuadrato } from '../lib/puntiItalia.js';

let indice = null;
export function leggiIndice() {
  indice ??= fetch(`${import.meta.env.BASE_URL}dati/punti/indice.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => d?.quadrati ?? null)
    .catch(() => null)
    .then((q) => {
      if (!q) indice = null; // si riprova la prossima volta
      return q;
    });
  return indice;
}

const file = new Map();
function leggiFile(id) {
  if (!file.has(id)) {
    file.set(
      id,
      fetch(`${import.meta.env.BASE_URL}dati/punti/${id}.json`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`quadrato ${id}: ${r.status}`))))
        .then((d) => d.punti ?? [])
        .catch((e) => {
          file.delete(id);
          throw e;
        }),
    );
  }
  return file.get(id);
}

// riquadro [sud, ovest, nord, est] → { punti, coperti: riquadri dei quadrati letti (anche vuoti) }
export async function puntiDelRobot(riquadro, { max = 6 } = {}) {
  const q = await leggiIndice();
  if (!q) return { punti: [], coperti: [] };
  const ids = fileDellaVista(riquadro, q, max);
  const punti = [];
  const coperti = [];
  for (const id of ids) {
    try {
      punti.push(...(await leggiFile(id)));
      coperti.push(riquadroQuadrato(id));
    } catch {
      // un file non arrivato: quella zona resta alla riserva
    }
  }
  // i quadrati vuoti (mare, estero) contano come coperti: niente Overpass lì
  const [s, o, n, e] = riquadro;
  for (let la = Math.floor(s / 0.5); la * 0.5 < n; la++) for (let lo = Math.floor(o / 0.5); lo * 0.5 < e; lo++) if (q[`${la}_${lo}`]?.n === 0) coperti.push(riquadroQuadrato(`${la}_${lo}`));
  return { punti, coperti };
}

// un punto [lon, lat] è in un quadrato già passato dal robot?
export async function quadratoFatto([lon, lat]) {
  const q = await leggiIndice();
  return Boolean(q?.[idQuadrato(lon, lat)]);
}
