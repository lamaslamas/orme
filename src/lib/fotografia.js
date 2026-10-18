// Fotografia naturalistica: a che ora partire per essere in un punto del percorso all'alba o al tramonto,
// e quanto del cammino cade al buio. Solo calcoli sul telefono (sole: src/lib/sole.js; tempi: metodo CAI).
import { luciDelGiorno, minutiItaliani } from './sole.js';

export const ANTICIPO_ALBA_MIN = 20; // si arriva e ci si prepara prima che il sole sorga
export const SOSTA_TRAMONTO = 'oro'; // al tramonto si arriva all'inizio dell'ora d'oro e si resta fino al tramonto
export const ARROTONDA_MIN = 5;

// Orari del giorno in minuti dalla mezzanotte italiana (null se il sole non sorge o non tramonta)
export function orariDelGiorno(data, punto) {
  const l = luciDelGiorno(data, punto);
  const m = {};
  for (const [k, d] of Object.entries(l)) m[k] = minutiItaliani(d);
  return m;
}

// Minuti di cammino dalla partenza al km dato (serie: profiloTempi), interpolando
export function minutiAlKm(serie, km) {
  const { km: ks, min } = serie ?? {};
  if (!ks?.length) return null;
  if (km <= 0) return 0;
  const i = ks.findIndex((k) => k >= km);
  if (i < 0) return min.at(-1);
  if (i === 0) return min[0];
  const f = (km - ks[i - 1]) / (ks[i] - ks[i - 1] || 1);
  return min[i - 1] + (min[i] - min[i - 1]) * f;
}

const sotto = (min, soglia) => Math.max(0, Math.min(min, soglia));

// evento: 'alba' | 'tramonto'; km: dove si vuole essere (lungo l'andata)
// serieAndata / serieRitorno: profiloTempi dell'andata e del ritorno (senza ritorno = senza rientro);
// orari: orariDelGiorno. Restituisce partenza, arrivo, quanto cammino al buio, avvisi.
export function pianoFoto({ evento, km, kmTotale, serieAndata, serieRitorno = null, orari }) {
  const andataMin = minutiAlKm(serieAndata, km);
  if (andataMin == null) return null;
  const nome = evento === 'alba' ? "all'alba" : 'al tramonto';
  const riferimento = evento === 'alba' ? orari.alba : orari.tramonto;
  if (riferimento == null) return { evento, nome, impossibile: 'Il sole oggi non sorge o non tramonta qui.', avvisi: [] };
  // arrivo: prima dell'alba; all'inizio dell'ora d'oro per il tramonto
  const arrivoMin = evento === 'alba' ? orari.alba - ANTICIPO_ALBA_MIN : orari.oroSeraInizio ?? orari.tramonto - 45;
  const partenzaMin = Math.floor((arrivoMin - andataMin) / ARROTONDA_MIN) * ARROTONDA_MIN;
  const avvisi = [];
  // all'alba: il cammino prima dell'alba civile è buio, tra alba civile e alba è crepuscolo
  let buioMin = 0;
  let crepuscoloMin = 0;
  if (evento === 'alba') {
    buioMin = Math.round(sotto(arrivoMin - partenzaMin, Math.max(0, (orari.albaCivile ?? orari.alba) - partenzaMin)));
    crepuscoloMin = Math.round(sotto(arrivoMin - partenzaMin - buioMin, Math.max(0, orari.alba - Math.max(partenzaMin, orari.albaCivile ?? orari.alba))));
  }
  // al tramonto: si resta fino al tramonto e poi si torna (se c'è il ritorno): il rientro dopo il crepuscolo è buio
  let rientro = null;
  if (evento === 'tramonto') {
    const ritornoMin = serieRitorno ? minutiAlKm(serieRitorno, Math.max(0, kmTotale - km)) : andataMin;
    const fineMin = orari.tramonto + ritornoMin;
    const finoAlBuio = orari.tramontoCivile ?? orari.tramonto;
    rientro = { ritornoMin: Math.round(ritornoMin), fineMin: Math.round(fineMin), buioMin: Math.round(Math.max(0, fineMin - finoAlBuio)) };
    buioMin = rientro.buioMin;
  }
  if (partenzaMin < 0) avvisi.push({ tipo: 'prima-di-mezzanotte', testo: 'Servirebbe partire prima di mezzanotte: più realistico dormire in un rifugio o bivacco vicino.' });
  if (buioMin > 0) {
    avvisi.push({
      tipo: 'buio',
      testo: evento === 'alba' ? `Cammini al buio per circa ${buioMin} minuti: frontale, sentiero che conosci, avvisa qualcuno.` : `Il rientro è al buio per circa ${buioMin} minuti dopo il crepuscolo: frontale e sentiero che conosci.`,
    });
  }
  if (buioMin > 0 || crepuscoloMin > 0 || partenzaMin < 0) avvisi.push({ tipo: 'regole', testo: "Nei parchi, di notte l'accesso può essere limitato o vietato: controlla le regole prima di partire." });
  return { evento, nome, km, andataMin: Math.round(andataMin), arrivoMin: Math.round(arrivoMin), partenzaMin, buioMin, crepuscoloMin, rientro, avvisi };
}
