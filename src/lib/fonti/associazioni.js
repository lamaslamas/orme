// Associazioni e guide lette come "elenco + pagine" (schema comune: ./schema.js).
// Per aggiungerne una: un modulo come ecotur.js e una riga qui (guida: scripts/FONTI.md).
import { ECOTUR } from './ecotur.js';
import { BEL_SENTIERO } from './belSentiero.js';
import { PARCO_MAJELLA } from './parcoMajella.js';

// giorno (0 = domenica … 6 = sabato): fonti lette una volta a settimana, quel giorno
export const ASSOCIAZIONI = [ECOTUR, BEL_SENTIERO, PARCO_MAJELLA];
