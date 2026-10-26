// "Suggeriscimi": dalle scelte (quando, quanto tempo, cosa cerchi, fatica, quanto lontano) alle
// proposte, con regole e niente servizi di AI. Ogni proposta ha un punteggio e una riga che spiega
// perché. Il meteo del giorno scelto riordina le proposte (giudicaGiornata, in condizioni.js).
import { distanzaKm } from './geo.js';
import { passaQuotaDislivello, passaLunghezza } from './quotaDislivello.js';
import { ANIMALI } from './costanti.js';
import { testoPostoPerDormire } from './puntiUtili.js';
import { durata, migliaia, suUnaRiga, testoSalitaMax } from './formato.js';

export const SCELTE_PREDEFINITE = { modo: 'percorsi', quando: 'oggi', tempo: 'mezza', cerco: [], specie: '', specieNome: '', fatica: 'qualsiasi', distanza: '60', parco: '', lunghezza: '12', quota: '', salita: '', senzaQuote: '', lunghezzaKm: '', biciDaVerificare: '', periodo: 'vicini' };
// Il periodo per la fauna: il mese, i mesi vicini (±1, di base) o tutto l'anno. raggio: mesi accanto al mese (null = tutto l'anno)
export const PERIODI = { mese: 'Questo mese', vicini: 'Mesi vicini (±1)', anno: "Tutto l'anno" };
export const RAGGIO_PERIODO = { mese: 0, vicini: 1, anno: null };
export const MODI_SUGGERISCI = { percorsi: 'Tra i percorsi', anello: 'Crea un anello' };
export const QUANDO = { oggi: 'Oggi', domani: 'Domani', sabato: 'Sabato', domenica: 'Domenica' };
export const TEMPI = { mezza: 'Mezza giornata', giornata: 'Giornata' };
export const COSE = { fauna: 'Fauna', panorama: 'Panorama', bosco: 'Bosco', cresta: 'Cresta', acqua: 'Acqua', associazioni: 'Uscite delle associazioni', dormire: 'Posto per dormire vicino' };
export const FATICHE = { qualsiasi: 'Qualsiasi', facile: 'Facile', media: 'Media', impegnativa: 'Impegnativa' };
// scelte che si possono togliere (toccando di nuovo la voce attiva): senza scelta il criterio non filtra
export const SCELTE_FACOLTATIVE = { tempo: '', distanza: '', fatica: 'qualsiasi' };
export const DISTANZE = { 30: '30 min', 60: '1 h', 120: '2 h', parco: 'Un parco' };

// la data "aaaa-mm-gg" della scelta, a partire da oggi (sabato e domenica: i prossimi, oggi compreso)
export function dataDelQuando(quando, oggi) {
  const d = new Date(`${oggi}T12:00:00Z`);
  const piu = (n) => new Date(d.getTime() + n * 86_400_000).toISOString().slice(0, 10);
  if (quando === 'domani') return piu(1);
  if (quando === 'sabato' || quando === 'domenica') {
    const voluto = quando === 'sabato' ? 6 : 0;
    return piu((voluto - d.getUTCDay() + 7) % 7);
  }
  return oggi;
}

// In auto, senza servizi: linea d'aria × 1,35 (le strade girano) a 60 km/h di media, più 5 minuti
export const FATTORE_STRADE = 1.35;
export function stimaAuto(da, a) {
  if (!da || !a) return null;
  const lineaKm = distanzaKm(da, a);
  return { lineaKm: Math.round(lineaKm), minuti: Math.round(((lineaKm * FATTORE_STRADE) / 60) * 60 + 5) };
}
export const testoAuto = (s) => (s ? `circa ${durata(s.minuti)} in auto (${s.lineaKm} km in linea d'aria)` : '');

// tempo di cammino (minuti, senza soste) adatto alla scelta
export function adattoAlTempo(minuti, tempo) {
  if (!tempo) return true; // nessuna scelta: qualsiasi durata
  if (!Number.isFinite(minuti)) return false;
  if (tempo === 'mezza') return minuti <= 270;
  if (tempo === 'giornata') return minuti >= 180 && minuti <= 540;
  return true;
}

// fatica: dislivello e difficoltà CAI
export function adattoAllaFatica({ salita, durataMin }, difficolta, fatica) {
  if (!fatica || fatica === 'qualsiasi') return true;
  const s = Number.isFinite(salita) ? salita : 0;
  if (fatica === 'facile') return s <= 500 && (!difficolta || ['T', 'E'].includes(difficolta)) && (durataMin ?? 0) <= 330;
  if (fatica === 'media') return s <= 1100 && difficolta !== 'EEA';
  return s >= 700 || ['EE', 'EEA'].includes(difficolta);
}

export const entroDistanza = (auto, distanza) => !distanza || distanza === 'parco' || !auto || auto.minuti <= Number(distanza);

// c: { misure: { km, salita, durataMin }, anello, difficolta, fauna, panorama, bosco, apertura,
//      quotaMax, acqua: n, dormire: { nome, tipo, distanzaM, daPartenza }|null, uscite: [nome], auto }
// → null se non va bene per le scelte, altrimenti { punteggio, trovati: [cose cercate trovate] }
export function valuta(c, scelte) {
  const tempo = scelte.tempo ?? '';
  if (!adattoAlTempo(c.misure.durataMin, tempo)) return null;
  const fatica = scelte.fatica ?? 'qualsiasi';
  if (!adattoAllaFatica(c.misure, c.difficolta, fatica)) return null;
  if (!entroDistanza(c.auto, scelte.distanza)) return null;
  // quota massima e dislivello (le scelte di Suggerisci, a parte da quelle degli elenchi)
  if (!passaQuotaDislivello(scelte, { quotaMax: c.quotaMax, salita: c.misure.salita })) return null;
  // lunghezza: i km da percorrere davvero (le misure di Suggerisci sono già quelle di «Solo andata» o di andata e ritorno)
  if (!passaLunghezza(scelte, c.misure.km)) return null;
  // una specie scelta (con "Fauna" tra le cose cercate): solo i percorsi con segnalazioni nel periodo
  const specie = (scelte.cerco ?? []).includes('fauna') && scelte.specie ? c.specie ?? null : undefined;
  if (specie === null || (specie && specie.punti <= 0)) return null;
  // «Posto per dormire vicino» tiene solo i percorsi con una struttura entro 2 km dalla partenza o dalla traccia
  if ((scelte.cerco ?? []).includes('dormire') && !c.dormire) return null;
  const trova = {
    fauna: specie ? true : c.fauna?.livello === 'frequenti' || c.fauna?.livello === 'possibili',
    panorama: (c.panorama ?? 0) >= 60,
    bosco: (c.bosco ?? 0) >= 50,
    cresta: (c.apertura ?? 0) >= 50 && (c.quotaMax ?? 0) >= 1400,
    acqua: (c.acqua ?? 0) > 0,
    associazioni: (c.uscite ?? []).length > 0,
    dormire: Boolean(c.dormire),
  };
  let punteggio = 100;
  const trovati = [];
  for (const cosa of scelte.cerco ?? []) {
    if (trova[cosa]) {
      trovati.push(cosa);
      punteggio += cosa === 'fauna' ? (specie ? Math.min(150, specie.punti * 4) : c.fauna.livello === 'frequenti' ? 30 : 15) : 20;
    } else punteggio -= 30; // cercato e non trovato: pesa più della distanza
  }
  if (c.anello) punteggio += 6;
  if (c.acqua) punteggio += 4;
  if (c.auto) punteggio -= c.auto.minuti / 6; // più vicino è meglio
  return { punteggio: Math.round(punteggio), trovati };
}

// Il meteo del giorno riordina: sconsigliato va in fondo, attenzione scende un po'
export const CORREZIONE_METEO = { ok: 0, attenzione: -15, sconsigliato: -80 };
export function ordinaProposte(voci) {
  const totale = (v) => v.valutazione.punteggio + (CORREZIONE_METEO[v.giudizio?.giudizio] ?? 0);
  return [...voci].sort((a, b) => totale(b) - totale(a));
}

// "Anello nel bosco, ricco di fauna (cervo, camoscio), 2 fontanelle, +580 m · 4 h 10"
// specieComuni: le specie che stanno in tutti i risultati: si dicono una volta in cima e non in ogni card.
// Le specie sono quelle lungo il percorso (la traccia e il suo tratto con più fauna), non quelle del parco.
export function testoPerche(c, { trovati = [], modo = 'ar', specieComuni = [], periodoAnno = false } = {}) {
  const nomi = (xs) => xs.map((a) => (ANIMALI[a] ?? String(a).replace(/_/g, ' ')).toLowerCase()).join(', ');
  const proprie = (c.specieLungo ?? []).filter((a) => !specieComuni.includes(a)).slice(0, 3);
  const elencoFauna = proprie.length ? ` (${nomi(proprie)})` : '';
  const parti = [c.anello ? 'Anello' : modo === 'ar' ? 'Andata e ritorno' : 'Solo andata'];
  if ((c.bosco ?? 0) >= 50) parti[0] += ' nel bosco';
  if (c.specie) {
    const z = c.specie.dove === 'percorso' ? '' : ', dato di zona';
    // con «Tutto l'anno» si dice quando: «segnalato in giu–set»
    const quando = periodoAnno && c.specie.mesi ? `, segnalato in ${c.specie.mesi}` : '';
    parti.push(`${(c.specie.nomeSpecie ?? ANIMALI[c.specie.animale] ?? c.specie.animale).toLowerCase()} ${c.specie.nome}${c.specie.persone ? ` (${c.specie.testo}${z})` : ' (uscita di un\'associazione)'}${quando}`);
  } else if (c.fauna?.livello === 'frequenti') parti.push(`ricco di fauna${elencoFauna}`);
  else if (c.fauna?.livello === 'possibili' && trovati.includes('fauna')) parti.push(`fauna possibile${elencoFauna}`);
  if ((c.panorama ?? 0) >= 60) parti.push(`panoramico (${c.panorama}/100)`);
  if (trovati.includes('cresta')) parti.push('tratti in cresta');
  if (c.acqua) parti.push(c.acqua === 1 ? '1 punto acqua' : `${c.acqua} punti acqua`);
  if (c.dormire && trovati.includes('dormire')) parti.push(testoPostoPerDormire(c.dormire));
  if (c.uscite?.length) parti.push(`lo usa ${c.uscite.length === 1 ? `l'uscita «${c.uscite[0]}»` : `${c.uscite.length} uscite delle associazioni`}`);
  const m = c.misure;
  // salita, altitudine massima (solo se c'è) e durata; ogni dato resta su una riga
  const numeri = [testoSalitaMax(m.salita, null), testoSalitaMax(null, c.quotaMax), m.durataMin != null ? durata(m.durataMin) : '']
    .filter(Boolean)
    .map(suUnaRiga)
    .join(' · ');
  return `${parti.join(', ')}${numeri ? `, ${numeri}` : ''}`;
}

// Nessun risultato: quale scelta esclude più percorsi. prove: [{ chiave, etichetta, n, motivo? }] = quanti percorsi
// si trovano cambiando una scelta alla volta. → { testo, alternative } (alternative: quelle con almeno un percorso,
// dalla più utile)
export function spiegaNessunRisultato(riassunto, prove) {
  const utili = prove.filter((p) => p.n > 0).sort((a, b) => b.n - a.n);
  const peggiore = utili[0];
  const motivo = peggiore?.motivo ? `: ${peggiore.motivo}` : '';
  const testo = peggiore
    ? `Nessun percorso con ${riassunto}${motivo}.`
    : `Nessun percorso con ${riassunto}, nemmeno togliendo una scelta alla volta: prova a cambiare zona o giorno.`;
  return { testo, alternative: utili.map((p) => ({ ...p, testo: `${p.etichetta} ne trovo ${p.n}` })) };
}

// Il testo del pulsante in fondo alle scelte, col numero di percorsi che si trovano: «Mostra 23 percorsi»
// (n = null: non si sa ancora)
export function testoConteggio(n) {
  if (n == null) return 'Suggerisci';
  if (n === 0) return 'Nessun percorso: tocca per vedere perché';
  return n === 1 ? 'Mostra 1 percorso' : `Mostra ${n} percorsi`;
}
