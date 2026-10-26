// «2 giorni con notte» e «Su più giorni»: lo stesso calcolo e la stessa frase. Le giornate secondo la luce
// (src/lib/dueGiorni.js): il primo giorno finisce dove c'è un posto per dormire vicino a metà del cammino, il secondo parte
// alle 8:00 (o all'alba nel tratto con più fauna). In MTB i tempi sono da bici.
import { pianoDueGiorni } from './dueGiorni.js';
import { profiloTempi, profiloTempiBici, kmLungoLaTraccia, RAGGIO_STRUTTURE_M, RAGGIO_PERNOTTO_M, lunghezzaDeiPezzi, km1 } from './lungoIlPercorso.js';
import { pezziScelti } from './andataRitorno.js';
import { puntiLungoIlPercorso, perLaNotteScelta, TIPI_PUNTO, etichettaPernotto } from './puntiUtili.js';
import { albaTramonto, minutiItaliani } from './sole.js';
import { durata } from './formato.js';

const ora = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`;

// pezzi: la traccia in ordine, nel verso scelto (con le quote, se ci sono); anello; misure: { durataMin, salita } mostrate nei
// risultati (per riportare i tempi senza quote); modo: 'ar' | 'andata'; data: "aaaa-mm-gg" del primo giorno;
// dormire: 'qualsiasi' | 'rifugi' | 'strutture'; punti: rifugi, strutture e acqua; geojson: la traccia (per i posti vicini);
// tratto: il tratto con più fauna, nel verso scelto, o null; dislivelloDeviazione(p): dislivello fino al posto, se noto
// → { piano, giorni, etichetta } oppure { motivo: 'breve' | 'troppo-lungo' | 'nessun-posto' | 'luce' | … }
export function pianoNotte({ pezzi, anello, attivita = 'trekking', modo = 'ar', data, partenzaMin = 540, dormire = 'qualsiasi', punti, geojson, misure = null, tratto = null, dislivelloDeviazione = () => null }) {
  const inizio = pezzi[0]?.[0];
  if (!punti || !inizio) return { motivo: 'senza-dati' };
  const camminata = pezziScelti(pezzi, modo, anello);
  const serie = attivita === 'mtb' ? profiloTempiBici(camminata) : profiloTempi(camminata);
  // senza le quote sui pezzi il tempo del cammino sarebbe solo in piano: si riporta al tempo mostrato nei risultati
  // (con il dislivello), tenendo le proporzioni lungo il percorso
  const mostrata = misure?.durataMin;
  if (!serie.conQuote && Number.isFinite(mostrata) && serie.min.at(-1) > 0) {
    const k = mostrata / serie.min.at(-1);
    serie.min = serie.min.map((m) => m * k);
  }
  const data2 = new Date(new Date(`${data}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  const sole = (d) => {
    const x = albaTramonto(d, [inizio[0], inizio[1]]);
    return { alba: minutiItaliani(x.alba), tramonto: minutiItaliani(x.tramonto) };
  };
  const comune = { serie, lunghezzaKm: lunghezzaDeiPezzi(pezzi), conRitorno: camminata.length > pezzi.length, attivita, partenzaMin, sole1: sole(data), sole2: sole(data2), tratto, dislivelloDeviazione };
  // prima la sola durata (veloce): troppo breve o troppo lungo per due giornate di luce, senza cercare i posti
  const prima = pianoDueGiorni({ ...comune, posti: [] });
  if (prima.motivo === 'breve' || prima.motivo === 'troppo-lungo') return { motivo: prima.motivo };
  const dove = perLaNotteScelta(dormire);
  const posti = geojson
    ? puntiLungoIlPercorso(punti, geojson, RAGGIO_STRUTTURE_M)
        .filter(dove)
        .filter((p) => p.distanzaM <= (TIPI_PUNTO[p.tipo].gruppo === 'strutture' ? RAGGIO_STRUTTURE_M : RAGGIO_PERNOTTO_M))
        .map((p) => ({ ...p, km: kmLungoLaTraccia([p.lon, p.lat], pezzi) }))
        .filter((p) => p.km != null)
    : [];
  const piano = pianoDueGiorni({ ...comune, posti });
  if (!piano.ok) return { motivo: piano.motivo };
  // senza quote sui pezzi il dislivello di ogni giornata si ripartisce secondo il tempo di cammino
  const totaleGiornate = (piano.giorno1?.durataMin ?? 0) + piano.giorno2.durataMin;
  const stima = (g) => (g && g.salita == null && Number.isFinite(misure?.salita) ? { ...g, salita: Math.round((misure.salita * g.durataMin) / totaleGiornate) } : g);
  piano.giorno1 = stima(piano.giorno1);
  piano.giorno2 = stima(piano.giorno2);
  // nome, tipo e distanza dalla traccia (con «notte vicino alla partenza» il testo lo dice a parte)
  return { piano, giorni: [piano.giorno1, piano.giorno2].filter(Boolean), etichetta: etichettaPernotto(piano.posto) };
}

const sal = (g) => (g.salita != null ? ` · +${g.salita} m` : '');
const CON_ARTICOLO = { campeggio: 'il campeggio', agriturismo: "l'agriturismo", bb: 'il B&B', ostello: "l'ostello", albergo: "l'albergo", alloggio: "l'alloggio", rifugio: 'il rifugio', bivacco: 'il bivacco', ricovero: 'il ricovero' };
const DA_ARTICOLO = { campeggio: 'dal campeggio', agriturismo: "dall'agriturismo", bb: 'dal B&B', ostello: "dall'ostello", albergo: "dall'albergo", alloggio: "dall'alloggio", rifugio: 'dal rifugio', bivacco: 'dal bivacco', ricovero: 'dal ricovero' };
// «, con +26 min per raggiungere l'ostello (1,7 km dalla traccia)» (non si dice per deviazioni di pochi metri)
const dev = (g, p, verso) =>
  g?.deviazioneMin && p.distanzaM >= 100
    ? `, con +${g.deviazioneMin} min ${verso === 'arrivare' ? `per raggiungere ${CON_ARTICOLO[p.tipo] ?? 'il posto'}` : `per tornare in traccia ${DA_ARTICOLO[p.tipo] ?? 'dal posto'}`} (${(p.distanzaM / 1000).toFixed(1).replace('.', ',')} km dalla traccia)`
    : '';

// «Giorno 1: 15:00–16:12 (1 h 12 · km 3,5 · +58 m, con +26 min per l'ostello a 1,7 km) · notte: … · Giorno 2: …» oppure
// «Notte vicino alla partenza: …; il giorno dopo tutto il percorso: 08:00–…»
export function testoGiornate(n) {
  const g2 = n.giorno2;
  const alba = g2.dallAlba ? " (all'alba, nel tratto con più fauna)" : '';
  if (n.tipo === 'notte-vicina') return `Notte vicino alla partenza: ${etichettaPernotto(n.posto)} · il giorno dopo tutto il percorso: ${ora(g2.daMin)}${alba}–${ora(g2.aMin)} (${durata(g2.durataMin)} · km ${km1(g2.km)}${sal(g2)}${g2.deviazioneMin ? `, con +${g2.deviazioneMin} min di deviazione` : ''})`;
  const g1 = n.giorno1;
  return `Giorno 1: ${ora(g1.daMin)}–${ora(g1.aMin)} (${durata(g1.durataMin)} · km ${km1(g1.km)}${sal(g1)}${dev(g1, n.posto, 'arrivare')}) · notte: ${etichettaPernotto(n.posto)} · Giorno 2: ${ora(g2.daMin)}${alba}–${ora(g2.aMin)} (${durata(g2.durataMin)} · km ${km1(g2.km)}${sal(g2)}${dev(g2, n.posto, 'tornare')})`;
}

// perché non c'è un piano, in una frase
export const MOTIVI_NOTTE = {
  breve: 'Il percorso è breve: basta un giorno.',
  'troppo-lungo': 'È troppo lungo per due giornate di luce: servirebbero più notti.',
  'nessun-posto': 'Non trovo un posto per dormire vicino a metà del cammino.',
  luce: 'Con questa partenza la prima giornata finirebbe dopo il tramonto: parti prima.',
  'senza-dati': 'Mancano i punti per dormire o la traccia.',
};
