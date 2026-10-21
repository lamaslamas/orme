// «Modifica traccia»: il pulsante c'è in qualsiasi punto dell'app da cui si apre un sentiero, un percorso, una
// carrareccia o un sentiero non segnato. Chi aggiunge un altro punto da cui si apre un sentiero deve usare questi:
//  - sentiero dell'archivio: #/sentiero/<id>/disegna (si salva sempre una copia in I miei percorsi)
//  - mio percorso (disegnato, importato): #/percorso/<id>/disegna (modifica diretta)
//  - carrareccia o sentiero non segnato toccato sulla mappa: dal foglio al tocco (foglioVia.js)
import { escapeHtml } from '../lib/formato.js';
import { ICONE } from './icone.js';

export const hrefModificaTraccia = (tipo, id) => `#/${tipo === 'percorso' ? 'percorso' : 'sentiero'}/${encodeURIComponent(id)}/disegna`;

// il pulsante; classe e contenuto secondo il punto in cui compare: 'pieno' (bottone con testo), 'icona' (solo matita, nelle card)
export function linkModificaTraccia(tipo, id, { stile = 'pieno', classe = '' } = {}) {
  const href = hrefModificaTraccia(tipo, id);
  if (stile === 'icona') return `<a class="modifica-carta ${escapeHtml(classe)}" href="${href}" aria-label="Modifica traccia" title="Modifica traccia">${ICONE.matita}</a>`;
  return `<a class="bottone ${escapeHtml(classe)}" href="${href}">${ICONE.matita}<span>Modifica traccia</span></a>`;
}
