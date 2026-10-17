// "Quando andare" nella scheda di un sentiero: striscia dei prossimi 7 giorni (Open-Meteo) con il
// tempo, le temperature e il giudizio di ogni giorno; toccando un giorno, sotto il motivo principale,
// fino a che ora partire, il tramonto e la temperatura in cima. I calcoli in src/lib/quandoAndare.js.
import { stato } from '../stato.js';
import { datiPerMeteo, GIUDIZI } from '../lib/condizioni.js';
import { GIORNI_STRISCIA, TEMPI_METEO, dateDaOggi, nomeGiorno, giornoDellaStriscia, testoDelGiorno, partenzaPassata } from '../lib/quandoAndare.js';
import { oraPartenzaScelta } from './andataRitorno.js';
import { escapeHtml } from '../lib/formato.js';
import { scaricaPrevisioni, previsioneDi } from './previsioni.js';
import { ICONE } from './icone.js';

const ICONA_TEMPO = { temporale: 'temporale', neve: 'neve', pioggia: 'pioggia', nuvoloso: 'nuvola', variabile: 'variabile', sereno: 'sole' };
const oggiItalia = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

export const htmlQuandoAndare = () => `<section class="riquadro quando-andare" aria-label="Quando andare">
    <h2>Quando andare</h2>
    <div class="striscia-meteo" role="radiogroup" aria-label="Prossimi giorni"><p class="tenue">Carico le previsioni…</p></div>
    <p class="giorno-meteo" aria-live="polite"></p>
    <p class="tenue piccolo">Previsioni Open-Meteo alla partenza e nel punto più alto, con la durata scelta sopra.</p>
  </section>`;

// sezione: il riquadro; dati: { sentiero, traccia, quote }; misure: quelle scelte (Solo andata / A/R).
// → aggiorna(misure, quote): ricalcola i giudizi quando cambia la scelta o arrivano le quote (se
// serve la previsione in quota, la scarica)
export function collegaQuandoAndare(sezione, { sentiero, traccia, quote: quoteIniziali, misure }) {
  let quote = quoteIniziali;
  if (!sezione) return () => {};
  const striscia = sezione.querySelector('.striscia-meteo');
  const riga = sezione.querySelector('.giorno-meteo');
  const attivita = stato.leggi().attivita;
  const oggi = oggiItalia();
  const date = dateDaOggi(oggi);
  let scelto = date[0];
  let giorni = [];
  let pronta = false;
  let m = datiPerMeteo({ sentiero, traccia, misure }, attivita, quote);
  if (!m) {
    sezione.remove();
    return () => {};
  }

  function calcola() {
    // si giudica con la partenza scelta (quella del blocco Andata e ritorno); per oggi, se è già passata, è tardi
    const partenza = oraPartenzaScelta();
    const ora = new Date();
    const tardi = partenzaPassata(partenza, ora.getHours() * 60 + ora.getMinutes());
    giorni = date.map((d) => {
      const g = giornoDellaStriscia({ basso: previsioneDi(m.basso.chiave, d), alto: m.alto ? previsioneDi(m.alto.chiave, d) : null }, m, { attivita, dopoMin: partenza ?? 0 });
      return d === oggi && tardi && g ? { ...g, giudizio: null, motivo: null, partenza: null, tardi: true } : g;
    });
  }
  function disegna() {
    striscia.innerHTML = date
      .map((d, i) => {
        const g = giorni[i];
        const on = d === scelto;
        const t = g?.temperature;
        return `<button type="button" role="radio" aria-checked="${on}" class="giorno-striscia ${on ? 'attivo' : ''} giudizio-${g?.giudizio ?? 'nessuno'}" data-giorno="${d}" aria-label="${escapeHtml(`${nomeGiorno(d, oggi)}: ${g ? `${TEMPI_METEO[g.tempo] ?? ''}, ${GIUDIZI[g.giudizio]?.nome ?? 'senza giudizio'}` : 'non disponibile'}`)}">
          <span class="nome-giorno">${escapeHtml(nomeGiorno(d, oggi))}</span>
          ${g?.tempo ? ICONE[ICONA_TEMPO[g.tempo]] : '<span class="icona"></span>'}
          <span class="temp-giorno">${t ? `${t.min}–${t.max}°` : '–'}</span>
          <span class="segno-giudizio" aria-hidden="true"></span>
        </button>`;
      })
      .join('');
    const i = date.indexOf(scelto);
    riga.textContent = testoDelGiorno(giorni[i], nomeGiorno(scelto, oggi));
    riga.className = `giorno-meteo meteo-${giorni[i]?.giudizio ?? 'nessuno'}`;
  }

  striscia.addEventListener('click', (e) => {
    const d = e.target.closest('[data-giorno]')?.dataset.giorno;
    if (!d || !pronta) return;
    scelto = d;
    disegna();
  });

  scaricaPrevisioni([m.basso, m.alto].filter(Boolean), { giorni: GIORNI_STRISCIA })
    .then(() => {
      calcola();
      // si parte dal primo giorno con una previsione
      scelto = date.find((d, i) => giorni[i]) ?? date[0];
      pronta = true;
      disegna();
    })
    .catch(() => {
      striscia.innerHTML = '<p class="tenue">Previsioni non disponibili: controlla la connessione.</p>';
    });

  return async (nuove, nuoveQuote = quote) => {
    quote = nuoveQuote;
    m = datiPerMeteo({ sentiero, traccia, misure: nuove }, attivita, quote) ?? m;
    if (!pronta) return;
    if (m.alto && !previsioneDi(m.alto.chiave, date[0])) await scaricaPrevisioni([m.alto], { giorni: GIORNI_STRISCIA }).catch(() => {});
    if (!sezione.isConnected) return;
    calcola();
    disegna();
  };
}
