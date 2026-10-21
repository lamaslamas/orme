// Sezione «Giorno o notte?» della scheda: con il tempo a disposizione (es. sabato 14:00 → domenica 18:00) mette
// a confronto, in due colonne di fatti e senza punteggio, tutto in giornata e una notte in un rifugio o
// bivacco vicino al punto che interessa. Calcoli: src/lib/giornoNotte.js.
import { escapeHtml, durata } from '../lib/formato.js';
import { km1, profiloTempi, rifugiPerLaNotte, kmLungoLaTraccia, lunghezzaDeiPezzi } from '../lib/lungoIlPercorso.js';
import { oraDaMinuti } from '../lib/andataRitorno.js';
import { orariDelGiorno, ANTICIPO_ALBA_MIN } from '../lib/fotografia.js';
import { confrontoGiornoNotte } from '../lib/giornoNotte.js';
import { perLaNotteScelta, doveDormire, conAcqua, puntiLungoIlPercorso, TIPI_PUNTO } from '../lib/puntiUtili.js';
import { testoTratto } from '../lib/trattoFauna.js';
import { puntiPerIlPercorso } from './puntiPercorso.js';
import { parcoNazionaleIn } from './piuGiorni.js';
import { ICONE } from './icone.js';
import { linkCodice } from './codice.js';

const oggiIt = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const piuGiorni = (data, n) => new Date(new Date(`${data}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

// il prossimo sabato (oggi compreso, se è sabato) e la domenica dopo
function datePredefinite() {
  const oggi = oggiIt();
  const giorno = new Date(`${oggi}T12:00:00Z`).getUTCDay();
  const sabato = piuGiorni(oggi, (6 - giorno + 7) % 7);
  return { parto: `${sabato}T14:00`, rientro: `${piuGiorni(sabato, 1)}T18:00` };
}

const ora = (min) => oraDaMinuti(min);
// "domenica 06:40" se non è il giorno della partenza
const NOMI_GIORNO = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const quando = (min, data0) => {
  const giorno = Math.floor(min / 1440);
  const nome = giorno ? `${NOMI_GIORNO[new Date(`${piuGiorni(data0, giorno)}T12:00:00Z`).getUTCDay()]} ` : '';
  return `${nome}${ora(min)}`;
};

// "alle 06:00" o "domenica alle 06:00"
const alle = (min, data0) => {
  const g = Math.floor(min / 1440);
  return `${g ? `${NOMI_GIORNO[new Date(`${piuGiorni(data0, g)}T12:00:00Z`).getUTCDay()]} ` : ''}alle ${ora(min)}`;
};

export function htmlGiornoNotte({ tratto }) {
  const d = datePredefinite();
  return `<div class="giorno-notte">
    <label class="scelta-ora">Parto <input type="datetime-local" data-gn-parto value="${d.parto}" /></label>
    <label class="scelta-ora">Rientro entro <input type="datetime-local" data-gn-rientro value="${d.rientro}" /></label>
    <div class="gruppo-scelte" role="radiogroup" aria-label="Dove voglio essere">
      ${tratto ? `<button type="button" class="chip-scorciatoia attiva" role="radio" aria-checked="true" data-gn-dove="tratto">Nel tratto con più fauna (${escapeHtml(testoTratto(tratto))})</button>` : ''}
      <button type="button" class="chip-scorciatoia ${tratto ? '' : 'attiva'}" role="radio" aria-checked="${tratto ? 'false' : 'true'}" data-gn-dove="km">Al km <input type="number" class="campo-km" data-gn-km min="0" step="0.5" inputmode="decimal" aria-label="Chilometro" /></button>
    </div>
    <button type="button" class="bottone" data-gn-confronta>Confronta</button>
    <div class="gn-risultato" aria-live="polite"></div>
    <p class="tenue piccolo">${linkCodice}</p>
    <p class="tenue piccolo">Due piani messi a confronto, senza punteggio: scegli tu. Tempi di cammino stimati (metodo CAI), sole calcolato sul telefono. Le regole dei parchi hanno sempre la precedenza.</p>
  </div>`;
}

const riga = (etichetta, valore) => `<dt>${etichetta}</dt><dd>${valore}</dd>`;
const avviso = (testo) => `<p class="avviso-via">${ICONE.avviso}<span>${testo}</span></p>`;

// box: la sezione; id: del percorso; pezzi: la traccia in ordine; anello: giro che si chiude
export function collegaGiornoNotte(box, { id, pezzi, tratto = null, anello = false, linkParco = null }) {
  if (!box || !pezzi?.length) return;
  const risultato = box.querySelector('.gn-risultato');
  const kmEl = box.querySelector('[data-gn-km]');
  const andata = profiloTempi(pezzi);
  const ritorno = profiloTempi(pezzi.map((l) => [...l].reverse()).reverse());
  const kmTotale = lunghezzaDeiPezzi(pezzi);
  if (kmEl) kmEl.value = String(Math.round(kmTotale / 2));
  let dove = tratto ? 'tratto' : 'km';
  let punti = null; // promessa dei rifugi e dell'acqua: si chiede solo al primo "Confronta"
  let richiesta = 0;

  box.addEventListener('click', async (e) => {
    const scelta = e.target.closest('[data-gn-dove]');
    if (scelta) {
      dove = scelta.dataset.gnDove;
      for (const x of box.querySelectorAll('[data-gn-dove]')) {
        x.classList.toggle('attiva', x === scelta);
        x.setAttribute('aria-checked', String(x === scelta));
      }
      return;
    }
    if (!e.target.closest('[data-gn-confronta]')) return;
    const mia = ++richiesta;
    const parto = box.querySelector('[data-gn-parto]').value;
    const rientro = box.querySelector('[data-gn-rientro]').value;
    if (!parto || !rientro) return void (risultato.innerHTML = '<p class="tenue">Scegli quando parti e entro quando devi rientrare.</p>');
    const data0 = parto.slice(0, 10);
    const [h, m] = parto.slice(11, 16).split(':').map(Number);
    const giorniFra = Math.round((new Date(`${rientro.slice(0, 10)}T12:00:00Z`) - new Date(`${data0}T12:00:00Z`)) / 86_400_000);
    const [h2, m2] = rientro.slice(11, 16).split(':').map(Number);
    const inizioMin = h * 60 + m;
    const fineMin = giorniFra * 1440 + h2 * 60 + m2;
    if (fineMin <= inizioMin) return void (risultato.innerHTML = '<p class="tenue">Il rientro deve essere dopo la partenza.</p>');
    risultato.innerHTML = '<p class="tenue">Calcolo e cerco i rifugi vicini…</p>';
    punti ??= puntiPerIlPercorso(id, pezzi);
    const { punti: tutti } = await punti;
    if (mia !== richiesta || !risultato.isConnected) return;

    const kmTarget = dove === 'tratto' && tratto ? tratto.daKm : Math.max(0, Math.min(kmTotale, Number(kmEl?.value) || 0));
    // le luci di ogni giorno dal punto di partenza (almeno i due giorni dell'escursione, più uno)
    const partenza = pezzi[0][0];
    const giorni = Array.from({ length: Math.max(3, giorniFra + 2) }, (_, i) => orariDelGiorno(piuGiorni(data0, i), [partenza[0], partenza[1]]));
    // il punto a kmTarget (per cercare un rifugio lì vicino)
    const idx = andata.km.findIndex((k) => k >= kmTarget);
    const puntoTarget = (andata.punti[Math.max(0, idx)] ?? partenza).slice(0, 2);
    const geojson = { type: 'MultiLineString', coordinates: pezzi };
    const vicini = (tutti ?? []).length ? puntiLungoIlPercorso(tutti, geojson) : [];
    const kmDi = (p) => kmLungoLaTraccia([p.lon, p.lat], pezzi);
    const acqua = vicini.filter(conAcqua).map((p) => ({ ...p, km: kmDi(p) }));
    const rifugi = rifugiPerLaNotte(tutti ?? [], pezzi, { km: kmTarget, punto: puntoTarget }, { perLaNotte: perLaNotteScelta(doveDormire()) });
    const rifugio = rifugi[0] ?? null;
    const acquaA = acqua.filter((p) => p.km != null && p.km <= kmTarget + 0.3).length;
    const acquaB = rifugio ? acqua.filter((p) => p.km != null && Math.abs(p.km - rifugio.km) <= 2).length : 0;
    const c = confrontoGiornoNotte({ kmTarget, kmTotale, anello, serieAndata: andata, serieRitorno: ritorno, inizioMin, fineMin, giorni, rifugio, acquaA, acquaB });
    const parco = await parcoNazionaleIn(rifugio ? [rifugio.lon, rifugio.lat] : partenza);
    if (mia !== richiesta || !risultato.isConnected) return;

    // un punto alla partenza: non c'è niente da confrontare
    if (kmTarget < 0.05) {
      risultato.innerHTML = `<p>Il punto è alla partenza: non serve camminare per arrivarci, e quindi nemmeno una notte fuori. Per esserci all'alba guarda «Luce e fotografia».</p>`;
      return;
    }
    // --- colonna A
    const a = c.a;
    const colonnaA = `<h4>Stesso giorno</h4><dl>
      ${riga('Km', `${km1(a.km)} km`)}
      ${riga('Cammino', durata(a.camminoMin))}
      ${riga('Al punto', `${quando(a.arrivoMin, data0)} (${a.luceArrivo})`)}
      ${riga('Rientro', `${quando(a.fineMin, data0)}${a.nelTempo ? '' : ' · oltre il tuo orario'}`)}
      ${riga('Al buio', a.buioMin ? `${durata(a.buioMin)} di cammino` : 'niente')}
      ${riga('Acqua', a.acqua ? `${a.acqua} ${a.acqua === 1 ? 'punto' : 'punti'} lungo la salita` : 'nessun punto noto')}
    </dl>${a.buioMin ? avviso(`Cammini al buio per ${durata(a.buioMin)}: frontale e sentiero che conosci.`) : ''}
    ${a.nelTempo ? '' : avviso(`Non rientri entro le ${escapeHtml(rientro.slice(11, 16))}.`)}
    <p class="tenue piccolo">All'alba al punto non ci arrivi: con una partenza di giorno ci sei ${a.luceArrivo}.</p>`;

    // --- colonna B
    let colonnaB;
    if (!c.b) {
      colonnaB = `<h4>Notte fuori</h4><p>Nessun rifugio o bivacco entro 1 km dalla traccia, vicino a quel punto. Dormire fuori richiede la tenda e, nei parchi, un permesso: è la scelta più delicata e non la calcolo.</p>`;
    } else {
      const b = c.b;
      const t = TIPI_PUNTO[b.rifugio.tipo];
      const prenota = [b.rifugio.prenotazione, b.rifugio.telefono && `tel. ${b.rifugio.telefono}`, b.rifugio.gestore && `gestione: ${b.rifugio.gestore}`].filter(Boolean).join(' · ');
      colonnaB = `<h4>Notte fuori</h4><dl>
        ${riga('Dormi', `${escapeHtml(b.rifugio.nome ?? t.nome)} · ${t.nome.toLowerCase()}, km ${km1(b.rifugio.km)}`)}
        ${riga('Giorno 1', `${km1(b.giorno1.km)} km · ${durata(b.giorno1.camminoMin)} · arrivo ${quando(b.giorno1.arrivoMin, data0)} (${b.giorno1.luceArrivo})`)}
        ${riga('Giorno 2', b.giorno2.partenzaMin == null ? 'alba non calcolabile' : `${km1(b.giorno2.km)} km · parti ${alle(b.giorno2.partenzaMin, data0)}`)}
        ${riga('Al punto', b.giorno2.arrivoTrattoMin == null ? '–' : `${quando(b.giorno2.arrivoTrattoMin, data0)}, ${ANTICIPO_ALBA_MIN} minuti prima dell'alba`)}
        ${riga('Rientro', b.giorno2.fineMin == null ? '–' : `${quando(b.giorno2.fineMin, data0)}${b.nelTempo ? '' : ' · oltre il tuo orario'}`)}
        ${riga('Al buio', b.buioMin ? `${durata(b.buioMin)} di cammino` : 'niente')}
        ${riga('Acqua', b.acqua ? `${b.acqua} ${b.acqua === 1 ? 'punto' : 'punti'} vicino al rifugio` : 'nessun punto noto')}
        ${prenota ? riga('Prenotazione', escapeHtml(prenota)) : ''}
      </dl>${b.giorno2.buioMin ? avviso(`La mattina cammini al buio per ${durata(b.giorno2.buioMin)}: frontale e sentiero che conosci.`) : ''}
      ${b.nelTempo ? '' : avviso(`Non rientri entro le ${escapeHtml(rientro.slice(11, 16))}.`)}
      ${b.riposoMin != null && b.riposoMin < 300 ? avviso(`Tra l'arrivo al rifugio e la ripartenza ci sono solo ${durata(b.riposoMin)}.`) : ''}
      ${parco ? avviso(`${escapeHtml(parco.nomeBreve)}: nei parchi nazionali campeggio e bivacco liberi sono in genere vietati; il rifugio va di norma prenotato.`) : ''}`;
    }
    risultato.innerHTML = `<div class="gn-colonne"><section>${colonnaA}</section><section>${colonnaB}</section></div>
      <p class="tenue piccolo">Tempo a disposizione: ${durata(c.disponibileMin)}.${linkParco ? ` <a href="${escapeHtml(linkParco)}" target="_blank" rel="noopener noreferrer">Regole e chiusure del Parco ↗</a>` : ''}</p>`;
  });
}
