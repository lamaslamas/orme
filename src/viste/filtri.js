// Filtri condivisi tra Parchi, Mappa e Salvati: ricerca con un solo pulsante "Filtri" (pannello
// dal basso con tutte le voci), scorciatoie a icone e filtri attivi da togliere con un tocco.
// I filtri scelti valgono per tutte le schermate.
import { ANIMALI, STATI, ACCESSI, DIFFICOLTA } from '../lib/costanti.js';
import { FILTRI_VUOTI } from '../lib/filtri.js';
import { escapeHtml } from '../lib/formato.js';
import { PARCHI, parcoDa } from '../datiParchi.js';
import { stato } from '../stato.js';
import { INTERVALLI } from '../lib/motore.js';
import { ICONE } from './icone.js';

// I filtri vivono nello stato condiviso: parco e animale sono gli stessi della
// heatmap e restano scelti passando da una sezione all'altra.
export function leggiFiltri(parcoFisso = null) {
  const st = stato.leggi();
  return { ...FILTRI_VUOTI, ...st.filtri, parco: parcoFisso ?? st.parco, animale: st.specie };
}

function salvaFiltri(filtri) {
  const { parco, animale, ...altri } = filtri;
  const voci = Object.fromEntries(Object.keys(stato.leggi().filtri).map((k) => [k, altri[k] ?? '']));
  stato.imposta({ parco: parco ?? '', specie: animale ?? '', filtri: voci });
}

// Animali da proporre: quelli del parco scelto, oppure di tutti i parchi
function vociAnimali(idParco) {
  const ammessi = new Set(idParco ? parcoDa(idParco)?.animali ?? [] : PARCHI.flatMap((p) => p.animali));
  return Object.entries(ANIMALI).filter(([k]) => ammessi.has(k));
}

export function definizioni(sentieri, parcoFisso, attivita = 'trekking') {
  const inBici = attivita !== 'trekking';
  return [
    ...(parcoFisso
      ? []
      : [{ chiave: 'parco', titolo: 'Parco', voci: PARCHI.map((p) => [p.id, p.nomeBreve]) }]),
    { chiave: 'animale', titolo: 'Animale', voci: vociAnimali(parcoFisso) },
    {
      chiave: 'fauna',
      titolo: 'Avvistamenti',
      voci: [
        ['frequenti', 'Ricchi di fauna (avvistamenti frequenti)'],
        ['possibili', 'Con fauna (almeno possibili)'],
      ],
      breve: (v) => (v === 'frequenti' ? 'Ricchi di fauna' : 'Con fauna'),
    },
    ...(inBici ? [{ chiave: 'soloBici', titolo: 'Percorribilità', voci: [['tutti', 'Anche i sentieri da verificare']], breve: () => 'Anche da verificare' }] : []),
    ...Object.entries(INTERVALLI).map(([chiave, d]) => ({ chiave, titolo: d.titolo, voci: d.voci })),
    {
      chiave: 'panorama',
      titolo: 'Valore panoramico',
      voci: [
        ['70', 'Molto panoramici (70+)'],
        ['50', 'Panoramici (50+)'],
        ['30', 'Almeno un po\' (30+)'],
      ],
      breve: (v) => `Panorama ${v}+`,
    },
    { chiave: 'stato', titolo: 'Stato', voci: Object.entries(STATI) },
    {
      chiave: 'difficolta',
      titolo: 'Difficoltà',
      voci: [['facili', 'Facili (T/E)'], ...Object.entries(DIFFICOLTA), ['nessuna', 'Non indicata']],
      breve: (v) => (v === 'nessuna' ? 'Difficoltà non indicata' : v === 'facili' ? 'Facili' : v),
    },
    { chiave: 'accesso', titolo: 'Accesso', voci: Object.entries(ACCESSI) },
    ...(inBici ? [] : [{
      chiave: 'bici',
      titolo: 'Bici',
      voci: [
        ['si', 'Consentita'],
        ['no', 'Vietata'],
        ['da_verificare', 'Da verificare'],
      ],
      breve: (v, et) => `Bici: ${et.toLowerCase()}`,
    }]),
  ];
}

export function htmlRicerca(testo, segnaposto = 'Cerca sentiero, zona…') {
  return `<label class="ricerca">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16.5 16.5 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <input type="search" name="testo" placeholder="${escapeHtml(segnaposto)}" value="${escapeHtml(testo ?? '')}" aria-label="Cerca" autocomplete="off" />
      </label>`;
}

// Scorciatoie a icone sopra l'elenco: un tocco applica (o toglie) un filtro comune
export const SCORCIATOIE = [
  { chiave: 'fauna', valore: 'frequenti', nome: 'Ricchi di fauna', icona: 'zampa' },
  { chiave: 'panorama', valore: '50', nome: 'Panoramici', icona: 'sole' },
  { chiave: 'durata', valore: '0-120', nome: 'Fino a 2 h', icona: 'orologio' },
  { chiave: 'difficolta', valore: 'facili', nome: 'Facili', icona: 'montagna' },
];

// ricerca=false: la casella di ricerca è altrove (es. in cima alla pagina iniziale)
export function htmlFiltri(sentieri, filtri, { ricerca = true } = {}) {
  const pulsante = `<button type="button" class="pulsante-filtri" data-azione="apri" aria-haspopup="dialog">${ICONE.filtri}<span>Filtri</span><b class="quanti" hidden></b></button>`;
  return `
    <div class="filtri">
      ${ricerca ? `<div class="riga-ricerca">${htmlRicerca(filtri.testo)}${pulsante}</div>` : ''}
      <div class="scorciatoie-filtri" role="group" aria-label="Scorciatoie">${ricerca ? '' : pulsante}<span class="scorciatoie-voci"></span></div>
      <div class="filtri-attivi" aria-label="Filtri attivi"></div>
      <dialog class="foglio foglio-filtri" aria-label="Filtri">
        <div class="foglio-maniglia" aria-hidden="true"></div>
        <div class="foglio-testa"><h2 class="foglio-titolo">Filtri</h2><button type="button" class="bottone testo" data-azione="azzera">Azzera</button></div>
        <div class="foglio-sezioni"></div>
        <button type="button" class="bottone primario pieno-largo mostra-risultati" data-azione="chiudi">Mostra i percorsi</button>
      </dialog>
    </div>`;
}

// Collega i filtri: alAggiornamento(filtri) viene chiamata a ogni modifica
// conta(filtri): quanti percorsi restano con quei filtri (per i numeri accanto a ogni scelta)
export function collegaFiltri(contenitore, sentieri, filtri, alAggiornamento, { parcoFisso = null, conta = null } = {}) {
  let defs = definizioni(sentieri, parcoFisso, stato.leggi().attivita);
  let attivita = stato.leggi().attivita;
  const ricerca = contenitore.querySelector('input[name=testo]');
  const foglio = contenitore.querySelector('.foglio-filtri');
  const scorciatoie = contenitore.querySelector('.scorciatoie-voci');
  const attivi = contenitore.querySelector('.filtri-attivi');
  // il filtro per paese non c'è più: un valore rimasto in memoria non deve nascondere percorsi
  filtri.paese = '';

  const etichetta = (d) => {
    const valore = filtri[d.chiave];
    const et = d.voci.find(([v]) => v === valore)?.[1] ?? valore;
    return d.breve ? d.breve(valore, et) : et;
  };
  const scorciatoiaAttiva = (sc) => filtri[sc.chiave] === sc.valore;

  function disegna() {
    // numero dei filtri scelti (senza ricerca e senza il parco fisso della pagina)
    const scelti = defs.filter((d) => filtri[d.chiave] && !(parcoFisso && d.chiave === 'parco'));
    contenitore.querySelectorAll('.quanti').forEach((b) => {
      b.hidden = !scelti.length;
      b.textContent = scelti.length;
    });
    contenitore.querySelectorAll('.pulsante-filtri').forEach((b) => b.classList.toggle('attivo', scelti.length > 0));
    scorciatoie.innerHTML = SCORCIATOIE.map(
      (sc) => `<button type="button" class="chip-scorciatoia ${scorciatoiaAttiva(sc) ? 'attiva' : ''}" data-scorciatoia="${sc.chiave}" aria-pressed="${scorciatoiaAttiva(sc)}">${ICONE[sc.icona]}<span>${escapeHtml(sc.nome)}</span></button>`,
    ).join('');
    // i filtri attivi che non sono già una scorciatoia accesa: piccole etichette da togliere
    attivi.innerHTML = scelti
      .filter((d) => !SCORCIATOIE.some((sc) => sc.chiave === d.chiave && scorciatoiaAttiva(sc)))
      .map((d) => `<button type="button" class="filtro-attivo" data-togli="${d.chiave}" aria-label="Togli ${escapeHtml(etichetta(d))}">${escapeHtml(etichetta(d))}<span aria-hidden="true">✕</span></button>`)
      .join('');
    if (foglio.open) disegnaFoglio();
  }

  function disegnaFoglio() {
    foglio.querySelector('.foglio-sezioni').innerHTML = defs
      .filter((d) => d.voci.length && !(parcoFisso && d.chiave === 'parco'))
      .map(
        (d) => `<section class="sezione-filtro"><h3>${escapeHtml(d.titolo)}</h3><div class="opzioni-filtro">${d.voci
          .map(([v, et]) => {
            // quanti percorsi restano scegliendo questa voce (con gli altri filtri attuali)
            const n = conta ? conta({ ...filtri, [d.chiave]: v }) : null;
            const scelta = filtri[d.chiave] === v;
            return `<button type="button" class="opzione ${scelta ? 'attiva' : ''} ${n === 0 && !scelta ? 'vuota' : ''}" data-chiave="${d.chiave}" data-valore="${escapeHtml(v)}" aria-pressed="${scelta}">${escapeHtml(et)}${n != null ? `<small>${n}</small>` : ''}</button>`;
          })
          .join('')}</div></section>`,
      )
      .join('');
    const n = conta ? conta(filtri) : null;
    foglio.querySelector('.mostra-risultati').textContent = n == null ? 'Mostra i percorsi' : n === 1 ? 'Mostra 1 percorso' : `Mostra ${n} percorsi`;
  }

  function aggiorna() {
    salvaFiltri(filtri);
    disegna();
    alAggiornamento(filtri);
  }

  // una scelta fatta altrove (es. l'animale della heatmap o l'attività) aggiorna anche questi filtri
  const scollega = stato.ascolta((s) => {
    const nuovi = leggiFiltri(parcoFisso);
    const cambiaAttivita = s.attivita !== attivita;
    if (cambiaAttivita) {
      attivita = s.attivita;
      defs = definizioni(sentieri, parcoFisso, attivita);
    }
    if (!cambiaAttivita && JSON.stringify(nuovi) === JSON.stringify(filtri)) return;
    Object.assign(filtri, nuovi);
    if (ricerca && ricerca.value !== filtri.testo) ricerca.value = filtri.testo;
    disegna();
    alAggiornamento(filtri);
  });

  function azzera() {
    for (const d of defs) filtri[d.chiave] = '';
    if (parcoFisso) filtri.parco = parcoFisso;
    aggiorna();
  }

  contenitore.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || !contenitore.contains(t)) return;
    if (t.dataset.azione === 'apri') {
      disegnaFoglio();
      foglio.showModal();
    } else if (t.dataset.azione === 'chiudi') foglio.close();
    else if (t.dataset.azione === 'azzera') azzera();
    else if (t.dataset.scorciatoia) {
      const sc = SCORCIATOIE.find((x) => x.chiave === t.dataset.scorciatoia);
      filtri[sc.chiave] = scorciatoiaAttiva(sc) ? '' : sc.valore;
      aggiorna();
    } else if (t.dataset.togli) {
      filtri[t.dataset.togli] = '';
      aggiorna();
    } else if (t.dataset.chiave) {
      // un secondo tocco sulla voce scelta la toglie
      filtri[t.dataset.chiave] = filtri[t.dataset.chiave] === t.dataset.valore ? '' : t.dataset.valore;
      aggiorna();
    }
  });
  // tocco fuori dal pannello: si chiude
  foglio.addEventListener('click', (e) => {
    if (e.target === foglio) foglio.close();
  });

  ricerca?.addEventListener('input', () => {
    filtri.testo = ricerca.value;
    aggiorna();
  });

  aggiorna();
  return {
    togli(chiave) {
      filtri[chiave] = '';
      aggiorna();
    },
    azzera() {
      Object.assign(filtri, FILTRI_VUOTI, parcoFisso ? { parco: parcoFisso } : {});
      if (ricerca) ricerca.value = '';
      aggiorna();
    },
    scollega,
  };
}

export const filtriAttivi = (filtri) => Object.values(filtri).filter(Boolean).length;
