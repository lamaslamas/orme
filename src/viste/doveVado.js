// "Dove vado domani?": scegli il giorno (oggi o domani) e l'app ordina i percorsi in base alle
// previsioni di Open-Meteo alla partenza e in quota, alla durata e alle tue preferenze.
// A Open-Meteo vanno solo coordinate e quote dei sentieri. Preferenze e scelte restano sul telefono.
import { tuttiISentieri, tutteLeTracce } from '../db.js';
import { PARCHI, parcoDa } from '../datiParchi.js';
import { ANIMALI } from '../lib/costanti.js';
import { FILTRI_VUOTI } from '../lib/filtri.js';
import { preparaPercorsi, filtraPercorsi } from '../lib/motore.js';
import { quoteDellaTraccia } from '../lib/riassunto.js';
import { durata as testoDurata, escapeHtml, codici } from '../lib/formato.js';
import {
  SOGLIE_PREDEFINITE,
  GIUDIZI,
  NOMI_FATTORI,
  DURATE,
  urlPrevisioni,
  giorniDaRisposta,
  giudicaGiornata,
  riassuntoParco,
  nellaDurata,
  datiPerMeteo,
  ordinaClassifica,
  animaliDelMese,
} from '../lib/condizioni.js';
import { stato } from '../stato.js';
import { htmlSelettoreAttivita, collegaSelettoreAttivita } from './attivita.js';

const CHIAVE_SCELTE = 'orme.doveVado';
const CHIAVE_SOGLIE = 'orme.preferenzeMeteo';
const PAGINA = 25;
const VALIDITA_MS = 60 * 60 * 1000; // previsioni riusate per un'ora

const leggi = (chiave, base) => {
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(chiave) ?? '{}') };
  } catch {
    return { ...base };
  }
};
const scrivi = (chiave, valore) => {
  try {
    localStorage.setItem(chiave, JSON.stringify(valore));
  } catch {
    // memoria non disponibile (navigazione privata): le scelte valgono solo per questa visita
  }
};

// data locale YYYY-MM-DD tra n giorni
function dataTra(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// previsioni già scaricate in questa sessione: chiave del punto → { giorni, quando }
const memoria = new Map();
async function scaricaPrevisioni(punti, { segnale } = {}) {
  const adesso = Date.now();
  const mancanti = punti.filter((p) => !(memoria.get(p.chiave)?.quando > adesso - VALIDITA_MS));
  for (const { url, punti: gruppo } of urlPrevisioni(mancanti)) {
    const r = await fetch(url, { signal: segnale });
    if (!r.ok) throw new Error(`Open-Meteo ha risposto ${r.status}`);
    const json = await r.json();
    const risposte = Array.isArray(json) ? json : [json];
    gruppo.forEach((p, i) => memoria.set(p.chiave, { giorni: giorniDaRisposta(risposte[i]), quando: adesso }));
  }
}

function htmlPreferenze(s) {
  const opzioni = (nome, voci, attuale) =>
    voci.map(([v, testo]) => `<option value="${v}" ${String(attuale) === String(v) ? 'selected' : ''}>${testo}</option>`).join('');
  return `<details class="riquadro preferenze-meteo">
    <summary>Le mie preferenze</summary>
    <p class="tenue piccolo">Servono a giudicare la giornata per te. Restano solo su questo dispositivo.</p>
    <label>Freddo: va bene fino a (percepiti in quota)
      <select name="freddo">${opzioni('freddo', [[5, '5 °C (soffro il freddo)'], [2, '2 °C'], [-2, '−2 °C (normale)'], [-6, '−6 °C'], [-10, '−10 °C (attrezzato)']], s.freddo)}</select></label>
    <label>Caldo: va bene fino a
      <select name="caldo">${opzioni('caldo', [[24, '24 °C (soffro il caldo)'], [28, '28 °C (normale)'], [32, '32 °C (reggo il caldo)']], s.caldo)}</select></label>
    <label>Vento: raffiche fino a
      <select name="raffiche">${opzioni('raffiche', [[35, '35 km/h'], [50, '50 km/h (normale)'], [65, '65 km/h']], s.raffiche)}</select></label>
    <label>Pioggia
      <select name="pioggia">${opzioni('pioggia', [['niente', 'meglio di no'], ['pioggerella', 'una pioggerella va bene']], s.pioggia)}</select></label>
    <label>Il mio passo
      <select name="passo">${opzioni('passo', [['lento', 'lento (+25%)'], ['medio', 'medio'], ['veloce', 'veloce (−15%)']], s.passo)}</select></label>
    <button type="button" class="link" data-azione="soglie-base">Torna ai valori normali</button>
  </details>`;
}

export async function vistaDoveVado(app) {
  const [sentieri, tracce] = await Promise.all([tuttiISentieri(), tutteLeTracce()]);
  const preparati = preparaPercorsi(sentieri, tracce);
  let scelte = leggi(CHIAVE_SCELTE, { giorno: 1, durata: '', parco: '' });
  let soglie = leggi(CHIAVE_SOGLIE, SOGLIE_PREDEFINITE);
  let mostrati = PAGINA;
  let ancheSconsigliati = false;
  let richiesta = 0;
  let controllo = null;

  app.innerHTML = `
    <a class="indietro" href="#/pianifica">‹ Pianifica</a>
    <h1 class="titolo-pagina">Dove vado ${scelte.giorno ? 'domani' : 'oggi'}?</h1>
    <div class="segmenti scelta-giorno" role="radiogroup" aria-label="Giorno">
      <button type="button" role="radio" class="segmento" data-giorno="0">Oggi</button>
      <button type="button" role="radio" class="segmento" data-giorno="1">Domani</button>
    </div>
    ${htmlSelettoreAttivita({ titolo: false })}
    <div class="pillole scelta-durata" role="group" aria-label="Durata">
      <button type="button" class="pillola" data-durata="">Qualsiasi durata</button>
      ${Object.entries(DURATE).map(([k, d]) => `<button type="button" class="pillola" data-durata="${k}">${d.nome}</button>`).join('')}
    </div>
    <div class="pillole scelta-parco" role="group" aria-label="Parco">
      <button type="button" class="pillola" data-parco="">Tutti i parchi</button>
      ${PARCHI.map((p) => `<button type="button" class="pillola" data-parco="${p.id}">${escapeHtml(p.nomeBreve)}</button>`).join('')}
    </div>
    <div id="parchiMeteo"></div>
    <div id="esito" aria-live="polite"></div>
    ${htmlPreferenze(soglie)}
    <p class="tenue piccolo fonte-meteo">Previsioni <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> (CC BY 4.0), alla quota di partenza e del punto più alto.
      È una valutazione delle previsioni, non una garanzia di sicurezza: controlla il meteo prima di partire e i bollettini valanghe d'inverno.</p>
  `;

  const titolo = app.querySelector('.titolo-pagina');
  const esito = app.querySelector('#esito');
  const parchiMeteo = app.querySelector('#parchiMeteo');

  function evidenzia() {
    titolo.textContent = `Dove vado ${scelte.giorno ? 'domani' : 'oggi'}?`;
    for (const b of app.querySelectorAll('[data-giorno]')) {
      const attivo = Number(b.dataset.giorno) === scelte.giorno;
      b.classList.toggle('attivo', attivo);
      b.setAttribute('aria-checked', String(attivo));
    }
    for (const b of app.querySelectorAll('[data-durata]')) b.classList.toggle('attiva', b.dataset.durata === scelte.durata);
    for (const b of app.querySelectorAll('[data-parco]')) b.classList.toggle('attiva', b.dataset.parco === scelte.parco);
  }

  function candidati() {
    const attivita = stato.leggi().attivita;
    return filtraPercorsi(preparati, { ...FILTRI_VUOTI }, attivita)
      .filter((p) => p.sentiero.tipoPercorso !== 'uscita_guidata') // le uscite guidate hanno le loro date
      .filter((p) => !scelte.parco || (p.sentiero.parchi ?? [p.sentiero.parco]).includes(scelte.parco))
      .map((p) => ({ ...p, meteo: datiPerMeteo(p, attivita, quoteDellaTraccia(p.sentiero, p.traccia)) }))
      .filter((p) => p.meteo);
  }

  async function calcola() {
    const mia = ++richiesta;
    controllo?.abort();
    controllo = new AbortController();
    evidenzia();
    const attivita = stato.leggi().attivita;
    const data = dataTra(scelte.giorno);
    const lista = candidati();
    if (!lista.length) {
      parchiMeteo.innerHTML = '';
      esito.innerHTML = '<p class="vuoto">Nessun percorso con traccia per questa scelta.</p>';
      return;
    }
    const punti = new Map();
    for (const p of lista) for (const x of [p.meteo.basso, p.meteo.alto].filter(Boolean)) punti.set(x.chiave, x);
    esito.innerHTML = '<p class="tenue">Scarico le previsioni…</p>';
    try {
      await scaricaPrevisioni([...punti.values()], { segnale: controllo.signal });
    } catch (e) {
      if (mia !== richiesta || e.name === 'AbortError') return;
      esito.innerHTML = `<p class="stato-dati stato-assente">Previsioni non disponibili ora${navigator.onLine === false ? ' (sei offline)' : ''}. <button type="button" class="link" data-azione="riprova">Riprova</button></p>`;
      return;
    }
    if (mia !== richiesta) return;

    const ora = new Date();
    const dopoMin = scelte.giorno === 0 ? ora.getHours() * 60 + ora.getMinutes() + 60 : 0; // oggi: almeno un'ora per arrivare
    const mese = Number(data.slice(5, 7));
    const voci = [];
    for (const p of lista) {
      const basso = memoria.get(p.meteo.basso.chiave)?.giorni[data];
      const alto = p.meteo.alto ? memoria.get(p.meteo.alto.chiave)?.giorni[data] : null;
      const giudizio = giudicaGiornata({ basso, alto, durataMin: p.meteo.durataMin, percorso: p.meteo.percorso, soglie, attivita, dopoMin });
      if (!giudizio || !nellaDurata(giudizio.durataPrevista, scelte.durata)) continue;
      voci.push({ ...p, giudizio, panorama: p.meteo.percorso.panorama, animali: animaliDelMese(p.sentiero.faunaInat, mese) });
    }

    // riga dei parchi: com'è la giornata in ciascuno
    const perParco = PARCHI.map((parco) => ({
      parco,
      r: riassuntoParco(voci.filter((v) => (v.sentiero.parchi ?? [v.sentiero.parco]).includes(parco.id)).map((v) => v.giudizio)),
    })).filter((x) => x.r);
    parchiMeteo.innerHTML = perParco.length
      ? `<ul class="parchi-meteo">${perParco
          .map(
            ({ parco, r }) => `<li class="giudizio-${r.giudizio}"><button type="button" class="parco-meteo" data-parco="${scelte.parco === parco.id ? '' : parco.id}">
              <span class="simbolo">${GIUDIZI[r.giudizio].simbolo}</span><b>${escapeHtml(parco.nomeBreve)}</b>
              <span class="tenue piccolo">${r.conta.ok} favorevoli${r.motivo ? ` · ${r.motivi[r.motivo]} con ${escapeHtml(NOMI_FATTORI[r.motivo])}` : ''}</span></button></li>`,
          )
          .join('')}</ul>`
      : '';

    const ordinati = ordinaClassifica(voci);
    const buoni = ordinati.filter((v) => v.giudizio.giudizio !== 'sconsigliato');
    const sconsigliati = ordinati.length - buoni.length;
    const visibili = (ancheSconsigliati ? ordinati : buoni).slice(0, mostrati);
    const totale = ancheSconsigliati ? ordinati.length : buoni.length;
    esito.innerHTML = `
      <p class="conteggio">${buoni.length ? `<b>${buoni.length}</b> percorsi consigliati ${scelte.giorno ? 'domani' : 'oggi'}` : `Nessun percorso consigliato ${scelte.giorno ? 'domani' : 'oggi'}`}${
        sconsigliati ? ` · <button type="button" class="link" data-azione="sconsigliati">${ancheSconsigliati ? 'nascondi' : 'mostra anche'} i ${sconsigliati} sconsigliati</button>` : ''
      }</p>
      <ul class="lista classifica-meteo">${visibili.map(htmlVoce).join('')}</ul>
      ${totale > visibili.length ? `<button type="button" class="bottone mostra-altri" data-azione="altri">Mostra altri (${totale - visibili.length})</button>` : ''}`;
  }

  function htmlVoce(v) {
    const { sentiero: s, giudizio: g } = v;
    const problemi = g.fattori.filter((f) => f.livello !== 'info');
    const note = g.fattori.filter((f) => f.livello === 'info');
    const motivo = problemi.length ? problemi.map((f) => f.testo).join(' · ') : 'condizioni favorevoli';
    const parco = parcoDa(s.parco)?.nomeBreve ?? '';
    const cod = codici(s);
    return `<li class="voce-meteo giudizio-${g.giudizio}">
      <a href="#/sentiero/${encodeURIComponent(s.id)}">
        <span class="simbolo" title="${GIUDIZI[g.giudizio].nome}">${GIUDIZI[g.giudizio].simbolo}</span>
        <span class="corpo">
          <span class="nome">${cod ? `<span class="codice">${escapeHtml(cod)}</span> ` : ''}${escapeHtml(s.nome)}</span>
          <span class="motivo">${escapeHtml(motivo)}</span>
          <span class="dati tenue piccolo">${escapeHtml(parco)} · circa ${testoDurata(g.durataPrevista)} con le soste${
            !g.partenza
              ? ''
              : (g.partenza.da === g.partenza.entro ? ` · parti alle ${g.partenza.da}` : ` · parti tra le ${g.partenza.da} e le ${g.partenza.entro}`) +
                (g.partenza.poi ? ` (più tardi: ${escapeHtml(g.partenza.poi)})` : '')
          }${note.length ? ` · ${escapeHtml(note.map((f) => f.testo).join(' · '))}` : ''}</span>
          ${v.animali.length ? `<span class="chip-animali">${v.animali.slice(0, 3).map((a) => `<span class="chip">${escapeHtml(ANIMALI[a] ?? a)}</span>`).join('')}</span>` : ''}
        </span>
      </a>
    </li>`;
  }

  app.addEventListener('click', (e) => {
    const t = e.target.closest('[data-giorno],[data-durata],[data-parco],[data-azione]');
    if (!t) return;
    if (t.dataset.giorno != null) scelte = { ...scelte, giorno: Number(t.dataset.giorno) };
    else if (t.dataset.durata != null) scelte = { ...scelte, durata: t.dataset.durata };
    else if (t.dataset.parco != null) scelte = { ...scelte, parco: t.dataset.parco };
    else if (t.dataset.azione === 'altri') mostrati += PAGINA;
    else if (t.dataset.azione === 'sconsigliati') ancheSconsigliati = !ancheSconsigliati;
    else if (t.dataset.azione === 'soglie-base') {
      soglie = { ...SOGLIE_PREDEFINITE };
      scrivi(CHIAVE_SOGLIE, soglie);
      for (const sel of app.querySelectorAll('.preferenze-meteo select')) sel.value = String(soglie[sel.name]);
    } else if (t.dataset.azione !== 'riprova') return;
    if (t.dataset.giorno != null || t.dataset.durata != null || t.dataset.parco != null) mostrati = PAGINA;
    scrivi(CHIAVE_SCELTE, scelte);
    calcola();
  });
  app.querySelector('.preferenze-meteo').addEventListener('change', (e) => {
    const v = e.target.value;
    soglie = { ...soglie, [e.target.name]: Number.isFinite(Number(v)) ? Number(v) : v };
    scrivi(CHIAVE_SOGLIE, soglie);
    calcola();
  });

  const scollegaAttivita = collegaSelettoreAttivita(app);
  let attivitaPrima = stato.leggi().attivita;
  const scollegaStato = stato.ascolta((s) => {
    if (s.attivita === attivitaPrima) return;
    attivitaPrima = s.attivita;
    mostrati = PAGINA;
    calcola();
  });
  calcola();
  return () => {
    richiesta++;
    controllo?.abort();
    scollegaAttivita();
    scollegaStato();
  };
}
