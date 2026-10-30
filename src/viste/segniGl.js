// Le icone della mappa MapLibre come immagini di un livello (symbol layer), non come marcatori HTML: la GPU le disegna tutte
// insieme e la mappa resta fluida anche con centinaia di punti. Qui si disegnano le immagini (su una tela) e si aggiungono alla mappa.
const IMMAGINI = new Map(); // url → promessa dell'immagine (null se non si carica)
export function caricaImmagine(url) {
  if (!IMMAGINI.has(url)) {
    IMMAGINI.set(
      url,
      new Promise((risolvi) => {
        const img = new Image();
        img.onload = () => risolvi(img);
        img.onerror = () => risolvi(null);
        img.src = url;
      }),
    );
  }
  return IMMAGINI.get(url);
}

const DENSITA = 2;
// disegna(ctx) lavora in px CSS; l'immagine ha il doppio dei pixel (schermi nitidi)
export function aggiungiImmagine(mappa, id, larghezza, altezza, disegna) {
  if (mappa.hasImage(id)) return;
  const tela = document.createElement('canvas');
  tela.width = larghezza * DENSITA;
  tela.height = altezza * DENSITA;
  const ctx = tela.getContext('2d');
  ctx.scale(DENSITA, DENSITA);
  disegna(ctx);
  mappa.addImage(id, ctx.getImageData(0, 0, tela.width, tela.height), { pixelRatio: DENSITA });
}

// --- punti di interesse: un quadrato arrotondato con un disegno (mai una lettera) e la punta in basso ---
export const POI_L = 30;
export const POI_A = 36;
const GLIFI = {
  goccia: (c) => {
    c.beginPath();
    c.moveTo(15, 6);
    c.bezierCurveTo(21, 13, 22, 16, 22, 18);
    c.arc(15, 18, 7, 0, Math.PI);
    c.bezierCurveTo(8, 16, 9, 13, 15, 6);
    c.fill();
  },
  casa: (c) => {
    c.beginPath();
    c.moveTo(6, 16);
    c.lineTo(15, 7);
    c.lineTo(24, 16);
    c.lineTo(21, 16);
    c.lineTo(21, 23);
    c.lineTo(9, 23);
    c.lineTo(9, 16);
    c.closePath();
    c.fill();
  },
  capanno: (c) => {
    // una casetta con la feritoia: il capanno di osservazione
    c.beginPath();
    c.moveTo(6, 15);
    c.lineTo(15, 8);
    c.lineTo(24, 15);
    c.lineTo(24, 23);
    c.lineTo(6, 23);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.fillRect(10, 15, 10, 3);
  },
  occhio: (c) => {
    c.beginPath();
    c.ellipse(15, 15, 9, 5.5, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.beginPath();
    c.arc(15, 15, 2.8, 0, Math.PI * 2);
    c.fill();
  },
  cima: (c) => {
    c.beginPath();
    c.moveTo(5, 23);
    c.lineTo(12, 10);
    c.lineTo(16, 16);
    c.lineTo(19, 12);
    c.lineTo(25, 23);
    c.closePath();
    c.fill();
  },
  sosta: (c) => {
    // un'auto vista di lato
    c.beginPath();
    c.moveTo(6, 19);
    c.lineTo(8, 13);
    c.lineTo(22, 13);
    c.lineTo(24, 19);
    c.lineTo(24, 22);
    c.lineTo(6, 22);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.beginPath();
    c.arc(10.5, 22, 2.6, 0, Math.PI * 2);
    c.arc(19.5, 22, 2.6, 0, Math.PI * 2);
    c.fill();
  },
};
export function disegnaPoi(ctx, { colore, glifo }, selezionato = false) {
  ctx.shadowColor = 'rgba(37, 50, 56, 0.45)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = colore;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(2, 2, 26, 26, 7) : ctx.rect(2, 2, 26, 26);
  ctx.moveTo(11, 28);
  ctx.lineTo(15, 33);
  ctx.lineTo(19, 28);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = selezionato ? 3 : 2;
  ctx.strokeStyle = '#fff';
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(2, 2, 26, 26, 7) : ctx.rect(2, 2, 26, 26);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  GLIFI[glifo]?.(ctx);
}

// --- fauna: lo spillo dell'animale con il numero di osservazioni (come sulla mappa principale) ---
export const FAUNA_L = 40;
export const FAUNA_A = 50;
export function disegnaFauna(ctx, { img, sfumata, conto }) {
  const x = FAUNA_L / 2; // la punta dello spillo sta in basso al centro dell'immagine (il numero a destra)
  const y = FAUNA_A + 2;
  const cy = y - 22;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, cy, 13, Math.PI * 0.75, Math.PI * 0.25);
  ctx.lineTo(x, y - 3);
  ctx.closePath();
  ctx.shadowColor = 'rgba(37, 50, 56, 0.4)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = sfumata ? 'rgba(241, 236, 255, 0.85)' : '#fff';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#7c6cf0';
  if (sfumata) ctx.setLineDash([4, 3]);
  ctx.stroke();
  ctx.setLineDash([]);
  if (img) {
    ctx.globalAlpha = sfumata ? 0.6 : 1;
    ctx.drawImage(img, x - 9, cy - 9, 18, 18);
    ctx.globalAlpha = 1;
  }
  if (conto > 1) {
    const testo = conto > 99 ? '99+' : String(conto);
    ctx.font = '700 10px Inter, system-ui, sans-serif';
    const w = Math.max(16, ctx.measureText(testo).width + 8);
    ctx.fillStyle = '#5b4b9a';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y - 42, w, 16, 8) : ctx.rect(x, y - 42, w, 16);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(testo, x + w / 2, y - 34);
  }
  ctx.restore();
}
export const idImmagineFauna = (urlIcona, sfumata, conto) => `fauna|${urlIcona}|${sfumata ? 1 : 0}|${conto > 99 ? 99 : conto}`;

// l'icona di una categoria per gli elenchi (stessa del segnaposto), come immagine in linea
const URL_ICONE = new Map();
export function urlIconaPoi(categoria) {
  if (!URL_ICONE.has(categoria.chiave)) {
    const tela = document.createElement('canvas');
    tela.width = POI_L * DENSITA;
    tela.height = POI_A * DENSITA;
    const ctx = tela.getContext('2d');
    ctx.scale(DENSITA, DENSITA);
    disegnaPoi(ctx, categoria);
    URL_ICONE.set(categoria.chiave, tela.toDataURL('image/png'));
  }
  return URL_ICONE.get(categoria.chiave);
}
