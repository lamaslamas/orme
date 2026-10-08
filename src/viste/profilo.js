// Profilo altimetrico colorato per pendenza, con riepilogo e tratti più ripidi
import { analizzaPendenze, CLASSI_PENDENZA, classePendenza } from '../lib/pendenza.js';

const L = 320;
const A = 120;
const fmt = (n) => n.toFixed(1).replace('.', ',');
const segno = (p) => `${p >= 0 ? '+' : '−'}${Math.round(Math.abs(p))}%`;

export function htmlProfiloPendenze(pezzi, { sotto = '' } = {}) {
  const a = analizzaPendenze(pezzi);
  if (!a) return '';
  const { campioni, pendenze: p } = a;
  const tot = campioni.at(-1).m || 1;
  const quote = campioni.map((c) => c.quota);
  const min = Math.min(...quote);
  const max = Math.max(...quote);
  const margine = Math.max(20, (max - min) * 0.1);
  const x = (m) => (m / tot) * L;
  const y = (q) => A - ((q - (min - margine)) / (max - min + 2 * margine)) * A;
  const r = (n) => Math.round(n * 10) / 10;

  // aree colorate: tratti consecutivi della stessa classe uniti in un solo poligono
  const aree = [];
  let inizio = 0;
  for (let i = 1; i <= campioni.length; i++) {
    const classe = i < campioni.length ? classePendenza((p[i] + p[i - 1]) / 2) : null;
    const classePrecedente = classePendenza((p[inizio + 1 < campioni.length ? inizio + 1 : inizio] + p[inizio]) / 2);
    if (i === campioni.length || classe !== classePrecedente) {
      const tratto = campioni.slice(inizio, i);
      const punti = tratto.map((c) => `${r(x(c.m))},${r(y(c.quota))}`).join(' ');
      aree.push(
        `<polygon points="${punti} ${r(x(tratto.at(-1).m))},${A} ${r(x(tratto[0].m))},${A}" fill="${CLASSI_PENDENZA[classePrecedente].colore}"/>`,
      );
      inizio = i - 1;
    }
  }
  const linea = campioni.map((c, i) => `${i ? 'L' : 'M'}${r(x(c.m))} ${r(y(c.quota))}`).join('');
  const kmTot = fmt(tot / 1000);

  return `<section class="riquadro">
    <h2>Profilo e pendenze</h2>
    <svg class="profilo" viewBox="0 0 ${L} ${A}" preserveAspectRatio="none" role="img"
      aria-label="Profilo altimetrico colorato per pendenza: da ${Math.round(min)} a ${Math.round(max)} metri su ${kmTot} km">
      ${aree.join('')}
      <path d="${linea}" fill="none" stroke="#13241d" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
    </svg>
    <div class="profilo-assi"><span>0 km</span><span>min ${Math.round(min)} m · max ${Math.round(max)} m</span><span>${kmTot} km</span></div>
    ${sotto}
    <div class="legenda-pendenze">${CLASSI_PENDENZA.map(
      (c, i) => `<span><i style="background:${c.colore}"></i>${c.nome}${a.perClasse[i] > 0.05 ? ` <b>${fmt(a.perClasse[i])} km</b>` : ''}</span>`,
    ).join('')}</div>
    <dl class="riepilogo-pendenze">
      <div class="riga"><dt>In salita</dt><dd>${fmt(a.km.salita)} km</dd></div>
      <div class="riga"><dt>In discesa</dt><dd>${fmt(a.km.discesa)} km</dd></div>
      <div class="riga"><dt>In piano</dt><dd>${fmt(a.km.piano)} km <span class="tenue">(pendenza sotto il 5%)</span></dd></div>
      <div class="riga"><dt>Pendenza max</dt><dd>${segno(a.maxSalita)} in salita · ${segno(a.maxDiscesa)} in discesa</dd></div>
      <div class="riga"><dt>Più ripidi</dt><dd>${a.tratti
        .map((t) => `al km ${fmt(t.km)}: ${segno(t.pendenza)} <span class="tenue">(${Math.round(t.quota)} m)</span>`)
        .join('<br>')}</dd></div>
    </dl>
    <p class="tenue piccolo">Stima: pendenze calcolate su tratti di ~100 m, la precisione dipende dalle quote (GPS ±10 m circa, modello del terreno ±10–20 m).</p>
  </section>`;
}
