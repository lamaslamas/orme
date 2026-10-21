// Blocco "Andata e ritorno" della scheda di un sentiero o di un percorso: interruttore Solo andata /
// Andata e ritorno (ricordato sul telefono), righe Andata, Ritorno e Totale, e gli orari del giorno
// scelto con il tramonto calcolato nel punto di partenza. Gli anelli hanno solo il giro e gli orari.
import { MODI, orariGiornata, oraDaMinuti, minutiDaOra, MARGINE_LUCE_MIN } from '../lib/andataRitorno.js';
import { avvisiOrari, partiEntro } from '../lib/quandoAndare.js';
import { testoRitmo } from '../lib/ritmo.js';
import { htmlRitmo, collegaRitmo } from './ritmo.js';
import { giornoScelto, impostaGiorno, ascoltaGiorno, limiteMeteoDi, ascoltaLimiti } from './giornoScelto.js';
import { albaTramonto, oraItaliana, minutiItaliani } from '../lib/sole.js';
import { durata, escapeHtml } from '../lib/formato.js';
import { ICONE } from './icone.js';

const CHIAVE_MODO = 'orme.andataRitorno';
const CHIAVE_ORA = 'orme.oraPartenza';

export function modoScelto() {
  try {
    return localStorage.getItem(CHIAVE_MODO) === 'andata' ? 'andata' : 'ar';
  } catch {
    return 'ar';
  }
}
function ricorda(chiave, valore) {
  try {
    localStorage.setItem(chiave, valore);
  } catch {
    // senza memoria del browser vale solo per questa pagina
  }
}
export const oraPartenzaScelta = () => minutiDaOra(oraRicordata());
export const oraPartenzaTesto = () => oraRicordata();
export const ricordaOraPartenza = (valore) => ricorda(CHIAVE_ORA, valore);
function oraRicordata() {
  try {
    return localStorage.getItem(CHIAVE_ORA) || '09:00';
  } catch {
    return '09:00';
  }
}
// oggi nell'ora italiana, "aaaa-mm-gg"
const oggi = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

const numero = (x) => (x == null ? '–' : x);
function riga(nome, m, classe = '') {
  const disl = m.salita == null ? '–' : `+${m.salita} −${m.discesa}`;
  return `<tr class="${classe}"><th scope="row">${nome}</th><td>${numero(m.km?.toFixed(1).replace('.', ','))} km</td><td>${disl}</td><td>${escapeHtml(durata(m.durataMin))}</td></tr>`;
}

// ar: misureAR(...); partenza: [lon, lat]; nomeArrivo: per "arrivo a …" (facoltativo)
// iniziali: { giorno, ora } con cui si apre (di base oggi e l'ora solita)
export function htmlAndataRitorno(ar, modo = modoScelto(), iniziali = null) {
  const conAR = !ar.anello && ar.totale;
  const giorno = giornoScelto() ?? iniziali?.giorno ?? oggi();
  const ora = iniziali?.ora ?? oraRicordata();
  return `<section class="riquadro andata-ritorno" aria-label="Percorrenza">
    <h2>${ar.anello ? 'Il giro' : 'Percorrenza'}</h2>
    ${ar.roundtripAperto ? '<p class="tenue piccolo">OSM lo indica come anello, ma la traccia non si chiude.</p>' : ''}
    ${
      conAR
        ? `<div class="segmenti due scelta-ar" role="radiogroup" aria-label="Andata e ritorno">${Object.entries(MODI)
            .map(([k, t]) => `<button type="button" role="radio" class="segmento ${k === modo ? 'attivo' : ''}" aria-checked="${k === modo}" data-modo-ar="${k}">${t}</button>`)
            .join('')}</div>`
        : ar.anello
          ? '<p class="tenue piccolo">Percorso ad anello: niente andata e ritorno.</p>'
          : ''
    }
    <table class="tabella-ar">
      ${ar.anello ? riga('Giro', ar.andata, 'totale') : conAR && modo === 'ar' ? riga('Andata', ar.andata) + riga('Ritorno', ar.ritorno) + riga('Totale', ar.totale, 'totale') : riga('Andata', ar.andata, 'totale')}
    </table>
    ${htmlRitmo()}
    <p class="tenue piccolo">${testoRitmo()}${conAR && modo === 'ar' ? ', calcolati nei due sensi' : ''}${ar.andata.salita == null ? ' (senza le quote: solo dai km)' : ''}.</p>
    <div class="orari-ar">
      <div class="orari-scelte">
        <label>Giorno <input type="date" data-giorno value="${escapeHtml(giorno)}" /></label>
        <label>Partenza <input type="time" data-ora value="${escapeHtml(ora)}" step="300" /></label>
      </div>
      <div class="orari-risultato" aria-live="polite"></div>
    </div>
  </section>`;
}

// sezione: il blocco; alCambioModo(modo): la pagina aggiorna i numeri in alto e "Su più giorni"
export function collegaAndataRitorno(sezione, { ar, partenza, alCambioModo = () => {}, ricarica = () => {} }) {
  if (!sezione) return;
  collegaRitmo(sezione, ricarica);
  // il giorno è uno solo: se lo cambia «Quando andare» cambia anche qui
  const smetti = ascoltaGiorno((g) => {
    const campo = sezione.querySelector('[data-giorno]');
    if (campo && campo.value !== g) {
      campo.value = g;
      aggiornaOrari();
    }
  });
  // il meteo del giorno arriva da «Quando andare» (dopo le previsioni): si rifà il «parti entro»
  const smettiLimiti = ascoltaLimiti((g) => g === sezione.querySelector('[data-giorno]')?.value && aggiornaOrari());
  new MutationObserver(() => {
    if (!sezione.isConnected) {
      smetti();
      smettiLimiti();
    }
  }).observe(document.body, { childList: true, subtree: true });
  let modo = modoScelto();
  function aggiornaOrari() {
    // il riquadro si ridisegna cambiando la scelta: si cerca ogni volta
    const risultato = sezione.querySelector('.orari-risultato');
    const giorno = sezione.querySelector('[data-giorno]').value || oggi();
    const partenzaMin = minutiDaOra(sezione.querySelector('[data-ora]').value);
    if (partenzaMin == null || ar.andata.durataMin == null) return void (risultato.innerHTML = '');
    const { tramonto } = partenza ? albaTramonto(giorno, partenza) : { tramonto: null };
    const conRitorno = modo === 'ar' && ar.ritorno && !ar.anello;
    const o = orariGiornata({ partenzaMin, andataMin: ar.andata.durataMin, ritornoMin: conRitorno ? ar.ritorno.durataMin : null, tramontoMin: minutiItaliani(tramonto) });
    const fine = ar.anello
      ? `Fine del giro alle <b>${oraDaMinuti(o.fineMin)}</b>`
      : conRitorno
        ? `Arrivo alle <b>${oraDaMinuti(o.arrivoMin)}</b> · rientro alla partenza alle <b>${oraDaMinuti(o.rientroMin)}</b>`
        : `Arrivo alle <b>${oraDaMinuti(o.arrivoMin)}</b>`;
    // un avviso per ogni problema vero (partenza passata, fine oltre l'ultima luce utile), altrimenti l'ora utile
    const adesso = new Date();
    const avvisi = avvisiOrari({
      oggi: giorno === oggi(),
      partenzaMin,
      adessoMin: adesso.getHours() * 60 + adesso.getMinutes(),
      fineMin: o.fineMin,
      tramontoMin: tramonto ? minutiItaliani(tramonto) : null,
      conRientro: Boolean(conRitorno || ar.anello),
    });
    const luce = avvisi.length
      ? avvisi.map((t) => `<p class="avviso-luce">${ICONE.avviso}<span>${escapeHtml(t)}</span></p>`).join('')
      : tramonto
        ? (() => {
            // un solo «parti entro»: il più restrittivo tra luce e meteo, con il motivo
            const pe = partiEntro({ luceMin: o.ultimaPartenzaMin, meteo: limiteMeteoDi(giorno), tramontoMin: minutiItaliani(tramonto) });
            return pe ? `<p class="tenue">${escapeHtml(pe.testo)}</p>` : '';
          })()
        : '';
    risultato.innerHTML = `<p>${fine}</p>${luce}`;
  }
  sezione.addEventListener('input', (e) => {
    if (e.target.matches('[data-giorno]') && e.target.value) impostaGiorno(e.target.value);
    if (e.target.matches('[data-ora]') && e.target.value) ricorda(CHIAVE_ORA, e.target.value);
    aggiornaOrari();
  });
  sezione.addEventListener('click', (e) => {
    const nuovo = e.target.closest('[data-modo-ar]')?.dataset.modoAr;
    if (!nuovo || nuovo === modo) return;
    modo = nuovo;
    ricorda(CHIAVE_MODO, modo);
    // si ridisegna il blocco con le righe giuste, tenendo giorno e ora scelti
    const giorno = sezione.querySelector('[data-giorno]').value;
    const ora = sezione.querySelector('[data-ora]').value;
    const nuovaSezione = document.createElement('div');
    nuovaSezione.innerHTML = htmlAndataRitorno(ar, modo);
    sezione.replaceChildren(...nuovaSezione.firstElementChild.childNodes);
    sezione.querySelector('[data-giorno]').value = giorno;
    sezione.querySelector('[data-ora]').value = ora;
    aggiornaOrari();
    alCambioModo(modo);
  });
  aggiornaOrari();
}
