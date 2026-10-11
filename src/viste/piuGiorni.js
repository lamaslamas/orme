// Pianifica, "Su più giorni": scelte le ore di cammino al giorno, dove finisce ogni giornata, i rifugi e
// bivacchi lì vicino (con la distanza dalla traccia) e l'avviso dei parchi nazionali sul pernottamento.
// Il tempo usa le quote punto per punto: della traccia o, se mancano, da Open-Meteo (salvate nel
// percorso); solo se non si riesce, proporzionale ai km.
import { salvaPercorso, leggiPercorso } from '../db.js';
import { aggiungiQuote } from '../lib/openMeteo.js';
import { improntaTraccia } from '../lib/panorama.js';
import { profiloTempi, finiGiornata, rifugiPerLaNotte, km1 } from '../lib/lungoIlPercorso.js';
import { perLaNotte, TIPI_PUNTO } from '../lib/puntiUtili.js';
import { puntoNelPoligono } from '../lib/confini.js';
import { escapeHtml, durata } from '../lib/formato.js';
import { PARCHI } from '../datiParchi.js';
import { caricaConfini } from './puntiPercorso.js';
import { ICONE } from './icone.js';

export const ORE_AL_GIORNO = [4, 6, 8];

export const htmlPiuGiorni = () => `<section class="riquadro piu-giorni">
    <h2>Su più giorni</h2>
    <p class="tenue piccolo">Ore di cammino al giorno, soste escluse:</p>
    <div class="ore-giorno" role="group" aria-label="Ore di cammino al giorno">${ORE_AL_GIORNO.map((o) => `<button type="button" class="chip-scorciatoia" data-ore="${o}" aria-pressed="false">${o} h</button>`).join('')}</div>
    <div class="giorni-risultato" aria-live="polite"></div>
  </section>`;

// Parco nazionale in cui cade un punto (confine, o riquadro se manca)
async function parcoNazionaleIn([lon, lat]) {
  const confini = await caricaConfini();
  return PARCHI.find((p) => p.nazionale && (confini[p.id]?.length ? puntoNelPoligono([lon, lat], confini[p.id]) : lat >= p.bbox[0] && lat <= p.bbox[2] && lon >= p.bbox[1] && lon <= p.bbox[3])) ?? null;
}

// Pezzi con le quote: della traccia, salvate prima, o chieste ora a Open-Meteo
async function pezziConQuote(percorso, pezzi) {
  if (profiloTempi(pezzi).conQuote) return { pezzi, fonte: 'traccia' };
  const impronta = improntaTraccia({ type: 'MultiLineString', coordinates: pezzi });
  if (percorso.quoteOpenMeteo?.impronta === impronta) return { pezzi: percorso.quoteOpenMeteo.coordinates, fonte: 'open-meteo' };
  try {
    const conQuote = await aggiungiQuote({ type: 'MultiLineString', coordinates: pezzi }, { passoM: 200 });
    // si rilegge il percorso: nel frattempo potrei averne cambiato nome o note
    const ora = (await leggiPercorso(percorso.id)) ?? percorso;
    await salvaPercorso({ ...ora, quoteOpenMeteo: { impronta, coordinates: conQuote.coordinates } });
    percorso.quoteOpenMeteo = { impronta, coordinates: conQuote.coordinates };
    return { pezzi: conQuote.coordinates, fonte: 'open-meteo' };
  } catch (e) {
    console.warn('Quote per i giorni', e);
    return { pezzi, fonte: null };
  }
}

function htmlRifugio(p) {
  const t = TIPI_PUNTO[p.tipo];
  return `<li><b>${escapeHtml(p.nome ?? t.nome)}</b>${p.nome ? ` <span class="tenue">· ${t.nome.toLowerCase()}</span>` : ''}
    <span class="tenue piccolo">al km ${km1(p.km)} · ${p.distanzaM < 30 ? 'sulla traccia' : `a ${p.distanzaM} m dalla traccia`}</span></li>`;
}

// punti: promessa di { punti, avviso }, gli stessi del riquadro "Rifugi e acqua"
export function collegaPiuGiorni(sezione, percorso, pezzi, punti) {
  if (!sezione) return;
  const risultato = sezione.querySelector('.giorni-risultato');
  let richiesta = 0;
  sezione.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ore]');
    if (!b) return;
    const ore = Number(b.dataset.ore);
    sezione.querySelectorAll('[data-ore]').forEach((x) => {
      x.classList.toggle('attiva', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    });
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
    if (mia !== richiesta || !risultato.isConnected) return;
    const serie = profiloTempi(pq);
    const fini = finiGiornata(serie, ore);
    if (!fini.length) {
      risultato.innerHTML = `<p>Si fa in una giornata: circa ${escapeHtml(durata(Math.round(serie.min.at(-1))))} di cammino.</p>`;
      return;
    }
    const giorni = await Promise.all(
      fini.map(async (f) => ({ ...f, rifugi: rifugiPerLaNotte(tutti ?? [], pezzi, f, { perLaNotte }).slice(0, 4), parco: await parcoNazionaleIn(f.punto) })),
    );
    if (mia !== richiesta || !risultato.isConnected) return;
    risultato.innerHTML = `
      <p class="tenue piccolo">${
        fonte === 'traccia' ? 'Tempi dalle quote della traccia (metodo CAI).' : fonte === 'open-meteo' ? 'Tempi dalle quote punto per punto (Open-Meteo, metodo CAI).' : 'Quote non disponibili: posizione stimata solo sui km (4 km/h).'
      }</p>
      <ol class="giorni">${giorni
        .map(
          (g) => `<li>
          <b>Fine giorno ${g.giorno}</b> · km ${km1(g.km)} <span class="tenue">(dopo ${escapeHtml(durata(Math.round(g.minuti)))})</span>
          ${g.rifugi.length ? `<ul class="giorni-rifugi">${g.rifugi.map(htmlRifugio).join('')}</ul>` : `<p class="tenue piccolo">${tutti ? 'Nessun rifugio o bivacco entro 1 km dalla traccia qui vicino.' : 'Dati su rifugi non disponibili.'}</p>`}
          ${g.parco ? `<p class="avviso-pernotto">${ICONE.avviso}<span>${escapeHtml(g.parco.nomeBreve)}: nei parchi nazionali campeggio e bivacco liberi sono in genere vietati. Verifica il regolamento del parco.</span></p>` : ''}
        </li>`,
        )
        .join('')}
        <li><b>Arrivo</b> · km ${km1(serie.km.at(-1))} <span class="tenue">(in tutto ${escapeHtml(durata(Math.round(serie.min.at(-1))))})</span></li>
      </ol>
      ${avviso ? `<p class="stato-dati stato-assente">${escapeHtml(avviso)}</p>` : ''}`;
  });
}
