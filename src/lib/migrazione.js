// Cose che nell'app non ci sono più e i dati che avevano lasciato sul telefono: i giri diventano percorsi miei; gli
// avvistamenti personali si scaricano in un file (backup) e poi si possono eliminare. Niente di tutto questo parte da solo
// verso l'esterno: i dati personali restano sul telefono, nel file che scarichi tu.
import { calcolaGiro } from './giro.js';

export const idPercorsoDaGiro = (giro) => `percorso-giro-${giro.id}`;

// Un giro salvato → un percorso mio con le tappe unite in fila (la traccia come si vedeva nel giro). null se non c'è
// nessuna traccia da tenere (tappe senza traccia o sentieri eliminati).
export function giroInPercorso(giro, sentieri, tracce, adesso = new Date().toISOString()) {
  const { geojson, problemi } = calcolaGiro(giro, sentieri, tracce);
  if (!geojson.coordinates.length) return null;
  const note = [
    giro.notePersonali?.trim(),
    'Era un giro con più sentieri.',
    giro.stato === 'fatto' ? `Fatto${giro.dataPercorso ? ` il ${giro.dataPercorso}` : ''}.` : '',
    problemi.length ? `Mancano ${problemi.length} tappe senza traccia o eliminate.` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return {
    id: idPercorsoDaGiro(giro),
    nome: giro.nome || 'Giro',
    note,
    origine: 'disegnato',
    puntiControllo: [],
    geojson,
    terreno: [],
    fonteTerreno: null,
    creato: giro.creato ?? adesso,
    modificato: adesso,
  };
}

// i giri che non sono ancora percorsi, trasformati (senza quelli senza traccia)
export function giriDaConvertire(giri, sentieri, tracce, percorsiEsistenti = new Set(), adesso) {
  return giri.filter((g) => !percorsiEsistenti.has(idPercorsoDaGiro(g))).map((g) => giroInPercorso(g, sentieri, tracce, adesso)).filter(Boolean);
}

// nome del file del backup completo dei dati che stanno per sparire
export const nomeFileBackupCompleto = (adesso = new Date()) => `orme-backup-completo-${adesso.toISOString().slice(0, 10)}.json`;
