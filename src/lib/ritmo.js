// Il ritmo di cammino: i tempi CAI sono senza soste. "Con soste" li allunga del 25%, "Fotografico" del 75% (per chi
// si ferma spesso ad aspettare la luce o ad appostarsi). Si sceglie una volta, si ricorda sul telefono e vale in tutta
// l'app: durata, orari di rientro, «parti entro», luce e fotografia, su più giorni (anche il punto di fine
// giornata) e Suggerisci.
export const RITMI = {
  senza: { nome: 'Senza soste', fattore: 1, testo: 'Tempi CAI senza soste' },
  soste: { nome: 'Con soste', fattore: 1.25, testo: 'Tempi CAI con soste (+25%)' },
  fotografico: { nome: 'Fotografico', fattore: 1.75, testo: 'Ritmo fotografico (+75%): tempi CAI con molte soste' },
};
const CHIAVE = 'orme.ritmo';

function leggi() {
  try {
    const v = globalThis.localStorage?.getItem(CHIAVE);
    return RITMI[v] ? v : 'senza';
  } catch {
    return 'senza';
  }
}
let corrente = leggi();

export const ritmoScelto = () => corrente;
export const fattoreRitmo = () => RITMI[corrente].fattore;
export const testoRitmo = () => RITMI[corrente].testo;
export function impostaRitmo(k) {
  if (!RITMI[k]) return;
  corrente = k;
  try {
    globalThis.localStorage?.setItem(CHIAVE, k);
  } catch {
    // vale solo per questa visita
  }
}
// solo per le prove
export const rileggiRitmo = () => (corrente = leggi());
