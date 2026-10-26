// Riquadro «Terreno» (dai tag OSM): una barra del tipo di fondo con le percentuali
import { FONDI, tipoFondo, riepilogoFondo, puntiOgni, queryVieVicine, vieDaRisposta, abbinaTerreno } from '../lib/terreno.js';
import { interrogaOverpass } from '../lib/overpass.js';

const MASSIMO_PUNTI_QUERY = 1500;
const fmt = (n) => (n > 0 && n < 0.05 ? 'meno di 0,1' : n.toFixed(1).replace('.', ','));

// una sola barra del tipo di fondo (sentiero, sterrato, asfalto, sconosciuto) con le percentuali
function barra(segmenti, totaleM) {
  const r = (n) => Math.round(n * 10) / 10;
  return `<svg class="barra-terreno" viewBox="0 0 320 14" preserveAspectRatio="none" aria-hidden="true">${segmenti
    .map((s) => `<rect x="${r((s.daM / totaleM) * 320)}" y="0" width="${Math.max(0.5, r(((s.aM - s.daM) / totaleM) * 320))}" height="14" fill="${FONDI[tipoFondo(s.tag)].colore}"/>`)
    .join('')}</svg>`;
}

export function htmlTerreno(percorso) {
  const tratti = percorso.terreno ?? [];
  if (!tratti.length) {
    return `<section class="riquadro" id="terreno">
      <h2>Terreno</h2>
      <p>Sentiero, sterrato o asfalto lungo la traccia, dai dati di OpenStreetMap.</p>
      <button type="button" class="bottone" data-azione="leggi-terreno">Leggi il terreno da OSM</button>
      <p class="tenue piccolo" id="statoTerreno"></p>
    </section>`;
  }
  const totaleM = tratti.at(-1).aM || 1;
  const riepilogo = riepilogoFondo(tratti);
  return `<section class="riquadro" id="terreno">
    <h2>Terreno</h2>
    ${barra(tratti, totaleM)}
    <p class="legenda-fondo">${riepilogo.map((x) => `<span><i class="quadretto" style="background:${FONDI[x.tipo].colore}"></i>${x.nome} <b>${x.percentuale}%</b></span>`).join(' ')}</p>
    <p class="tenue piccolo">${fmt(totaleM / 1000)} km. ${
      percorso.fonteTerreno === 'brouter' ? 'Tag OSM dei tratti scelti da BRouter.' : 'Tag OSM della via più vicina ogni 25 m (entro 20 m): vicino agli incroci può sbagliare.'
    } In Appennino molti sentieri non hanno questi tag.</p>
  </section>`;
}

// Legge il terreno da Overpass per un percorso caricato da GPX
export async function leggiTerrenoDaOsm(pezzi) {
  let punti = puntiOgni(pezzi, 25);
  const perQuery = punti.filter((_, i) => i % Math.max(2, Math.ceil(punti.length / MASSIMO_PUNTI_QUERY)) === 0);
  const vie = vieDaRisposta(await interrogaOverpass(queryVieVicine(perQuery), { timeoutMs: 120000 }));
  punti = puntiOgni(pezzi, 25);
  return abbinaTerreno(punti, vie);
}
