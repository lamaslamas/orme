// Pianifica, "Su più giorni": scelte le ore di cammino al giorno, dove finisce ogni giornata, i rifugi e
// bivacchi lì vicino (con la distanza dalla traccia) e l'avviso dei parchi nazionali sul pernottamento.
// Il tempo usa le quote punto per punto: della traccia o, se mancano, da Open-Meteo (salvate nel
// percorso); solo se non si riesce, proporzionale ai km.
import { salvaPercorso, leggiPercorso } from '../db.js';
import { quoteDeiPezzi, testoFonteQuote } from './quote.js';
import { improntaTraccia } from '../lib/panorama.js';
import { quoteDisponibili } from '../lib/quoteSalvate.js';
import { pianoNotte, testoGiornate, MOTIVI_NOTTE } from '../lib/pianoNotte.js';
import { doveDormire, ricordaDoveDormire, DOVE_DORMIRE } from '../lib/puntiUtili.js';
import { oraPartenzaScelta } from './andataRitorno.js';
import { statoQuando, ascoltaQuando } from './quando.js';
import { puntoNelPoligono } from '../lib/confini.js';
import { escapeHtml } from '../lib/formato.js';
import { PARCHI } from '../datiParchi.js';
import { caricaConfini } from './copertura.js';
import { ICONE } from './icone.js';

// sopra questa durata (soste escluse) ha senso pensare a una notte fuori
export const MINUTI_PER_DUE_GIORNI = 240;

// L'avviso per chi dorme in un rifugio o bivacco dentro un parco nazionale (lo stesso in «Su più giorni» e in Suggerisci)
export const testoAvvisoPernotto = (parco) => `${parco.nomeBreve}: nei parchi nazionali campeggio e bivacco liberi sono in genere vietati. Verifica il regolamento del parco.`;

// «Su più giorni»: lo stesso calcolo e la stessa frase di «2 giorni con notte» di Suggerisci (src/lib/pianoNotte.js), con il
// giorno e la partenza del blocco «Quando»
export const htmlPiuGiorni = () => `<section class="riquadro piu-giorni">
    <h2>Su più giorni</h2>
    <p class="tenue piccolo">Dove dormire:</p>
    <div class="ore-giorno dove-dormire" role="group" aria-label="Dove dormire">${Object.entries(DOVE_DORMIRE).map(([k, t]) => `<button type="button" class="chip-scorciatoia ${k === doveDormire() ? 'attiva' : ''}" data-dormire="${k}" aria-pressed="${k === doveDormire()}">${t}</button>`).join('')}</div>
    <button type="button" class="bottone primario" data-calcola-giorni>Calcola le due giornate</button>
    <div class="giorni-risultato" aria-live="polite"></div>
  </section>`;

// Parco nazionale in cui cade un punto (confine, o riquadro se manca)
export async function parcoNazionaleIn([lon, lat]) {
  const confini = await caricaConfini();
  return PARCHI.find((p) => p.nazionale && (confini[p.id]?.length ? puntoNelPoligono([lon, lat], confini[p.id]) : lat >= p.bbox[0] && lat <= p.bbox[2] && lon >= p.bbox[1] && lon <= p.bbox[3])) ?? null;
}

export { quoteDisponibili };

// Pezzi con le quote: già disponibili o chieste ora a Open-Meteo
export async function pezziConQuote(percorso, pezzi) {
  const pronte = quoteDisponibili(percorso, pezzi);
  if (pronte) return pronte;
  const impronta = improntaTraccia({ type: 'MultiLineString', coordinates: pezzi });
  try {
    const { pezzi: conQuote, fonte } = await quoteDeiPezzi(pezzi);
    // si rilegge il percorso: nel frattempo potrei averne cambiato nome o note
    const ora = (await leggiPercorso(percorso.id)) ?? percorso;
    const quote = { impronta, coordinates: conQuote, fonte };
    // un percorso arrivato da un link (sola lettura) non si scrive sul telefono
    if (!percorso.virtuale) await salvaPercorso({ ...ora, quote });
    percorso.quote = quote;
    return { pezzi: conQuote, fonte };
  } catch (e) {
    console.warn('Quote per i giorni', e);
    return { pezzi, fonte: null };
  }
}

// punti: promessa di { punti, avviso }, gli stessi del riquadro "Rifugi e acqua"
// conQuote(pezzi): chiamata quando arrivano le quote (per aggiornare i numeri in alto)
// modo(): 'andata' o 'ar'; anello(): il percorso è un anello
export function collegaPiuGiorni(sezione, percorso, pezzi, punti, { conQuote = () => {}, modo = () => 'andata', anello = () => false } = {}) {
  if (!sezione) return;
  const risultato = sezione.querySelector('.giorni-risultato');
  let richiesta = 0;
  let calcolato = false;

  async function calcola() {
    calcolato = true;
    const mia = ++richiesta;
    risultato.innerHTML = '<p class="tenue">Calcolo le giornate…</p>';
    let pronti = false;
    punti.then(() => (pronti = true));
    const quote = pezziConQuote(percorso, pezzi);
    // i rifugi di una zona fuori dai parchi possono richiedere un po' (OpenStreetMap)
    quote.then(() => {
      if (!pronti && mia === richiesta) risultato.innerHTML = '<p class="tenue">Cerco i rifugi di questa zona…</p>';
    });
    const [{ pezzi: pq, fonte }, { punti: tutti, avviso }] = await Promise.all([quote, punti]);
    if (['tinitaly', 'terrain', 'open-meteo'].includes(fonte)) conQuote(pq, fonte);
    if (mia !== richiesta || !risultato.isConnected) return;
    const { giorno } = statoQuando();
    const r = pianoNotte({
      pezzi: pq,
      anello: anello(),
      modo: modo(),
      data: giorno,
      partenzaMin: oraPartenzaScelta() ?? 540,
      dormire: doveDormire(),
      punti: tutti ?? [],
      geojson: { type: 'MultiLineString', coordinates: pq },
    });
    const nota = fonte === 'traccia' ? 'Tempi dalle quote della traccia (metodo CAI).' : fonte ? `Tempi con il metodo CAI. ${testoFonteQuote(fonte)}.` : 'Quote non disponibili: tempi stimati solo sui km.';
    if (r.motivo) {
      risultato.innerHTML = `<p>${escapeHtml(MOTIVI_NOTTE[r.motivo] ?? 'Non trovo una soluzione con queste scelte.')}</p><p class="tenue piccolo">${escapeHtml(nota)}</p>${avviso ? `<p class="stato-dati stato-assente">${escapeHtml(avviso)}</p>` : ''}`;
      return;
    }
    const parco = r.piano.posto ? await parcoNazionaleIn([r.piano.posto.lon, r.piano.posto.lat]) : null;
    if (mia !== richiesta || !risultato.isConnected) return;
    risultato.innerHTML = `<p>${escapeHtml(testoGiornate(r.piano))}</p>
      ${parco ? `<p class="avviso-pernotto">${ICONE.avviso}<span>${escapeHtml(testoAvvisoPernotto(parco))}</span></p>` : ''}
      <p class="tenue piccolo">${escapeHtml(nota)} Giorno e partenza sono quelli di «Quando».</p>
      ${avviso ? `<p class="stato-dati stato-assente">${escapeHtml(avviso)}</p>` : ''}`;
  }

  sezione.addEventListener('click', (e) => {
    const d = e.target.closest('[data-dormire]');
    if (d) {
      ricordaDoveDormire(d.dataset.dormire);
      sezione.querySelectorAll('[data-dormire]').forEach((x) => {
        x.classList.toggle('attiva', x === d);
        x.setAttribute('aria-pressed', String(x === d));
      });
      if (calcolato) calcola(); // si rifà il calcolo con la nuova scelta
      return;
    }
    if (e.target.closest('[data-calcola-giorni]')) calcola();
  });
  // cambiando giorno, partenza o andata e ritorno in «Quando» le giornate si rifanno (se già calcolate)
  const smetti = ascoltaQuando(() => calcolato && sezione.isConnected && calcola());
  new MutationObserver(() => !sezione.isConnected && smetti()).observe(document.body, { childList: true, subtree: true });
}
