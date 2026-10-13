// "I miei percorsi": in un posto solo i sentieri salvati, i percorsi disegnati o importati (GPX)
// e i giri combinati. Ogni scheda riusa la sua schermata di prima.
import { vistaSalvati } from './salvati.js';
import { vistaPianifica } from './pianifica.js';
import { vistaGiri } from './giri.js';

const SCHEDE = [
  ['salvati', 'Salvati', vistaSalvati],
  ['percorsi', 'Disegnati', vistaPianifica],
  ['giri', 'Giri', vistaGiri],
];

export async function vistaMiei(app, scelta) {
  const [chiave, , vista] = SCHEDE.find(([k]) => k === scelta) ?? SCHEDE[0];
  app.innerHTML = `
    <h1 class="titolo-pagina">I miei percorsi</h1>
    <div class="segmenti schede-miei" role="tablist" aria-label="I miei percorsi">
      ${SCHEDE.map(([k, nome]) => `<a role="tab" class="segmento ${k === chiave ? 'attivo' : ''}" aria-selected="${k === chiave}" href="#/miei?scheda=${k}">${nome}</a>`).join('')}
    </div>
    <div class="contenuto-miei"></div>`;
  return vista(app.querySelector('.contenuto-miei'));
}
