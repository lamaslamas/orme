// Riquadro "Terreno" (dai tag OSM) con la valutazione MTB facoltativa, chiusa in partenza
import { ATTRIBUTI, NON_INDICATO, riepilogoTerreno, puntiOgni, queryVieVicine, vieDaRisposta, abbinaTerreno } from '../lib/terreno.js';
import { valutaPercorsoMtb, NOMI_MTB, COLORI_MTB, CLASSI_MTB } from '../lib/mtb.js';
import { analizzaPendenze } from '../lib/pendenza.js';
import { interrogaOverpass } from '../lib/overpass.js';
import { escapeHtml } from '../lib/formato.js';

const PALETTE = ['#15803d', '#65a30d', '#ca8a04', '#ea580c', '#b91c1c', '#7f1d1d'];
const GRIGIO = '#d1d5db';
const MASSIMO_PUNTI_QUERY = 1500;
const fmt = (n) => (n > 0 && n < 0.05 ? 'meno di 0,1' : n.toFixed(1).replace('.', ','));

function coloreCategoria(attributo, categoria) {
  if (categoria === NON_INDICATO) return GRIGIO;
  const i = ATTRIBUTI[attributo].ordine.indexOf(categoria);
  return PALETTE[Math.min(Math.max(i, 0), PALETTE.length - 1)];
}

function barra(segmenti, totaleM, colore) {
  const r = (n) => Math.round(n * 10) / 10;
  return `<svg class="barra-terreno" viewBox="0 0 320 14" preserveAspectRatio="none" aria-hidden="true">${segmenti
    .map((s) => `<rect x="${r((s.daM / totaleM) * 320)}" y="0" width="${Math.max(0.5, r(((s.aM - s.daM) / totaleM) * 320))}" height="14" fill="${colore(s)}"/>`)
    .join('')}</svg>`;
}

// aperto: valutazione MTB già aperta (modalità MTB ed e-MTB)
export function htmlTerreno(percorso, pezzi, attributo = 'highway', { aperto = false } = {}) {
  const tratti = percorso.terreno ?? [];
  if (!tratti.length) {
    return `<section class="riquadro" id="terreno">
      <h2>Terreno</h2>
      <p>Tipo di via, fondo, difficoltà e visibilità della traccia, dai dati di OpenStreetMap.</p>
      <button type="button" class="bottone" data-azione="leggi-terreno">Leggi il terreno da OSM</button>
      <p class="tenue piccolo" id="statoTerreno"></p>
    </section>`;
  }
  const totaleM = tratti.at(-1).aM || 1;
  const riepilogo = riepilogoTerreno(tratti, attributo);
  const def = ATTRIBUTI[attributo];
  const indicati = riepilogo.filter((x) => x.categoria !== NON_INDICATO).reduce((s, x) => s + x.km, 0);

  // MTB: pendenza di ogni tratto dal profilo, se ci sono le quote
  const analisi = analizzaPendenze(pezzi);
  const pendenzaA = (m) => {
    if (!analisi) return 0;
    const i = analisi.campioni.findIndex((c) => c.m >= m);
    return analisi.pendenze[i < 0 ? analisi.pendenze.length - 1 : i];
  };
  const mtb = valutaPercorsoMtb(tratti, pendenzaA);

  return `<section class="riquadro" id="terreno">
    <h2>Terreno</h2>
    <div class="pillole pillole-terreno" role="group" aria-label="Attributo">
      ${Object.entries(ATTRIBUTI)
        .map(([k, a]) => `<button type="button" class="pillola ${k === attributo ? 'attiva' : ''}" data-attributo="${k}">${a.nome}</button>`)
        .join('')}
    </div>
    ${barra(tratti, totaleM, (s) => coloreCategoria(attributo, def.categoria(s.tag?.[attributo]) ?? NON_INDICATO))}
    <div class="profilo-assi"><span>0 km</span><span>${fmt(totaleM / 1000)} km</span></div>
    <dl>${riepilogo
      .map((x) => `<div class="riga"><dt><i class="quadretto" style="background:${coloreCategoria(attributo, x.categoria)}"></i>${escapeHtml(x.categoria)}</dt><dd>${fmt(x.km)} km</dd></div>`)
      .join('')}</dl>
    <p class="tenue piccolo">${
      percorso.fonteTerreno === 'brouter'
        ? 'Tag OSM dei tratti scelti da BRouter.'
        : 'Tag OSM della via più vicina ogni 25 m (entro 20 m): vicino agli incroci può sbagliare.'
    } Dato indicato su ${fmt(indicati)} km di ${fmt(totaleM / 1000)}: in Appennino molti sentieri non hanno questi tag.</p>
    <details class="spiegazione mtb" ${aperto ? 'open' : ''}>
      <summary>Valutazione MTB (facoltativa)</summary>
      ${barra(mtb.tratti, totaleM, (s) => COLORI_MTB[s.classe])}
      <dl>${CLASSI_MTB.filter((c) => mtb.km[c] > 0.01)
        .map((c) => `<div class="riga"><dt><i class="quadretto" style="background:${COLORI_MTB[c]}"></i>${NOMI_MTB[c]}</dt><dd>${fmt(mtb.km[c])} km</dd></div>`)
        .join('')}</dl>
      <p class="tenue piccolo">Stima prudente: divieti, poi mtb:scale, sac_scale, fondo e tipo di via, poi pendenza. Valutabile il ${Math.round(
        mtb.affidabilita * 100,
      )}% del percorso. Le regole del parco prevalgono sempre: verifica sul sito del Parco.</p>
    </details>
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
