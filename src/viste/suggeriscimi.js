// "Suggeriscimi" (pagina iniziale): una sola schermata con tutte le scelte, già impostate e ricordate
// sul telefono (src/lib/suggerimenti.js); "Suggerisci" mostra 3 proposte sulla mappa, ognuna con la riga
// del perché, il meteo del giorno scelto e l'auto stimata. "Altre 3" scorre la classifica.
import L from 'leaflet';
import { stato } from '../stato.js';
import { preparaPercorsi, filtraPercorsi } from '../lib/motore.js';
import { eUscita, FILTRI_VUOTI } from '../lib/filtri.js';
import { quoteDellaTraccia } from '../lib/riassunto.js';
import { percorsoSentiero } from '../lib/tracce.js';
import { possibilitaFauna } from '../lib/faunaPercorso.js';
import { puntiLungoIlPercorso, conAcqua, perLaNotte } from '../lib/puntiUtili.js';
import { profiloTempi, finiGiornata, rifugiPerLaNotte, lunghezzaDeiPezzi } from '../lib/lungoIlPercorso.js';
import { baseAndata, misureAR, misureScelte, eAnelloPezzi, pezziScelti, fineSullAndata } from '../lib/andataRitorno.js';
import { sentieriDelleUscite } from '../lib/collegamenti.js';
import { datiPerMeteo, giornoAllaQuota, giudicaGiornata, SOGLIE_PREDEFINITE } from '../lib/condizioni.js';
import { puntoDiPartenza } from '../lib/navigazione.js';
import {
  SCELTE_PREDEFINITE,
  QUANDO,
  TEMPI,
  COSE,
  FATICHE,
  DISTANZE,
  dataDelQuando,
  stimaAuto,
  testoAuto,
  valuta,
  ordinaProposte,
  testoPerche,
} from '../lib/suggerimenti.js';
import { escapeHtml, codici } from '../lib/formato.js';
import { PARCHI, parcoDa } from '../datiParchi.js';
import { caricaPunti } from './puntiUtili.js';
import { scaricaPrevisioni, previsioneDi } from './previsioni.js';
import { modoScelto } from './andataRitorno.js';
import { tendinaTrascinabile } from './tendina.js';

const CHIAVE = 'orme.suggerisci';
const PER_VOLTA = 3;
const METEO_PER_VOLTA = 12; // previsioni per i primi della classifica (poi per i successivi, se servono)
const COLORI_PROPOSTE = ['#e8590c', '#1971c2', '#2b8a3e'];

function scelteRicordate() {
  try {
    return { ...SCELTE_PREDEFINITE, ...JSON.parse(localStorage.getItem(CHIAVE) ?? '{}') };
  } catch {
    return { ...SCELTE_PREDEFINITE };
  }
}
function ricorda(scelte) {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(scelte));
  } catch {
    // senza memoria del browser le scelte valgono solo ora
  }
}
const oggiItalia = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

// gruppo di scelte a pillole: una sola (radio) o più (cerco)
function htmlGruppo(nome, voci, scelto, multipla = false) {
  return `<div class="gruppo-scelte" role="${multipla ? 'group' : 'radiogroup'}" aria-label="${nome}">${Object.entries(voci)
    .map(([k, t]) => {
      const on = multipla ? scelto.includes(k) : String(scelto) === k;
      return `<button type="button" class="chip-scorciatoia ${on ? 'attiva' : ''}" role="${multipla ? 'checkbox' : 'radio'}" aria-checked="${on}" data-scelta="${nome}" data-valore="${k}">${escapeHtml(t)}</button>`;
    })
    .join('')}</div>`;
}

// mappa: la mappa della home; sentieri e tracce: tutti quelli sul telefono;
// posizione(): [lon, lat] mia (o null); allApertura(): chi apre questa tendina chiude le altre
export function creaSuggeriscimi(contenitore, mappa, { sentieri, tracce, posizione = () => null, allApertura = () => {} }) {
  let scelte = scelteRicordate();
  const foglio = document.createElement('section');
  foglio.className = 'foglio-suggerisci';
  foglio.hidden = true;
  foglio.setAttribute('aria-label', 'Suggeriscimi');
  contenitore.appendChild(foglio);
  const tendina = tendinaTrascinabile(foglio, { corpo: '.suggerisci-corpo', naturale: true, allaChiusura: () => chiudi() });
  // le proposte sopra le altre tracce, ben visibili
  if (!mappa.getPane('proposte')) {
    mappa.createPane('proposte');
    mappa.getPane('proposte').style.zIndex = 420;
    mappa.getPane('proposte').style.pointerEvents = 'none';
  }
  const tela = L.canvas({ pane: 'proposte' });
  const disegnate = L.layerGroup().addTo(mappa);

  let classifica = [];
  let mostrate = 0;
  let richiesta = 0;

  function htmlScelte() {
    return `
      <h3>Quando</h3>${htmlGruppo('quando', QUANDO, scelte.quando)}
      <h3>Quanto tempo</h3>${htmlGruppo('tempo', TEMPI, scelte.tempo)}
      <h3>Cosa cerchi</h3>${htmlGruppo('cerco', COSE, scelte.cerco, true)}
      <h3>Fatica</h3>${htmlGruppo('fatica', FATICHE, scelte.fatica)}
      <h3>Quanto lontano</h3>${htmlGruppo('distanza', DISTANZE, scelte.distanza)}
      ${
        scelte.distanza === 'parco'
          ? `<select class="scelta-parco" aria-label="Parco"><option value="">Scegli il parco…</option>${PARCHI.filter((p) => !p.zona)
              .map((p) => `<option value="${p.id}" ${p.id === scelte.parco ? 'selected' : ''}>${escapeHtml(p.nome)}</option>`)
              .join('')}</select>`
          : ''
      }`;
  }
  // riepilogo delle scelte in una riga, quando ci sono le proposte ("Cambia" riapre le scelte)
  function testoScelte() {
    const cerco = scelte.cerco.map((c) => COSE[c].toLowerCase());
    const lontano = scelte.distanza === 'parco' ? parcoDa(scelte.parco)?.nomeBreve ?? 'un parco' : `entro ${DISTANZE[scelte.distanza]}`;
    return [QUANDO[scelte.quando], TEMPI[scelte.tempo].toLowerCase(), FATICHE[scelte.fatica].toLowerCase(), lontano, ...cerco].join(' · ');
  }
  function disegnaForm() {
    foglio.innerHTML = `
      <button type="button" class="foglio-maniglia-zona" aria-label="Trascina per aprire, abbassare o chiudere"><span class="foglio-maniglia"></span></button>
      <div class="suggerisci-corpo">
        <div class="suggerisci-riepilogo" hidden><span></span><button type="button" class="bottone testo" data-azione="cambia">Cambia</button></div>
        <div class="suggerisci-form">
          <div class="suggerisci-scelte">${htmlScelte()}</div>
          <button type="button" class="bottone primario pieno-largo" data-azione="suggerisci">Suggerisci</button>
        </div>
        <div class="suggerisci-risultati" aria-live="polite"></div>
      </div>`;
  }
  // con le proposte: scelte in una riga sopra; "Cambia" le riapre
  function soloRisultati(si) {
    foglio.querySelector('.suggerisci-form').hidden = si;
    const r = foglio.querySelector('.suggerisci-riepilogo');
    r.hidden = !si;
    r.querySelector('span').textContent = testoScelte();
  }

  // --- i candidati: misure scelte (A/R), fauna nel periodo, acqua, rifugio per la notte, uscite ---
  let puntiUtili = null;
  function candidati(data) {
    const mese = Number(data.slice(5, 7));
    const modo = modoScelto();
    const da = posizione() ?? (() => {
      const c = mappa.getCenter();
      return [c.lng, c.lat];
    })();
    // sentieri usati dalle uscite delle associazioni
    const usciteDi = new Map();
    // (anche le uscite con una traccia propria: il loro percorso è quello)
    for (const v of sentieriDelleUscite(sentieri.filter(eUscita), tracce)) {
      usciteDi.set(v.sentiero ?? v.chiave, v.uscite.map((u) => u.escursione?.nomeUscita || u.nome));
    }
    // compatibili con l'attività scelta (a piedi niente itinerari MTB), come negli altri elenchi
    return filtraPercorsi(preparaPercorsi(sentieri, tracce), { ...FILTRI_VUOTI }, stato.leggi().attivita)
      .filter((p) => p.traccia?.geojson && !['uscita_guidata', 'rete_sentieri'].includes(p.sentiero.tipoPercorso))
      .filter((p) => scelte.distanza !== 'parco' || !scelte.parco || (p.sentiero.parchi ?? [p.sentiero.parco]).includes(scelte.parco))
      .map((p) => {
        const s = p.sentiero;
        const pezzi = percorsoSentiero(p.traccia.geojson).pezzi;
        const quote = quoteDellaTraccia(s, p.traccia);
        const anello = eAnelloPezzi(pezzi);
        const base = baseAndata(pezzi, quote);
        // le misure della scelta (Solo andata / A/R), come nella scheda
        const misure = base
          ? misureScelte(misureAR(base, { anello }), modo)
          : (() => {
              const k = modo === 'ar' && !anello ? 2 : 1;
              return { km: p.misure.km * k, salita: p.misure.salita != null ? p.misure.salita * k : null, durataMin: p.misure.durataMin != null ? p.misure.durataMin * k : null };
            })();
        const partenza = puntoDiPartenza(s, p.traccia);
        const vicini = puntiUtili ? puntiLungoIlPercorso(puntiUtili, p.traccia.geojson) : [];
        return {
          ...p,
          pezzi,
          quote,
          misure,
          anello,
          difficolta: s.difficolta,
          fauna: possibilitaFauna(s, mese, { stagione: true }),
          panorama: s.panorama?.punteggio ?? null,
          bosco: s.panorama?.boscoPercento ?? null,
          apertura: s.panorama?.criteri?.apertura ?? null,
          quotaMax: quote?.max ?? null,
          acqua: vicini.filter(conAcqua).length,
          vicini,
          uscite: usciteDi.get(s.id) ?? [],
          auto: partenza ? stimaAuto(da, [partenza.lon, partenza.lat]) : null,
          rifugioNotte: null,
        };
      });
  }

  // "2 giorni con notte": come "Su più giorni", la prima giornata finisce a metà del cammino e lì
  // (entro 1 km dalla traccia) ci deve essere un rifugio o un bivacco
  function rifugioPerLaNotte(c) {
    if (!puntiUtili) return null;
    const serie = profiloTempi(pezziScelti(c.pezzi, modoScelto(), c.anello));
    const totale = serie.min.at(-1) ?? 0;
    const [fine] = finiGiornata(serie, totale / 2 / 60);
    if (!fine) return null;
    // con A/R la giornata può finire sul ritorno: si cerca nel punto equivalente dell'andata
    const [r] = rifugiPerLaNotte(puntiUtili, c.pezzi, fineSullAndata(fine, lunghezzaDeiPezzi(c.pezzi)), { perLaNotte });
    return r ? r.nome || 'un rifugio' : null;
  }

  // meteo del giorno scelto per un gruppo di proposte (giudizio come in "Dove vado domani")
  async function conMeteo(voci, data, mia) {
    const attivita = stato.leggi().attivita;
    const giorni = Math.max(2, Math.round((new Date(data) - new Date(oggiItalia())) / 86_400_000) + 1);
    const dati = voci.map((v) => ({ v, m: datiPerMeteo({ sentiero: v.sentiero, traccia: v.traccia, misure: v.misure }, attivita, v.quote) }));
    const celle = new Map();
    for (const { m } of dati) for (const x of [m?.basso, m?.alto].filter(Boolean)) celle.set(x.chiave, x);
    try {
      await scaricaPrevisioni([...celle.values()], { giorni });
    } catch {
      return; // senza meteo le proposte restano nell'ordine delle scelte
    }
    if (mia !== richiesta) return;
    const ora = new Date();
    const dopoMin = data === oggiItalia() ? ora.getHours() * 60 + ora.getMinutes() + 60 : 0;
    for (const { v, m } of dati) {
      if (!m) continue;
      const basso = giornoAllaQuota(previsioneDi(m.basso.chiave, data), m.basso.quota);
      const alto = m.alto ? giornoAllaQuota(previsioneDi(m.alto.chiave, data), m.alto.quota) : null;
      // su due giorni si giudica la prima giornata (metà del cammino)
      const durataMin = (v.misure.durataMin ?? m.durataMin) / (scelte.tempo === 'due' ? 2 : 1);
      v.giudizio = basso ? giudicaGiornata({ basso, alto, durataMin, percorso: m.percorso, soglie: SOGLIE_PREDEFINITE, attivita, dopoMin }) : null;
    }
  }

  async function suggerisci() {
    const mia = ++richiesta;
    const risultati = foglio.querySelector('.suggerisci-risultati');
    risultati.innerHTML = '<p class="tenue">Cerco tra i percorsi…</p>';
    puntiUtili ??= await caricaPunti();
    if (mia !== richiesta) return;
    const data = dataDelQuando(scelte.quando, oggiItalia());
    const lista = [];
    for (const c of candidati(data)) {
      if (scelte.tempo === 'due') c.rifugioNotte = rifugioPerLaNotte(c);
      const valutazione = valuta(c, scelte);
      if (valutazione) lista.push({ ...c, valutazione });
    }
    lista.sort((a, b) => b.valutazione.punteggio - a.valutazione.punteggio);
    if (!lista.length) {
      classifica = [];
      disegnate.clearLayers();
      risultati.innerHTML = '<p class="vuoto">Nessun percorso per queste scelte: prova a cambiare tempo, fatica o distanza.</p>';
      return;
    }
    risultati.innerHTML = '<p class="tenue">Guardo il meteo…</p>';
    // il meteo riordina i primi della classifica
    const primi = lista.slice(0, METEO_PER_VOLTA);
    await conMeteo(primi, data, mia);
    if (mia !== richiesta) return;
    classifica = [...ordinaProposte(primi), ...lista.slice(METEO_PER_VOLTA)];
    mostrate = 0;
    mostraAltre(data);
  }

  const NOMI_GIORNO = { ok: 'Meteo favorevole', attenzione: 'Attenzione', sconsigliato: 'Sconsigliato' };
  function htmlProposta(v, i, data) {
    const s = v.sentiero;
    const g = v.giudizio;
    const giorno = scelte.quando === 'oggi' ? 'oggi' : scelte.quando === 'domani' ? 'domani' : QUANDO[scelte.quando].toLowerCase();
    const meteo = g
      ? `<span class="meteo-proposta meteo-${g.giudizio}">${escapeHtml(`${giorno}: ${g.fattori?.[0]?.testo ?? NOMI_GIORNO[g.giudizio].toLowerCase()}`)}${g.partenza?.entro ? escapeHtml(` · parti entro le ${g.partenza.entro}`) : ''}</span>`
      : '';
    return `<li class="proposta">
      <button type="button" class="proposta-mappa" data-proposta="${i}" aria-label="Mostra sulla mappa"><span class="numero-proposta" style="background:${COLORI_PROPOSTE[i % 3]}">${i + 1}</span></button>
      <div class="proposta-corpo">
        <a class="nome" href="#/sentiero/${encodeURIComponent(s.id)}">${s.codici?.length ? `<span class="codice">${escapeHtml(codici(s))}</span> ` : ''}${escapeHtml(s.nome)}</a>
        <span class="perche">${escapeHtml(testoPerche(v, { trovati: v.valutazione.trovati, modo: modoScelto() }))}</span>
        ${meteo}
        <span class="tenue piccolo">${escapeHtml([parcoDa(s.parco)?.nomeBreve, testoAuto(v.auto)].filter(Boolean).join(' · '))}${posizione() ? '' : ' dal centro della mappa'}</span>
      </div>
    </li>`;
  }

  async function mostraAltre(data = dataDelQuando(scelte.quando, oggiItalia())) {
    const risultati = foglio.querySelector('.suggerisci-risultati');
    let pagina = classifica.slice(mostrate, mostrate + PER_VOLTA);
    // oltre i primi: meteo anche per questi (con calma, solo quando servono)
    if (pagina.some((v) => v.giudizio === undefined) && mostrate >= METEO_PER_VOLTA - PER_VOLTA) {
      const mia = richiesta;
      const altri = classifica.slice(mostrate, mostrate + METEO_PER_VOLTA);
      await conMeteo(altri, data, mia);
      if (mia !== richiesta) return;
      const riordinati = ordinaProposte(altri);
      classifica.splice(mostrate, riordinati.length, ...riordinati);
      pagina = classifica.slice(mostrate, mostrate + PER_VOLTA);
    }
    if (!pagina.length) {
      mostrate = 0;
      return mostraAltre(data);
    }
    disegnate.clearLayers();
    soloRisultati(true);
    const limiti = L.latLngBounds([]);
    pagina.forEach((v, i) => {
      L.geoJSON(v.traccia.geojson, { renderer: tela, pane: 'proposte', style: { color: '#fff', weight: 10, opacity: 0.95 }, interactive: false }).addTo(disegnate);
      const linea = L.geoJSON(v.traccia.geojson, { renderer: tela, pane: 'proposte', style: { color: COLORI_PROPOSTE[i], weight: 6, opacity: 1 }, interactive: false }).addTo(disegnate);
      const p = puntoDiPartenza(v.sentiero, v.traccia);
      if (p) {
        L.marker([p.lat, p.lon], {
          icon: L.divIcon({ className: 'segno-proposta', html: `<span style="background:${COLORI_PROPOSTE[i]}">${i + 1}</span>`, iconSize: [26, 26] }),
          keyboard: false,
          interactive: false,
        }).addTo(disegnate);
      }
      limiti.extend(linea.getBounds());
    });
    const fine = mostrate + pagina.length;
    risultati.innerHTML = `
      <ol class="proposte">${pagina.map((v, i) => htmlProposta(v, i, data)).join('')}</ol>
      <div class="azioni-proposte">
        ${classifica.length > PER_VOLTA ? `<button type="button" class="bottone" data-azione="altre">Altre 3</button>` : ''}
        <span class="tenue piccolo">${mostrate + 1}–${fine} di ${classifica.length}</span>
      </div>`;
    risultati.dataset.pagina = String(mostrate);
    mostrate = fine >= classifica.length ? 0 : fine;
    paginaOra = pagina;
    // dopo i risultati la tendina scende a metà: si vedono mappa e proposte
    tendina.vai('meta');
    foglio.querySelector('.suggerisci-corpo').scrollTop = 0;
    if (limiti.isValid()) inquadra(limiti, 14);
  }
  // inquadra sopra la parte visibile della tendina
  function inquadra(limiti, maxZoom) {
    mappa.sbloccaInquadrature?.();
    const sotto = Math.max(70, tendina.visibile());
    mappa.fitBounds(limiti, { paddingTopLeft: [30, 80], paddingBottomRight: [30, sotto + 20], maxZoom });
  }
  let paginaOra = [];

  foglio.addEventListener('click', (e) => {
    const b = e.target.closest('[data-scelta]');
    if (b) {
      const { scelta, valore } = b.dataset;
      if (scelta === 'cerco') scelte.cerco = scelte.cerco.includes(valore) ? scelte.cerco.filter((x) => x !== valore) : [...scelte.cerco, valore];
      else scelte[scelta] = valore;
      ricorda(scelte);
      foglio.querySelector('.suggerisci-scelte').innerHTML = htmlScelte();
      return;
    }
    const azione = e.target.closest('[data-azione]')?.dataset.azione;
    if (azione === 'suggerisci') suggerisci();
    else if (azione === 'altre') mostraAltre();
    else if (azione === 'cambia') {
      soloRisultati(false);
      tendina.vai('aperta');
    }
    const n = e.target.closest('[data-proposta]')?.dataset.proposta;
    if (n != null && paginaOra[n]) inquadra(L.geoJSON(paginaOra[n].traccia.geojson).getBounds(), 15);
  });
  foglio.addEventListener('change', (e) => {
    if (!e.target.matches('.scelta-parco')) return;
    scelte.parco = e.target.value;
    ricorda(scelte);
  });

  function apri() {
    allApertura();
    disegnaForm();
    foglio.hidden = false;
    document.body.classList.add('suggerisci-aperto');
    tendina.apri('aperta');
  }
  function chiudi() {
    if (foglio.hidden) return;
    foglio.hidden = true;
    tendina.chiudi();
    richiesta++;
    disegnate.clearLayers();
    document.body.classList.remove('suggerisci-aperto');
  }
  mappa.on('unload', () => foglio.parentElement?.remove());
  return { apri, chiudi, aperto: () => !foglio.hidden };
}
