// Avvisi del percorso dentro i parchi: tratti non segnati, a mano libera o su sentieri ad accesso
// regolato (solo con guida, numero chiuso, chiusure). Servono al disegno e a "Genera anello".
// Si guarda un punto ogni 25 m: se è dentro un parco e perché è a rischio; i punti vicini con lo
// stesso motivo diventano un tratto da evidenziare.
import { distanzaKm, distanzaDallaTracciaM } from './geo.js';
import { terrenoSegnato } from './disegno.js';

export const PASSO_AVVISI_M = 25;
export const VICINO_REGOLATO_M = 30;
const SENTIERI = new Set(['path', 'track', 'footway', 'bridleway', 'steps']);
export const ACCESSI_REGOLATI = { guida: 'solo con guida', numero_chiuso: 'a numero chiuso', chiusure_periodiche: 'con chiusure periodiche', vietato: 'chiuso' };

// punti ogni passoM lungo la linea, con i metri dall'inizio
function campioni(linea, passoM) {
  const fuori = [];
  let m = 0;
  let prossimo = 0;
  for (let i = 0; i < linea.length; i++) {
    if (i) {
      const d = distanzaKm(linea[i - 1], linea[i]) * 1000;
      // punti intermedi sul segmento
      while (prossimo < m + d) {
        const t = d ? (prossimo - m) / d : 0;
        fuori.push({ m: prossimo, p: [linea[i - 1][0] + (linea[i][0] - linea[i - 1][0]) * t, linea[i - 1][1] + (linea[i][1] - linea[i - 1][1]) * t] });
        prossimo += passoM;
      }
      m += d;
    } else {
      fuori.push({ m: 0, p: [linea[0][0], linea[0][1]] });
      prossimo = passoM;
    }
  }
  if (linea.length > 1) fuori.push({ m, p: [linea.at(-1)[0], linea.at(-1)[1]] });
  return fuori;
}

// percorso: { linea, terreno: [{ daM, aM, tag }], liberi: [[daM, aM]…] }
// parcoDi([lon, lat]) → parco o null; regolati: [{ nome, accesso, geojson }] (nostri sentieri)
// → [{ motivo: 'non_segnato' | 'mano_libera' | 'regolato', parco, nome?, accesso?, daM, aM, linea }]
export function trattiARischio({ linea, terreno = [], liberi = [] }, { parcoDi, regolati = [], passoM = PASSO_AVVISI_M }) {
  if (!linea?.length) return [];
  const tag = (m) => terreno.find((t) => m >= t.daM && m <= t.aM)?.tag ?? null;
  const libero = (m) => liberi.some(([a, b]) => m >= a && m <= b);
  const motivoIn = ({ m, p }) => {
    const parco = parcoDi(p);
    if (!parco) return null;
    const vicino = regolati.find((r) => distanzaDallaTracciaM(p, r.geojson) <= VICINO_REGOLATO_M);
    if (vicino) return { motivo: 'regolato', parco, nome: vicino.nome, accesso: vicino.accesso };
    if (libero(m)) return { motivo: 'mano_libera', parco };
    const t = tag(m);
    if (t && SENTIERI.has(t.highway) && !terrenoSegnato(t)) return { motivo: 'non_segnato', parco };
    return null;
  };
  const tratti = [];
  for (const c of campioni(linea, passoM)) {
    const x = motivoIn(c);
    const ultimo = tratti.at(-1);
    const stesso = ultimo && x && ultimo.motivo === x.motivo && ultimo.nome === x.nome && ultimo.parco?.id === x.parco?.id && c.m - ultimo.aM <= passoM * 1.5;
    if (stesso) {
      ultimo.aM = c.m;
      ultimo.linea.push(c.p);
    } else if (x) tratti.push({ ...x, daM: c.m, aM: c.m, linea: [c.p] });
  }
  // un solo punto (meno di un passo) non è un tratto
  return tratti.filter((t) => t.aM - t.daM >= passoM);
}

// righe brevi per la barra: una per motivo (e per sentiero regolato), con i km
export function testiAvvisi(tratti) {
  const gruppi = new Map();
  for (const t of tratti) {
    const k = `${t.motivo}|${t.nome ?? ''}|${t.parco.id}`;
    const g = gruppi.get(k) ?? { ...t, m: 0 };
    g.m += t.aM - t.daM;
    gruppi.set(k, g);
  }
  const km = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`);
  return [...gruppi.values()].map((g) =>
    g.motivo === 'regolato'
      ? `${g.nome}: ${ACCESSI_REGOLATI[g.accesso] ?? 'accesso regolato'} (${km(g.m)} del percorso). Verifica e prenota prima di partire.`
      : g.motivo === 'mano_libera'
        ? `${km(g.m)} a mano libera nel ${g.parco.nomeBreve}: uscire dai sentieri può essere vietato.`
        : `${km(g.m)} su tratti non segnati nel ${g.parco.nomeBreve}: possono essere vietati, verifica le regole del parco.`,
  );
}

// tratti a mano libera, in metri dall'inizio, dai tratti calcolati in fila
export function intervalliLiberi(tratti) {
  const fuori = [];
  let m = 0;
  for (const t of tratti) {
    const lungo = (t.coordinate ?? []).reduce((s, p, i, a) => (i ? s + distanzaKm(a[i - 1], p) * 1000 : 0), 0);
    if (t.libero) fuori.push([m, m + lungo]);
    m += lungo;
  }
  return fuori;
}
