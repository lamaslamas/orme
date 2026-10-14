// Tendina dal basso, la stessa per tutti i fogli dell'app (Percorsi qui, Fauna, scheda del sentiero
// toccato, sentiero di OpenStreetMap, disegno): tre posizioni (chiusa, metà, aperta) e
// src/lib/tendina.js decide dove si ferma. Si trascina dalla maniglia; con la lista già in cima,
// trascinare in giù sulla lista abbassa la tendina; una spinta veloce in giù la chiude; un tocco sulla
// maniglia passa da metà ad aperta e viceversa. Su schermi larghi i fogli sono pannelli laterali:
// niente trascinamento.
// La tendina è alta come "aperta" e si sposta in giù (transform): spostarla non ridisegna il
// contenuto. Una cornice intorno taglia la parte che finisce sotto la barra in basso.
import { posizioneFinale, altezzeTendina, chiudereFinestra } from '../lib/tendina.js';

const SOGLIA_PX = 6; // sotto: è un tocco, non un trascinamento
const largo = () => window.matchMedia('(min-width: 1024px)').matches;

// la cornice: un riquadro fisso fino alla barra in basso, che taglia ciò che esce sotto
function cornice(foglio) {
  if (foglio.parentElement?.classList.contains('cornice-tendina')) return foglio.parentElement;
  const c = document.createElement('div');
  c.className = 'cornice-tendina';
  const z = getComputedStyle(foglio).zIndex;
  if (z && z !== 'auto') c.style.setProperty('--z-cornice', z);
  foglio.before(c);
  c.appendChild(foglio);
  return c;
}

// foglio: la tendina. maniglia: selettore della zona da trascinare (vale anche dopo che il contenuto
// è stato riscritto); corpo: selettore della parte che scorre (null = il foglio stesso).
// naturale: "aperta" è l'altezza del contenuto (fogli corti), non tutto lo schermo.
// chiudibile: false = la posizione più bassa è "metà" (il foglio del disegno resta sempre).
// quotaMeta: altezza di "metà" rispetto allo spazio disponibile; fineMeta: selettore dell'elemento
// che deve vedersi tutto a metà (es. il pulsante Salva): "metà" arriva fin lì.
// allaChiusura(): chi apre e chiude il foglio (aria, livelli, pulsanti) sa che si è chiuso.
export function tendinaTrascinabile(foglio, { maniglia = '.foglio-maniglia-zona', corpo = null, allaChiusura = () => {}, naturale = false, chiudibile = true, quotaMeta = 0.48, fineMeta = null } = {}) {
  let posizione = 'chiusa';
  foglio.classList.add('trascinabile');
  const contenitore = cornice(foglio);
  const corpoDi = () => (corpo ? foglio.querySelector(corpo) : foglio) ?? foglio;

  // altezza del contenuto, senza limiti (solo per i fogli "naturali")
  function contenuto() {
    const { height, transform } = foglio.style;
    const c = corpoDi();
    const margine = c.style.paddingBottom;
    foglio.style.height = 'auto';
    foglio.style.transform = 'none';
    c.style.paddingBottom = '';
    const h = foglio.scrollHeight;
    foglio.style.height = height;
    foglio.style.transform = transform;
    c.style.paddingBottom = margine;
    return h;
  }
  // spazio tra la ricerca in alto e la barra in basso (l'altezza della cornice)
  function altezze() {
    const spazio = (contenitore.clientHeight || window.innerHeight) - 72;
    const a = altezzeTendina(spazio);
    a.meta = Math.round(spazio * quotaMeta);
    if (naturale) a.aperta = Math.min(a.aperta, contenuto());
    const fine = fineMeta && foglio.querySelector(fineMeta);
    if (fine) a.meta = Math.round(fine.offsetTop + fine.offsetHeight + 14);
    a.meta = Math.min(a.meta, a.aperta);
    return a;
  }
  const sposta = (visibile, aperta) => {
    const giu = Math.max(0, aperta - visibile);
    foglio.style.transform = `translateY(${giu}px)`;
    return giu;
  };
  const visibileOra = () => (parseFloat(foglio.style.height) || foglio.getBoundingClientRect().height) - (new DOMMatrixReadOnly(getComputedStyle(foglio).transform).m42 || 0);
  function pulisci() {
    foglio.style.height = '';
    foglio.style.transform = '';
    corpoDi().style.paddingBottom = '';
    foglio.classList.remove('aperto');
  }
  function vai(p) {
    if (p === 'chiusa' && !chiudibile) p = 'meta';
    const daChiusa = posizione === 'chiusa';
    posizione = p;
    if (largo()) {
      pulisci();
      foglio.classList.toggle('aperto', p === 'aperta');
      return;
    }
    if (p === 'chiusa') {
      pulisci();
      allaChiusura();
      return;
    }
    // la classe prima di misurare: da aperto alcuni fogli mostrano di più (es. il profilo più alto)
    foglio.classList.toggle('aperto', p === 'aperta');
    const a = altezze();
    foglio.style.height = `${a.aperta}px`;
    if (daChiusa) {
      // all'apertura sale dal basso
      foglio.classList.add('trascinando');
      sposta(0, a.aperta);
      void foglio.offsetHeight;
      foglio.classList.remove('trascinando');
    }
    const giu = sposta(a[p], a.aperta);
    // la fine della lista resta raggiungibile anche a metà (la parte sotto la barra non si vede)
    corpoDi().style.paddingBottom = giu ? `${giu + 16}px` : '';
  }

  // --- trascinamento: la tendina segue il dito, poi la posizione più vicina (o la spinta) ---
  let inizio = null; // { y, h, aperta }
  let ultimi = []; // ultimi punti per la velocità
  const comincia = (y) => {
    inizio = { y, h: visibileOra(), aperta: altezze().aperta };
    ultimi = [{ y, t: performance.now() }];
    foglio.classList.add('trascinando');
  };
  const segui = (y) => {
    sposta(Math.max(60, Math.min(inizio.aperta, inizio.h - (y - inizio.y))), inizio.aperta);
    ultimi.push({ y, t: performance.now() });
    if (ultimi.length > 6) ultimi.shift();
  };
  const finisci = () => {
    foglio.classList.remove('trascinando');
    const a = ultimi[0];
    const b = ultimi.at(-1);
    const velocita = b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0;
    const altezza = visibileOra();
    const misure = altezze();
    inizio = null;
    vai(posizioneFinale({ altezza, velocita, altezze: misure }));
  };

  // dalla maniglia (anche dopo che il contenuto è stato riscritto)
  let daManiglia = null; // { tocco: true finché il dito non si sposta }
  foglio.addEventListener('pointerdown', (e) => {
    if (largo() || !e.target.closest(maniglia)) return;
    foglio.setPointerCapture?.(e.pointerId);
    daManiglia = { tocco: Boolean(e.target.closest('.foglio-maniglia-zona')) };
    comincia(e.clientY);
  });
  foglio.addEventListener('pointermove', (e) => {
    if (!daManiglia || !inizio) return;
    if (Math.abs(e.clientY - inizio.y) > SOGLIA_PX) daManiglia.tocco = false;
    segui(e.clientY);
  });
  const rilascia = (e) => {
    if (!daManiglia || !inizio) return;
    const tocco = daManiglia.tocco && Math.abs(e.clientY - inizio.y) <= SOGLIA_PX;
    daManiglia = null;
    if (!tocco) return finisci();
    foglio.classList.remove('trascinando');
    inizio = null;
    // un tocco sulla maniglia: da metà ad aperta e viceversa (un foglio corto, senza metà, si chiude)
    const a = altezze();
    if (a.meta >= a.aperta) vai(chiudibile ? 'chiusa' : 'meta');
    else vai(posizione === 'aperta' ? 'meta' : 'aperta');
  };
  foglio.addEventListener('pointerup', rilascia);
  foglio.addEventListener('pointercancel', rilascia);

  // dalla lista: solo se è già in cima e il dito va in giù
  let tocco = null; // { y, trascina, corpo }
  foglio.addEventListener(
    'touchstart',
    (e) => {
      if (largo() || e.touches.length !== 1 || e.target.closest(maniglia)) return;
      const c = corpoDi();
      if (!c.contains(e.target)) return;
      tocco = { y: e.touches[0].clientY, trascina: false, corpo: c };
    },
    { passive: true },
  );
  foglio.addEventListener(
    'touchmove',
    (e) => {
      if (!tocco) return;
      const y = e.touches[0].clientY;
      if (!tocco.trascina) {
        if (tocco.corpo.scrollTop > 0 || y - tocco.y < SOGLIA_PX) {
          if (Math.abs(y - tocco.y) >= SOGLIA_PX) tocco = null; // la lista scorre: non è la tendina
          return;
        }
        tocco.trascina = true;
        comincia(tocco.y);
      }
      e.preventDefault(); // la lista non scorre: si abbassa la tendina
      segui(y);
    },
    { passive: false },
  );
  const fineTocco = () => {
    if (tocco?.trascina) finisci();
    tocco = null;
  };
  foglio.addEventListener('touchend', fineTocco);
  foglio.addEventListener('touchcancel', fineTocco);

  // girando il telefono le altezze cambiano
  window.addEventListener('resize', () => posizione !== 'chiusa' && vai(posizione));
  // i fogli corti crescono o si accorciano quando arriva il contenuto (dettagli, dati da OSM)
  if (naturale) {
    let atteso = false;
    new MutationObserver(() => {
      if (atteso || posizione === 'chiusa' || inizio) return;
      atteso = true;
      requestAnimationFrame(() => {
        atteso = false;
        if (posizione !== 'chiusa' && !inizio) vai(posizione);
      });
    }).observe(foglio, { childList: true, subtree: true, characterData: true });
  }

  return {
    apri: (p = 'meta') => vai(p),
    chiudi: () => {
      posizione = 'chiusa';
      pulisci();
    },
    vai,
    posizione: () => posizione,
  };
}

// Finestra modale dal basso (Filtri, Salva il percorso): stessi gesti della tendina, ma due posizioni.
// Si trascina dalla maniglia o dal titolo, e dalla lista quando è in cima; oltre un terzo o con una
// spinta veloce in giù si chiude. Sul computer le finestre sono al centro: niente trascinamento.
export function finestraTrascinabile(finestra, { maniglia = '.foglio-maniglia, .foglio-titolo, .foglio-testa', corpo = null } = {}) {
  finestra.classList.add('finestra-trascinabile');
  // chiusa in qualunque modo (pulsante, tocco fuori, trascinamento): la prossima volta riparte su
  finestra.addEventListener('close', () => {
    finestra.style.transform = '';
    finestra.classList.remove('trascinando');
  });
  let inizio = null; // { y, h }
  let ultimi = [];
  const corpoDi = () => (corpo ? finestra.querySelector(corpo) : null) ?? finestra;
  const comincia = (y) => {
    inizio = { y, h: finestra.getBoundingClientRect().height };
    ultimi = [{ y, t: performance.now() }];
    finestra.classList.add('trascinando');
  };
  const segui = (y) => {
    finestra.style.transform = `translateY(${Math.max(0, y - inizio.y)}px)`;
    ultimi.push({ y, t: performance.now() });
    if (ultimi.length > 6) ultimi.shift();
  };
  const finisci = (y) => {
    finestra.classList.remove('trascinando');
    const a = ultimi[0];
    const b = ultimi.at(-1);
    const velocita = b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0;
    const chiudi = chiudereFinestra({ spostamento: Math.max(0, y - inizio.y), altezza: inizio.h, velocita });
    inizio = null;
    if (!chiudi) return void (finestra.style.transform = '');
    // scende fino in fondo, poi si chiude
    finestra.style.transform = 'translateY(100%)';
    const fine = () => {
      finestra.close();
      finestra.style.transform = '';
    };
    finestra.addEventListener('transitionend', fine, { once: true });
    setTimeout(() => finestra.open && fine(), 300);
  };
  let daManiglia = false;
  finestra.addEventListener('pointerdown', (e) => {
    if (largo() || !finestra.open || !e.target.closest(maniglia) || e.target.closest('button, a, input, select')) return;
    finestra.setPointerCapture?.(e.pointerId);
    daManiglia = true;
    comincia(e.clientY);
  });
  finestra.addEventListener('pointermove', (e) => daManiglia && inizio && segui(e.clientY));
  const rilascia = (e) => {
    if (!daManiglia || !inizio) return;
    daManiglia = false;
    finisci(e.clientY);
  };
  finestra.addEventListener('pointerup', rilascia);
  finestra.addEventListener('pointercancel', rilascia);

  let tocco = null;
  finestra.addEventListener(
    'touchstart',
    (e) => {
      if (largo() || e.touches.length !== 1 || e.target.closest(maniglia)) return;
      tocco = { y: e.touches[0].clientY, trascina: false, corpo: corpoDi() };
    },
    { passive: true },
  );
  finestra.addEventListener(
    'touchmove',
    (e) => {
      if (!tocco) return;
      const y = e.touches[0].clientY;
      if (!tocco.trascina) {
        if (tocco.corpo.scrollTop > 0 || y - tocco.y < SOGLIA_PX) {
          if (Math.abs(y - tocco.y) >= SOGLIA_PX) tocco = null;
          return;
        }
        tocco.trascina = true;
        comincia(tocco.y);
      }
      e.preventDefault();
      segui(y);
      tocco.ultimaY = y;
    },
    { passive: false },
  );
  const fineTocco = () => {
    if (tocco?.trascina) finisci(tocco.ultimaY ?? tocco.y);
    tocco = null;
  };
  finestra.addEventListener('touchend', fineTocco);
  finestra.addEventListener('touchcancel', fineTocco);
}
