// La matita (o «Disegna un percorso») con una bozza salvata: si sceglie tra «Riprendi la bozza» e «Nuovo percorso»
// (che elimina la bozza, dopo una conferma). Un solo ascoltatore per tutta l'app.
import { leggiBozza, cancellaBozza, impostaAperturaDisegno } from '../lib/bozza.js';

let collegato = false;
export function collegaSceltaBozza() {
  if (collegato) return;
  collegato = true;
  // in fase di cattura: prima degli altri ascoltatori, che aprirebbero subito il pianificatore
  document.addEventListener(
    'click',
    (e) => {
      const link = e.target.closest?.('a[href="#/percorso-nuovo"]');
      if (!link || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || !(leggiBozza()?.punti?.length > 0)) return;
      e.preventDefault();
      e.stopPropagation();
      apriScelta();
    },
    true,
  );
}

function apriScelta() {
  document.querySelector('.foglio-bozza')?.remove();
  const d = document.createElement('dialog');
  d.className = 'foglio foglio-bozza';
  const n = leggiBozza()?.punti?.length ?? 0;
  d.innerHTML = `<div class="foglio-maniglia" aria-hidden="true"></div>
    <h2 class="foglio-titolo">Hai una bozza di percorso</h2>
    <p class="tenue piccolo">${n} ${n === 1 ? 'punto' : 'punti'} sul telefono: puoi riprenderla o cominciare da capo.</p>
    <div class="azioni-salva">
      <button type="button" class="bottone primario" data-scelta="riprendi">Riprendi la bozza</button>
      <button type="button" class="bottone" data-scelta="nuovo">Nuovo percorso</button>
      <button type="button" class="bottone" data-scelta="annulla">Annulla</button>
    </div>`;
  document.body.append(d);
  const chiudi = () => {
    d.close();
    d.remove();
  };
  d.addEventListener('click', (e) => {
    if (e.target === d) return chiudi();
    const scelta = e.target.closest('[data-scelta]')?.dataset.scelta;
    if (!scelta || scelta === 'annulla') return scelta && chiudi();
    if (scelta === 'riprendi') {
      impostaAperturaDisegno('bozza');
      chiudi();
      location.hash = '#/percorso-nuovo';
    } else if (scelta === 'nuovo' && confirm('Eliminare la bozza del percorso che stavi disegnando e cominciarne uno nuovo?')) {
      cancellaBozza();
      chiudi();
      location.hash = '#/percorso-nuovo';
    }
  });
  d.addEventListener('cancel', () => d.remove());
  d.showModal();
}
