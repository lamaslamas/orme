// Pagina iniziale: "Come vuoi esplorare?", ricerca, parchi, animali,
// percorsi di osservazione e l'elenco di tutti i percorsi con i filtri.
import { tuttiISentieri, tutteLeTracce } from '../db.js';
import { PARCHI, parcoDa, diUnParco } from '../datiParchi.js';
import { ANIMALI, HABITAT } from '../lib/costanti.js';
import { ATTIVITA } from '../lib/compatibilita.js';
import { FILTRI_VUOTI } from '../lib/filtri.js';
import { preparaPercorsi, filtraPercorsi } from '../lib/motore.js';
import { cercaParchiESpecie, riepilogoSpecie, osservazionePerParco } from '../lib/home.js';
import { fotoDi } from '../datiFoto.js';
import { htmlPulsanteCrediti } from './visore.js';
import { htmlInvitoInstalla, collegaInstalla } from './installa.js';
import { escapeHtml } from '../lib/formato.js';
import { stato } from '../stato.js';
import { htmlSelettoreAttivita, collegaSelettoreAttivita } from './attivita.js';
import { htmlRicerca } from './filtri.js';
import { montaElenco, schedaInLista } from './lista.js';

const PER_PARCO = 4;

// Foto di parchi e animali (Wikimedia Commons)
function htmlFoto(chiave, alt) {
  const f = fotoDi(chiave);
  if (!f) return '<div class="foto vuota" aria-hidden="true"></div>';
  return `<img class="foto" src="${escapeHtml(f.url)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" />`;
}

// crediti solo nella foto a schermo pieno: nell'anteprima un piccolo "©"
function htmlCredito(chiave, titolo) {
  const f = fotoDi(chiave);
  return f ? htmlPulsanteCrediti({ url: f.url, autore: f.autore, licenza: f.licenza, pagina: f.pagina, titolo }) : '';
}

// attivita: { trekking, mtb, emtb } = quanti percorsi del parco sono adatti a ciascuna
function htmlParco(p, n, evidenziato, attivita) {
  const specie = p.animali.slice(0, 3).map((a) => ANIMALI[a]).join(', ');
  return `<li class="carta-foto ${evidenziato ? 'evidenziata' : ''}">
    <a class="carta-foto-link" href="#/parco/${encodeURIComponent(p.id)}">
      ${htmlFoto(p.id, p.nomeBreve)}
      <span class="carta-foto-testo">
        <span class="nome">${escapeHtml(p.nomeBreve)}</span>
        <span class="specie-parco">${escapeHtml(specie)}</span>
        <span class="carta-dati">${escapeHtml(p.regioni.join(' · '))} · <b>${n}</b> percorsi</span>
        <span class="parco-badge">${Object.entries(ATTIVITA)
          .filter(([k]) => attivita[k])
          .map(([k, nome]) => `<span title="${attivita[k]} percorsi adatti">${nome} ${attivita[k]}</span>`)
          .join('')}</span>
      </span>
    </a>
    ${htmlCredito(p.id, p.nomeBreve)}
  </li>`;
}

function htmlSpecie(r, scelta, evidenziata) {
  // i parchi su una riga sola (accorciata con i puntini); per esteso al passaggio del mouse
  const parchi = r.parchi.map((id) => parcoDa(id)?.nomeBreve).join(', ');
  return `<li class="carta-specie ${scelta ? 'scelta' : ''} ${evidenziata ? 'evidenziata' : ''}">
    <button type="button" class="carta-specie-bottone" data-specie="${r.animale}" aria-pressed="${scelta}" title="${escapeHtml(parchi)}">
      ${htmlFoto(r.animale, r.nome)}
      <span class="nome">${escapeHtml(r.nome)}</span>
      <span class="specie-percorsi">${r.percorsi ? `${r.percorsi} ${r.percorsi === 1 ? 'percorso' : 'percorsi'}` : 'nessun percorso'}</span>
      ${HABITAT[r.animale] ? `<span class="habitat">${escapeHtml(HABITAT[r.animale])}</span>` : ''}
      ${parchi ? `<span class="specie-parchi">${escapeHtml(parchi)}</span>` : ''}
    </button>
    ${htmlCredito(r.animale, r.nome)}
  </li>`;
}

export async function vistaHome(app) {
  const [tutti, tracce] = await Promise.all([tuttiISentieri(), tutteLeTracce()]);
  const sentieri = tutti.filter(diUnParco);
  const preparati = preparaPercorsi(sentieri, tracce);
  const st = stato.leggi();
  // per i badge dei parchi: percorsi non "non percorribili" per ciascuna attività
  const perAttivita = new Map(PARCHI.map((p) => [p.id, { trekking: 0, mtb: 0, emtb: 0 }]));
  for (const { sentiero, compat } of preparati) {
    for (const id of sentiero.parchi ?? [sentiero.parco]) {
      const conta = perAttivita.get(id);
      if (!conta) continue;
      for (const k of Object.keys(conta)) {
        const ok = k === 'trekking' ? sentiero.tipoPercorso !== 'itinerario_mtb' : compat[k].stato === 'percorribile' || compat[k].stato === 'con_limitazioni';
        if (ok) conta[k]++;
      }
    }
  }

  app.innerHTML = `
    <h1 class="titolo-pagina">Esplora i parchi</h1>
    ${htmlInvitoInstalla()}
    <a class="invito-meteo" href="#/domani"><span class="icona-meteo" aria-hidden="true">⛅</span><span><b>Dove vado domani?</b><span class="tenue piccolo">I percorsi migliori secondo il meteo, la durata e le tue preferenze</span></span></a>
    ${htmlSelettoreAttivita()}
    <div class="ricerca-home">${htmlRicerca(st.filtri.testo, 'Cerca parco, animale o percorso…')}</div>
    <p class="trovati tenue" hidden></p>

    <section class="sezione-home">
      <h2 class="titolo-sezione">Parchi</h2>
      <ul class="scorrimento parchi-foto"></ul>
    </section>

    <section class="sezione-home">
      <h2 class="titolo-sezione">Animali</h2>
      <p class="tenue piccolo">Tocca un animale per vedere i percorsi dove è stato osservato.</p>
      <ul class="scorrimento specie-foto"></ul>
    </section>

    <section class="sezione-home">
      <h2 class="titolo-sezione">Percorsi di osservazione</h2>
      <div class="osservazione"></div>
    </section>

    <section class="sezione-home">
      <h2 class="titolo-sezione">Tutti i percorsi</h2>
      <div id="elenco"></div>
    </section>

    <div class="scorciatoie">
      <a class="pillola" href="#/salvati">Salvati</a>
      <a class="pillola" href="#/giri">I miei giri</a>
      <a class="pillola" href="#/avvistamenti">I miei avvistamenti</a>
    </div>
    <a class="fab" href="#/nuovo" aria-label="Aggiungi sentiero">+</a>
  `;

  const ricerca = app.querySelector('.ricerca-home input');
  const trovati = app.querySelector('.trovati');
  const listaParchi = app.querySelector('.parchi-foto');
  const listaSpecie = app.querySelector('.specie-foto');
  const osservazione = app.querySelector('.osservazione');

  function disegna() {
    const s = stato.leggi();
    // parchi, animali e osservazione seguono l'attività scelta, non gli altri filtri dell'elenco
    const visibili = filtraPercorsi(preparati, { ...FILTRI_VUOTI }, s.attivita).map((p) => p.sentiero);
    const cercati = cercaParchiESpecie(s.filtri.testo);
    const nomi = [...cercati.parchi.map((id) => parcoDa(id).nomeBreve), ...cercati.specie.map((k) => ANIMALI[k])];
    trovati.hidden = !nomi.length;
    trovati.textContent = nomi.length ? `Trovati: ${nomi.join(', ')}` : '';

    // ciò che corrisponde alla ricerca viene prima
    const parchi = [...PARCHI].sort((a, b) => cercati.parchi.includes(b.id) - cercati.parchi.includes(a.id));
    listaParchi.innerHTML = parchi
      .map((p) => htmlParco(p, visibili.filter((x) => (x.parchi ?? [x.parco]).includes(p.id)).length, cercati.parchi.includes(p.id), perAttivita.get(p.id)))
      .join('');

    const specie = riepilogoSpecie(visibili).sort(
      (a, b) =>
        cercati.specie.includes(b.animale) - cercati.specie.includes(a.animale) ||
        (b.animale === s.specie) - (a.animale === s.specie) ||
        (b.percorsi > 0) - (a.percorsi > 0),
    );
    listaSpecie.innerHTML = specie.map((r) => htmlSpecie(r, r.animale === s.specie, cercati.specie.includes(r.animale))).join('');

    const gruppi = osservazionePerParco(visibili, s.specie);
    const conTraccia = new Map(preparati.map((p) => [p.sentiero.id, p]));
    osservazione.innerHTML = gruppi.length
      ? `${s.specie ? `<p class="tenue">Con <b>${escapeHtml(ANIMALI[s.specie])}</b> · <button type="button" class="link" data-azione="tutte-le-specie">tutti gli animali</button></p>` : ''}
        ${gruppi
          .map(
            (g) => `<div class="gruppo-parco">
              <h3>${escapeHtml(parcoDa(g.parco).nomeBreve)} <span class="tenue">· ${g.percorsi.length}</span></h3>
              <ul class="lista">${g.percorsi
                .slice(0, PER_PARCO)
                .map((x) => {
                  const p = conTraccia.get(x.id);
                  return schedaInLista(x, p?.traccia, false, p?.compat);
                })
                .join('')}</ul>
              ${g.percorsi.length > PER_PARCO ? `<a class="vedi-tutti" href="#/parco/${encodeURIComponent(g.parco)}">Vedi tutti i ${g.percorsi.length} nel parco ›</a>` : ''}
            </div>`,
          )
          .join('')}`
      : `<p class="vuoto">Nessun percorso di osservazione${s.specie ? ` con ${escapeHtml(ANIMALI[s.specie])}` : ''}${
          s.attivita !== 'trekking' ? ` per ${ATTIVITA[s.attivita]}: le uscite di osservazione sono quasi sempre a piedi` : ''
        }.${s.specie ? ' <button type="button" class="link" data-azione="tutte-le-specie">Tutti gli animali</button>' : ''}</p>`;
  }

  listaSpecie.addEventListener('click', (e) => {
    const k = e.target.closest('[data-specie]')?.dataset.specie;
    if (!k) return;
    stato.imposta({ specie: stato.leggi().specie === k ? '' : k });
    app.querySelector('.osservazione').closest('section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  app.addEventListener('click', (e) => {
    if (e.target.closest('[data-azione="tutte-le-specie"]')) stato.imposta({ specie: '' });
  });
  ricerca.addEventListener('input', () => stato.imposta({ filtri: { testo: ricerca.value } }));

  const elenco = montaElenco(app.querySelector('#elenco'), sentieri, tracce, { ricerca: false, serveUnFiltro: true });
  const scollegaAttivita = collegaSelettoreAttivita(app);
  const scollegaInstalla = collegaInstalla(app);
  const scollegaStato = stato.ascolta((s) => {
    if (ricerca.value !== s.filtri.testo && document.activeElement !== ricerca) ricerca.value = s.filtri.testo;
    disegna();
  });
  disegna();
  return () => {
    elenco.scollega();
    scollegaAttivita();
    scollegaInstalla();
    scollegaStato();
  };
}
