// Il tratto con più fauna sulla mappa: una linea arancione più spessa sopra la traccia (scheda e mappa grande)
import L from 'leaflet';
import { lineaTraKm } from '../lib/lungoIlPercorso.js';
import { testoTratto } from '../lib/trattoFauna.js';

export function segnaTrattoFauna(mappa, pezzi, tratto) {
  if (!tratto || !pezzi?.length) return null;
  const linea = lineaTraKm(pezzi, tratto.daKm, tratto.aKm).map(([lon, lat]) => [lat, lon]);
  if (linea.length < 2) return null;
  const l = L.polyline(linea, { color: '#f08c00', weight: 8, opacity: 0.85, interactive: true, lineCap: 'round' })
    .bindPopup(`<b>Più fauna: ${testoTratto(tratto)}</b><br><span class="tenue piccolo">Il tratto in cui più persone diverse (${tratto.persone}) hanno segnalato animali entro 150 m dalla traccia. Osservazioni di volontari: non garantiscono un incontro.</span>`)
    .addTo(mappa);
  // nella legenda del pulsante dei livelli
  const m = mappa._map ?? mappa;
  m.vociLegenda?.push(() =>
    m.hasLayer(l)
      ? '<div class="voce-legenda"><b>Più fauna</b><ul class="legenda-sentieri"><li><svg viewBox="0 0 34 10" width="34" height="10" aria-hidden="true"><path d="M2 5H32" stroke="#f08c00" stroke-width="7" stroke-linecap="round"/></svg>Il tratto con più osservatori diversi (toccalo)</li></ul></div>'
      : '',
  );
  return l;
}
