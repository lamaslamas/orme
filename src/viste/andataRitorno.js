// Blocco "Andata e ritorno" della scheda di un sentiero o di un percorso: interruttore Solo andata /
// Andata e ritorno (ricordato sul telefono), righe Andata, Ritorno e Totale, e gli orari del giorno
// scelto con il tramonto calcolato nel punto di partenza. Gli anelli hanno solo il giro e gli orari.
import { MODI, orariGiornata, oraDaMinuti, minutiDaOra, MARGINE_LUCE_MIN } from '../lib/andataRitorno.js';
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
export function htmlAndataRitorno(ar, modo = modoScelto()) {
  const conAR = !ar.anello && ar.totale;
  return `<section class="riquadro andata-ritorno" aria-label="Andata e ritorno">
    <h2>${ar.anello ? 'Il giro' : 'Andata e ritorno'}</h2>
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
    <p class="tenue piccolo">Tempi CAI senza soste${conAR ? ', calcolati nei due sensi' : ''}${ar.andata.salita == null ? ' (senza le quote: solo dai km)' : ''}.</p>
    <div class="orari-ar">
      <div class="orari-scelte">
        <label>Giorno <input type="date" data-giorno value="${oggi()}" /></label>
        <label>Partenza <input type="time" data-ora value="${escapeHtml(oraRicordata())}" step="300" /></label>
      </div>
      <div class="orari-risultato" aria-live="polite"></div>
    </div>
  </section>`;
}

// sezione: il blocco; alCambioModo(modo): la pagina aggiorna i numeri in alto e "Su più giorni"
export function collegaAndataRitorno(sezione, { ar, partenza, alCambioModo = () => {} }) {
  if (!sezione) return;
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
    const fine = ar.anello ? `rientro <b>${oraDaMinuti(o.fineMin)}</b>` : conRitorno ? `arrivo <b>${oraDaMinuti(o.arrivoMin)}</b> · rientro <b>${oraDaMinuti(o.rientroMin)}</b>` : `arrivo <b>${oraDaMinuti(o.arrivoMin)}</b>`;
    const luce = tramonto
      ? o.tardi
        ? `<p class="avviso-luce">${ICONE.avviso}<span>${conRitorno || ar.anello ? 'Rientri' : 'Arrivi'} dopo l'ultima luce utile (tramonto ${oraItaliana(tramonto)}, margine ${MARGINE_LUCE_MIN} min): parti entro le ${oraDaMinuti(o.ultimaPartenzaMin)}. Nei boschi e nelle valli il buio arriva prima.</span></p>`
        : `<p class="tenue">Tramonto ${oraItaliana(tramonto)} alla partenza · parti entro le <b>${oraDaMinuti(o.ultimaPartenzaMin)}</b> per ${conRitorno || ar.anello ? 'rientrare' : 'arrivare'} con la luce</p>`
      : '';
    risultato.innerHTML = `<p>${fine}</p>${luce}`;
  }
  sezione.addEventListener('input', (e) => {
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
