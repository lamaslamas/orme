// «2 giorni con notte»: le due giornate si calcolano dalla luce, non dalla metà del cammino.
// - Primo giorno: parte all'ora scelta e finisce al più tardi al tramonto meno 30 minuti (tempi con il ritmo scelto).
// - Secondo giorno: parte alle 8:00 (all'alba se il percorso ha un tratto con più fauna, come in «Luce e fotografia»)
//   e dura al più fino al tramonto meno 30 minuti.
// - Si dorme in un posto raggiunto entro la fine del primo giorno, da cui il secondo basta per finire.
// - La fatica scelta vale per ciascuna giornata, non per il totale.
import { minutiAlKm } from './fotografia.js';
import { dislivello } from './quote.js';
import { MARGINE_TRAMONTO_MIN } from './quandoAndare.js';
import { stimaDurataMin } from './durata.js';
import { durataInBici } from './condizioni.js';

export const PARTENZA_SECONDO_GIORNO_MIN = 8 * 60;

// salita e discesa tra due km del cammino (serie: profiloTempi dei pezzi percorsi); null senza quote
export function dislivelloTra(serie, daKm, aKm) {
  const punti = [];
  serie.km.forEach((k, i) => {
    if (k >= daKm - 1e-9 && k <= aKm + 1e-9) punti.push(serie.punti[i]);
  });
  const d = punti.length > 1 ? dislivello([punti]) : null;
  return d ? { salita: d.salita, discesa: d.discesa } : { salita: null, discesa: null };
}

export const PRIMO_GIORNO_MINIMO_MIN = 30; // sotto, non è un primo giorno: è «notte vicino alla partenza»

// Il tempo per andare dalla traccia al posto per dormire (e, il giorno dopo, per tornare): a piedi, con il ritmo scelto
// (stimaDurataMin) e il dislivello se lo si conosce ({ salita, discesa } dal punto della traccia al posto)
// In MTB la deviazione si fa in bici (stessi tempi della bici: 12 km/h, 400 m/h in salita).
export function tempoDeviazione(distanzaM, dislivelloAndata = null, attivita = 'trekking') {
  if (!Number.isFinite(distanzaM) || distanzaM < 30) return { andataMin: 0, ritornoMin: 0 };
  const km = distanzaM / 1000;
  const ritorno = dislivelloAndata ? { salita: dislivelloAndata.discesa ?? 0, discesa: dislivelloAndata.salita ?? 0 } : null;
  if (attivita === 'mtb') return { andataMin: durataInBici(km, dislivelloAndata?.salita ?? null, 'mtb') ?? 0, ritornoMin: durataInBici(km, ritorno?.salita ?? null, 'mtb') ?? 0 };
  return { andataMin: stimaDurataMin(km, dislivelloAndata), ritornoMin: stimaDurataMin(km, ritorno) };
}

// Il tratto (km sull'andata) cade nella parte del cammino dopo la notte? (cammino: andata, e con A/R anche il ritorno)
function tratto2(tratto, kmPosto, lunghezzaKm, conRitorno) {
  if (!tratto) return false;
  const sull = tratto.aKm > kmPosto; // andata dopo il posto
  const alRitorno = conRitorno && 2 * lunghezzaKm - tratto.daKm > kmPosto; // ritorno dopo il posto
  return sull || alRitorno;
}

// serie: profiloTempi(cammino); posti: [{ km (sull'andata), distanzaM, ...}]; lunghezzaKm: dell'andata; conRitorno: A/R
// sole1 / sole2: { alba, tramonto } in minuti dalla mezzanotte del giorno stesso; tratto: { daKm, aKm } con più fauna
// dislivelloDeviazione(p): { salita, discesa } dal punto della traccia al posto, se noto
// → { ok, motivo?, tipo: 'due-giorni' | 'notte-vicina', posto, kmPosto, giorno1?, giorno2 }
export function pianoDueGiorni({ serie, posti, lunghezzaKm, conRitorno, partenzaMin, sole1, sole2, tratto = null, dislivelloDeviazione = () => null, margineMin = MARGINE_TRAMONTO_MIN, attivita = 'trekking' }) {
  const totale = serie.min.at(-1) ?? 0;
  const fine1 = (sole1?.tramonto ?? Infinity) - margineMin;
  const fine2 = (sole2?.tramonto ?? Infinity) - margineMin;
  const inizio2 = (alba) => (alba ? sole2?.alba ?? PARTENZA_SECONDO_GIORNO_MIN : PARTENZA_SECONDO_GIORNO_MIN);
  const d1 = fine1 - partenzaMin; // minuti di cammino possibili il primo giorno
  const d2max = fine2 - inizio2(Boolean(tratto)); // il secondo, al più (con l'alba se c'è il tratto)
  if (totale <= d1) return { ok: false, motivo: 'breve', d1, d2: d2max }; // si fa in un giorno: non serve la notte
  if (totale > d1 + d2max) return { ok: false, motivo: 'troppo-lungo', d1, d2: d2max };
  if (!posti?.length) return { ok: false, motivo: 'nessun-posto', d1, d2: d2max };
  // il posto si può trovare sull'andata o, con A/R, anche al ritorno (stesso punto, km 2L − km)
  const candidati = posti.flatMap((p) => [{ p, kmCammino: p.km }, ...(conRitorno ? [{ p, kmCammino: 2 * lunghezzaKm - p.km }] : [])]);
  const valutati = candidati
    .map((c) => {
      const t = minutiAlKm(serie, c.kmCammino);
      const dev = tempoDeviazione(c.p.distanzaM, dislivelloDeviazione(c.p), attivita);
      const alba = tratto2(tratto, c.kmCammino, lunghezzaKm, conRitorno);
      const ini2 = inizio2(alba);
      return { ...c, t1: t, dev, alba, ini2, d2: fine2 - ini2 };
    })
    .filter((c) => c.t1 != null);
  // il primo giorno comprende il cammino e la deviazione per arrivare al posto; il secondo la deviazione per tornare in traccia
  const raggiungibili = valutati.filter((c) => c.t1 + c.dev.andataMin <= d1);
  if (!raggiungibili.length) return { ok: false, motivo: 'luce', d1, d2: d2max }; // i posti ci sono, ma dopo il tramonto
  const giusti = raggiungibili.filter((c) => totale - c.t1 + c.dev.ritornoMin <= c.d2);
  if (!giusti.length) return { ok: false, motivo: 'troppo-lungo', d1, d2: d2max };
  // il più vicino alla fine del primo giorno (così il secondo è il più corto)
  const scelto = giusti.sort((a, b) => b.t1 + b.dev.andataMin - (a.t1 + a.dev.andataMin))[0];
  const dis1 = dislivelloTra(serie, 0, scelto.kmCammino);
  const dis2 = dislivelloTra(serie, scelto.kmCammino, serie.km.at(-1));
  const durata1 = Math.round(scelto.t1 + scelto.dev.andataMin);
  const durata2 = Math.round(totale - scelto.t1 + scelto.dev.ritornoMin);
  const base = { ok: true, posto: scelto.p, kmPosto: scelto.kmCammino, d1, d2: scelto.d2, deviazione: scelto.dev };
  const giorno2 = { daMin: scelto.ini2, aMin: scelto.ini2 + durata2, durataMin: durata2, km: serie.km.at(-1) - scelto.kmCammino, ...dis2, deviazioneMin: Math.round(scelto.dev.ritornoMin), dallAlba: scelto.alba };
  // primo giorno sotto i 30 minuti: si dorme vicino alla partenza e il giorno dopo si fa tutto il percorso (se ci sta)
  if (durata1 < PRIMO_GIORNO_MINIMO_MIN) {
    const ini = inizio2(Boolean(tratto));
    const tutto = Math.round(totale + scelto.dev.andataMin + scelto.dev.ritornoMin);
    if (tutto <= fine2 - ini) {
      return {
        ...base,
        tipo: 'notte-vicina',
        kmPosto: 0,
        giorno1: null,
        giorno2: { daMin: ini, aMin: ini + tutto, durataMin: tutto, km: serie.km.at(-1), ...dislivelloTra(serie, 0, serie.km.at(-1)), deviazioneMin: Math.round(scelto.dev.andataMin + scelto.dev.ritornoMin), dallAlba: Boolean(tratto) },
      };
    }
  }
  return {
    ...base,
    tipo: 'due-giorni',
    giorno1: { daMin: partenzaMin, aMin: partenzaMin + durata1, durataMin: durata1, km: scelto.kmCammino, ...dis1, deviazioneMin: Math.round(scelto.dev.andataMin) },
    giorno2,
  };
}

// Ordine dei piani con la notte: prima quelli in cui il secondo giorno passa dal tratto con più fauna all'alba, poi le
// giornate più equilibrate (durata dei due giorni simile: a fasce di 30 minuti, così «a parità» ha un senso), e a parità
// la deviazione per dormire più corta (andata + ritorno); una deviazione oltre 1 ora in tutto va dopo le altre
export const FASCIA_EQUILIBRIO_MIN = 30;
export const DEVIAZIONE_LUNGA_MIN = 60;
export function chiaveOrdineNotte(notte) {
  if (!notte) return [2, Infinity, 1, Infinity];
  const alba = notte.giorno2?.dallAlba ? 0 : 1;
  const sbilancio = notte.giorno1 ? Math.floor(Math.abs(notte.giorno1.durataMin - notte.giorno2.durataMin) / FASCIA_EQUILIBRIO_MIN) : Infinity;
  const deviazione = (notte.giorno1?.deviazioneMin ?? 0) + (notte.giorno2?.deviazioneMin ?? 0);
  return [alba, sbilancio, deviazione > DEVIAZIONE_LUNGA_MIN ? 1 : 0, deviazione];
}
export const confrontaNotte = (a, b) => {
  const x = chiaveOrdineNotte(a);
  const y = chiaveOrdineNotte(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
};
