// Giro combinato (non c'è più nell'app): più sentieri in fila, ciascuno eventualmente al contrario. Resta il calcolo che
// serve a trasformare i giri salvati in percorsi miei (src/lib/migrazione.js).
import { unisciTappe } from './tracce.js';

// sentieri e tracce: Map id -> oggetto. → { geojson (le tappe unite in fila), problemi (tappe senza sentiero o senza traccia) }
export function calcolaGiro(giro, sentieri, tracce) {
  const tappe = (giro.tappe ?? [])
    .filter((t) => t && typeof t.sentieroId === 'string')
    .map((t) => {
      const sentiero = sentieri.get(t.sentieroId) ?? null;
      const traccia = tracce.get(t.sentieroId) ?? null;
      return { sentieroId: t.sentieroId, alContrario: Boolean(t.alContrario), mancante: !sentiero, senzaTraccia: Boolean(sentiero) && !traccia?.geojson?.coordinates?.length, geojson: traccia?.geojson ?? null };
    });
  const { pezzi } = unisciTappe(tappe);
  return { geojson: { type: 'MultiLineString', coordinates: pezzi.map((p) => p.linea) }, problemi: tappe.filter((t) => t.mancante || t.senzaTraccia) };
}
