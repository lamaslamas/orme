// Partenza di "Crea un anello": la mia posizione o un punto scelto sulla mappa. Il punto scelto si aggancia al
// punto più vicino della rete di sentieri (l'anello deve partire da un sentiero). Solo dove parte l'anello:
// il calcolo dell'anello resta quello di sempre.
import { distanzaKm } from './geo.js';

export const MAX_AGGANCIO_M = 2000; // oltre: lì non ci sono sentieri per creare un anello
export const AVVISO_SPOSTAMENTO_M = 300; // oltre: si dice che la partenza è stata spostata

// Il punto più vicino a p sul segmento a-b (piano locale, basta per poche centinaia di metri)
function suSegmento(p, a, b) {
  const k = Math.cos((p[1] * Math.PI) / 180);
  const [ax, ay, bx, by, px, py] = [a[0] * k, a[1], b[0] * k, b[1], p[0] * k, p[1]];
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// punto: [lon, lat]; linee: [{ linea: [[lon, lat], …], nome }]
// → { stato: 'ok' | 'spostata' | 'lontano', punto, distanzaM, nome }
//   ok: agganciato entro 300 m; spostata: agganciato più lontano (lo si dice); lontano: nessun sentiero entro 2 km
//   (il punto resta dov'è e non vale come partenza)
export function agganciaPartenza(punto, linee, { maxM = MAX_AGGANCIO_M } = {}) {
  let migliore = null;
  for (const { linea, nome = null } of linee ?? []) {
    for (let i = 0; i < (linea?.length ?? 0); i++) {
      const q = linea.length === 1 ? linea[0] : i ? suSegmento(punto, linea[i - 1], linea[i]) : null;
      if (!q) continue;
      const d = distanzaKm(punto, q) * 1000;
      if (!migliore || d < migliore.d) migliore = { d, q, nome };
    }
  }
  if (!migliore || migliore.d > maxM) return { stato: 'lontano', punto, distanzaM: migliore ? Math.round(migliore.d) : null, nome: null };
  const distanzaM = Math.round(migliore.d);
  return { stato: distanzaM > AVVISO_SPOSTAMENTO_M ? 'spostata' : 'ok', punto: [migliore.q[0], migliore.q[1]], distanzaM, nome: migliore.nome };
}

// Il messaggio sotto la scelta della partenza (null se non serve dire niente)
export function testoAggancio(r) {
  if (!r) return null;
  if (r.stato === 'lontano') return 'Qui intorno (entro 2 km) non ci sono sentieri per creare un anello: scegli un altro punto.';
  if (r.stato === 'spostata') return `Il sentiero più vicino è a ${r.distanzaM} m: partenza spostata lì.`;
  return null;
}

// Scelta iniziale: la mia posizione se il GPS c'è, altrimenti un punto sulla mappa con il motivo.
// gps: { disponibile: bool, errore: 'negato' | 'non-trovata' | 'non-supportato' | null }
export function sceltaIniziale(gps) {
  if (gps?.disponibile) return { modo: 'gps', motivo: null };
  const motivo =
    gps?.errore === 'negato'
      ? 'La posizione non è permessa (permesso negato): scegli la partenza sulla mappa.'
      : gps?.errore === 'non-supportato'
        ? 'Questo dispositivo non dà la posizione: scegli la partenza sulla mappa.'
        : 'Posizione non trovata: scegli la partenza sulla mappa.';
  return { modo: 'mappa', motivo };
}

// C'è una partenza valida per generare l'anello?
export function partenzaValida({ modo, gps = null, scelta = null }) {
  if (modo === 'gps') return Boolean(gps);
  return Boolean(scelta && scelta.stato !== 'lontano');
}

// Da dove parte, per il riepilogo: "dalla tua posizione", "da <sentiero o località>", "dal punto scelto"
export function daDoveParte({ modo, scelta = null }) {
  if (modo === 'gps') return 'dalla tua posizione';
  return scelta?.nome ? `da ${scelta.nome}` : 'dal punto scelto';
}

// Stato di "Crea un anello" quando cambia la partenza dopo la generazione: le scelte restano (lunghezza,
// fatica), gli anelli già trovati non valgono più e "Rigenera" riparte dal primo giro da lì
export function cambiaPartenza(stato, scelta) {
  return { ...stato, scelta, anelli: [], giro: 0, daRigenerare: Boolean(stato.anelli?.length) };
}
