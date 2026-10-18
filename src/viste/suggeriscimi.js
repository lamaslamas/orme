// "Suggeriscimi" (pagina iniziale): una sola schermata con tutte le scelte, già impostate e ricordate
// sul telefono (src/lib/suggerimenti.js); "Suggerisci" mostra 3 proposte sulla mappa, ognuna con la riga
// del perché, il meteo del giorno scelto e l'auto stimata. "Altre 3" scorre la classifica.
// "Crea un anello": 3 giri nuovi dalla partenza, calcolati con BRouter (src/lib/anello.js); nei parchi
// solo sentieri segnati e senza accesso regolato, fuori anche i non segnati, evidenziati.
import L from 'leaflet';
import { stato } from '../stato.js';
import { preparaPercorsi, filtraPercorsi } from '../lib/motore.js';
import { eUscita, FILTRI_VUOTI } from '../lib/filtri.js';
import { quoteDellaTraccia } from '../lib/riassunto.js';
import { percorsoSentiero, tracciaDaNonUsare } from '../lib/tracce.js';
import { possibilitaFauna, puntiSpecie, GRUPPI_SPECIE, SPECIE_SCEGLIBILI } from '../lib/faunaPercorso.js';
import { ANIMALI } from '../lib/costanti.js';
import { linkCodice } from './codice.js';
import { urlOsservazioniGbif, interpretaGbif } from '../lib/gbif.js';
import { riquadroIntorno, zonaInquadrata } from '../lib/intorno.js';
import { specieDellaZonaPerOsservatori, puntiSpecieZona, PREFISSO_ZONA, urlNomeItaliano, nomeItalianoDaRisposta } from '../lib/specieZona.js';
import { puntiLungoIlPercorso, conAcqua, perLaNotte } from '../lib/puntiUtili.js';
import { profiloTempi, finiGiornata, rifugiPerLaNotte, lunghezzaDeiPezzi, riquadroDeiPezzi, percorsoCoperto } from '../lib/lungoIlPercorso.js';
import { baseAndata, misureAR, misureScelte, eAnelloPezzi, pezziScelti, fineSullAndata } from '../lib/andataRitorno.js';
import { sentieriDelleUscite } from '../lib/collegamenti.js';
import { datiPerMeteo, giornoAllaQuota, giudicaGiornata, SOGLIE_PREDEFINITE } from '../lib/condizioni.js';
import { puntoDiPartenza } from '../lib/navigazione.js';
import {
  SCELTE_PREDEFINITE,
  MODI_SUGGERISCI,
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
import { escapeHtml, codici, durata } from '../lib/formato.js';
import { PARCHI, parcoDa } from '../datiParchi.js';
import { caricaPunti } from './puntiUtili.js';
import { zoneCoperte } from './copertura.js';
import { scaricaPrevisioni, previsioneDi } from './previsioni.js';
import { modoScelto, oraPartenzaScelta, oraPartenzaTesto, ricordaOraPartenza } from './andataRitorno.js';
import { TESTO_TARDI, partenzaPassata } from '../lib/quandoAndare.js';
import { tendinaTrascinabile } from './tendina.js';
import { ICONE } from './icone.js';
import { calcolaPercorso, PREFERENZA_SEGNATI } from '../lib/brouter.js';
import { trattiARischio, ACCESSI_REGOLATI } from '../lib/avvisiParco.js';
import { distanzaKm } from '../lib/geo.js';
import { misureDeiPezzi, km1 } from '../lib/lungoIlPercorso.js';
import { leggiBozza, salvaBozza, impostaAperturaDisegno } from '../lib/bozza.js';
import {
  LUNGHEZZE,
  DIREZIONI,
  direzioniDelGiro,
  puntiDellAnello,
  puntoA,
  sovrapposizione,
  quotaSegnata,
  trattiNonSegnati,
  ammessoNeiParchi,
  vicinoAiSentieri,
  agganciaAlSentiero,
  senzaPunte,
  gambo,
  valutaAnello,
  scegliAnelli,
  correzioneLunghezza,
  prossimiAnelli,
  quotaComune,
  MAX_SCARTO_LUNGHEZZA,
  MAX_GAMBO,
  testoQuotaSegnata,
} from '../lib/anello.js';
import { preparaAvvisi } from './avvisiParco.js';
import { quoteDeiPezzi } from './quote.js';
import { puntiDelRobot } from './puntiRobot.js';
import { reteDeiSentieri, giriDallaPartenza, lineaDelGiro, sentieriDelGiro, nodiVicini, puntiLungo } from '../lib/reteSentieri.js';

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
// le scelte di "Quale animale": qualsiasi, i gruppi, poi le singole specie
const VOCI_SPECIE = { '': 'Qualsiasi', ...Object.fromEntries(Object.entries(GRUPPI_SPECIE).map(([k, g]) => [k, g.nome])), ...Object.fromEntries(SPECIE_SCEGLIBILI.map((a) => [a, ANIMALI[a] ?? a])) };
// nomi italiani delle specie della zona, ricordati sul telefono (una ricerca per specie, una volta sola)
const CHIAVE_NOMI = 'orme.nomiSpecie';
function leggiNomiSpecie() {
  try {
    return JSON.parse(localStorage.getItem(CHIAVE_NOMI) ?? '{}');
  } catch {
    return {};
  }
}
function salvaNomiSpecie(nomi) {
  try {
    localStorage.setItem(CHIAVE_NOMI, JSON.stringify(nomi));
  } catch {
    // senza memoria si richiedono alla prossima visita
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
  // le proposte sulla mappa hanno una voce nella legenda del pulsante dei livelli
  mappa.vociLegenda?.push(() =>
    disegnate.getLayers().length
      ? `<div class="voce-legenda"><b>Proposte di Suggerisci</b><ul class="legenda-sentieri">${COLORI_PROPOSTE.map((c, i) => `<li><svg viewBox="0 0 34 10" width="34" height="10" aria-hidden="true"><path d="M2 5H32" stroke="#fff" stroke-width="8" stroke-linecap="round"/><path d="M2 5H32" stroke="${c}" stroke-width="5" stroke-linecap="round"/></svg>Proposta ${i + 1} (quadrato col numero: la partenza)</li>`).join('')}</ul><p class="tenue piccolo">Toccando il quadrato si apre il riquadro; \"P\" è la partenza degli anelli.</p></div>`
      : '',
  );

  let classifica = [];
  let mostrate = 0;
  let richiesta = 0;
  // allargamenti chiesti quando non resta nessun percorso (tornano normali a ogni nuova scelta)
  let raggioMesi = 1;
  let scalaArea = 1;
  // le specie più segnalate nella zona inquadrata (GBIF) per "Quale animale"
  let zonaSpecie = { chiave: null, stato: '', osservazioni: [] };
  const nomiIt = leggiNomiSpecie();
  const nomeSpecieZona = (x) => (x.animale ? ANIMALI[x.animale] : nomiIt[x.chiave] || x.nome);
  const meseDelQuando = () => Number(dataDelQuando(scelte.quando, oggiItalia()).slice(5, 7));
  const nomeMese = () => new Date(`${dataDelQuando(scelte.quando, oggiItalia())}T12:00:00`).toLocaleDateString('it-IT', { month: 'long' });
  const specieDinamica = () => scelte.cerco.includes('fauna') && String(scelte.specie ?? '').startsWith(PREFISSO_ZONA);
  const etichettaSpecie = () => scelte.specieNome || VOCI_SPECIE[scelte.specie] || scelte.specie;
  function aggiornaScelte() {
    const box = foglio.querySelector('.suggerisci-scelte');
    if (box) box.innerHTML = htmlScelte();
  }
  async function caricaZona({ forza = false } = {}) {
    const b = mappa.getBounds();
    if (mappa.getZoom() < 9) {
      zonaSpecie = { chiave: null, stato: 'lontano', osservazioni: [] };
      return aggiornaScelte();
    }
    const { centro, km } = zonaInquadrata([b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]);
    const raggio = Math.min(50, km * scalaArea);
    const chiave = `${centro.map((x) => x.toFixed(2))}|${raggio}`;
    if (!forza && zonaSpecie.chiave === chiave && zonaSpecie.stato === 'ok') return;
    zonaSpecie = { chiave, stato: 'carico', osservazioni: [] };
    aggiornaScelte();
    try {
      const osservazioni = [];
      for (let pagina = 0; pagina < (scalaArea > 1 ? 8 : 5); pagina++) {
        const r = await fetch(urlOsservazioniGbif(riquadroIntorno(centro, raggio), { specie: 'notevoli', gruppi: ['rapaci', 'acqua', 'mammiferi'] }, { limite: 300, scarto: pagina * 300 }));
        if (!r.ok) throw new Error(`GBIF ${r.status}`);
        const json = await r.json();
        // solo i campi che servono ai conti: l'osservatore è un codice anonimo
        for (const x of interpretaGbif(json)) osservazioni.push({ nomeScientifico: x.nomeScientifico, specie: x.specie, animale: x.animale, data: x.data, lat: x.lat, lon: x.lon, sfumata: x.sfumata, osservatore: x.osservatore });
        if (json.endOfRecords || !json.results?.length) break;
      }
      if (zonaSpecie.chiave !== chiave) return;
      zonaSpecie = { chiave, stato: 'ok', osservazioni };
      aggiornaScelte();
      // i nomi italiani delle prime (iNaturalist), poi si ridisegna
      const prime = specieDellaZonaPerOsservatori(osservazioni, meseDelQuando(), { raggioMesi }).filter((x) => !x.animale && nomiIt[x.chiave] === undefined);
      if (prime.length) {
        await Promise.all(
          prime.map(async (x) => {
            try {
              const r = await fetch(urlNomeItaliano(x.chiave));
              nomiIt[x.chiave] = nomeItalianoDaRisposta(await r.json(), x.chiave) ?? '';
            } catch {
              // senza nome italiano resta quello di GBIF
            }
          }),
        );
        salvaNomiSpecie(nomiIt);
        if (zonaSpecie.chiave === chiave) aggiornaScelte();
      }
    } catch {
      if (zonaSpecie.chiave === chiave) {
        zonaSpecie = { chiave, stato: 'errore', osservazioni: [] };
        aggiornaScelte();
      }
    }
  }
  // "Più segnalate nella zona inquadrata": pillole oltre all'elenco fisso
  function htmlSpecieZona() {
    const { stato } = zonaSpecie;
    if (stato === 'lontano') return '<p class="tenue piccolo">Avvicina la mappa (zoom 9 o più) per vedere le specie più segnalate nella zona.</p>';
    if (stato === 'carico') return '<p class="tenue piccolo">Cerco le specie più segnalate nella zona inquadrata…</p>';
    if (stato === 'errore') return '<p class="tenue piccolo">Non riesco a leggere le specie della zona (sei offline?). <button type="button" class="bottone testo" data-azione="zona-riprova">Riprova</button></p>';
    if (stato !== 'ok') return '';
    const lista = specieDellaZonaPerOsservatori(zonaSpecie.osservazioni, meseDelQuando(), { raggioMesi });
    if (!lista.length) return `<h3>Più segnalate qui</h3><p class="tenue piccolo">Poche segnalazioni nella zona inquadrata in ${nomeMese()}. <button type="button" class="bottone testo" data-azione="zona-riprova">Aggiorna</button></p>`;
    return `<h3>Più segnalate qui <span class="tenue piccolo">· ${nomeMese()}, per persone diverse</span></h3>
      <div class="gruppo-scelte" role="radiogroup" aria-label="Specie più segnalate nella zona">${lista
        .map((x) => {
          const valore = x.animale ?? `${PREFISSO_ZONA}${x.chiave}`;
          const nome = nomeSpecieZona(x);
          return `<button type="button" class="chip-scorciatoia ${scelte.specie === valore ? 'attiva' : ''}" role="radio" aria-checked="${scelte.specie === valore}" data-scelta="specie" data-valore="${escapeHtml(valore)}" data-nome="${escapeHtml(nome)}">${escapeHtml(nome)} · ${x.persone}</button>`;
        })
        .join('')}</div>
      <p class="tenue piccolo">Il numero sono le persone diverse che l'hanno segnalato. <button type="button" class="bottone testo" data-azione="zona-riprova">Aggiorna per la zona inquadrata</button></p>`;
  }

  function htmlScelte() {
    const modo = `<div class="segmenti due scelta-modo" role="radiogroup" aria-label="Cosa suggerire">${Object.entries(MODI_SUGGERISCI)
      .map(([k, t]) => `<button type="button" role="radio" class="segmento ${k === scelte.modo ? 'attivo' : ''}" aria-checked="${k === scelte.modo}" data-scelta="modo" data-valore="${k}">${t}</button>`)
      .join('')}</div>`;
    if (scelte.modo === 'anello') {
      return `${modo}
        <h3>Lunghezza</h3>${htmlGruppo('lunghezza', LUNGHEZZE, scelte.lunghezza)}
        <h3>Fatica</h3>${htmlGruppo('fatica', FATICHE, scelte.fatica)}
        <p class="tenue piccolo partenza-anello">Partenza: ${partenzaManuale ? 'il punto scelto sulla mappa' : posizione() ? 'la tua posizione' : 'il centro della mappa (sposta la mappa per cambiarla)'}. Nei parchi solo sentieri segnati e aperti a tutti; fuori anche i non segnati, evidenziati.</p>`;
    }
    return `${modo}
      <h3>Quando</h3>${htmlGruppo('quando', QUANDO, scelte.quando)}
      <label class="scelta-ora">Partenza <input type="time" data-ora-partenza value="${escapeHtml(oraPartenzaTesto())}" step="300" /></label>
      <h3>Quanto tempo</h3>${htmlGruppo('tempo', TEMPI, scelte.tempo)}
      <h3>Cosa cerchi</h3>${htmlGruppo('cerco', COSE, scelte.cerco, true)}
      ${
        scelte.cerco.includes('fauna')
          ? `<h3>Quale animale</h3>${htmlGruppo('specie', VOCI_SPECIE, scelte.specie ?? '')}
      <p class="tenue piccolo">In ordine di persone diverse che l\'hanno segnalato nel mese scelto: non è la probabilità di vederlo. ${linkCodice}</p>${htmlSpecieZona()}`
          : ''
      }
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
    if (scelte.modo === 'anello') return ['Anello', LUNGHEZZE[scelte.lunghezza], FATICHE[scelte.fatica].toLowerCase(), partenzaManuale ? 'dal punto scelto' : posizione() ? 'dalla tua posizione' : 'dal centro della mappa'].join(' · ');
    const cerco = scelte.cerco.map((c) => (c === 'fauna' && scelte.specie ? etichettaSpecie() || COSE[c] : COSE[c]).toLowerCase());
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
          <button type="button" class="bottone primario pieno-largo" data-azione="suggerisci">${testoBottone()}</button>
        </div>
        <div class="suggerisci-risultati" aria-live="polite"></div>
      </div>`;
  }
  const testoBottone = () => (scelte.modo === 'anello' ? 'Crea l\'anello' : 'Suggerisci');
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
      // traccia incompleta (salti oltre 500 m): si propone solo se la fonte dà i km, e con quelli
      .filter((p) => !tracciaDaNonUsare(p.sentiero, p.traccia).incompleta || p.misure.km != null)
      .filter((p) => scelte.distanza !== 'parco' || !scelte.parco || (p.sentiero.parchi ?? [p.sentiero.parco]).includes(scelte.parco))
      .map((p) => {
        const s = p.sentiero;
        const pezzi = percorsoSentiero(p.traccia.geojson).pezzi;
        const quote = quoteDellaTraccia(s, p.traccia);
        const incompleta = tracciaDaNonUsare(s, p.traccia).incompleta;
        const anello = !incompleta && eAnelloPezzi(pezzi, { roundtrip: Boolean(p.traccia.dettagli?.roundtrip) });
        const base = incompleta ? null : baseAndata(pezzi, quote);
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
          specie: !scelte.cerco.includes('fauna') || !scelte.specie
            ? null
            : specieDinamica()
              ? puntiSpecieZona(zonaSpecie.osservazioni, p.traccia.geojson, scelte.specie.slice(PREFISSO_ZONA.length), mese, { raggioMesi, nome: scelte.specieNome })
              : puntiSpecie(s, scelte.specie, mese, raggioMesi),
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
    // si giudica con la partenza scelta (la stessa della scheda); per oggi, se è già passata, è tardi
    const partenza = oraPartenzaScelta();
    const ora = new Date();
    tardiOggi = data === oggiItalia() && partenzaPassata(partenza, ora.getHours() * 60 + ora.getMinutes());
    const dopoMin = partenza ?? 0;
    for (const { v, m } of dati) {
      if (!m) continue;
      const basso = giornoAllaQuota(previsioneDi(m.basso.chiave, data), m.basso.quota);
      const alto = m.alto ? giornoAllaQuota(previsioneDi(m.alto.chiave, data), m.alto.quota) : null;
      // su due giorni si giudica la prima giornata (metà del cammino)
      const durataMin = (v.misure.durataMin ?? m.durataMin) / (scelte.tempo === 'due' ? 2 : 1);
      v.giudizio = basso && !tardiOggi ? giudicaGiornata({ basso, alto, durataMin, percorso: m.percorso, soglie: SOGLIE_PREDEFINITE, attivita, dopoMin }) : null;
    }
  }

  async function suggerisci() {
    const mia = ++richiesta;
    const risultati = foglio.querySelector('.suggerisci-risultati');
    risultati.innerHTML = '<p class="tenue">Cerco tra i percorsi…</p>';
    puntiUtili ??= await caricaPunti();
    if (mia !== richiesta) return;
    const data = dataDelQuando(scelte.quando, oggiItalia());
    const adessoSuggerisci = new Date();
    tardiOggi = data === oggiItalia() && partenzaPassata(oraPartenzaScelta(), adessoSuggerisci.getHours() * 60 + adessoSuggerisci.getMinutes());
    if (specieDinamica()) {
      await caricaZona();
      if (mia !== richiesta) return;
      if (zonaSpecie.stato !== 'ok') {
        risultati.innerHTML = '<p class="vuoto">Non riesco a leggere le segnalazioni della zona (sei offline?). Riprova tra poco.</p>';
        return;
      }
    }
    const lista = [];
    let senzaSpecie = 0; // quanti percorsi andrebbero bene se non si guardasse la specie
    for (const c of candidati(data)) {
      if (scelte.tempo === 'due') c.rifugioNotte = rifugioPerLaNotte(c);
      const valutazione = valuta(c, scelte);
      if (valutazione) lista.push({ ...c, valutazione });
      else if (scelte.specie && scelte.cerco.includes('fauna') && valuta(c, { ...scelte, specie: '' })) senzaSpecie++;
    }
    lista.sort((a, b) => b.valutazione.punteggio - a.valutazione.punteggio);
    if (!lista.length) {
      classifica = [];
      disegnate.clearLayers();
      if (senzaSpecie > 0) {
        // la specie scelta è il motivo: si propone di allargare mesi o area
        const areaMassima = scelte.distanza === '120' && (scalaArea === 2 || !specieDinamica());
        risultati.innerHTML = `<p class="vuoto">Nessun percorso con segnalazioni di ${escapeHtml(etichettaSpecie().toLowerCase())} in ${escapeHtml(nomeMese())}${raggioMesi > 1 ? ' e nei mesi vicini' : ''} in questa zona.</p>
          <div class="azioni-vuoto">${raggioMesi < 3 ? '<button type="button" class="bottone" data-azione="allarga-mesi">Allarga ai mesi vicini</button>' : ''}${areaMassima ? '' : '<button type="button" class="bottone" data-azione="area-grande">Cerca in un\'area più grande</button>'}</div>`;
        return;
      }
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
          title: `Proposta ${i + 1}`,
        })
          .bindPopup(`<div class="popup-sentiero"><b>Proposta ${i + 1} di Suggerisci</b><br>${escapeHtml(v.sentiero.nome)}<br><span class="tenue piccolo">Partenza del percorso.</span><br><a class="bottone primario popup-apri" href="#/sentiero/${encodeURIComponent(v.sentiero.id)}">Apri la scheda ›</a></div>`)
          .addTo(disegnate);
      }
      limiti.extend(linea.getBounds());
    });
    const fine = mostrate + pagina.length;
    risultati.innerHTML = `
      ${tardiOggi ? `<p class="avviso-luce">${ICONE.avviso}<span>${TESTO_TARDI}</span></p>` : ''}
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

  // --- Crea un anello ---
  let anelliOra = [];
  let tardiOggi = false; // oggi con la partenza scelta già passata: niente giudizio sul meteo, si dice che è tardi
  let partenzaManuale = null; // "Crea un anello da qui": il punto scelto sulla mappa (vale finché la tendina resta aperta)
  const centroMappa = () => {
    const c = mappa.getCenter();
    return [c.lng, c.lat];
  };
  // giro: 0 con "Crea l'anello", poi ogni "Rigenera" prova direzioni nuove (direzioniDelGiro)
  let giroAnello = 0;
  async function creaAnelli(giro = 0) {
    const mia = ++richiesta;
    giroAnello = giro;
    const risultati = foglio.querySelector('.suggerisci-risultati');
    const avanzamento = (n) => (risultati.innerHTML = `<p class="tenue">Calcolo gli anelli sui sentieri… ${n} di ${DIREZIONI}</p>`);
    avanzamento(0);
    const volutaKm = Number(scelte.lunghezza);
    const voluta = partenzaManuale ?? posizione() ?? centroMappa();
    // acqua: i punti dei parchi più i quadrati del robot della zona (file già pronti, niente Overpass)
    const raggio = volutaKm / 2 + 1;
    const [avvisi, parchi, robot] = await Promise.all([preparaAvvisi(), caricaPunti(), puntiDelRobot(riquadroDeiPezzi([[puntoA(voluta, raggio * 1.42, 225), puntoA(voluta, raggio * 1.42, 45)]], 0), { max: 9 })]);
    if (mia !== richiesta) return;
    const punti = [...new Map([...(parchi ?? []), ...robot.punti].map((p) => [p.id, p])).values()];
    // dove i punti non sono stati scaricati l'acqua non si sa (non è "nessuna")
    const zone = [...(await zoneCoperte(Boolean(parchi))), ...robot.coperti.map((bbox) => ({ bbox }))];
    const acquaDi = (linea, geojson) => (percorsoCoperto([linea], zone) ? puntiLungoIlPercorso(punti, geojson).filter(conAcqua).length : null);
    // nei parchi l'anello si fa con i soli sentieri dell'archivio, aperti a tutti
    if (avvisi.parcoDi(voluta)) return anelliNelParco({ mia, giro, voluta, volutaKm, acquaDi });
    // fuori dai parchi BRouter; i punti del giro che cadono in un parco si agganciano ai sentieri
    const vertici = verticiDeiSentieri(voluta, volutaKm / 2 + 2);
    const suiSentieri = vicinoAiSentieri(vertici);
    const partenza = voluta;
    const aggancia = (p) => (avvisi.parcoDi(p) ? agganciaAlSentiero(p, vertici)?.p ?? p : p);
    const varianti = [];
    const ottenute = []; // lunghezze riportate alla voluta: correggono le prossime
    const conti = { fuoriRegole: 0, errori: 0, occupato: false };
    const calcola = (tappe) => calcolaPercorso(tappe, { preferenzaSegnati: PREFERENZA_SEGNATI });
    // una richiesta alla volta (il server pubblico di BRouter è di tutti); basta con 3 anelli buoni
    for (const [k, gradi] of direzioniDelGiro(giro).entries()) {
      if (scegliAnelli(varianti, PER_VOLTA).length === PER_VOLTA) break;
      avanzamento(k + 1);
      const kmRichiesti = volutaKm * correzioneLunghezza(ottenute, volutaKm);
      let tappe = puntiDellAnello(partenza, kmRichiesti, gradi).map((p, i, x) => (i === 0 || i === x.length - 1 ? p : aggancia(p)));
      let r = null;
      try {
        r = await calcola(tappe);
        // punti raggiunti con un andata e ritorno: si spostano alla base e si ricalcola una volta
        const senza = senzaPunte(r.coordinate, tappe);
        if (senza && mia === richiesta) {
          tappe = senza;
          r = await calcola(tappe);
        }
      } catch (e) {
        if (e.occupato) conti.occupato = true;
        else conti.errori++;
      }
      if (mia !== richiesta) return;
      if (conti.occupato) break;
      if (!r) continue;
      const linea = r.coordinate.map(([lon, lat]) => [lon, lat]);
      ottenute.push(((r.lunghezzaM / 1000) * volutaKm) / kmRichiesti);
      if (!ammessoNeiParchi(trattiARischio({ linea, terreno: r.terreno }, avvisi), { suiSentieri })) {
        conti.fuoriRegole++;
        continue;
      }
      const geojson = { type: 'MultiLineString', coordinates: [linea] };
      const v = {
        linea,
        geojson,
        tappe,
        misure: misureDeiPezzi([r.coordinate]),
        segnata: quotaSegnata(r.terreno),
        gamboM: gambo(linea),
        acqua: acquaDi(linea, geojson),
        nonSegnati: trattiNonSegnati(linea, r.terreno),
      };
      v.sovrapposizione = sovrapposizione(linea, { gamboM: v.gamboM });
      v.punteggio = valutaAnello({ ...v.misure, ...v }, { volutaKm, fatica: scelte.fatica });
      varianti.push(v);
    }
    anelliOra = scegliAnelli(varianti, PER_VOLTA);
    mostraAnelli({ ...conti, scartate: varianti.length - anelliOra.length, partenza });
  }

  // Nel parco: la rete dei sentieri dell'archivio intorno alla partenza e i giri da lì (anche con un
  // gambo), ordinati; le quote (TINITALY) per i primi, finché ce ne sono 3 adatti alla fatica.
  // "Rigenera" mostra i 3 successivi della stessa classifica
  let nelParco = null; // { chiave, lista, partenza, distanzaM, mostrati }
  async function anelliNelParco({ mia, giro, voluta, volutaKm, acquaDi }) {
    const chiave = `${voluta.map((x) => x.toFixed(3))}|${volutaKm}|${scelte.fatica}`;
    if (!giro || nelParco?.chiave !== chiave) {
      const lista = [];
      const adatti = sentieriAdatti();
      for (const s of sentieri) {
        if (!adatti.has(s.id) || ACCESSI_REGOLATI[s.accesso?.tipo] || ['uscita_guidata', 'rete_sentieri'].includes(s.tipoPercorso)) continue;
        const g = tracce.get(s.id)?.geojson;
        if (!g) continue;
        const linee = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
        if (linee.some((l) => l.some((p) => distanzaKm(voluta, p) <= volutaKm / 2 + 3))) lista.push({ id: s.id, linee });
      }
      const rete = reteDeiSentieri(lista, { partenza: voluta });
      const [nodo] = nodiVicini(rete, voluta, { n: 1, maxM: 2000 });
      if (!nodo) {
        anelliOra = [];
        return mostraAnelli({ messaggio: 'Nessun sentiero segnato del parco entro 2 km da qui: sposta la partenza.' });
      }
      const giri = giriDallaPartenza(rete, nodo.id, { minKm: volutaKm * (1 - MAX_SCARTO_LUNGHEZZA), maxKm: volutaKm * (1 + MAX_SCARTO_LUNGHEZZA), maxGamboKm: (volutaKm * MAX_GAMBO) / 2 });
      const nomi = new Map(sentieri.map((s) => [s.id, s.codici?.length ? codici(s) : s.nome]));
      // prima classifica senza quote: lunghezza, tratti ripetuti e gambo
      const prima = giri.map((g) => {
        const linea = lineaDelGiro(rete, g);
        const gamboM = g.gamboKm * 1000;
        const v = { linea, gamboM, sovrapposizione: sovrapposizione(linea, { gamboM }), segnata: 1, nonSegnati: [], nomi: [...new Set(sentieriDelGiro(rete, g).map((id) => nomi.get(id)).filter(Boolean))] };
        v.provvisorio = valutaAnello({ km: g.km, salita: 0, durataMin: 0, ...v }, { volutaKm, fatica: 'media' });
        return v;
      });
      nelParco = { chiave, lista: prima.filter((v) => v.provvisorio != null).sort((a, b) => b.provvisorio - a.provvisorio), partenza: nodo.p, distanzaM: nodo.distanzaM, mostrati: 0 };
    }
    // dal punto dove si era arrivati: quote e punteggio vero, finché ce ne sono 3; in fondo si ricomincia
    const r = await prossimiAnelli(nelParco.lista, nelParco.mostrati, PER_VOLTA, async (v, pagina) => {
      if (!v.misure) {
        risultati().innerHTML = '<p class="tenue">Calcolo le quote degli anelli…</p>';
        const { pezzi } = await quoteDeiPezzi([v.linea]).catch(() => ({ pezzi: [v.linea] }));
        if (mia !== richiesta) return false;
        v.misure = misureDeiPezzi(pezzi);
        v.geojson = { type: 'MultiLineString', coordinates: [v.linea] };
        v.acqua = acquaDi(v.linea, v.geojson);
        v.punteggio = valutaAnello({ ...v.misure, ...v }, { volutaKm, fatica: scelte.fatica });
      }
      return v.punteggio != null && !pagina.some((x) => quotaComune(x.linea, v.linea) > 0.6);
    });
    if (mia !== richiesta) return;
    const { pagina, scartate } = r;
    nelParco.mostrati = r.posizione;
    anelliOra = pagina;
    const restano = nelParco.lista.length - nelParco.mostrati;
    mostraAnelli({
      partenza: nelParco.partenza,
      agganciata: { distanzaM: nelParco.distanzaM },
      nelParco: true,
      restano,
      messaggio: pagina.length ? '' : `Nessun anello sui sentieri segnati del parco${scartate ? ' adatto alla fatica scelta' : ''} da qui: prova un'altra lunghezza o sposta la partenza.`,
    });
  }
  const risultati = () => foglio.querySelector('.suggerisci-risultati');

  // i sentieri compatibili con l'attività scelta (a piedi niente itinerari MTB), come negli elenchi
  const sentieriAdatti = () => new Set(filtraPercorsi(preparaPercorsi(sentieri, tracce), { ...FILTRI_VUOTI }, stato.leggi().attivita).map((p) => p.sentiero.id));

  // vertici dei sentieri dell'archivio entro raggioKm, senza quelli ad accesso regolato né le uscite
  function verticiDeiSentieri(centro, raggioKm) {
    const fuori = [];
    const adatti = sentieriAdatti();
    for (const s of sentieri) {
      if (!adatti.has(s.id) || ACCESSI_REGOLATI[s.accesso?.tipo] || ['uscita_guidata', 'rete_sentieri'].includes(s.tipoPercorso)) continue;
      const g = tracce.get(s.id)?.geojson;
      if (!g) continue;
      for (const l of g.type === 'LineString' ? [g.coordinates] : g.coordinates) for (const p of l) if (distanzaKm(centro, p) <= raggioKm) fuori.push(p);
    }
    return fuori;
  }

  function mostraAnelli({ mia = richiesta, fuoriRegole = 0, errori = 0, occupato = false, scartate = 0, partenza, agganciata, nelParco: suiSegnati = false, restano = 0, messaggio = '' }) {
    const risultati = foglio.querySelector('.suggerisci-risultati');
    disegnate.clearLayers();
    soloRisultati(true);
    if (!anelliOra.length && messaggio) {
      risultati.innerHTML = `<p class="vuoto">${escapeHtml(messaggio)}</p>`;
      tendina.vai('meta');
      return;
    }
    if (!anelliOra.length) {
      const perche = [
        fuoriRegole ? `${fuoriRegole} ${fuoriRegole === 1 ? 'usciva' : 'uscivano'} dai sentieri segnati o aperti a tutti del parco` : '',
        scartate ? `${scartate} troppo ${scartate === 1 ? 'lontano' : 'lontani'} dalla lunghezza o dalla fatica scelte, o con troppi tratti ripetuti` : '',
        errori ? `${errori} non ${errori === 1 ? 'calcolato' : 'calcolati'} (punto lontano dai sentieri)` : '',
      ]
        .filter(Boolean)
        .join('; ');
      risultati.innerHTML = `${
        occupato
          ? '<p class="vuoto">Il server di BRouter è occupato: riprova tra qualche minuto.</p>'
          : `<p class="vuoto">Nessun anello adatto da qui${perche ? `: ${escapeHtml(perche)}` : ''}. Prova Rigenera, un'altra lunghezza o sposta la partenza.</p>`
      }
        <div class="azioni-proposte"><button type="button" class="bottone" data-azione="rigenera">Rigenera</button></div>`;
      tendina.vai('meta');
      return;
    }
    const limiti = L.latLngBounds([]);
    const latlng = (l) => l.map(([lon, lat]) => [lat, lon]);
    anelliOra.forEach((v, i) => {
      L.polyline(latlng(v.linea), { renderer: tela, pane: 'proposte', color: '#fff', weight: 10, opacity: 0.95, interactive: false }).addTo(disegnate);
      const linea = L.polyline(latlng(v.linea), { renderer: tela, pane: 'proposte', color: COLORI_PROPOSTE[i], weight: 6, opacity: 1, interactive: false }).addTo(disegnate);
      // i tratti non segnati (fuori dai parchi) tratteggiati in giallo sopra il colore
      for (const t of v.nonSegnati) L.polyline(latlng(t.linea), { renderer: tela, pane: 'proposte', color: '#ffd43b', weight: 3, dashArray: '6 6', interactive: false }).addTo(disegnate);
      const meta = v.linea[Math.floor(v.linea.length / 2)];
      L.marker([meta[1], meta[0]], {
        icon: L.divIcon({ className: 'segno-proposta', html: `<span style="background:${COLORI_PROPOSTE[i]}">${i + 1}</span>`, iconSize: [26, 26] }),
        keyboard: false,
        title: `Anello ${i + 1}`,
      })
        .bindPopup(`<div class="popup-sentiero"><b>Anello ${i + 1} di Suggerisci</b><br><span class="tenue piccolo">Giro creato dall'app sui sentieri della zona (non è un percorso salvato): aprilo nell'elenco per modificarlo o salvarlo.</span></div>`)
        .addTo(disegnate);
      limiti.extend(linea.getBounds());
    });
    L.marker([partenza[1], partenza[0]], {
      icon: L.divIcon({ className: 'segno-proposta', html: '<span style="background:#222">P</span>', iconSize: [26, 26] }),
      keyboard: false,
      title: 'Partenza degli anelli',
    })
      .bindPopup('<div class="popup-sentiero"><b>Partenza degli anelli</b><br><span class="tenue piccolo">Da qui partono gli anelli proposti da Suggerisci.</span></div>')
      .addTo(disegnate);
    risultati.innerHTML = `
      <ol class="proposte">${anelliOra.map(htmlAnello).join('')}</ol>
      <div class="azioni-proposte">${!suiSegnati || restano > 0 || anelliOra.length === PER_VOLTA ? '<button type="button" class="bottone" data-azione="rigenera">Rigenera</button>' : ''}</div>
      ${occupato ? '<p class="tenue piccolo">Il server di BRouter è occupato: per altri anelli riprova tra qualche minuto.</p>' : ''}
      ${agganciata?.distanzaM >= 50 ? `<p class="tenue piccolo">Nel parco la partenza è sul sentiero più vicino (P), a ${agganciata.distanzaM} m in linea d'aria.</p>` : ''}
      <p class="tenue piccolo">${
        suiSegnati
          ? 'Nel parco: solo i sentieri segnati del nostro archivio, senza quelli chiusi, a numero chiuso o solo con guida. Quote TINITALY.'
          : `Calcolati con BRouter sui dati OpenStreetMap, quote SRTM: controlla il percorso prima di partire.${fuoriRegole ? ` ${fuoriRegole} ${fuoriRegole === 1 ? 'variante scartata' : 'varianti scartate'} perché nel parco uscivano dai sentieri segnati o aperti a tutti.` : ''}`
      }</p>`;
    tendina.vai('meta');
    foglio.querySelector('.suggerisci-corpo').scrollTop = 0;
    // a tendina ferma (si sposta in 0,22 s): così si sa quanta mappa resta visibile
    setTimeout(() => mia === richiesta && inquadra(limiti, 15), 260);
  }

  function htmlAnello(v, i) {
    const m = v.misure;
    const gamboKm = v.gamboM >= 300 ? km1(v.gamboM / 1000) : null;
    const acqua = v.acqua == null ? 'acqua: dati non scaricati per questa zona' : v.acqua === 0 ? 'niente acqua entro 300 m' : v.acqua === 1 ? '1 punto acqua' : `${v.acqua} punti acqua`;
    const numeri = [`${km1(m.km)} km`, m.salita != null ? `+${Math.round(m.salita)} m` : '', durata(m.durataMin), acqua].filter(Boolean).join(' · ');
    const kmNonSegnati = v.nonSegnati.reduce((s, t) => s + (t.aM - t.daM), 0) / 1000;
    return `<li class="proposta">
      <button type="button" class="proposta-mappa" data-anello="${i}" aria-label="Mostra sulla mappa"><span class="numero-proposta" style="background:${COLORI_PROPOSTE[i]}">${i + 1}</span></button>
      <div class="proposta-corpo">
        <span class="nome">Anello ${i + 1}</span>
        <span class="perche">${escapeHtml(numeri)}</span>
        ${gamboKm ? `<span class="tenue piccolo">I primi ${gamboKm} km si rifanno al ritorno</span>` : ''}
        ${v.nomi?.length ? `<span class="tenue piccolo">Sentieri ${escapeHtml(v.nomi.join(' · '))}</span>` : ''}
        ${v.nomi ? '' : `<span class="tenue piccolo">${escapeHtml(testoQuotaSegnata(v.segnata))}${kmNonSegnati >= 0.05 ? ` · <span class="non-segnati-anello">${km1(kmNonSegnati)} km non segnati</span> (tratteggio giallo)` : ''}</span>`}
        <button type="button" class="bottone testo modifica-anello" data-azione="modifica" data-anello="${i}">Modifica nel disegno</button>
      </div>
    </li>`;
  }

  // "Modifica nel disegno": punti lungo l'anello (uno ogni 1,2 km) diventano la bozza; nel disegno
  // BRouter li collega e gli avvisi del parco restano
  function modificaNelDisegno(v) {
    const punti = puntiLungo(v.linea, 1.2);
    if ((leggiBozza()?.punti?.length ?? 0) > 1 && !confirm('Sostituire il percorso che stai disegnando con questo anello?')) return;
    salvaBozza(punti);
    impostaAperturaDisegno('bozza'); // si apre sull'anello, non sulla vista della mappa
    location.hash = '#/percorso-nuovo';
  }

  foglio.addEventListener('click', (e) => {
    const b = e.target.closest('[data-scelta]');
    if (b) {
      const { scelta, valore } = b.dataset;
      if (scelta === 'cerco') scelte.cerco = scelte.cerco.includes(valore) ? scelte.cerco.filter((x) => x !== valore) : [...scelte.cerco, valore];
      else scelte[scelta] = valore;
      if (scelta === 'specie') scelte.specieNome = b.dataset.nome ?? '';
      raggioMesi = 1;
      scalaArea = 1;
      ricorda(scelte);
      foglio.querySelector('.suggerisci-scelte').innerHTML = htmlScelte();
      foglio.querySelector('[data-azione="suggerisci"]').textContent = testoBottone();
      // "Fauna" appena scelta: le specie della zona inquadrata
      if (scelta === 'cerco' && scelte.cerco.includes('fauna') && zonaSpecie.stato === '') caricaZona();
      return;
    }
    const azione = e.target.closest('[data-azione]')?.dataset.azione;
    if (azione === 'suggerisci') scelte.modo === 'anello' ? creaAnelli(0) : suggerisci();
    else if (azione === 'zona-riprova') caricaZona({ forza: true });
    else if (azione === 'allarga-mesi') {
      raggioMesi = 3;
      suggerisci();
    } else if (azione === 'area-grande') {
      const ordine = ['30', '60', '120'];
      const i = ordine.indexOf(scelte.distanza);
      scelte.distanza = i >= 0 && i < 2 ? ordine[i + 1] : '120';
      scalaArea = 2;
      ricorda(scelte);
      aggiornaScelte();
      (specieDinamica() ? caricaZona({ forza: true }) : Promise.resolve()).then(suggerisci);
    } else if (azione === 'rigenera') creaAnelli(giroAnello + 1);
    else if (azione === 'modifica') return modificaNelDisegno(anelliOra[e.target.closest('[data-anello]').dataset.anello]);
    else if (azione === 'altre') mostraAltre();
    else if (azione === 'cambia') {
      soloRisultati(false);
      tendina.vai('aperta');
    }
    const n = e.target.closest('[data-proposta]')?.dataset.proposta;
    if (n != null && paginaOra[n]) inquadra(L.geoJSON(paginaOra[n].traccia.geojson).getBounds(), 15);
    const a = e.target.closest('.proposta-mappa[data-anello]')?.dataset.anello;
    if (a != null && anelliOra[a]) inquadra(L.geoJSON(anelliOra[a].geojson).getBounds(), 16);
  });
  foglio.addEventListener('change', (e) => {
    if (e.target.matches('[data-ora-partenza]')) return e.target.value && ricordaOraPartenza(e.target.value);
    if (!e.target.matches('.scelta-parco')) return;
    scelte.parco = e.target.value;
    ricorda(scelte);
  });

  function apri() {
    allApertura();
    disegnaForm();
    if (scelte.modo === 'percorsi' && scelte.cerco.includes('fauna')) caricaZona();
    foglio.hidden = false;
    document.body.classList.add('suggerisci-aperto');
    tendina.apri('aperta');
  }
  // "Crea un anello da qui" (da «Nessun percorso passa da qui»): la tendina si apre sugli anelli, con quel punto
  function apriAnelloDa(punto) {
    partenzaManuale = punto;
    scelte.modo = 'anello';
    ricorda(scelte);
    apri();
  }
  function chiudi() {
    partenzaManuale = null;
    if (foglio.hidden) return;
    foglio.hidden = true;
    tendina.chiudi();
    richiesta++;
    disegnate.clearLayers();
    document.body.classList.remove('suggerisci-aperto');
  }
  // le proposte stanno sulla mappa solo con Suggerisci aperto: appena si nasconde (X, Esc, un altro pannello, trascinandolo
  // in giù) spariscono. Se per qualunque motivo restano, un avviso «Proposte di Suggerisci · Nascondi» le toglie.
  const avvisoProposte = document.createElement('div');
  avvisoProposte.className = 'avviso-proposte';
  avvisoProposte.hidden = true;
  avvisoProposte.innerHTML = '<span>Proposte di Suggerisci</span> · <button type="button" class="link">Nascondi</button>';
  contenitore.appendChild(avvisoProposte);
  avvisoProposte.querySelector('button').addEventListener('click', () => disegnate.clearLayers());
  const aggiornaAvvisoProposte = () => {
    const restano = disegnate.getLayers().length > 0 && foglio.hidden;
    avvisoProposte.hidden = !restano;
    document.body.classList.toggle('con-proposte', restano);
  };
  disegnate.on('layeradd layerremove', aggiornaAvvisoProposte);
  new MutationObserver(() => {
    if (foglio.hidden) disegnate.clearLayers();
    aggiornaAvvisoProposte();
  }).observe(foglio, { attributes: true, attributeFilter: ['hidden'] });
  // un altro pannello o strumento si apre: Suggerisci, se non è quello aperto, non lascia proposte
  const allAltroPannello = () => foglio.hidden && disegnate.clearLayers();
  window.addEventListener('orme:pannello', allAltroPannello);
  mappa.on('unload', () => {
    window.removeEventListener('orme:pannello', allAltroPannello);
    avvisoProposte.remove();
    document.body.classList.remove('con-proposte');
    foglio.parentElement?.remove();
  });
  return { apri, apriAnelloDa, chiudi, aperto: () => !foglio.hidden };
}
