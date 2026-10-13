// Tendina dal basso trascinabile con il dito, con tre posizioni: chiusa, metà, aperta
// (src/lib/tendina.js decide dove si ferma). Si trascina dalla maniglia; con la lista già in cima,
// trascinare in giù sulla lista abbassa la tendina. Una spinta veloce in giù la chiude. Su schermi
// larghi la tendina è un pannello laterale: niente trascinamento.
// La tendina è sempre alta come "aperta" e si sposta in giù (transform): spostarla non ridisegna
// il contenuto (cambiarne l'altezza a ogni fotogramma sì, ed era a scatti sul telefono). La cornice
// intorno taglia la parte che finisce sotto la barra in basso.
import { posizioneFinale, altezzeTendina } from '../lib/tendina.js';

const SOGLIA_PX = 6; // sotto: è un tocco, non un trascinamento
const largo = () => window.matchMedia('(min-width: 1024px)').matches;

// foglio: la tendina; maniglia: la zona da trascinare; corpo: la parte che scorre;
// allaChiusura(): chi la apre e chiude (aria, pulsanti) sa che si è chiusa
export function tendinaTrascinabile(foglio, { maniglia, corpo, allaChiusura = () => {} }) {
  let posizione = 'chiusa';
  foglio.classList.add('trascinabile');

  // spazio tra la ricerca in alto e la barra in basso (l'altezza della cornice)
  const cornice = foglio.parentElement;
  function altezze() {
    return altezzeTendina((cornice?.clientHeight || window.innerHeight) - 72);
  }
  // spostamento in giù per avere `visibile` px di tendina
  const sposta = (visibile) => {
    const { aperta } = altezze();
    const giu = Math.max(0, aperta - visibile);
    foglio.style.transform = `translateY(${giu}px)`;
    return giu;
  };
  const visibileOra = () => altezze().aperta - (new DOMMatrixReadOnly(getComputedStyle(foglio).transform).m42 || 0);
  function pulisci() {
    foglio.style.height = '';
    foglio.style.transform = '';
    corpo.style.paddingBottom = '';
  }
  function vai(p) {
    const daChiusa = posizione === 'chiusa';
    posizione = p;
    if (largo()) return pulisci();
    if (p === 'chiusa') {
      pulisci();
      allaChiusura();
      return;
    }
    const a = altezze();
    foglio.style.height = `${a.aperta}px`;
    if (daChiusa) {
      // all'apertura sale dal basso
      foglio.classList.add('trascinando');
      sposta(0);
      void foglio.offsetHeight;
      foglio.classList.remove('trascinando');
    }
    const giu = sposta(a[p]);
    // la fine della lista resta raggiungibile anche a metà (la parte sotto la barra non si vede)
    corpo.style.paddingBottom = `${giu + 16}px`;
  }

  // --- trascinamento: altezza che segue il dito, poi la posizione più vicina (o la spinta) ---
  let inizio = null; // { y, h, t }
  let ultimi = []; // ultimi punti per la velocità
  const comincia = (y) => {
    inizio = { y, h: visibileOra(), t: performance.now() };
    ultimi = [{ y, t: inizio.t }];
    foglio.classList.add('trascinando');
  };
  const segui = (y) => {
    const { aperta } = altezze();
    sposta(Math.max(60, Math.min(aperta, inizio.h - (y - inizio.y))));
    ultimi.push({ y, t: performance.now() });
    if (ultimi.length > 6) ultimi.shift();
  };
  const finisci = () => {
    foglio.classList.remove('trascinando');
    const a = ultimi[0];
    const b = ultimi.at(-1);
    const velocita = b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0;
    const altezza = visibileOra();
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
      pulisci();
    },
    vai,
    posizione: () => posizione,
  };
}
