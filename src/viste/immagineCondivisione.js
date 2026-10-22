// L'immagine verticale (1080×1350) del percorso: mappa con la traccia, km, dislivello, tempo, profilo, nome e «Orme».
// La mappa è fatta con le tessere di OpenStreetMap (se non arrivano, resta uno sfondo semplice con la traccia).
import { LARGHEZZA, ALTEZZA, TEMI, riquadroLinee, vista, suImmagine, serieProfilo } from '../lib/immagine.js';
import { durata } from '../lib/formato.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MAPPA = { x: 60, y: 210, w: 960, h: 720 };
const URL_TESSERA = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

function caricaTessera(url, attesaMs = 8000) {
  return new Promise((risolvi, rifiuta) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const t = setTimeout(() => rifiuta(new Error('tessera lenta')), attesaMs);
    img.onload = () => (clearTimeout(t), risolvi(img));
    img.onerror = () => (clearTimeout(t), rifiuta(new Error('tessera non arrivata')));
    img.src = url;
  });
}

function rettangoloTondo(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// il testo a capo su al massimo `righe` righe
function scrivi(ctx, testo, x, y, larghezza, altezzaRiga, righe) {
  const parole = String(testo).split(/\s+/);
  const out = [];
  let riga = '';
  for (const parola of parole) {
    const prova = riga ? `${riga} ${parola}` : parola;
    if (ctx.measureText(prova).width > larghezza && riga) (out.push(riga), (riga = parola));
    else riga = prova;
  }
  out.push(riga);
  const mostrate = out.slice(0, righe);
  if (out.length > righe) mostrate[righe - 1] = `${mostrate[righe - 1].replace(/\s*\S*$/, '')}…`;
  mostrate.forEach((r, i) => ctx.fillText(r, x, y + i * altezzaRiga));
}

// misure: { km, salita, discesa, durataMin }; pezzi: [[lon, lat, quota?]…]; → Promise<Blob PNG>
export async function creaImmagine({ nome, pezzi, misure, tema = 'chiaro', tessera = caricaTessera }) {
  const T = TEMI[tema] ?? TEMI.chiaro;
  const canvas = document.createElement('canvas');
  canvas.width = LARGHEZZA;
  canvas.height = ALTEZZA;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = T.sfondo;
  ctx.fillRect(0, 0, LARGHEZZA, ALTEZZA);
  ctx.textBaseline = 'alphabetic';

  // nome
  ctx.fillStyle = T.testo;
  ctx.font = `700 60px ${FONT}`;
  scrivi(ctx, nome || 'Percorso', 60, 110, 960, 70, 2);

  // mappa
  const v = vista(riquadroLinee(pezzi), MAPPA.w, MAPPA.h, 80);
  ctx.save();
  rettangoloTondo(ctx, MAPPA.x, MAPPA.y, MAPPA.w, MAPPA.h, 28);
  ctx.clip();
  ctx.fillStyle = T.riquadro;
  ctx.fillRect(MAPPA.x, MAPPA.y, MAPPA.w, MAPPA.h);
  const caricate = await Promise.allSettled(v.tessere.map((t) => tessera(URL_TESSERA(v.z, t.x, t.y)).then((img) => ({ img, t }))));
  const conTessere = caricate.some((c) => c.status === 'fulfilled');
  for (const c of caricate) {
    if (c.status !== 'fulfilled') continue;
    const { img, t } = c.value;
    if (T.scuraMappa && 'filter' in ctx) ctx.filter = 'invert(1) hue-rotate(180deg) brightness(0.92) saturate(0.7)';
    ctx.drawImage(img, MAPPA.x + t.px, MAPPA.y + t.py);
    ctx.filter = 'none';
  }
  if (conTessere && T.scuraMappa && !('filter' in ctx)) {
    ctx.fillStyle = 'rgba(8, 16, 14, 0.55)';
    ctx.fillRect(MAPPA.x, MAPPA.y, MAPPA.w, MAPPA.h);
  }
  // traccia
  const tracciato = (l) => {
    ctx.beginPath();
    l.forEach((p, i) => {
      const [x, y] = suImmagine(p, v);
      if (i) ctx.lineTo(MAPPA.x + x, MAPPA.y + y);
      else ctx.moveTo(MAPPA.x + x, MAPPA.y + y);
    });
  };
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = T.alone;
  ctx.lineWidth = 17;
  for (const l of pezzi) (tracciato(l), ctx.stroke());
  ctx.strokeStyle = T.traccia;
  ctx.lineWidth = 9;
  for (const l of pezzi) (tracciato(l), ctx.stroke());
  // partenza e arrivo
  const estremi = [[pezzi[0][0], '#2f8f3a'], [pezzi.at(-1).at(-1), '#c2410c']];
  for (const [p, colore] of estremi) {
    const [x, y] = suImmagine(p, v);
    ctx.beginPath();
    ctx.arc(MAPPA.x + x, MAPPA.y + y, 16, 0, Math.PI * 2);
    ctx.fillStyle = colore;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  }
  // credito obbligatorio delle tessere
  if (conTessere) {
    ctx.font = `500 20px ${FONT}`;
    const testo = '© OpenStreetMap';
    const w = ctx.measureText(testo).width + 20;
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillRect(MAPPA.x + MAPPA.w - w, MAPPA.y + MAPPA.h - 32, w, 32);
    ctx.fillStyle = '#333';
    ctx.fillText(testo, MAPPA.x + MAPPA.w - w + 10, MAPPA.y + MAPPA.h - 9);
  }
  ctx.restore();

  // numeri
  const colonne = [
    [`${(Math.round(misure.km * 10) / 10).toFixed(1).replace('.', ',')} km`, 'distanza'],
    [misure.salita != null ? `+${misure.salita} m` : '–', 'dislivello in salita'],
    [misure.durataMin != null ? durata(misure.durataMin) : '–', 'tempo'],
  ];
  colonne.forEach(([valore, etichetta], i) => {
    const x = 60 + i * 330;
    ctx.fillStyle = T.testo;
    ctx.font = `700 62px ${FONT}`;
    ctx.fillText(valore, x, 1030);
    ctx.fillStyle = T.tenue;
    ctx.font = `500 28px ${FONT}`;
    ctx.fillText(etichetta, x, 1072);
  });

  // profilo
  const serie = serieProfilo(pezzi);
  if (serie.length > 1) {
    const box = { x: 60, y: 1110, w: 960, h: 150 };
    const zs = serie.map((s) => s.z);
    const [minZ, maxZ] = [Math.min(...zs), Math.max(...zs)];
    const kmTot = serie.at(-1).km || 1;
    const px = (s) => box.x + (s.km / kmTot) * box.w;
    const py = (s) => box.y + box.h - ((s.z - minZ) / Math.max(1, maxZ - minZ)) * (box.h - 16) - 4;
    ctx.beginPath();
    ctx.moveTo(px(serie[0]), box.y + box.h);
    for (const s of serie) ctx.lineTo(px(s), py(s));
    ctx.lineTo(px(serie.at(-1)), box.y + box.h);
    ctx.closePath();
    ctx.fillStyle = T.profilo;
    ctx.fill();
    ctx.beginPath();
    serie.forEach((s, i) => (i ? ctx.lineTo(px(s), py(s)) : ctx.moveTo(px(s), py(s))));
    ctx.strokeStyle = T.traccia;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = T.tenue;
    ctx.font = `500 24px ${FONT}`;
    ctx.fillText(`${Math.round(minZ)} m`, box.x, box.y + box.h + 28);
    const t = `${Math.round(maxZ)} m`;
    ctx.fillText(t, box.x + box.w - ctx.measureText(t).width, box.y + box.h + 28);
  }

  // firma
  ctx.fillStyle = T.tenue;
  ctx.font = `600 26px ${FONT}`;
  ctx.fillText('Orme', 60, 1332);

  return new Promise((risolvi, rifiuta) => canvas.toBlob((b) => (b ? risolvi(b) : rifiuta(new Error('immagine non creata'))), 'image/png'));
}
