// Il profilo altimetrico piccolo (come nel disegno): linea e area, quota minima e massima, la fonte delle
// quote; toccando o scorrendo il dito si vede il punto (km e quota) e la mappa lo mostra.
import { puntoAlKm } from '../lib/disegno.js';
import { km1 } from '../lib/lungoIlPercorso.js';
import { escapeHtml } from '../lib/formato.js';

const L = 300;
const A = 60;

// serie: [{ km, z, p }] (profiloPezzi); fonte: testo della fonte delle quote
export function htmlProfiloMini(serie, fonte = '') {
  if (!serie || serie.length < 2) return '';
  const zs = serie.map((x) => x.z);
  const [min, max] = [Math.min(...zs), Math.max(...zs)];
  const tot = serie.at(-1).km || 1;
  const X = (km) => (km / tot) * L;
  const Y = (z) => A - 4 - ((z - min) / (max - min || 1)) * (A - 10);
  const d = serie.map((x, i) => `${i ? 'L' : 'M'}${X(x.km).toFixed(1)} ${Y(x.z).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${L} ${A}" preserveAspectRatio="none" role="img" aria-label="Profilo altimetrico: da ${Math.round(min)} a ${Math.round(max)} m">
      <path d="${d} L${L} ${A} L0 ${A} Z" class="profilo-area"/><path d="${d}" class="profilo-linea" fill="none" vector-effect="non-scaling-stroke"/>
      <line class="profilo-cursore" x1="-10" x2="-10" y1="0" y2="${A}" vector-effect="non-scaling-stroke"/></svg>
    <p class="profilo-dati"><span>min ${Math.round(min)} m · max ${Math.round(max)} m</span><span class="dato-profilo"></span></p>
    ${fonte ? `<p class="profilo-fonte tenue">${escapeHtml(fonte)}</p>` : ''}`;
}

// box: il contenitore (il suo contenuto si può riscrivere); serie(): la serie attuale;
// alPunto({ km, z, p }): per mostrare il punto sulla mappa. Tocco e scorrimento.
export function collegaProfiloMini(box, serie, alPunto) {
  let premuto = false;
  const vai = (e) => {
    const svg = e.target.closest?.('svg') ?? box.querySelector('svg');
    const s = serie();
    if (!svg || !s || s.length < 2) return;
    const r = svg.getBoundingClientRect();
    const tot = s.at(-1).km;
    const frazione = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const x = puntoAlKm(s, frazione * tot);
    alPunto(x);
    const cursore = svg.querySelector('.profilo-cursore');
    const px = ((x.km / tot) * L).toFixed(1);
    cursore?.setAttribute('x1', px);
    cursore?.setAttribute('x2', px);
    const dato = box.querySelector('.dato-profilo');
    if (dato) dato.textContent = `km ${km1(x.km)} · ${Math.round(x.z)} m`;
  };
  box.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('svg')) return;
    premuto = true;
    box.setPointerCapture?.(e.pointerId);
    vai(e);
  });
  box.addEventListener('pointermove', (e) => premuto && vai(e));
  const fine = () => (premuto = false);
  box.addEventListener('pointerup', fine);
  box.addEventListener('pointercancel', fine);
}
