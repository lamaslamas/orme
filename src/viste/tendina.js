// Tendina dal basso trascinabile con il dito, con tre posizioni: chiusa, metà, aperta
// (src/lib/tendina.js decide dove si ferma). Si trascina dalla maniglia; con la lista già in cima,
// trascinare in giù sulla lista abbassa la tendina. Una spinta veloce in giù la chiude. Su schermi
// larghi la tendina è un pannello laterale: niente trascinamento.
import { posizioneFinale, altezzeTendina } from '../lib/tendina.js';

const SOGLIA_PX = 6; // sotto: è un tocco, non un trascinamento
const largo = () => window.matchMedia('(min-width: 1024px)').matches;

// foglio: la tendina; maniglia: la zona da trascinare; corpo: la parte che scorre;
// allaChiusura(): chi la apre e chiude (aria, pulsanti) sa che si è chiusa
export function tendinaTrascinabile(foglio, { maniglia, corpo, allaChiusura = () => {} }) {
  let posizione = 'chiusa';
  foglio.classList.add('trascinabile');

  // spazio tra la ricerca in alto e la barra in basso
  function altezze() {
    const sotto = parseFloat(getComputedStyle(foglio).bottom) || 0;
    return altezzeTendina(window.innerHeight - sotto - 72);
  }
  function vai(p) {
    posizione = p;
    if (largo()) {
      foglio.style.height = '';
      return;
    }
    if (p === 'chiusa') {
      foglio.style.height = '';
      allaChiusura();
      return;
    }
    foglio.style.height = `${altezze()[p]}px`;
  }

  // --- trascinamento: altezza che segue il dito, poi la posizione più vicina (o la spinta) ---
  let inizio = null; // { y, h, t }
  let ultimi = []; // ultimi punti per la velocità
  const comincia = (y) => {
    inizio = { y, h: foglio.getBoundingClientRect().height, t: performance.now() };
    ultimi = [{ y, t: inizio.t }];
    foglio.classList.add('trascinando');
  };
  const segui = (y) => {
    const { aperta } = altezze();
    foglio.style.height = `${Math.max(60, Math.min(aperta, inizio.h - (y - inizio.y)))}px`;
    ultimi.push({ y, t: performance.now() });
    if (ultimi.length > 6) ultimi.shift();
  };
  const finisci = () => {
    foglio.classList.remove('trascinando');
    const a = ultimi[0];
    const b = ultimi.at(-1);
    const velocita = b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0;
    const altezza = foglio.getBoundingClientRect().height;
    inizio = null;
    vai(posizioneFinale({ altezza, velocita, altezze: altezze() }));
  };

  // dalla maniglia: un tocco passa da metà ad aperta e viceversa, un trascinamento la sposta
  maniglia.addEventListener('pointerdown', (e) => {
    if (largo()) return;
    maniglia.setPointerCapture?.(e.pointerId);
    comincia(e.clientY);
  });
  maniglia.addEventListener('pointermove', (e) => inizio && segui(e.clientY));
  const rilascia = (e) => {
    if (!inizio) return;
    const mosso = Math.abs(e.clientY - inizio.y) > SOGLIA_PX;
    if (mosso) return finisci();
    foglio.classList.remove('trascinando');
    inizio = null;
    vai(posizione === 'aperta' ? 'meta' : 'aperta');
  };
  maniglia.addEventListener('pointerup', rilascia);
  maniglia.addEventListener('pointercancel', rilascia);
  // il clic che segue il tocco sulla maniglia non deve fare altro
  maniglia.addEventListener('click', (e) => e.preventDefault());

  // dalla lista: solo se è già in cima e il dito va in giù
  let tocco = null; // { y, trascina }
  corpo.addEventListener(
    'touchstart',
    (e) => {
      if (largo() || e.touches.length !== 1) return;
      tocco = { y: e.touches[0].clientY, trascina: false };
    },
    { passive: true },
  );
  corpo.addEventListener(
    'touchmove',
    (e) => {
      if (!tocco) return;
      const y = e.touches[0].clientY;
      if (!tocco.trascina) {
        if (corpo.scrollTop > 0 || y - tocco.y < SOGLIA_PX) {
          if (Math.abs(y - tocco.y) >= SOGLIA_PX) tocco = null; // la lista scorre: non è un trascinamento
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
  corpo.addEventListener('touchend', fineTocco);
  corpo.addEventListener('touchcancel', fineTocco);

  // girando il telefono le altezze cambiano
  window.addEventListener('resize', () => posizione !== 'chiusa' && vai(posizione));

  return {
    apri: (p = 'meta') => vai(p),
    chiudi: () => {
      posizione = 'chiusa';
      foglio.style.height = '';
    },
    vai,
    posizione: () => posizione,
  };
}
