// Il tratto con più fauna sulla mappa: una linea arancione più spessa sopra la traccia (scheda e mappa grande)
import L from 'leaflet';
import { lineaTraKm } from '../lib/lungoIlPercorso.js';
import { testoTratto } from '../lib/trattoFauna.js';

export function segnaTrattoFauna(mappa, pezzi, tratto) {
  if (!tratto || !pezzi?.length) return null;
  const linea = lineaTraKm(pezzi, tratto.daKm, tratto.aKm).map(([lon, lat]) => [lat, lon]);
  if (linea.length < 2) return null;
  return L.polyline(linea, { color: '#f08c00', weight: 8, opacity: 0.85, interactive: true, lineCap: 'round' })
    .bindTooltip(`Più fauna: ${testoTratto(tratto)}`, { sticky: true })
    .addTo(mappa);
}
