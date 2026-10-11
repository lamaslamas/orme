// "Sentieri probabili" per le uscite delle associazioni senza traccia: i nomi dei luoghi nel
// testo dell'uscita confrontati con nome, zona e codici dei sentieri dello stesso parco, più i
// luoghi trovati sulla mappa dal robot (solo dentro il riquadro del parco, per evitare omonimi).
// Al massimo 3 candidati, ognuno con i suoi motivi. Non è una traccia: la sceglie l'utente.
import { normalizza } from './filtri.js';
import { distanzaDallaTracciaM, lunghezzaKm } from './geo.js';

export const MAX_CANDIDATI = 3;
export const VICINO_M = 800; // un luogo trovato sulla mappa "è sul percorso" entro questa distanza
const MIN_LETTERE = 4;

// Parole con la maiuscola che non sono luoghi (inizio frase, enti, mesi, inglese delle pagine Ecotur)
const NON_LUOGHI = new Set(
  (
    'il lo la i gli le un una uno di da in con su per tra fra a e o ma che non nel nella nei negli sul sulla dal dalla al alla ' +
    'the a an and of to in on at for with our we you your this that it is are from by its their after before during ' +
    'parco nazionale regionale riserva ente foreste casentinesi abruzzo lazio molise italia italy park national ' +
    'wolf howling lupo lupi day trek trekking escursione escursioni uscita serata notte inverno estate autunno primavera ' +
    'gennaio febbraio marzo aprile maggio giugno luglio agosto settembre ottobre novembre dicembre ' +
    'january february march april may june july august september october november december ' +
    'ecotur pnfc pnalm cai guida guide ritrovo info prenotazione prenotazioni sentiero sentieri percorso km ' +
    'anello natura facile occhi ululati ululato tornano avete trovarsi esperienza educazione pomeriggio canis centro visite ' +
    'where hike autumn kingdom naples papal states fox child discovering tracks colors flavors excursion evening'
  ).split(' '),
);
// parole che, prima di un nome, indicano un luogo (Monte Amaro, Rifugio Casaponte…)
const PAROLE_LUOGO = /^(monte|monti|colle|passo|valle|val|vallone|lago|rifugio|bivacco|fonte|sorgente|forca|pizzo|serra|piano|pian|prato|prati|bosco|foresta|località|loc|madonna|santa?|san|castel|poggio|cima|croce|pratalino|eremo|cascata|cascate|gola|gole|altopiano|piana|fosso|fiume|torrente|borgo)$/i;
const PARTICELLE = new Set(['di', 'del', 'della', 'delle', 'dei', 'degli', 'dello', "d'", "dell'", "all'", "sull'", "nell'", 'de', 'la', 'le', 'lo', 'il', 'alla', 'al', 'alle', 'in', 'sul', 'sulla']);
const LUNGO_KM = 25; // cammini a tappe e grandi traversate: meno probabili per un'uscita di un giorno

// Nomi di luogo in un testo: sequenze di parole con la maiuscola, con "di", "del"… in mezzo
// ("Chiusi della Verna", "Forca d'Acero", "Lago di Ponte")
export function luoghiNelTesto(testo) {
  const parole = String(testo ?? '')
    .replace(/[“”"«»()\[\]:;!?]/g, ' , ')
    .replace(/[–—]/g, ' , ')
    .replace(/[’`]/g, "'")
    .replace(/(\p{L})'(\p{Lu})/gu, "$1' $2")
    .split(/\s+/)
    .filter(Boolean);
  const trovati = new Map();
  let attuale = [];
  const chiudi = () => {
    while (attuale.length && PARTICELLE.has(attuale.at(-1).toLowerCase())) attuale.pop();
    const significative = attuale.filter((p) => !PARTICELLE.has(p.toLowerCase()) && !NON_LUOGHI.has(normalizza(p)));
    if (/^(località|loc)$/i.test(attuale[0] ?? '')) attuale.shift(); // "Località La Beccia" = "La Beccia"
    const nome = attuale.join(' ').replace(/' /g, "'");
    if (normalizza(attuale[0] ?? '').replace(/'$/, '') === '') return (attuale = []);
    if (significative.length && normalizza(nome).replace(/[^a-z]/g, '').length >= MIN_LETTERE) trovati.set(normalizza(nome), nome);
    attuale = [];
  };
  for (const grezza of parole) {
    const fine = /[.,]$/.test(grezza) || grezza === ',';
    const p = grezza.replace(/[.,]+$/, '');
    if (!p || p === ',') {
      chiudi();
      continue;
    }
    if (/^\p{Lu}/u.test(p) && !/^\p{Lu}+$/u.test(p.replace(/[^\p{L}]/gu, '')) || (PAROLE_LUOGO.test(p) && /^\p{Lu}/u.test(p))) attuale.push(p);
    else if (attuale.length && PARTICELLE.has(p.toLowerCase())) attuale.push(p);
    else chiudi();
    if (fine) chiudi();
  }
  chiudi();
  // un nome che è solo una parola esclusa con la sua particella ("Il Lupo") non è un luogo
  return [...trovati.values()].filter((n) => n.split(' ').some((p) => !NON_LUOGHI.has(normalizza(p)) && !PARTICELLE.has(p.toLowerCase())));
}

// Codici dei sentieri nominati nel testo ("sentiero F2", "il K6")
export function codiciNelTesto(testo) {
  return [...String(testo ?? '').matchAll(/\b([A-Z]{1,2}\d{1,3}[a-z]?)\b/g)].map((m) => m[1].toUpperCase());
}

// Il punto di partenza conta solo se è un luogo, non l'ufficio dell'associazione (es. Ecotur, Via Piave 9)
function partenzaUtile(s) {
  const d = s.partenza?.descrizione ?? '';
  const chi = [s.escursione?.associazione, ...(s.organizzatori ?? [])].filter(Boolean).map(normalizza);
  if (!d || /\b(via|viale|piazza|corso)\b\s+\S+\s*\d/i.test(d) || chi.some((c) => normalizza(d).includes(c))) return '';
  return d;
}

// Testo dell'uscita da cui leggere i luoghi (anche per il robot)
export function testoDellUscita(s) {
  return [s.nome, s.escursione?.nomeUscita, s.zona, s.partenza?.paese, partenzaUtile(s), s.descrizione].filter(Boolean).join('. ');
}

const parchiDi = (s) => s.parchi ?? [s.parco].filter(Boolean);

// uscita: il sentiero senza traccia; percorsi: [{ sentiero, traccia }] con traccia;
// luoghi: [{ nome, lat, lon }] trovati dal robot sulla mappa (s.luoghi?.punti)
export function sentieriProbabili(uscita, percorsi, { luoghi = uscita.luoghi?.punti ?? [] } = {}) {
  const testo = testoDellUscita(uscita);
  const nomi = luoghiNelTesto(testo);
  const codici = new Set(codiciNelTesto(testo));
  const parchi = new Set(parchiDi(uscita));
  const risultati = [];
  for (const { sentiero: s, traccia } of percorsi) {
    if (s.id === uscita.id || !traccia?.geojson || !parchiDi(s).some((p) => parchi.has(p))) continue;
    // le uscite sono a piedi: niente itinerari MTB, altre uscite o reti di sentieri
    if (['itinerario_mtb', 'uscita_guidata', 'rete_sentieri'].includes(s.tipoPercorso)) continue;
    const motivi = [];
    let punti = 0;
    const doveCercare = normalizza([s.nome, s.zona, s.partenza?.paese, s.partenza?.descrizione].filter(Boolean).join(' '));
    for (const n of nomi) {
      const k = normalizza(n);
      if (!new RegExp(`(^|[^a-z])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(doveCercare)) continue;
      punti += k.includes(' ') ? 4 : 3;
      motivi.push(`nomina ${n}`);
    }
    const stessoCodice = (s.codici ?? []).find((c) => codici.has(String(c).toUpperCase()));
    if (stessoCodice) {
      punti += 4;
      motivi.push(`sentiero ${stessoCodice}`);
    }
    for (const l of luoghi) {
      if (motivi.some((m) => normalizza(m).includes(normalizza(l.nome).replace(/^(localita|loc) /, '')))) continue;
      if (distanzaDallaTracciaM([l.lon, l.lat], traccia.geojson) > VICINO_M) continue;
      punti += 2;
      motivi.push(`passa da ${l.nome}`);
    }
    if (!punti) continue;
    const km = s.lunghezzaKm ?? Math.round(lunghezzaKm(traccia.geojson) * 10) / 10;
    if (km > LUNGO_KM && !(uscita.lunghezzaKm > LUNGO_KM)) punti -= 1;
    // lunghezza simile: solo per scegliere tra candidati che hanno già un motivo
    const a = uscita.lunghezzaKm;
    const b = km;
    if (a && b && b / a >= 0.7 && b / a <= 1.4) {
      punti += 1;
      motivi.push(`lunghezza simile (${String(b).replace('.', ',')} km)`);
    }
    risultati.push({ id: s.id, nome: s.nome, codici: s.codici ?? [], punti, motivi });
  }
  return risultati.sort((x, y) => y.punti - x.punti || x.nome.localeCompare(y.nome, 'it')).slice(0, MAX_CANDIDATI);
}

// La traccia ereditata da un sentiero confermato: sul telefono, segnata come scelta mia
// (l'archivio non la sostituisce; un mio GPX sì)
export function tracciaConfermata(uscitaId, candidato, traccia, oggi = new Date().toISOString().slice(0, 10)) {
  return {
    sentieroId: uscitaId,
    origine: traccia.origine ?? 'osm',
    geojson: traccia.geojson,
    dettagli: { conferma: { sentiero: candidato.id, nome: candidato.nome, data: oggi } },
  };
}
