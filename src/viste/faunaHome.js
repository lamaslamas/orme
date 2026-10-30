// Fauna sulla pagina iniziale (al posto di "Intorno a me"): acceso il pulsante "Fauna", dal basso
// sale un foglio con la heatmap (legenda e filtri), "Ricco di fauna · periodo attuale" per i
// percorsi, i gruppi di animali che interessano e "Cosa vedere qui" per la zona inquadrata.
// Toccando un animale la heatmap mostra solo quello; ritoccandolo si torna ai gruppi.
import L from 'leaflet';
import { leggiGruppiSalvati, leggiSoloRare, salvaSoloRare } from '../lib/gruppiFauna.js';
import { ricercheSpecieDellaZona, specieDellaZona, zonaInquadrata } from '../lib/intorno.js';
import { specieDalleOsservazioni, filtraOsservazioni } from '../lib/filtroFauna.js';
import { iconaPerOsservazione } from '../lib/gbif.js';
import { NOMI_IT, cercaNomeItaliano } from './faunaComune.js';
import { escapeHtml } from '../lib/formato.js';
import { stato } from '../stato.js';
import { nascoste, urlSpecieComuni, specieComuniDaRisposta } from '../lib/specieNascoste.js';
import { htmlNascondi, assicuraComuni } from './nascondiSpecie.js';
import { iconaAnimale, ICONE } from './icone.js';
import { tendinaTrascinabile } from './tendina.js';

// i gruppi scelti sono una preferenza del telefono, la stessa in tutte le mappe (src/lib/gruppiFauna.js)
const leggiGruppi = leggiGruppiSalvati;

const riccoOra = (f) => f.fauna === 'frequenti' && f.stagione === 'adesso';

// contenitore: dove mettere il foglio; restituisce { personalizza, collega(heat), pannello, chiudi }
// allApertura(): quando il foglio si apre (es. per chiudere l'elenco dei percorsi: uno alla volta)
// compatto: senza «Percorsi ricchi di fauna qui» (nel pianificatore non c'è un elenco di percorsi)
export function creaFaunaHome(contenitore, mappa, { allApertura = () => {}, apriElenco = () => {}, compatto = false, riservaAlto = 72 } = {}) {
  let gruppi = leggiGruppi();
  let scelta = null; // { inat, nome, scientifico }
  let heat = null;
  let ultimaZona = '';
  let richiesta = 0;

  const foglio = document.createElement('section');
  foglio.className = 'foglio-fauna';
  foglio.hidden = true;
  foglio.setAttribute('aria-label', 'Fauna qui');
  foglio.innerHTML = `
    <button type="button" class="foglio-maniglia-zona" aria-label="Trascina per aprire o abbassare la fauna"><span class="foglio-maniglia"></span></button>
    <div class="fauna-heat"></div>
    <div class="fauna-corpo">
      <div class="fauna-azioni">
        ${compatto ? '' : `<button type="button" class="chip-scorciatoia" data-azione="ricco">${ICONE.zampa}<span>Percorsi ricchi di fauna qui</span></button>`}
        <label class="interruttore solo-rare"><input type="checkbox" data-azione="solo-rare" /> Solo rare</label>
      </div>
      <h3 class="titolo-sezione">Cosa vedere qui</h3>
      <ul class="specie-zona"></ul>
      <div class="fauna-nascoste-barra"><button type="button" class="chip-scorciatoia" data-azione="nascoste" aria-expanded="false" aria-controls="faunaNascoste"></button></div>
      <section class="fauna-nascoste" id="faunaNascoste" hidden aria-label="Specie nascoste">
        <label class="interruttore"><input type="checkbox" data-azione="comuni" /> Nascondi le più comuni</label>
        <p class="tenue piccolo comuni-nota"></p>
        <div class="comuni-proposta" hidden></div>
        <h4 class="titolo-nascoste">Nascoste da te</h4>
        <ul class="elenco-nascoste"></ul>
      </section>
    </div>`;
  contenitore.appendChild(foglio);
  // la stessa tendina di "Percorsi qui": chiuderla (X, Esc, trascinandola in giù, o aprendone un'altra) nasconde
  // il pannello ma la Fauna resta accesa; un tocco su "Fauna" lo riapre. Si spegne dall'interruttore nel pannello
  const tendina = tendinaTrascinabile(foglio, { corpo: '.fauna-corpo', allaChiusura: () => mostra(false), riserva: riservaAlto });
  const elenco = foglio.querySelector('.specie-zona');

  // «Nascoste (N)»: le specie nascoste a mano, l'interruttore delle più comuni (con l'elenco da vedere prima)
  const barraNascoste = foglio.querySelector('[data-azione="nascoste"]');
  const pannelloNascoste = foglio.querySelector('.fauna-nascoste');
  const interruttoreComuni = foglio.querySelector('[data-azione="comuni"]');
  const proposta = foglio.querySelector('.comuni-proposta');
  function disegnaNascoste() {
    barraNascoste.textContent = `Nascoste (${nascoste.conta()})`;
    const comuni = nascoste.comuni();
    interruttoreComuni.checked = comuni.attive;
    foglio.querySelector('.comuni-nota').textContent = comuni.attive && !comuni.specie.length
      ? 'Calcolo le specie più osservate in Italia…'
      : comuni.attive
      ? `Nascondo: ${comuni.specie.map((v) => v.nome).join(', ')}. Le più osservate in Italia.`
      : 'Le 30 specie di animali selvatici più osservate in Italia (iNaturalist), senza quelle di «Quale animale»: te le faccio vedere prima.';
    const mie = nascoste.nascoste();
    foglio.querySelector('.titolo-nascoste').hidden = !mie.length;
    foglio.querySelector('.elenco-nascoste').innerHTML =
      mie.map((v) => `<li><span>${escapeHtml(v.nome)}</span><button type="button" class="link" data-rimetti="${escapeHtml(v.chiave)}">Rimetti</button></li>`).join('') +
      (mie.length > 1 ? '<li><button type="button" class="link" data-azione="rimetti-tutte">Rimetti tutte</button></li>' : '');
  }
  // acceso: prima l'elenco di quelle che si nascondono, poi la conferma
  async function proponiComuni() {
    interruttoreComuni.checked = false;
    proposta.hidden = false;
    proposta.innerHTML = '<p class="tenue piccolo">Cerco gli animali più osservati in Italia…</p>';
    let elenco = [];
    try {
      elenco = specieComuniDaRisposta(await (await fetch(urlSpecieComuni())).json());
    } catch {
      proposta.innerHTML = '<p class="tenue piccolo">Non riesco a calcolarle ora (sei offline?). Riprova tra poco.</p>';
      return;
    }
    proposta.innerHTML = `<p><b>Nasconderei ${elenco.length} specie</b>, le più osservate in Italia (non quelle di «Quale animale»):</p>
      <ul class="elenco-comuni">${elenco.map((x) => `<li>${escapeHtml(x.nome)} <span class="tenue">· ${x.osservazioni.toLocaleString('it-IT')}</span></li>`).join('')}</ul>
      <div class="azioni-comuni"><button type="button" class="bottone primario" data-azione="conferma-comuni">Nascondi queste</button><button type="button" class="bottone" data-azione="annulla-comuni">Annulla</button></div>`;
    proposta.dataset.elenco = JSON.stringify(elenco.map((x) => ({ scientifico: x.scientifico, nome: x.nome, inat: x.inat })));
  }
  interruttoreComuni.addEventListener('change', () => {
    if (interruttoreComuni.checked) proponiComuni();
    else {
      nascoste.impostaComuni(false);
      proposta.hidden = true;
    }
  });
  // la X accanto al nome nella barra (heatmap.js): si torna a tutti gli animali
  const togliSpecie = () => {
    scelta = null;
    ultimoElenco = '';
    heat?.ricarica();
    for (const c of elenco.querySelectorAll('[data-taxon]')) {
      c.classList.remove('scelta');
      c.setAttribute('aria-pressed', 'false');
    }
    mostraSpecie(true);
  };
  window.addEventListener('orme-togli-specie', togliSpecie);
  const scollegaNascoste = nascoste.ascolta(() => {
    disegnaNascoste();
    mostraSpecie(true);
  });

  function disegnaScelte() {
    foglio.querySelector('[data-azione="solo-rare"]').checked = leggiSoloRare();
    const ricco = foglio.querySelector('[data-azione="ricco"]');
    if (!ricco) return;
    const on = riccoOra(stato.leggi().filtri);
    ricco.classList.toggle('attiva', on);
    ricco.setAttribute('aria-pressed', String(on));
  }

  // specie più osservate nella zona inquadrata, nei gruppi scelti
  async function mostraSpecie(forza = false) {
    if (foglio.hidden) return;
    // con le icone sulla mappa l'elenco viene dalle loro osservazioni (dalleOsservazioni)
    if (heat?.osservazioniVisibili?.()) return dalleOsservazioni();
    // la zona che si vede davvero: sotto la ricerca e sopra questo foglio
    const { x, y } = mappa.getSize();
    const sotto = Math.max(y * 0.3, y - foglio.offsetHeight);
    const visibile = L.latLngBounds(mappa.containerPointToLatLng([0, Math.min(60, sotto / 2)]), mappa.containerPointToLatLng([x, sotto]));
    const { centro, km } = zonaInquadrata([visibile.getSouth(), visibile.getWest(), visibile.getNorth(), visibile.getEast()]);
    const chiave = JSON.stringify([centro, km, gruppi, nascoste.firma()]);
    if (!forza && chiave === ultimaZona) return;
    ultimaZona = chiave;
    const ricerche = ricercheSpecieDellaZona(centro, km, gruppi);
    if (!ricerche.length) {
      elenco.innerHTML = '<li class="tenue">Scegli almeno un gruppo di animali.</li>';
      return;
    }
    const mia = ++richiesta;
    // la lista di prima resta (un po' sbiadita) finché non arriva la nuova: l'altezza non cambia e la tendina non si muove
    if (elenco.children.length) elenco.classList.add('in-caricamento');
    else elenco.innerHTML = '<li class="tenue">Cerco gli animali della zona…</li>';
    let specie;
    try {
      const risposte = await Promise.all(ricerche.map(async (u) => (await fetch(u)).json()));
      specie = specieDellaZona(risposte, undefined, { rare: gruppi.includes('rare') ? [risposte.length - 1] : [] });
    } catch {
      if (mia === richiesta) {
        elenco.classList.remove('in-caricamento');
        if (!elenco.querySelector('[data-taxon]')) elenco.innerHTML = '<li class="tenue">Animali non disponibili ora (sei offline?).</li>';
      }
      return;
    }
    if (mia !== richiesta || !foglio.isConnected) return;
    elenco.classList.remove('in-caricamento');
    disegnaCarte(specie);
  }

  // le carte delle specie: dall'elenco per zona (iNaturalist) o dalle osservazioni che si vedono sulla mappa
  function disegnaCarte(specie) {
    elenco.classList.remove('in-caricamento');
    elenco.innerHTML = specie.length
      ? specie
          .map(
            (x) => `<li><button type="button" class="carta-specie-zona ${scelta && scelta.scientifico === x.scientifico ? 'scelta' : ''}" data-taxon="${x.inat ?? ''}" data-nome="${escapeHtml(x.nome)}" data-scientifico="${escapeHtml(x.scientifico)}" aria-pressed="${Boolean(scelta && scelta.scientifico === x.scientifico)}" title="Mostra solo ${escapeHtml(x.nome)} sulla mappa">
              ${x.foto ? `<img src="${escapeHtml(x.foto.url)}" alt="" loading="lazy" />` : `<span class="specie-icona">${iconaAnimale(x.icona)}</span>`}
              <b>${escapeHtml(x.nome)}</b>${x.rara ? '<span class="specie-rara">rara</span>' : ''}
              <span class="tenue">${x.osservazioni} ${x.osservazioni === 1 ? 'osservazione' : 'osservazioni'}</span>
            </button>${htmlNascondi({ animale: x.animale ?? null, scientifico: x.scientifico, nome: x.nome, inat: x.inat })}</li>`,
          )
          .join('')
      : '<li class="tenue">Nessuna osservazione di questi animali nella zona.</li>';
  }
  // con le icone sulla mappa l'elenco è fatto delle stesse osservazioni (stesse fonti, stesso filtro): icone, conteggio ed
  // elenco coincidono. Con una specie scelta resta quella sola, con le sue osservazioni (si toglie con un tocco o con la X)
  function dalleOsservazioni() {
    if (foglio.hidden) return;
    const oss = heat?.osservazioniVisibili?.();
    if (!oss) return;
    // nomi in italiano: quelli di iNaturalist ci sono già; per le altre fonti si chiedono una volta e l'elenco si rifà
    const usate = scelta ? filtraOsservazioni(oss, { gruppi, taxon: scelta }) : oss;
    const specie = specieDalleOsservazioni(usate).map((x) => ({ ...x, nome: x.animale ? x.nome : NOMI_IT.get(x.scientifico) || x.nome, icona: iconaPerOsservazione(x.esempio) }));
    for (const x of specie) if (!x.animale && x.esempio.fonte !== 'iNaturalist' && !NOMI_IT.has(x.scientifico)) cercaNomeItaliano(x.scientifico).then((n) => n && ((ultimoElenco = ''), dalleOsservazioni()));
    const chiave = JSON.stringify(specie.map((x) => [x.chiave, x.osservazioni]));
    if (chiave === ultimoElenco) return;
    ultimoElenco = chiave;
    disegnaCarte(specie);
  }
  let ultimoElenco = '';
  window.addEventListener('orme-oss-aggiornate', dalleOsservazioni);

  foglio.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.azione === 'nascoste') {
      pannelloNascoste.hidden = !pannelloNascoste.hidden;
      b.setAttribute('aria-expanded', String(!pannelloNascoste.hidden));
      disegnaNascoste();
    } else if (b.dataset.rimetti) {
      nascoste.rimetti(b.dataset.rimetti);
    } else if (b.dataset.azione === 'rimetti-tutte') {
      nascoste.rimettiTutte();
    } else if (b.dataset.azione === 'conferma-comuni') {
      nascoste.impostaComuni(true, JSON.parse(proposta.dataset.elenco ?? '[]'));
      proposta.hidden = true;
    } else if (b.dataset.azione === 'annulla-comuni') {
      proposta.hidden = true;
    } else if (b.dataset.azione === 'ricco') {
      // l'elenco «Percorsi qui» della zona inquadrata, già filtrato per «Ricco di fauna» nel periodo attuale
      // (e nei mesi accanto); il filtro si vede e si toglie nell'elenco
      stato.imposta({ filtri: { fauna: 'frequenti', stagione: 'adesso' } });
      apriElenco();
    } else if (b.dataset.scientifico) {
      const x = { inat: Number(b.dataset.taxon) || null, nome: b.dataset.nome, scientifico: b.dataset.scientifico };
      scelta = scelta?.scientifico === x.scientifico ? null : x;
      ultimoElenco = '';
      heat?.ricarica();
      for (const c of elenco.querySelectorAll('[data-taxon]')) {
        const on = c.dataset.scientifico === scelta?.scientifico;
        c.classList.toggle('scelta', on);
        c.setAttribute('aria-pressed', String(on));
      }
    }
  });

  foglio.querySelector('[data-azione="solo-rare"]').addEventListener('change', (e) => {
    salvaSoloRare(e.target.checked);
    gruppi = leggiGruppiSalvati();
    scelta = null;
    heat?.ricarica();
    mostraSpecie(true);
  });

  function mostra(si) {
    const cambia = foglio.hidden === si;
    foglio.hidden = !si;
    if (cambia) si ? tendina.apri('meta') : tendina.chiudi();
    document.body.classList.toggle('fauna-aperta', si);
    if (si) {
      allApertura();
      disegnaScelte();
      disegnaNascoste();
      assicuraComuni();
      mostraSpecie();
    }
  }
  // "Cosa vedere qui" segue la zona inquadrata, solo con il foglio della fauna aperto
  const togliDallaCoda = mappa.dopoIlMovimento('fauna: specie della zona', () => mostraSpecie(), { visibile: () => !foglio.hidden, priorita: 4 });
  // il pannello si apre quando la Fauna si accende e si chiude quando si spegne; da accesa può restare chiuso
  let heatPrima = Boolean(stato.leggi().livelli.heatmap);
  const scollega = stato.ascolta((s) => {
    const acceso = Boolean(s.livelli.heatmap);
    if (acceso !== heatPrima) {
      heatPrima = acceso;
      mostra(acceso);
    } else disegnaScelte();
  });

  return {
    // campi in più per la heatmap: i gruppi scelti o l'animale toccato
    personalizza: () => ({ gruppi, ...(scelta ? { taxon: { inat: scelta.inat, scientifico: scelta.scientifico, nome: scelta.nome } } : {}) }),
    collega(h) {
      heat = h;
      mostra(Boolean(stato.leggi().livelli.heatmap));
    },
    pannello: foglio.querySelector('.fauna-heat'),
    // Fauna accesa ma pannello chiuso: un tocco su "Fauna" lo riapre (restituisce true se l'ha riaperto)
    riapri() {
      if (!foglio.hidden || !stato.leggi().livelli.heatmap) return false;
      mostra(true);
      return true;
    },
    chiudi() {
      window.removeEventListener('orme-togli-specie', togliSpecie);
      window.removeEventListener('orme-oss-aggiornate', dalleOsservazioni);
      scollegaNascoste();
      scollega();
      togliDallaCoda();
      document.body.classList.remove('fauna-aperta');
      foglio.remove();
    },
  };
}
