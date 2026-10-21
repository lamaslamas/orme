// Pianifica, "Su più giorni": scelte le ore di cammino al giorno, dove finisce ogni giornata, i rifugi e
// bivacchi lì vicino (con la distanza dalla traccia) e l'avviso dei parchi nazionali sul pernottamento.
// Il tempo usa le quote punto per punto: della traccia o, se mancano, da Open-Meteo (salvate nel
// percorso); solo se non si riesce, proporzionale ai km.
import { salvaPercorso, leggiPercorso } from '../db.js';
import { quoteDeiPezzi, quoteDeiPunti, testoFonteQuote } from './quote.js';
import { improntaTraccia } from '../lib/panorama.js';
import { quoteDisponibili } from '../lib/quoteSalvate.js';
import { profiloTempi, finiGiornata, rifugiPerLaNotte, km1, quotaPiuVicina, testoDislivelloRifugio, lunghezzaDeiPezzi } from '../lib/lungoIlPercorso.js';
import { pezziScelti, fineSullAndata } from '../lib/andataRitorno.js';
import { perLaNotteScelta, doveDormire, ricordaDoveDormire, DOVE_DORMIRE, TIPI_PUNTO } from '../lib/puntiUtili.js';
import { puntoNelPoligono } from '../lib/confini.js';
import { escapeHtml, durata } from '../lib/formato.js';
import { PARCHI } from '../datiParchi.js';
import { caricaConfini } from './copertura.js';
import { ICONE } from './icone.js';

export const ORE_AL_GIORNO = [4, 6, 8];

export const htmlPiuGiorni = () => `<section class="riquadro piu-giorni">
    <h2>Su più giorni</h2>
    <p class="tenue piccolo">Ore di cammino al giorno, soste escluse:</p>
    <div class="ore-giorno" role="group" aria-label="Ore di cammino al giorno">${ORE_AL_GIORNO.map((o) => `<button type="button" class="chip-scorciatoia" data-ore="${o}" aria-pressed="false">${o} h</button>`).join('')}</div>
    <p class="tenue piccolo">Dove dormire:</p>
    <div class="ore-giorno dove-dormire" role="group" aria-label="Dove dormire">${Object.entries(DOVE_DORMIRE).map(([k, t]) => `<button type="button" class="chip-scorciatoia ${k === doveDormire() ? 'attiva' : ''}" data-dormire="${k}" aria-pressed="${k === doveDormire()}">${t}</button>`).join('')}</div>
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
    await salvaPercorso({ ...ora, quote });
    percorso.quote = quote;
    return { pezzi: conQuote, fonte };
  } catch (e) {
    console.warn('Quote per i giorni', e);
    return { pezzi, fonte: null };
  }
}

function htmlRifugio(p) {
  const t = TIPI_PUNTO[p.tipo];
  const dove = p.distanzaM < 30 ? 'sulla traccia' : `a ${p.distanzaM} m dalla traccia${p.salita ? ` · ${p.salita}` : ''}`;
  return `<li><b>${escapeHtml(p.nome ?? t.nome)}</b>${p.nome ? ` <span class="tenue">· ${t.nome.toLowerCase()}</span>` : ''}
    <span class="tenue piccolo">al km ${km1(p.km)} · ${escapeHtml(dove)}</span></li>`;
}

// Dislivello approssimato per arrivare ai rifugi fuori traccia: quota del rifugio (OSM o TINITALY)
// meno quella del punto più vicino del percorso
async function conDislivello(rifugi, pq) {
  const fuori = rifugi.filter((p) => p.distanzaM >= 30);
  const senzaQuota = fuori.filter((p) => !Number.isFinite(p.quota));
  const quote = senzaQuota.length ? await quoteDeiPunti(senzaQuota.map((p) => [p.lon, p.lat])) : [];
  const quotaDi = new Map(senzaQuota.map((p, i) => [p.id, quote[i]]));
  return rifugi.map((p) =>
    p.distanzaM < 30 ? p : { ...p, salita: testoDislivelloRifugio(Number.isFinite(p.quota) ? p.quota : quotaDi.get(p.id), quotaPiuVicina(pq, [p.lon, p.lat])) },
  );
}

// punti: promessa di { punti, avviso }, gli stessi del riquadro "Rifugi e acqua"
// conQuote(pezzi): chiamata quando arrivano le quote da Open-Meteo (per aggiornare i numeri in alto)
// modo(): 'andata' o 'ar' (Andata e ritorno: dopo l'andata la stessa traccia al contrario)
export function collegaPiuGiorni(sezione, percorso, pezzi, punti, { conQuote = () => {}, modo = () => 'andata' } = {}) {
  if (!sezione) return;
  const risultato = sezione.querySelector('.giorni-risultato');
  let richiesta = 0;
  let oreOra = null;
  sezione.addEventListener('click', async (e) => {
    const d = e.target.closest('[data-dormire]');
    if (d) {
      ricordaDoveDormire(d.dataset.dormire);
      sezione.querySelectorAll('[data-dormire]').forEach((x) => {
        x.classList.toggle('attiva', x === d);
        x.setAttribute('aria-pressed', String(x === d));
      });
      if (oreOra) sezione.querySelector(`[data-ore="${oreOra}"]`)?.click(); // si rifà il calcolo con la nuova scelta
      return;
    }
    const b = e.target.closest('[data-ore]');
    if (!b) return;
    const ore = Number(b.dataset.ore);
    oreOra = ore;
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
    if (['tinitaly', 'terrain', 'open-meteo'].includes(fonte)) conQuote(pq, fonte);
    if (mia !== richiesta || !risultato.isConnected) return;
    // con Andata e ritorno le giornate continuano sul ritorno; i rifugi di una giornata che finisce
    // sul ritorno si cercano nel punto equivalente dell'andata
    const serie = profiloTempi(pezziScelti(pq, modo()));
    const fini = finiGiornata(serie, ore);
    const kmAndata = lunghezzaDeiPezzi(pq);
    if (!fini.length) {
      risultato.innerHTML = `<p>Si fa in una giornata: circa ${escapeHtml(durata(Math.round(serie.min.at(-1))))} di cammino.</p>`;
      return;
    }
    const giorni = await Promise.all(
      fini.map(async (f) => ({
        ...f,
        rifugi: await conDislivello(rifugiPerLaNotte(tutti ?? [], pezzi, fineSullAndata(f, kmAndata), { perLaNotte: perLaNotteScelta(doveDormire()) }).slice(0, 4), pq),
        parco: await parcoNazionaleIn(f.punto),
      })),
    );
    if (mia !== richiesta || !risultato.isConnected) return;
    risultato.innerHTML = `
      <p class="tenue piccolo">${
        fonte === 'traccia' ? 'Tempi dalle quote della traccia (metodo CAI).' : fonte ? `Tempi con il metodo CAI. ${testoFonteQuote(fonte)}.` : 'Quote non disponibili: posizione stimata solo sui km (4 km/h).'
      }</p>
      <ol class="giorni">${giorni
        .map(
          (g) => `<li>
          <b>Fine giorno ${g.giorno}</b> · km ${km1(g.km)} <span class="tenue">(dopo ${escapeHtml(durata(Math.round(g.minuti)))})</span>
          ${g.rifugi.length ? `<ul class="giorni-rifugi">${g.rifugi.map(htmlRifugio).join('')}</ul>` : `<p class="tenue piccolo">${tutti ? `Nessun posto per dormire (${doveDormire() === 'qualsiasi' ? 'rifugio, bivacco o struttura' : doveDormire() === 'rifugi' ? 'rifugio o bivacco' : 'struttura'}) vicino alla traccia qui: 1 km per i rifugi, 2 km per le strutture.` : 'Dati su rifugi non disponibili.'}</p>`}
          ${g.parco ? `<p class="avviso-pernotto">${ICONE.avviso}<span>${escapeHtml(g.parco.nomeBreve)}: nei parchi nazionali campeggio e bivacco liberi sono in genere vietati. Verifica il regolamento del parco.</span></p>` : ''}
        </li>`,
        )
        .join('')}
        <li><b>Arrivo</b> · km ${km1(serie.km.at(-1))} <span class="tenue">(in tutto ${escapeHtml(durata(Math.round(serie.min.at(-1))))})</span></li>
      </ol>
      ${avviso ? `<p class="stato-dati stato-assente">${escapeHtml(avviso)}</p>` : ''}`;
  });
}
