// "Dove vado domani?": scegli il giorno (oggi o domani) e l'app ordina i percorsi in base alle
// previsioni di Open-Meteo alla partenza e in quota, alla durata e alle tue preferenze.
// A Open-Meteo vanno solo coordinate e quote dei sentieri. Preferenze e scelte restano sul telefono.
import { tuttiISentieri, tutteLeTracce } from '../db.js';
import { PARCHI, parcoDa } from '../datiParchi.js';
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
  giornoAllaQuota,
} from '../lib/condizioni.js';
import { stato } from '../stato.js';
import { htmlSelettoreAttivita, collegaSelettoreAttivita } from './attivita.js';
import { caricaPunti } from './puntiUtili.js';
import { ICONE } from './icone.js';
import { htmlFaunaBreve } from './faunaBreve.js';
import { puntiLungoIlPercorso, perLaNotte, conAcqua, riassuntoPunti, TIPI_PUNTO, RAGGIO_LUNGO_IL_PERCORSO_M } from '../lib/puntiUtili.js';

// giudizio: cerchio pieno colorato con il segno dentro
const giudizio = (colore, d) => `<svg class="icona-giudizio" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="${colore}"/><path d="${d}" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICONE_GIUDIZIO = {
  ok: giudizio('#3f8f4f', 'm7 12.5 3.2 3.2L17 9'),
  attenzione: giudizio('#c98a1b', 'M12 7v6M12 16.5v.5'),
  sconsigliato: giudizio('#b5473a', 'M8 8l8 8M16 8l-8 8'),
};

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

// previsioni già scaricate: chiave della cella → { giorni, quando }. Restano anche sul dispositivo
// per un'ora, così riaprire la pagina non le scarica di nuovo (Open-Meteo è gratuito: con calma)
const CHIAVE_PREVISIONI = 'orme.previsioni';
const memoria = new Map();
try {
  const salvate = JSON.parse(localStorage.getItem(CHIAVE_PREVISIONI) ?? '{}');
  for (const [k, v] of Object.entries(salvate)) if (v.quando > Date.now() - VALIDITA_MS) memoria.set(k, v);
} catch {
  // niente memoria del dispositivo: si scaricano ogni volta
}
function salvaPrevisioni() {
  const recenti = Object.fromEntries([...memoria].filter(([, v]) => v.quando > Date.now() - VALIDITA_MS));
  try {
    localStorage.setItem(CHIAVE_PREVISIONI, JSON.stringify(recenti));
  } catch {
    // spazio esaurito: restano solo in questa sessione
  }
}
async function scaricaPrevisioni(punti, { segnale } = {}) {
  const adesso = Date.now();
  const mancanti = punti.filter((p) => !(memoria.get(p.chiave)?.quando > adesso - VALIDITA_MS));
  for (const { url, punti: gruppo } of urlPrevisioni(mancanti)) {
    const r = await fetch(url, { signal: segnale });
    if (r.status === 429) throw new Error('troppe richieste a Open-Meteo, riprova tra un minuto');
    if (!r.ok) throw new Error(`Open-Meteo ha risposto ${r.status}`);
    const json = await r.json();
    const risposte = Array.isArray(json) ? json : [json];
    gruppo.forEach((p, i) => memoria.set(p.chiave, { giorni: giorniDaRisposta(risposte[i]), quando: adesso }));
  }
  if (mancanti.length) salvaPrevisioni();
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
  let scelte = leggi(CHIAVE_SCELTE, { giorno: 1, durata: '', parco: '', notte: false, acqua: false });
  let soglie = leggi(CHIAVE_SOGLIE, SOGLIE_PREDEFINITE);
  let mostrati = PAGINA;
  let ancheSconsigliati = false;
  let richiesta = 0;
  let controllo = null;

  app.innerHTML = `
    <div class="pagina-meteo">
      <a class="indietro" href="#/pianifica">‹ Pianifica</a>
      <h1 class="titolo-pagina">Dove vado ${scelte.giorno ? 'domani' : 'oggi'}?</h1>
      <section class="pannello-scelte" aria-label="Scelte">
        <div class="scelte-riga">
          <div class="segmenti scelta-giorno" role="radiogroup" aria-label="Giorno">
            <button type="button" role="radio" class="segmento" data-giorno="0">Oggi</button>
            <button type="button" role="radio" class="segmento" data-giorno="1">Domani</button>
          </div>
          ${htmlSelettoreAttivita({ titolo: false })}
        </div>
        <div class="scelta">
          <span class="scelta-nome">${ICONE.orologio}Durata</span>
          <div class="pillole" role="group" aria-label="Durata">
            <button type="button" class="pillola" data-durata="">Qualsiasi</button>
            ${Object.entries(DURATE).map(([k, d]) => `<button type="button" class="pillola" data-durata="${k}">${d.nome}</button>`).join('')}
          </div>
        </div>
        <div class="scelta">
          <span class="scelta-nome">${ICONE.parco}Parco</span>
          <div class="pillole" role="group" aria-label="Parco">
            <button type="button" class="pillola" data-parco="">Tutti</button>
            ${PARCHI.map((p) => `<button type="button" class="pillola" data-parco="${p.id}">${escapeHtml(p.nomeBreve)}</button>`).join('')}
          </div>
        </div>
        <div class="scelta">
          <span class="scelta-nome">${ICONE.segnaposto}Lungo il percorso</span>
          <div class="pillole" role="group" aria-label="Lungo il percorso">
            <button type="button" class="pillola" data-filtro="notte" aria-pressed="false">${ICONE.casa}Rifugio o bivacco per la notte</button>
            <button type="button" class="pillola" data-filtro="acqua" aria-pressed="false">${ICONE.goccia}Acqua</button>
          </div>
        </div>
      </section>
      <div id="parchiMeteo"></div>
      <div id="esito" aria-live="polite"></div>
      ${htmlPreferenze(soglie)}
      <p class="tenue piccolo fonte-meteo">Previsioni <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> (CC BY 4.0), alla quota di partenza e del punto più alto.
        Rifugi, bivacchi e acqua da OpenStreetMap, entro ${RAGGIO_LUNGO_IL_PERCORSO_M} m dalla traccia: verifica sul posto.
        È una valutazione delle previsioni, non una garanzia di sicurezza: controlla il meteo prima di partire e i bollettini valanghe d'inverno.</p>
    </div>
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
    for (const b of app.querySelectorAll('[data-filtro]')) {
      const attivo = Boolean(scelte[b.dataset.filtro]);
      b.classList.toggle('attiva', attivo);
      b.setAttribute('aria-pressed', String(attivo));
    }
  }

  // rifugi e acqua vicino a ogni traccia (calcolati una volta per percorso)
  let puntiUtili = null;
  const vicini = new Map();
  function puntiVicini(p) {
    if (!puntiUtili || !p.traccia?.geojson) return [];
    if (!vicini.has(p.sentiero.id)) vicini.set(p.sentiero.id, puntiLungoIlPercorso(puntiUtili, p.traccia.geojson));
    return vicini.get(p.sentiero.id);
  }

  function candidati() {
    const attivita = stato.leggi().attivita;
    return filtraPercorsi(preparati, { ...FILTRI_VUOTI }, attivita)
      .filter((p) => p.sentiero.tipoPercorso !== 'uscita_guidata') // le uscite guidate hanno le loro date
      .filter((p) => !scelte.parco || (p.sentiero.parchi ?? [p.sentiero.parco]).includes(scelte.parco))
      .map((p) => ({ ...p, vicini: puntiVicini(p) }))
      .filter((p) => (!scelte.notte || p.vicini.some(perLaNotte)) && (!scelte.acqua || p.vicini.some(conAcqua)))
      .map((p) => ({ ...p, meteo: datiPerMeteo(p, attivita, quoteDellaTraccia(p.sentiero, p.traccia)) }))
      .filter((p) => p.meteo);
  }

  async function calcola() {
    const mia = ++richiesta;
    controllo?.abort();
    controllo = new AbortController();
    evidenzia();
    if ((scelte.notte || scelte.acqua) && !puntiUtili) {
      puntiUtili = await caricaPunti();
      if (mia !== richiesta) return;
      if (!puntiUtili) {
        parchiMeteo.innerHTML = '';
        esito.innerHTML = '<p class="stato-dati stato-assente">Dati su rifugi e acqua non raggiungibili ora: togli il filtro "Lungo il percorso" o riprova.</p>';
        return;
      }
    }
    const attivita = stato.leggi().attivita;
    const data = dataTra(scelte.giorno);
    const lista = candidati();
    if (!lista.length) {
      parchiMeteo.innerHTML = '';
      esito.innerHTML = `<p class="vuoto">Nessun percorso con traccia per questa scelta${scelte.notte || scelte.acqua ? ': prova a togliere un filtro "Lungo il percorso"' : ''}.</p>`;
      return;
    }
    const punti = new Map();
    for (const p of lista) for (const x of [p.meteo.basso, p.meteo.alto].filter(Boolean)) punti.set(x.chiave, x);
    esito.innerHTML = '<p class="tenue">Scarico le previsioni…</p>';
    try {
      await scaricaPrevisioni([...punti.values()], { segnale: controllo.signal });
    } catch (e) {
      if (mia !== richiesta || e.name === 'AbortError') return;
      esito.innerHTML = `<p class="stato-dati stato-assente">Previsioni non disponibili ora (${navigator.onLine === false ? 'sei offline' : escapeHtml(e.message)}). <button type="button" class="link" data-azione="riprova">Riprova</button></p>`;
      return;
    }
    if (mia !== richiesta) return;
    // i punti servono anche senza filtri, per mostrare rifugi e acqua nelle schede
    if (!puntiUtili) {
      puntiUtili = await caricaPunti();
      if (mia !== richiesta) return;
      if (puntiUtili) for (const p of lista) p.vicini = puntiVicini(p);
    }

    const ora = new Date();
    const dopoMin = scelte.giorno === 0 ? ora.getHours() * 60 + ora.getMinutes() + 60 : 0; // oggi: almeno un'ora per arrivare
    const mese = Number(data.slice(5, 7));
    const voci = [];
    for (const p of lista) {
      const basso = giornoAllaQuota(memoria.get(p.meteo.basso.chiave)?.giorni[data], p.meteo.basso.quota);
      const alto = p.meteo.alto ? giornoAllaQuota(memoria.get(p.meteo.alto.chiave)?.giorni[data], p.meteo.alto.quota) : null;
      const giudizio = giudicaGiornata({ basso, alto, durataMin: p.meteo.durataMin, percorso: p.meteo.percorso, soglie, attivita, dopoMin });
      if (!giudizio || !nellaDurata(giudizio.durataPrevista, scelte.durata)) continue;
      voci.push({ ...p, giudizio, panorama: p.meteo.percorso.panorama, mese });
    }

    // com'è la giornata in ciascun parco (solo quando non se ne è scelto uno)
    const perParco = scelte.parco
      ? []
      : PARCHI.map((parco) => ({
          parco,
          r: riassuntoParco(voci.filter((v) => v.sentiero.parco === parco.id).map((v) => v.giudizio)),
        })).filter((x) => x.r);
    parchiMeteo.innerHTML = perParco.length
      ? `<ul class="parchi-meteo">${perParco
          .map(
            ({ parco, r }) => `<li class="giudizio-${r.giudizio}"><button type="button" class="parco-meteo" data-parco="${parco.id}">
              <span class="simbolo">${ICONE_GIUDIZIO[r.giudizio]}</span>
              <span class="parco-nome">${escapeHtml(parco.nomeBreve)}</span>
              <span class="parco-dati">${r.conta.ok} favorevoli${r.motivo ? ` · ${r.motivi[r.motivo]} con ${escapeHtml(NOMI_FATTORI[r.motivo])}` : ''}</span></button></li>`,
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
      <ul class="classifica-meteo">${visibili.map(htmlVoce).join('')}</ul>
      ${totale > visibili.length ? `<button type="button" class="bottone mostra-altri" data-azione="altri">Mostra altri (${totale - visibili.length})</button>` : ''}`;
  }

  const riga = (icona, html, classe = '') => `<span class="riga-meteo ${classe}">${icona}<span>${html}</span></span>`;

  function htmlVoce(v) {
    const { sentiero: s, giudizio: g } = v;
    const problemi = g.fattori.filter((f) => f.livello !== 'info');
    const note = g.fattori.filter((f) => f.livello === 'info');
    const parco = parcoDa(s.parco)?.nomeBreve ?? '';
    const cod = codici(s);
    const notte = (v.vicini ?? []).filter(perLaNotte);
    const acqua = (v.vicini ?? []).filter(conAcqua);
    const partenza = !g.partenza
      ? ''
      : `${g.partenza.da === g.partenza.entro ? `Parti alle <b>${g.partenza.da}</b>` : `Parti tra le <b>${g.partenza.da}</b> e le <b>${g.partenza.entro}</b>`}${
          g.partenza.poi ? `<span class="tenue"> · più tardi: ${escapeHtml(g.partenza.poi)}</span>` : ''
        }`;
    return `<li class="voce-meteo giudizio-${g.giudizio}">
      <a href="#/sentiero/${encodeURIComponent(s.id)}">
        <span class="voce-testa">
          <span class="simbolo" title="${GIUDIZI[g.giudizio].nome}">${ICONE_GIUDIZIO[g.giudizio]}</span>
          <span class="nome">${cod ? `<span class="codice">${escapeHtml(cod)}</span> ` : ''}${escapeHtml(s.nome)}</span>
        </span>
        <span class="voce-corpo">
          ${riga(problemi.length ? ICONE.avviso : ICONE.ok, escapeHtml(problemi.length ? problemi.map((f) => f.testo).join(' · ') : 'Condizioni favorevoli'), 'motivo')}
          ${riga(ICONE.orologio, `circa <b>${testoDurata(g.durataPrevista)}</b> con le soste · ${escapeHtml(parco)}`)}
          ${partenza ? riga(ICONE.bandierina, partenza) : ''}
          ${note.length ? riga(ICONE.nuvola, escapeHtml(note.map((f) => f.testo).join(' · '))) : ''}
          ${notte.length ? riga(ICONE.casa, escapeHtml(notte.slice(0, 2).map((p) => `${p.nome ?? TIPI_PUNTO[p.tipo].nome}${p.distanzaM >= 30 ? ` (${p.distanzaM} m)` : ''}`).join(', ')), 'rifugi') : ''}
          ${acqua.length ? riga(ICONE.goccia, escapeHtml(riassuntoPunti(acqua)), 'acqua') : ''}
          ${htmlFaunaBreve(s, { mese: v.mese, riga: true })}
        </span>
      </a>
    </li>`;
  }

  app.addEventListener('click', (e) => {
    const t = e.target.closest('[data-giorno],[data-durata],[data-parco],[data-filtro],[data-azione]');
    if (!t) return;
    if (t.dataset.giorno != null) scelte = { ...scelte, giorno: Number(t.dataset.giorno) };
    else if (t.dataset.durata != null) scelte = { ...scelte, durata: t.dataset.durata };
    else if (t.dataset.parco != null) scelte = { ...scelte, parco: t.dataset.parco };
    else if (t.dataset.filtro) scelte = { ...scelte, [t.dataset.filtro]: !scelte[t.dataset.filtro] };
    else if (t.dataset.azione === 'altri') mostrati += PAGINA;
    else if (t.dataset.azione === 'sconsigliati') ancheSconsigliati = !ancheSconsigliati;
    else if (t.dataset.azione === 'soglie-base') {
      soglie = { ...SOGLIE_PREDEFINITE };
      scrivi(CHIAVE_SOGLIE, soglie);
      for (const sel of app.querySelectorAll('.preferenze-meteo select')) sel.value = String(soglie[sel.name]);
    } else if (t.dataset.azione !== 'riprova') return;
    if (t.dataset.giorno != null || t.dataset.durata != null || t.dataset.parco != null || t.dataset.filtro) mostrati = PAGINA;
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
