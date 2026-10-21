// «2 giorni con notte»: le due giornate si calcolano dalla luce, non dalla metà del cammino.
// - Primo giorno: parte all'ora scelta e finisce al più tardi al tramonto meno 30 minuti (tempi con il ritmo scelto).
// - Secondo giorno: parte alle 8:00 (all'alba se il percorso ha un tratto con più fauna, come in «Luce e fotografia»)
//   e dura al più fino al tramonto meno 30 minuti.
// - Si dorme in un posto raggiunto entro la fine del primo giorno, da cui il secondo basta per finire.
// - La fatica scelta vale per ciascuna giornata, non per il totale.
import { minutiAlKm } from './fotografia.js';
import { dislivello } from './quote.js';
import { MARGINE_TRAMONTO_MIN } from './quandoAndare.js';

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

// serie: profiloTempi(cammino); posti: [{ km (sull'andata), ... }]; lunghezzaKm: dell'andata; conRitorno: A/R
// sole1 / sole2: { alba, tramonto } in minuti dalla mezzanotte del giorno stesso
// → { ok, motivo?, posto, kmPosto, giorno1, giorno2 }
export function pianoDueGiorni({ serie, posti, lunghezzaKm, conRitorno, partenzaMin, sole1, sole2, trattoFauna = false, margineMin = MARGINE_TRAMONTO_MIN }) {
  const totale = serie.min.at(-1) ?? 0;
  const fine1 = (sole1?.tramonto ?? Infinity) - margineMin;
  const inizio2 = trattoFauna && sole2?.alba != null ? sole2.alba : PARTENZA_SECONDO_GIORNO_MIN;
  const fine2 = (sole2?.tramonto ?? Infinity) - margineMin;
  const d1 = fine1 - partenzaMin; // minuti di cammino possibili il primo giorno
  const d2 = fine2 - inizio2; // e il secondo
  if (totale <= d1) return { ok: false, motivo: 'breve', d1, d2 }; // si fa in un giorno: non serve la notte
  if (totale > d1 + d2) return { ok: false, motivo: 'troppo-lungo', d1, d2 };
  if (!posti?.length) return { ok: false, motivo: 'nessun-posto', d1, d2 };
  // il posto si può trovare sull'andata o, con A/R, anche al ritorno (stesso punto, km 2L − km)
  const candidati = posti.flatMap((p) => [{ p, kmCammino: p.km }, ...(conRitorno ? [{ p, kmCammino: 2 * lunghezzaKm - p.km }] : [])]);
  const conTempi = candidati.map((c) => ({ ...c, t1: minutiAlKm(serie, c.kmCammino) })).filter((c) => c.t1 != null);
  const raggiungibili = conTempi.filter((c) => c.t1 <= d1);
  if (!raggiungibili.length) return { ok: false, motivo: 'luce', d1, d2 }; // i posti ci sono, ma dopo il tramonto
  const giusti = raggiungibili.filter((c) => totale - c.t1 <= d2);
  if (!giusti.length) return { ok: false, motivo: 'troppo-lungo', d1, d2 };
  // il più vicino alla fine del primo giorno (così il secondo è il più corto)
  const scelto = giusti.sort((a, b) => b.t1 - a.t1)[0];
  const t1 = scelto.t1;
  const dis1 = dislivelloTra(serie, 0, scelto.kmCammino);
  const dis2 = dislivelloTra(serie, scelto.kmCammino, serie.km.at(-1));
  return {
    ok: true,
    posto: scelto.p,
    kmPosto: scelto.kmCammino,
    giorno1: { daMin: partenzaMin, aMin: partenzaMin + t1, durataMin: Math.round(t1), km: scelto.kmCammino, ...dis1 },
    giorno2: { daMin: inizio2, aMin: inizio2 + (totale - t1), durataMin: Math.round(totale - t1), km: serie.km.at(-1) - scelto.kmCammino, ...dis2, dallAlba: trattoFauna },
    d1,
    d2,
  };
}
