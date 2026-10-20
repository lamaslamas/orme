// "Quando andare" nella scheda di un sentiero: i prossimi 7 giorni, ognuno con il giudizio di
// giudicaGiornata (lo stesso di "Dove vado domani"), il tempo che fa di giorno, le temperature alla
// partenza e in cima, il tramonto e il motivo principale.
import { giudicaGiornata, giornoAllaQuota, SOGLIE_PREDEFINITE } from './condizioni.js';

export const GIORNI_STRISCIA = 7;
export const TESTO_TARDI = 'Per oggi è tardi: scegli un altro giorno o orario';
// La partenza scelta (minuti dalla mezzanotte) è già passata? Vale solo per oggi: allora il giudizio sulla
// luce non ha senso e si dice che è tardi (invece di «troppo lungo per le ore di luce» calcolato da adesso)
export const partenzaPassata = (partenzaMin, adessoMin) => Number.isFinite(partenzaMin) && Number.isFinite(adessoMin) && partenzaMin < adessoMin;
const NOMI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

// le date "aaaa-mm-gg" da oggi
export function dateDaOggi(oggi, n = GIORNI_STRISCIA) {
  const d = new Date(`${oggi}T12:00:00Z`);
  return Array.from({ length: n }, (_, k) => new Date(d.getTime() + k * 86_400_000).toISOString().slice(0, 10));
}

// "Oggi", "Domani", poi "Sab 18"
export function nomeGiorno(data, oggi) {
  const [d0, d1] = dateDaOggi(oggi, 2);
  if (data === d0) return 'Oggi';
  if (data === d1) return 'Domani';
  const d = new Date(`${data}T12:00:00Z`);
  return `${NOMI[d.getUTCDay()]} ${d.getUTCDate()}`;
}

// Il tempo delle ore di giorno (8–18), dai codici WMO: temporale, neve, pioggia, nuvoloso, variabile, sereno
export const TEMPI_METEO = { temporale: 'Temporali', neve: 'Neve', pioggia: 'Pioggia', nuvoloso: 'Nuvoloso', variabile: 'Variabile', sereno: 'Sereno' };
export function tempoDelGiorno(ore) {
  const giorno = (ore ?? []).filter((o) => o.ora >= 8 && o.ora <= 18);
  if (!giorno.length) return null;
  if (giorno.some((o) => o.codice >= 95)) return 'temporale';
  if (giorno.some((o) => (o.codice >= 71 && o.codice <= 77) || o.codice === 85 || o.codice === 86 || o.neve > 0.2)) return 'neve';
  if (giorno.filter((o) => ((o.codice >= 51 && o.codice <= 67) || (o.codice >= 80 && o.codice <= 82)) && o.pp >= 40).length >= 2) return 'pioggia';
  const nuvole = giorno.reduce((s, o) => s + (o.nuvole ?? 0), 0) / giorno.length;
  return nuvole >= 70 ? 'nuvoloso' : nuvole >= 30 ? 'variabile' : 'sereno';
}

// minima e massima delle ore di giorno (8–18), arrotondate
export function temperatureDelGiorno(ore) {
  const t = (ore ?? []).filter((o) => o.ora >= 8 && o.ora <= 18 && Number.isFinite(o.t)).map((o) => o.t);
  return t.length ? { min: Math.round(Math.min(...t)), max: Math.round(Math.max(...t)) } : null;
}

const oraTesto = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;

// Un giorno della striscia. basso, alto: le previsioni del giorno alla partenza e in cima (alto può
// mancare), con la loro quota; m: datiPerMeteo(...); dopoMin: per oggi, da che ora si può partire
export function giornoDellaStriscia({ basso, alto = null }, m, { attivita = 'trekking', soglie = SOGLIE_PREDEFINITE, dopoMin = 0 } = {}) {
  const b = giornoAllaQuota(basso, m.basso.quota);
  const a = alto && m.alto ? giornoAllaQuota(alto, m.alto.quota) : null;
  if (!b?.ore?.length) return null;
  const g = giudicaGiornata({ basso: b, alto: a, durataMin: m.durataMin, percorso: m.percorso, soglie, attivita, dopoMin });
  const motivo = g?.fattori?.find((f) => f.livello !== 'ok' && f.livello !== 'info')?.testo ?? null;
  return {
    giudizio: g?.giudizio ?? null,
    motivo,
    partenza: g?.partenza ?? null,
    tempo: tempoDelGiorno(b.ore),
    temperature: temperatureDelGiorno(b.ore),
    inCima: a ? temperatureDelGiorno(a.ore) : null,
    tramonto: Number.isFinite(b.tramonto) ? oraTesto(b.tramonto) : null,
  };
}

// La riga sotto la striscia per il giorno scelto
export function testoDelGiorno(g, nome) {
  if (!g) return `${nome}: previsione non disponibile`;
  if (g.tardi) return TESTO_TARDI;
  const parti = [];
  if (g.motivo) parti.push(g.motivo);
  else if (g.giudizio === 'ok') parti.push('meteo favorevole');
  if (g.partenza?.entro) parti.push(`parti entro le ${g.partenza.entro}`);
  // il tramonto una volta sola: se il motivo (es. «troppo lungo per le ore di luce») lo dice già, non si ripete
  if (g.tramonto && !String(g.motivo ?? '').includes('tramonto')) parti.push(`tramonto ${g.tramonto}`);
  if (g.inCima) parti.push(`in cima ${g.inCima.min}–${g.inCima.max}°`);
  return `${nome}: ${parti.join(' · ')}`;
}

// Per i percorsi disegnati: partenza e punto più alto dai pezzi con le quote, nella forma di
// s.quote dei sentieri (quella che usa datiPerMeteo). null senza quote
export function quoteMeteoDaiPezzi(pezzi) {
  const punti = (pezzi ?? []).flat().filter((p) => Number.isFinite(p[2]));
  if (!punti.length) return null;
  const primo = pezzi[0][0];
  const alto = punti.reduce((m, p) => (p[2] > m[2] ? p : m), punti[0]);
  return {
    partenza: { lon: primo[0], lat: primo[1], quota: Number.isFinite(primo[2]) ? Math.round(primo[2]) : null },
    alto: { lon: alto[0], lat: alto[1], quota: Math.round(alto[2]) },
    max: Math.round(alto[2]),
    min: Math.round(Math.min(...punti.map((p) => p[2]))),
  };
}

// Avvisi sugli orari, ciascuno per il suo motivo (nessuno se non c'è un problema vero):
// - partenza già passata (oggi): "Le 12:00 di oggi sono già passate"
// - arrivo o rientro oltre l'ultima luce utile (mezz'ora prima del tramonto, come in Suggerisci):
//   "Rientro alle 20:47, dopo il tramonto (18:12)"
const hhmm = (min) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
export const MARGINE_TRAMONTO_MIN = 30;
export function avvisiOrari({ oggi = false, partenzaMin, adessoMin = null, fineMin, tramontoMin = null, conRientro = false }) {
  const avvisi = [];
  if (oggi && partenzaPassata(partenzaMin, adessoMin)) avvisi.push(`Le ${hhmm(partenzaMin)} di oggi sono già passate`);
  if (Number.isFinite(tramontoMin) && Number.isFinite(fineMin) && fineMin > tramontoMin - MARGINE_TRAMONTO_MIN) {
    const quando = fineMin > tramontoMin ? 'dopo il tramonto' : "a meno di mezz'ora dal tramonto";
    avvisi.push(`${conRientro ? 'Rientro' : 'Arrivo'} alle ${hhmm(fineMin)}, ${quando} (${hhmm(tramontoMin)})`);
  }
  return avvisi;
}

// Giorno e ora con cui si apre la pagina di un sentiero: quelli di Suggerisci, se si arriva da lì; altrimenti oggi
// all'ora solita, ma se è già passata o non lascia luce per finire il percorso, domani alle 8:00
export function giornoOraIniziali({ oggi, domani, adessoMin, oraSolita, durataMin, tramontoOggiMin = null, daSuggerisci = null }) {
  if (daSuggerisci?.giorno && daSuggerisci?.ora) return { giorno: daSuggerisci.giorno, ora: daSuggerisci.ora, motivo: 'suggerisci' };
  const [h, m] = String(oraSolita ?? '09:00').split(':').map(Number);
  const partenza = h * 60 + m;
  const passata = partenzaPassata(partenza, adessoMin);
  const senzaLuce = Number.isFinite(tramontoOggiMin) && Number.isFinite(durataMin) && partenza + durataMin > tramontoOggiMin - MARGINE_TRAMONTO_MIN;
  if (passata || senzaLuce) return { giorno: domani, ora: '08:00', motivo: passata ? 'passata' : 'luce' };
  return { giorno: oggi, ora: oraSolita, motivo: null };
}
