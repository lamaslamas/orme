// Su telefono: toccando un percorso sulla mappa si alza un foglio dal basso, sopra la mappa.
// Ridotto: nome, numeri, fauna e Salva / Portami / Apri la scheda. Trascinato in su: anche foto,
// difficoltà, avvertenze, rifugi e acqua, panorama. In giù (o un tocco sulla mappa) si chiude.
import L from 'leaflet';
import { tendinaTrascinabile } from './tendina.js';
import { escapeHtml, codici, durata } from '../lib/formato.js';
import { misureSentiero, testoIncompleta } from '../lib/riassunto.js';
import { ACCESSI } from '../lib/costanti.js';
import { puntoDiPartenza, linkGoogleMaps, linkGeo } from '../lib/navigazione.js';
import { puntiLungoIlPercorso, riassuntoPunti } from '../lib/puntiUtili.js';
import { leggiSentiero, salvaSentiero } from '../db.js';
import { iniziaBozza, aggiungiABozza, impostaAperturaDisegno, aperturaDaMappa } from '../lib/bozza.js';
import { htmlFaunaBreve } from './faunaBreve.js';
import { copertina } from './daVedere.js';
import { caricaPunti } from './puntiUtili.js';
import { ICONE } from './icone.js';

export const suTelefono = () => Boolean(globalThis.matchMedia?.('(max-width: 1023.98px)').matches);

const DIFFICOLTA = { T: 'T · turistico', E: 'E · escursionistico', EE: 'EE · per esperti', EEA: 'EEA · con attrezzatura' };
// accesso regolato (guida, numero chiuso, chiusure): un avviso prima di partire
const REGOLATO = ['guida', 'numero_chiuso', 'chiusure_periodiche'];

// difficoltà CAI e accesso, sempre visibili; avviso se l'accesso è regolato
function htmlAccesso(s) {
  const tipo = s.accesso?.tipo || 'nessuno';
  const chip = [
    s.difficolta ? `<span class="chip">${escapeHtml(DIFFICOLTA[s.difficolta] ?? s.difficolta)}</span>` : '',
    `<span class="chip ${REGOLATO.includes(tipo) ? 'chip-accesso' : ''}">${escapeHtml(tipo === 'nessuno' ? 'Accesso non indicato' : ACCESSI[tipo] ?? tipo)}</span>`,
  ].join('');
  const avviso = REGOLATO.includes(tipo)
    ? `<p class="avviso-via">${ICONE.avviso}<span>Accesso regolato (${escapeHtml(ACCESSI[tipo].toLowerCase())}): verifica e prenota prima di partire.</span></p>`
    : '';
  return `<div class="chips">${chip}</div>${avviso}`;
}

// altriItinerari(latlng): se c'è, un link apre gli itinerari segnati OSM del punto toccato (da scaricare)
export function creaFoglioPercorso(mappa, { allaChiusura = () => {}, nota = () => '', extra = () => '', altriItinerari = null } = {}) {
  const foglio = document.createElement('section');
  foglio.className = 'foglio-percorso';
  foglio.hidden = true;
  foglio.setAttribute('aria-label', 'Percorso scelto');
  document.body.appendChild(foglio);
  let attuale = null; // { sentiero, traccia }

  // la stessa tendina di "Percorsi qui" (alta quanto il contenuto): si trascina anche dal nome
  const tendina = tendinaTrascinabile(foglio, { maniglia: '.foglio-maniglia-zona, .foglio-nome', corpo: '.foglio-corpo', naturale: true, fineMeta: '.foglio-azioni:not(.due)', allaChiusura: () => chiudi() });

  function chiudi() {
    if (foglio.hidden) return;
    foglio.hidden = true;
    tendina.chiudi();
    attuale = null;
    allaChiusura();
  }

  async function dettagli(s, traccia) {
    const el = foglio.querySelector('.foglio-dettagli');
    const foto = copertina(s, traccia);
    // difficoltà e accesso sono già in alto
    const etichette = s.daVerificare ? '<span class="chip chip-verifica">Da verificare</span>' : '';
    el.innerHTML = `
      ${foto ? `<img class="foglio-foto" src="${escapeHtml(foto.url)}" alt="" loading="lazy" />` : ''}
      ${etichette ? `<div class="chips">${etichette}</div>` : ''}
      <p class="foglio-righe"><span class="punti-foglio tenue">Rifugi e acqua: …</span>${
        s.panorama ? `<span>${ICONE.sole}Panorama ${s.panorama.punteggio}/100</span>` : ''
      }</p>`;
    // rifugi e acqua lungo il percorso (dati già sul telefono)
    const punti = await caricaPunti();
    if (attuale?.sentiero.id !== s.id) return;
    const vicini = punti && traccia?.geojson ? puntiLungoIlPercorso(punti, traccia.geojson) : [];
    const testo = el.querySelector('.punti-foglio');
    if (testo) testo.innerHTML = `${ICONE.goccia}${vicini.length ? escapeHtml(riassuntoPunti(vicini)) : 'Niente rifugi né acqua vicino'}`;
  }

  // tocco: [lat, lng] del punto toccato, per "Inizia da qui" (senza, la partenza del percorso)
  function mostra(s, traccia, tocco = null) {
    attuale = { sentiero: s, traccia, tocco: tocco ? [Number(tocco.lng.toFixed(6)), Number(tocco.lat.toFixed(6))] : null };
    const m = misureSentiero(s, traccia);
    const id = encodeURIComponent(s.id);
    const punto = puntoDiPartenza(s, traccia);
    const dati = [
      m.km != null ? `<span>${ICONE.percorso}${m.km.toFixed(1).replace('.', ',')} km</span>` : '',
      m.salita != null ? `<span>${ICONE.salita}${m.salita} m</span>` : '',
      m.durataMin != null ? `<span>${ICONE.orologio}${m.durataStimata ? '~' : ''}${durata(m.durataMin)}</span>` : '',
      nota(s) ? `<span>${escapeHtml(nota(s))}</span>` : '',
    ].join('');
    foglio.innerHTML = `
      <button type="button" class="foglio-maniglia-zona" aria-label="Trascina per aprire, abbassare o chiudere"><span class="foglio-maniglia"></span></button>
      <div class="foglio-corpo">
        <p class="foglio-nome">${s.codici?.length ? `<span class="codice">${escapeHtml(codici(s))}</span> ` : ''}<b>${escapeHtml(s.nome)}</b></p>
        ${dati ? `<span class="dati-icone">${dati}</span>` : ''}
        ${testoIncompleta(m) ? `<p class="avviso-incompleta">${ICONE.avviso}<span>${testoIncompleta(m)}: i numeri sono quelli della fonte.</span></p>` : ''}
        ${htmlFaunaBreve(s, { compatta: true })}
        ${htmlAccesso(s)}
        ${extra(s)}
        <div class="foglio-azioni due">
          <button type="button" class="bottone primario" data-azione="inizia">${ICONE.bandierina}<span>Inizia da qui</span></button>
          <button type="button" class="bottone" data-azione="aggiungi">${ICONE.percorso}<span>Aggiungi</span></button>
        </div>
        <div class="foglio-azioni">
          <button type="button" class="bottone ${s.salvato ? 'salvato' : ''}" data-azione="salva" aria-pressed="${Boolean(s.salvato)}">${ICONE.segnalibro}<span>${s.salvato ? 'Salvato' : 'Salva'}</span></button>
          ${punto ? `<button type="button" class="bottone" data-azione="portami">${ICONE.navigazione}<span>Portami</span></button>` : ''}
          <a class="bottone primario" href="#/sentiero/${id}">Apri la scheda</a>
        </div>
        ${altriItinerari && tocco ? '<button type="button" class="bottone testo piccolo" data-azione="itinerari">Altri itinerari segnati su questo tratto</button>' : ''}
        ${
          punto
            ? `<div class="foglio-portami" hidden>
          <a class="bottone" href="${linkGoogleMaps(punto, 'auto')}" target="_blank" rel="noopener">In auto</a>
          <a class="bottone" href="${linkGoogleMaps(punto, 'piedi')}" target="_blank" rel="noopener">A piedi</a>
          <a class="bottone testo" href="${linkGeo(punto)}">Altra app</a>
        </div>`
            : ''
        }
        <div class="foglio-dettagli"></div>
      </div>`;
    const eraChiuso = foglio.hidden;
    foglio.hidden = false;
    // un percorso nuovo riparte da metà; la tendina si adegua al contenuto
    tendina.vai(eraChiuso ? 'meta' : tendina.posizione() === 'chiusa' ? 'meta' : tendina.posizione());
    dettagli(s, traccia);
  }

  foglio.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.classList.contains('foglio-maniglia-zona')) return; // la maniglia è della tendina
    else if ((b.dataset.azione === 'inizia' || b.dataset.azione === 'aggiungi') && attuale) {
      const p = attuale.tocco ?? puntoDiPartenza(attuale.sentiero, attuale.traccia);
      if (!p) return;
      const punto = Array.isArray(p) ? p : [p.lon, p.lat];
      if (b.dataset.azione === 'inizia') iniziaBozza(punto);
      else aggiungiABozza(punto);
      impostaAperturaDisegno(aperturaDaMappa(mappa, punto)); // la vista della mappa, centrata su quel punto
      location.hash = '#/percorso-nuovo';
    } else if (b.dataset.azione === 'itinerari' && attuale?.tocco) {
      const [lng, lat] = attuale.tocco;
      chiudi();
      altriItinerari(L.latLng(lat, lng));
    } else if (b.dataset.azione === 'portami') foglio.querySelector('.foglio-portami').hidden = !foglio.querySelector('.foglio-portami').hidden;
    else if (b.dataset.azione === 'salva' && attuale) {
      const s = await leggiSentiero(attuale.sentiero.id);
      if (!s) return;
      const salvato = s.salvato ? null : new Date().toISOString().slice(0, 10);
      await salvaSentiero({ ...s, salvato });
      attuale.sentiero = { ...attuale.sentiero, salvato };
      b.classList.toggle('salvato', Boolean(salvato));
      b.setAttribute('aria-pressed', String(Boolean(salvato)));
      b.querySelector('span').textContent = salvato ? 'Salvato' : 'Salva';
    }
  });



  // un tocco su un punto vuoto della mappa chiude il foglio e serve solo a quello (la heatmap
  // non apre le osservazioni); un tocco vicino a una traccia apre quella
  mappa.foglioAppenaChiuso = () => Date.now() - chiusoAlle < 500;
  let chiusoAlle = 0;
  mappa.on('click', (e) => {
    if (foglio.hidden || mappa.percorsoVicino?.(e.latlng)) return;
    chiusoAlle = Date.now();
    chiudi();
  });
  mappa.on('unload', () => foglio.remove());

  return { mostra, chiudi, aperto: () => !foglio.hidden };
}
