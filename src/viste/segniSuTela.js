// Segni disegnati su una tela canvas invece che come segnaposto HTML (rifugi, acqua, icone della
// fauna). Con centinaia di segnaposto HTML il telefono rallentava: Leaflet ne fa un livello grafico
// ciascuno (anche fuori dallo schermo) e la GPU li deve comporre tutti a ogni fotogramma. Sulla tela
// si disegnano solo quelli inquadrati, alla fine del movimento; durante il trascinamento la tela si
// sposta tutta insieme. Tocchi e riquadri (bindPopup) funzionano come prima.
import L from 'leaflet';

// una tela per mappa, sopra le tracce e sotto i riquadri
export function telaSegni(mappa) {
  if (mappa._telaSegni) return mappa._telaSegni;
  if (!mappa.getPane('segni')) {
    mappa.createPane('segni');
    mappa.getPane('segni').style.zIndex = 600; // come i segnaposto di Leaflet
  }
  mappa._telaSegni = L.canvas({ pane: 'segni', padding: 0.2, tolerance: 4 });
  return mappa._telaSegni;
}

// Segno: disegno(ctx, x, y) disegna intorno al punto (x, y) in pixel della tela;
// centro: [dx, dy] del centro della zona toccabile rispetto al punto (es. lo spillo sopra il punto)
export const SegnoSuTela = L.CircleMarker.extend({
  options: { radius: 12, centro: [0, 0], disegno: null, interactive: true },
  _updatePath() {
    const r = this._renderer;
    if (!r?._drawing || this._empty() || !this.options.disegno) return;
    this.options.disegno(r._ctx, this._point.x, this._point.y);
  },
  _containsPoint(p) {
    const [dx, dy] = this.options.centro;
    return p.distanceTo(this._point.add([dx, dy])) <= this._radius + this._clickTolerance();
  },
  // il riquadro "vuoto" si calcola sulla zona disegnata (con lo spillo sopra il punto)
  _updateBounds() {
    const r = this._radius + 4;
    const [dx, dy] = this.options.centro;
    const c = this._point.add([dx, dy]);
    this._pxBounds = new L.Bounds(c.subtract([r, r]), c.add([r, r]));
  },
});

// Immagini (le icone degli animali): caricate una volta; quando sono pronte la tela si ridisegna
const immagini = new Map();
export function immagine(url, tela) {
  let voce = immagini.get(url);
  if (!voce) {
    const img = new Image();
    voce = { img, pronta: false, tele: new Set() };
    img.onload = () => {
      voce.pronta = true;
      for (const t of voce.tele) t._redraw?.();
      voce.tele.clear();
    };
    img.src = url;
    immagini.set(url, voce);
  }
  if (!voce.pronta && tela) voce.tele.add(tela);
  return voce.pronta ? voce.img : null;
}

// Tracciati SVG (attributo d) disegnati con Path2D: il simbolo di un rifugio o di una fonte senza
// immagini da caricare. parti: [{ d, fill, stroke, larghezza }] in un riquadro 24 × 24
export function disegnaTracciati(ctx, parti, x, y, lato, colore) {
  const k = lato / 24;
  ctx.save();
  ctx.translate(x - lato / 2, y - lato / 2);
  ctx.scale(k, k);
  for (const p of parti) {
    const path = new Path2D(p.d);
    const col = (c) => (c === 'currentColor' ? colore : c);
    if (p.fill && p.fill !== 'none') {
      ctx.fillStyle = col(p.fill);
      ctx.fill(path);
    }
    if (p.stroke) {
      ctx.strokeStyle = col(p.stroke);
      ctx.lineWidth = p.larghezza ?? 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke(path);
    }
  }
  ctx.restore();
}
