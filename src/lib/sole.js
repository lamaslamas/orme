// Alba e tramonto calcolati sul telefono (formula astronomica della NOAA, precisione di un paio di
// minuti): niente servizi esterni. Gli orari si scrivono nell'ora italiana (ora legale compresa).

const RAD = Math.PI / 180;
const ZENIT = 90.833; // centro del sole 0,833° sotto l'orizzonte: rifrazione e raggio del disco

// giorno giuliano a mezzanotte UTC della data "aaaa-mm-gg"
function giornoGiuliano(data) {
  const [a, m, g] = data.split('-').map(Number);
  return Date.UTC(a, m - 1, g) / 86_400_000 + 2440587.5;
}

// minuti UTC dalla mezzanotte dell'alba (alba = true) o del tramonto, oppure null (sole sempre su o giù)
function evento(data, lat, lon, alba, zenit = ZENIT) {
  // si itera una volta: il secondo calcolo usa l'ora trovata dal primo
  let minuti = 720 - 4 * lon;
  for (let i = 0; i < 2; i++) {
    const t = (giornoGiuliano(data) + minuti / 1440 - 2451545) / 36525;
    const l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
    const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
    const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
    const c = Math.sin(m * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t)) + Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * t) + Math.sin(3 * m * RAD) * 0.000289;
    const omega = 125.04 - 1934.136 * t;
    const lambda = l0 + c - 0.00569 - 0.00478 * Math.sin(omega * RAD);
    const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
    const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
    const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD));
    const y = Math.tan((eps / 2) * RAD) ** 2;
    const eqTempo =
      4 / RAD *
      (y * Math.sin(2 * l0 * RAD) - 2 * e * Math.sin(m * RAD) + 4 * e * y * Math.sin(m * RAD) * Math.cos(2 * l0 * RAD) - 0.5 * y * y * Math.sin(4 * l0 * RAD) - 1.25 * e * e * Math.sin(2 * m * RAD));
    const cosH = Math.cos(zenit * RAD) / (Math.cos(lat * RAD) * Math.cos(decl)) - Math.tan(lat * RAD) * Math.tan(decl);
    if (cosH > 1 || cosH < -1) return null;
    const h = Math.acos(cosH) / RAD;
    minuti = 720 - 4 * (lon + (alba ? h : -h)) - eqTempo;
  }
  return minuti;
}

// { alba, tramonto } come Date (o null) per la data "aaaa-mm-gg" nel punto [lon, lat]
export function albaTramonto(data, [lon, lat]) {
  const base = Date.UTC(...data.split('-').map((x, i) => Number(x) - (i === 1 ? 1 : 0)));
  const ora = (min) => (min == null ? null : new Date(base + Math.round(min * 60_000)));
  return { alba: ora(evento(data, lat, lon, true)), tramonto: ora(evento(data, lat, lon, false)) };
}

// "18:12" nell'ora italiana
export const oraItaliana = (d) => (d ? d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }) : '–');

// minuti dalla mezzanotte italiana di quel giorno (per i confronti con l'ora di partenza)
export function minutiItaliani(d) {
  if (!d) return null;
  const [h, m] = oraItaliana(d).split(':').map(Number);
  return h * 60 + m;
}

// Le luci del giorno per la fotografia, come Date (o null): crepuscolo civile (sole a −6°), alba e tramonto,
// ora d'oro (il sole sotto i 6° sull'orizzonte: luce bassa e calda, da alba a +6° e da +6° a tramonto)
export const ZENIT_ORO = 84;
export const ZENIT_CIVILE = 96;
export function luciDelGiorno(data, [lon, lat]) {
  const base = Date.UTC(...data.split('-').map((x, i) => Number(x) - (i === 1 ? 1 : 0)));
  const ora = (min) => (min == null ? null : new Date(base + Math.round(min * 60_000)));
  return {
    albaCivile: ora(evento(data, lat, lon, true, ZENIT_CIVILE)),
    alba: ora(evento(data, lat, lon, true)),
    oroMattinaFine: ora(evento(data, lat, lon, true, ZENIT_ORO)),
    oroSeraInizio: ora(evento(data, lat, lon, false, ZENIT_ORO)),
    tramonto: ora(evento(data, lat, lon, false)),
    tramontoCivile: ora(evento(data, lat, lon, false, ZENIT_CIVILE)),
  };
}
