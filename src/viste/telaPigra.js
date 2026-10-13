// Tele canvas di Leaflet "pigre": a fine movimento Leaflet ridimensiona e ridisegna da capo ogni tela
// (tracce, rifugi e acqua, fauna…), anche dopo uno spostamento di pochi pixel; sul telefono con
// centinaia di tracce costava centinaia di millisecondi al momento di staccare il dito. Qui, se lo
// zoom è lo stesso e lo schermo è ancora dentro la zona già disegnata (con un margine più ampio,
// 30% per lato), la tela resta com'è: il riquadro della mappa si sposta e la porta con sé.
import L from 'leaflet';

let fatto = false;
export function telePigre() {
  if (fatto) return;
  fatto = true;
  L.Canvas.mergeOptions({ padding: 0.3 });
  const aggiorna = L.Canvas.prototype._update;
  L.Canvas.include({
    _update() {
      const m = this._map;
      if (this._bounds && !m._animatingZoom && this._zoom === m.getZoom() && !this._forzaAggiornamento) {
        const dim = m.getSize();
        const vista = L.bounds(m.containerPointToLayerPoint([0, 0]), m.containerPointToLayerPoint(dim));
        if (this._bounds.contains(vista)) return; // già disegnata: niente da rifare
      }
      this._forzaAggiornamento = false;
      return aggiorna.call(this);
    },
  });
}
