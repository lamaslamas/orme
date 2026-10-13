// Misuratore delle prestazioni (solo con "?misura" nell'indirizzo): tempi dei lavori a fine movimento
// della mappa e del disegno delle mappe MapLibre, per confrontare prima e dopo una correzione sul
// telefono vero. Senza "?misura" non fa niente: cronometra() restituisce la funzione così com'è.

export const MISURA_ATTIVA = (() => {
  try {
    if (typeof location === 'undefined') return false;
    // resta acceso nella stessa scheda anche cambiando pagina; ?misura=0 lo spegne
    const p = new URLSearchParams(location.search);
    if (p.get('misura') === '0') {
      sessionStorage.removeItem('orme.misura');
      return false;
    }
    if (p.has('misura')) {
      sessionStorage.setItem('orme.misura', '1');
      return true;
    }
    return sessionStorage.getItem('orme.misura') === '1';
  } catch {
    return false;
  }
})();

const tempi = new Map(); // nome → { volte, totale, max }

export function registra(nome, ms) {
  const t = tempi.get(nome) ?? { volte: 0, totale: 0, max: 0 };
  t.volte++;
  t.totale += ms;
  t.max = Math.max(t.max, ms);
  tempi.set(nome, t);
}

// La funzione, misurata quando il misuratore è acceso (solo la parte sincrona: è quella che blocca
// lo schermo). Spento, è la stessa funzione: nessun costo nell'uso normale.
export function cronometra(nome, fn, attivo = MISURA_ATTIVA) {
  if (!attivo) return fn;
  return function (...argomenti) {
    const inizio = performance.now();
    try {
      return fn.apply(this, argomenti);
    } finally {
      registra(nome, performance.now() - inizio);
    }
  };
}

export const tempiRegistrati = () => new Map(tempi);
export const azzeraTempi = () => tempi.clear();

// mappe MapLibre da misurare (nome → mappa), registrate da chi le crea
const mappeGl = new Map(); // nome → ultima mappa
const misurate = new WeakSet(); // ogni mappa una volta sola (il livello Leaflet la ricrea a ogni aggiunta)
export function registraMappaGl(nome, mappaGl, attivo = MISURA_ATTIVA) {
  if (!attivo || !mappaGl) return;
  mappeGl.set(nome, mappaGl);
  if (misurate.has(mappaGl)) return;
  misurate.add(mappaGl);
  // il disegno di ogni fotogramma (metodo interno di MapLibre: solo in misura)
  const originale = mappaGl._render;
  if (typeof originale === 'function') mappaGl._render = cronometra(`disegno MapLibre: ${nome}`, originale, true);
}
export const mappeGlRegistrate = () => [...mappeGl.keys()];

// ---- calcoli del riepilogo (puri, con i test) ----

// fotogrammi: durate in ms tra un requestAnimationFrame e il successivo
export function statisticheFotogrammi(durate, secondi) {
  if (!durate.length) return { fotogrammi: 0, fps: 0, persi: 0, quotaPersi: 0, peggiore: 0, p95: 0, mediana: 0 };
  const ordinati = [...durate].sort((a, b) => a - b);
  const quantile = (q) => ordinati[Math.min(ordinati.length - 1, Math.floor(q * ordinati.length))];
  // un fotogramma sopra 1,5 × 16,7 ms ne ha fatti perdere: si contano quelli che mancano
  const persi = durate.reduce((n, d) => n + Math.max(0, Math.round(d / 16.7) - 1), 0);
  return {
    fotogrammi: durate.length,
    fps: Math.round(durate.length / secondi),
    persi,
    quotaPersi: Math.round((persi / (persi + durate.length)) * 100),
    peggiore: Math.round(ordinati.at(-1)),
    p95: Math.round(quantile(0.95)),
    mediana: Math.round(quantile(0.5)),
  };
}

const ms = (x) => `${Math.round(x)} ms`;
const s = (x) => `${(x / 1000).toFixed(1).replace('.', ',')} s`;
const durata = (x) => (x >= 1000 ? s(x) : ms(x));

// righe dei tempi, dal più pesante: "elenco: 820 ms (14×, max 110 ms)"
export function righeTempi(mappaTempi) {
  return [...mappaTempi]
    .sort((a, b) => b[1].totale - a[1].totale)
    .map(([nome, t]) => `  ${nome}: ${durata(t.totale)} (${t.volte}×, max ${ms(t.max)})`);
}

// compiti lunghi del browser (PerformanceObserver "longtask" e "long-animation-frame")
export function riassuntoLunghi(lunghi) {
  if (!lunghi.length) return 'nessuno';
  const totale = lunghi.reduce((n, x) => n + x, 0);
  return `${lunghi.length} (totale ${durata(totale)}, max ${ms(Math.max(...lunghi))})`;
}

// fotogrammi lunghi divisi tra script, stile e impaginazione, disegno (long-animation-frame).
// voci: [{ script, stile, altro (ms), origini: [{ origine, durata }] }]
export function riassuntoFotogrammiLunghi(voci) {
  if (!voci.length) return [];
  const somma = (k) => voci.reduce((n, v) => n + (v[k] ?? 0), 0);
  const perOrigine = new Map();
  for (const v of voci) for (const sc of v.origini ?? []) perOrigine.set(sc.origine, (perOrigine.get(sc.origine) ?? 0) + sc.durata);
  return [
    `  in tutto ${voci.length} · script ${durata(somma('script'))} · stile e impaginazione ${durata(somma('stile'))} · altro (disegno, GPU, attese) ${durata(somma('altro'))}`,
    ...[...perOrigine]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([o, d]) => `  ${o}: ${durata(d)}`),
  ];
}

// l'ultima mappa Leaflet aperta (per il punto di prova e lo zoom nel riepilogo)
let mappaAttiva = null;
export function registraMappa(mappa, attivo = MISURA_ATTIVA) {
  if (attivo) mappaAttiva = mappa;
}
export const mappaRegistrata = () => mappaAttiva;
