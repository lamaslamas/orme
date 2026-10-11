// Etichetta fauna, uguale in tutte le liste: quanto spesso è stata vista fauna lungo il
// percorso (iNaturalist verificato e uscite delle associazioni) e quali animali.
import { ANIMALI } from '../lib/costanti.js';
import { escapeHtml } from '../lib/formato.js';
import { possibilitaFauna, POSSIBILITA_FAUNA } from '../lib/faunaPercorso.js';
import { ICONE } from './icone.js';

const SPIEGAZIONE =
  'Da osservazioni verificate (iNaturalist, eBird e altre fonti) e dalle uscite delle associazioni: dice quanto spesso sono stati visti, non garantisce un incontro.';

// mese: 1-12 (di base quello attuale); riga: formato a riga con icona (schede di "Dove vado")
// stagione: livello calcolato solo sulle osservazioni di questo mese e di quelli accanto
export function htmlFaunaBreve(s, { mese = new Date().getMonth() + 1, riga = false, compatta = false, stagione = false } = {}) {
  const f = possibilitaFauna(s, mese, { stagione });
  if (!f) return '';
  const nomi = f.specie.slice(0, compatta ? 2 : 3).map((a) => escapeHtml(ANIMALI[a] ?? a)).join(', ');
  // il periodo migliore dell'anno, per sapere quando tornare
  const periodo = f.periodo ? ` <span class="tenue">· meglio ${escapeHtml(f.periodo)}</span>` : '';
  const testo = `<b>${POSSIBILITA_FAUNA[f.livello]}</b>${nomi ? ` · ${nomi}` : ''}${f.nelPeriodo && !compatta && !stagione ? ' <span class="tenue">(in questo periodo)</span>' : ''}${periodo}`;
  if (riga) return `<span class="riga-meteo fauna-breve fauna-${f.livello}" title="${SPIEGAZIONE}">${ICONE.zampa}<span>${testo}</span></span>`;
  return `<span class="fauna-breve fauna-${f.livello}" title="${SPIEGAZIONE}">${ICONE.zampa}<span>${testo}</span></span>`;
}
