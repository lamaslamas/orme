// Blocco «Quando» della scheda di un sentiero e di un percorso mio: la striscia dei prossimi 7 giorni (Open-Meteo) da
// toccare per scegliere il giorno, l'ora di partenza, a che ora si arriva (o si rientra), una riga con alba, ora d'oro e
// tramonto e un solo avviso, il più restrittivo (partenza passata, fine dopo il tramonto, meteo, «parti entro»).
// Prima erano tre blocchi: Percorrenza, Quando andare, Luce e fotografia. I calcoli sono in src/lib/quandoAndare.js,
// src/lib/andataRitorno.js e src/lib/fotografia.js.
import { stato } from '../stato.js';
import { datiPerMeteo } from '../lib/condizioni.js';
import { GIORNI_STRISCIA, dateDaOggi, nomeGiorno, giornoDellaStriscia, partenzaPassata, avvisiOrari, partiEntro, tempoDelGiorno, TEMPI_METEO } from '../lib/quandoAndare.js';
import { MODI, orariGiornata, oraDaMinuti, minutiDaOra } from '../lib/andataRitorno.js';
import { orariDelGiorno } from '../lib/fotografia.js';
import { albaTramonto, minutiItaliani } from '../lib/sole.js';
import { escapeHtml } from '../lib/formato.js';
import { scaricaPrevisioni, previsioneDi } from './previsioni.js';
import { modoScelto, ricordaModo, oraPartenzaScelta, oraPartenzaTesto, ricordaOraPartenza } from './andataRitorno.js';
import { htmlRigaRitmo } from './ritmo.js';
import { ICONE } from './icone.js';

const ICONA_TEMPO = { temporale: 'temporale', neve: 'neve', pioggia: 'pioggia', nuvoloso: 'nuvola', variabile: 'variabile', sereno: 'sole' };
const oggiItalia = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const ora = (min) => (min == null ? '–' : oraDaMinuti(min));

// Il giorno scelto e la partenza, per chi li usa (le giornate di «Su più giorni»); a ogni cambio un evento
let giornoOra = { giorno: null };
export const statoQuando = () => giornoOra;
export function ascoltaQuando(f) {
  window.addEventListener('orme:quando', f);
  return () => window.removeEventListener('orme:quando', f);
}
const avvisaQuando = () => window.dispatchEvent(new CustomEvent('orme:quando'));

// ar: misureAR(...) o null; iniziali: { giorno, ora } con cui si apre
export function htmlQuando(ar, modo = modoScelto(), iniziali = null) {
  const conAR = ar && !ar.anello && ar.totale;
  return `<section class="riquadro quando" aria-label="Quando">
    <h2>Quando</h2>
    ${ar?.roundtripAperto ? '<p class="tenue piccolo">OSM lo indica come anello, ma la traccia non si chiude.</p>' : ''}
    ${
      conAR
        ? `<div class="segmenti due scelta-ar" role="radiogroup" aria-label="Andata e ritorno">${Object.entries(MODI)
            .map(([k, t]) => `<button type="button" role="radio" class="segmento ${k === modo ? 'attivo' : ''}" aria-checked="${k === modo}" data-modo-ar="${k}">${t}</button>`)
            .join('')}</div>`
        : ar?.anello
          ? '<p class="tenue piccolo">Percorso ad anello: niente andata e ritorno.</p>'
          : ''
    }
    <div class="striscia-meteo" role="radiogroup" aria-label="Prossimi giorni"><p class="tenue">Carico le previsioni…</p></div>
    <p class="giorno-meteo tenue" aria-live="polite"></p>
    ${
      ar
        ? `<div class="quando-orari"><label>Partenza <input type="time" data-ora value="${escapeHtml(iniziali?.ora ?? oraPartenzaTesto())}" step="300" /></label>
      <span class="quando-fine" aria-live="polite"></span></div>`
        : ''
    }
    <p class="quando-luce tenue"></p>
    <div class="quando-avviso" aria-live="polite"></div>
    ${htmlRigaRitmo()}
    <p class="tenue piccolo">Previsioni Open-Meteo alla partenza e nel punto più alto; luce calcolata sul telefono.</p>
  </section>`;
}

// sezione: il blocco; dati: { sentiero, traccia, quote, ar, partenza ([lon, lat] per la luce), misureDi(modo), iniziali }.
// alCambioModo(modo): la pagina aggiorna i numeri in alto e «Su più giorni».
// → aggiorna(misure, quote): ricalcola quando cambia la scelta o arrivano le quote
export function collegaQuando(sezione, { sentiero, traccia, quote: quoteIniziali, ar = null, partenza = null, misureDi, iniziali = null, alCambioModo = () => {} }) {
  if (!sezione) return () => {};
  let quote = quoteIniziali;
  const striscia = sezione.querySelector('.striscia-meteo');
  const rigaGiorno = sezione.querySelector('.giorno-meteo');
  const attivita = stato.leggi().attivita;
  const oggi = oggiItalia();
  const date = dateDaOggi(oggi, GIORNI_STRISCIA);
  let scelto = date.includes(iniziali?.giorno) ? iniziali.giorno : date[0];
  giornoOra = { giorno: scelto };
  let giorni = [];
  let pronta = false;
  let modo = modoScelto();
  let m = datiPerMeteo({ sentiero, traccia, misure: misureDi(modo) }, attivita, quote);
  // senza dati per il meteo (es. nessuna traccia) la striscia non c'è: restano ora, luce e avviso
  if (!m) striscia.hidden = true;

  const partenzaMin = () => minutiDaOra(sezione.querySelector('[data-ora]')?.value) ?? oraPartenzaScelta();
  const g = () => giorni[date.indexOf(scelto)] ?? null;

  function calcola() {
    if (!m) return;
    // si giudica con la partenza scelta; per oggi, se è già passata, è tardi
    const parte = partenzaMin();
    const adesso = new Date();
    const tardi = partenzaPassata(parte, adesso.getHours() * 60 + adesso.getMinutes());
    giorni = date.map((d) => {
      const x = giornoDellaStriscia({ basso: previsioneDi(m.basso.chiave, d), alto: m.alto ? previsioneDi(m.alto.chiave, d) : null }, m, { attivita, dopoMin: parte ?? 0 });
      return d === oggi && tardi && x ? { ...x, giudizio: null, motivo: null, partenza: null, tardi: true } : x;
    });
  }

  function disegnaStriscia() {
    if (!m) return;
    striscia.innerHTML = date
      .map((d, i) => {
        const x = giorni[i];
        const on = d === scelto;
        const t = x?.temperature;
        return `<button type="button" role="radio" aria-checked="${on}" class="giorno-striscia ${on ? 'attivo' : ''} giudizio-${x?.giudizio ?? 'nessuno'}" data-giorno="${d}" aria-label="${escapeHtml(`${nomeGiorno(d, oggi)}: ${x ? `${TEMPI_METEO[x.tempo] ?? ''}${t ? `, ${t.min} / ${t.max} gradi` : ''}` : 'previsione non disponibile'}`)}">
          <span class="nome-giorno">${escapeHtml(nomeGiorno(d, oggi))}</span>
          ${x?.tempo ? ICONE[ICONA_TEMPO[x.tempo]] : '<span class="icona"></span>'}
          <span class="temp-giorno">${t ? `${t.min}–${t.max}°` : '–'}</span>
          <span class="segno-giudizio" aria-hidden="true"></span>
        </button>`;
      })
      .join('');
  }

  // orari, riga della luce e un solo avviso
  function disegnaOrari() {
    const x = g();
    // il tempo del giorno scelto, in breve
    rigaGiorno.textContent = m && pronta ? (x ? [nomeGiorno(scelto, oggi), TEMPI_METEO[x.tempo]?.toLowerCase(), x.temperature && `${x.temperature.min}–${x.temperature.max}°`, x.inCima && `in cima ${x.inCima.min}–${x.inCima.max}°`].filter(Boolean).join(' · ') : `${nomeGiorno(scelto, oggi)}: previsione non disponibile`) : '';
    const luce = partenza ? orariDelGiorno(scelto, partenza) : null;
    sezione.querySelector('.quando-luce').textContent = luce ? `Alba ${ora(luce.alba)} · ora d'oro ${ora(luce.alba)}–${ora(luce.oroMattinaFine)} e ${ora(luce.oroSeraInizio)}–${ora(luce.tramonto)} · tramonto ${ora(luce.tramonto)}` : '';
    const fine = sezione.querySelector('.quando-fine');
    const avvisoBox = sezione.querySelector('.quando-avviso');
    const parte = partenzaMin();
    const tramontoMin = partenza ? minutiItaliani(albaTramonto(scelto, partenza).tramonto) : null;
    const candidati = []; // { testo, gravita }
    if (ar && parte != null && ar.andata.durataMin != null) {
      const conRitorno = modo === 'ar' && ar.ritorno && !ar.anello;
      const o = orariGiornata({ partenzaMin: parte, andataMin: ar.andata.durataMin, ritornoMin: conRitorno ? ar.ritorno.durataMin : null, tramontoMin });
      fine.innerHTML = ar.anello
        ? `Fine del giro alle <b>${ora(o.fineMin)}</b>`
        : conRitorno
          ? `Arrivo alle <b>${ora(o.arrivoMin)}</b> · rientro alle <b>${ora(o.rientroMin)}</b>`
          : `Arrivo alle <b>${ora(o.arrivoMin)}</b>`;
      const adesso = new Date();
      for (const t of avvisiOrari({ oggi: scelto === oggi, partenzaMin: parte, adessoMin: adesso.getHours() * 60 + adesso.getMinutes(), fineMin: o.fineMin, tramontoMin, conRientro: Boolean(conRitorno || ar.anello) })) candidati.push({ testo: t, gravita: 3 });
      if (x && !x.tardi && x.giudizio === 'sconsigliato' && x.motivo) candidati.push({ testo: `${nomeGiorno(scelto, oggi)}: ${x.motivo}`, gravita: 3 });
      else if (x && !x.tardi && x.giudizio === 'attenzione' && x.motivo) candidati.push({ testo: `${nomeGiorno(scelto, oggi)}: ${x.motivo}`, gravita: 2 });
      const limite = x?.partenza?.entro ? { entroMin: minutiDaOra(x.partenza.entro), poi: x.partenza.poi } : null;
      const pe = partiEntro({ luceMin: o.ultimaPartenzaMin, meteo: limite, tramontoMin });
      if (pe) candidati.push({ testo: pe.testo, gravita: 1 });
    }
    const scelta = candidati.sort((a, b) => b.gravita - a.gravita)[0];
    avvisoBox.innerHTML = scelta ? (scelta.gravita >= 2 ? `<p class="avviso-luce">${ICONE.avviso}<span>${escapeHtml(scelta.testo)}</span></p>` : `<p class="tenue">${escapeHtml(scelta.testo)}</p>`) : '';
  }

  function tutto() {
    calcola();
    disegnaStriscia();
    disegnaOrari();
    avvisaQuando();
  }

  striscia.addEventListener('click', (e) => {
    const d = e.target.closest('[data-giorno]')?.dataset.giorno;
    if (!d || d === scelto) return;
    scelto = d;
    giornoOra = { giorno: scelto };
    disegnaStriscia();
    disegnaOrari();
    avvisaQuando();
  });
  sezione.addEventListener('input', (e) => {
    if (!e.target.matches('[data-ora]') || !e.target.value) return;
    ricordaOraPartenza(e.target.value);
    tutto();
  });
  sezione.addEventListener('click', (e) => {
    const nuovo = e.target.closest('[data-modo-ar]')?.dataset.modoAr;
    if (!nuovo || nuovo === modo) return;
    modo = nuovo;
    ricordaModo(modo);
    sezione.querySelectorAll('[data-modo-ar]').forEach((b) => {
      const on = b.dataset.modoAr === modo;
      b.classList.toggle('attivo', on);
      b.setAttribute('aria-checked', String(on));
    });
    m = datiPerMeteo({ sentiero, traccia, misure: misureDi(modo) }, attivita, quote) ?? m;
    if (pronta) tutto();
    else {
      disegnaOrari();
      avvisaQuando();
    }
    alCambioModo(modo);
  });

  if (m) {
    scaricaPrevisioni([m.basso, m.alto].filter(Boolean), { giorni: GIORNI_STRISCIA })
      .then(() => {
        calcola();
        // si parte dal giorno voluto (se c'è la previsione), altrimenti dal primo con una previsione
        scelto = giorni[date.indexOf(scelto)] ? scelto : date.find((d, i) => giorni[i]) ?? date[0];
        giornoOra = { giorno: scelto };
        pronta = true;
        disegnaStriscia();
        disegnaOrari();
      })
      .catch(() => {
        striscia.innerHTML = '<p class="tenue">Previsioni non disponibili: controlla la connessione.</p>';
      });
  }
  disegnaOrari();

  return async (nuove, nuoveQuote = quote) => {
    quote = nuoveQuote;
    m = datiPerMeteo({ sentiero, traccia, misure: nuove }, attivita, quote) ?? m;
    if (!pronta) return disegnaOrari();
    if (m.alto && !previsioneDi(m.alto.chiave, date[0])) await scaricaPrevisioni([m.alto], { giorni: GIORNI_STRISCIA }).catch(() => {});
    if (!sezione.isConnected) return;
    tutto();
  };
}
