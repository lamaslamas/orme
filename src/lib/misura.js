// Misuratore delle prestazioni (solo con "?misura" nell'indirizzo): tempi dei lavori a fine movimento
// della mappa e del disegno delle mappe MapLibre, per confrontare prima e dopo una correzione sul
// telefono vero. Senza "?misura" non fa niente: cronometra() restituisce la funzione così com'è.

export const MISURA_ATTIVA = (() => {
  try {
    if (typeof location === 'undefined') return false;
    // solo con ?misura nell'indirizzo (resta anche cambiando pagina: cambia solo la parte dopo #);
    // non si memorizza niente nel browser; ?misura=0 lo spegne
    const p = new URLSearchParams(location.search);
    sessionStorage.removeItem('orme.misura'); // il ricordo delle versioni di prima
    return p.has('misura') && p.get('misura') !== '0';
  } catch {
    return false;
  }
})();

const tempi = new Map(); // nome → { volte, totale, max }

// cronologia dei lavori cronometrati (istante di inizio e durata), per dire cosa c'era dentro un compito lungo
const cronologia = [];
export const cronologiaLavori = () => cronologia;
export const azzeraCronologia = () => (cronologia.length = 0);

export function registra(nome, ms) {
  if (ms >= 10 && cronologia.length < 5000) cronologia.push({ nome, da: performance.now() - ms, ms });
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

// numeri che una vista segnala per il riepilogo (es. i percorsi disegnati sulla mappa), solo con il misuratore acceso
const contatori = new Map();
export function impostaContatore(nome, n, attivo = MISURA_ATTIVA) {
  if (attivo) contatori.set(nome, n);
}
export const contatoriRegistrati = () => new Map(contatori);

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
  // primo stile caricato e prima immagine completa (la base è «usabile» quando ha finito di disegnarsi)
  mappaGl.once?.('load', () => segna(`mappa ${nome}: stile caricato`));
  mappaGl.once?.('idle', () => segna(`mappa ${nome}: prima immagine completa`));
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

// ---------- avvio e sonde (solo con ?misura) ----------
// Tutto parte dal caricamento della pagina, così il riepilogo dell'avvio e i compiti lunghi iniziali ci sono anche se il
// misuratore si apre dopo. Senza ?misura queste funzioni non fanno niente.

const fasi = []; // { nome, t }: istanti (ms dall'apertura della pagina), una volta sola per nome
export function segna(nome, attivo = MISURA_ATTIVA) {
  if (!attivo || fasi.some((f) => f.nome === nome)) return;
  fasi.push({ nome, t: performance.now() });
}
export const fasiRegistrate = () => [...fasi];

const intervalli = []; // { nome, da, a }: lavori asincroni (lettura, scarico, scrittura)
// il lavoro `fn` (anche asincrono), cronometrato per intero; spento, è fn()
export function intervallo(nome, fn, attivo = MISURA_ATTIVA) {
  if (!attivo) return fn();
  const da = performance.now();
  const fine = () => intervalli.push({ nome, da, a: performance.now() });
  try {
    const r = fn();
    if (r && typeof r.then === 'function') return r.finally(fine);
    fine();
    return r;
  } catch (e) {
    fine();
    throw e;
  }
}
export const intervalliRegistrati = () => [...intervalli];

// letture e scritture sul telefono: IndexedDB (per archivio) e localStorage/sessionStorage
const sonde = { letture: [], transazioni: [], archivioWeb: { localStorage: { n: 0, byte: 0 }, sessionStorage: { n: 0, byte: 0 } } };
export const sondeRegistrate = () => sonde;

function installaSonde() {
  try {
    performance.setResourceTimingBufferSize?.(3000); // di base 250: le tessere della mappa riempiono subito il registro
  } catch {
    // pazienza
  }
  try {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      const o = this === globalThis.localStorage ? 'localStorage' : 'sessionStorage';
      sonde.archivioWeb[o].n++;
      sonde.archivioWeb[o].byte += String(k).length + String(v).length;
      return setItem.call(this, k, v);
    };
  } catch {
    // niente conteggio dell'archiviazione web
  }
  try {
    // ogni lettura di un intero archivio (getAll) con il tempo fino al risultato e quanti record
    for (const metodo of ['getAll', 'getAllKeys']) {
      const originale = IDBObjectStore.prototype[metodo];
      IDBObjectStore.prototype[metodo] = function (...a) {
        const richiesta = originale.apply(this, a);
        const inizio = performance.now();
        const store = this.name;
        richiesta.addEventListener('success', () => sonde.letture.push({ store, metodo, record: richiesta.result?.length ?? 0, da: inizio, ms: performance.now() - inizio }));
        return richiesta;
      };
    }
    // ogni transazione: archivi, modo, record scritti, durata fino a «complete»
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (archivi, modo, ...resto) {
      const tx = transaction.call(this, archivi, modo, ...resto);
      const voce = { archivi: [].concat(archivi).join('+'), modo: modo ?? 'readonly', scritti: 0, da: performance.now(), ms: null };
      const put = tx.objectStore.bind(tx);
      tx.objectStore = (nome) => {
        const st = put(nome);
        if (!st.__misurato) {
          st.__misurato = true;
          for (const m of ['put', 'add']) {
            const f = st[m].bind(st);
            st[m] = (...a) => {
              voce.scritti++;
              return f(...a);
            };
          }
        }
        return st;
      };
      tx.addEventListener('complete', () => {
        voce.ms = performance.now() - voce.da;
        if (voce.modo === 'readwrite') sonde.transazioni.push(voce);
      });
      return tx;
    };
  } catch {
    // niente sonde di IndexedDB
  }
}
// ---- lavori pianificati: timer, eventi, fotogrammi, tempi di riposo, risposte di IndexedDB e dei Worker ----
// Ogni funzione che il browser richiama (non solo quelle nostre) è cronometrata e registrata con l'origine di chi l'ha
// programmata: file:riga:colonna della build (con lo stesso commit, scripts/origine.mjs la traduce nel codice sorgente).
// Solo con ?misura e solo se dura almeno 15 ms, così il riepilogo dice cosa gira anche senza toccare niente.
const SOGLIA_LAVORO_MS = 15;
const origineProgrammazione = () => {
  // le prime due righe sono questa funzione e la sonda che la chiama: l'origine è chi ha programmato il lavoro
  const righe = String(new Error().stack ?? '').split('\n').slice(3);
  const r = righe.find((x) => !/lib\/misura|misura\.js|node_modules\/\.vite|<anonymous>$/.test(x) && /https?:\/\//.test(x));
  const m = r?.match(/(?:\/|\()([^/()]+?)(?:-\w{8})?\.js:(\d+):(\d+)/);
  return m ? `${m[1]}:${m[2]}:${m[3]}` : 'origine ignota';
};
function cronometraChiamata(f, nome, origine) {
  return function (...a) {
    const inizio = performance.now();
    try {
      return f.apply(this, a);
    } finally {
      const ms = performance.now() - inizio;
      if (ms >= SOGLIA_LAVORO_MS) registra(`${nome} da ${origine}`, ms);
    }
  };
}
export const paginaInSecondoPiano = { stato: false }; // vero se durante la misura la pagina è finita in secondo piano
function installaSondeLavori() {
  try {
    document.addEventListener('visibilitychange', () => document.hidden && (paginaInSecondoPiano.stato = true));
    for (const nome of ['setTimeout', 'setInterval']) {
      const originale = globalThis[nome];
      globalThis[nome] = function (f, ...a) {
        return typeof f === 'function' ? originale.call(this, cronometraChiamata(f, `${nome === 'setTimeout' ? 'timer' : 'intervallo'} (${Math.round(a[0] ?? 0)} ms)`, origineProgrammazione()), ...a) : originale.call(this, f, ...a);
      };
    }
    for (const nome of ['requestAnimationFrame', 'requestIdleCallback']) {
      const originale = globalThis[nome];
      if (typeof originale === 'function') globalThis[nome] = function (f, ...a) { return originale.call(this, cronometraChiamata(f, nome === 'requestAnimationFrame' ? 'fotogramma' : 'tempo di riposo', origineProgrammazione()), ...a); };
    }
    // ascoltatori di eventi (tocchi, risposte, messaggi dei Worker, caricamenti…): per tipo, bersaglio e origine
    const mappa = new WeakMap(); // ascoltatore originale → { chiave: avvolto }
    const aggiungi = EventTarget.prototype.addEventListener;
    const rimuovi = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (tipo, f, opzioni) {
      if (typeof f !== 'function') return aggiungi.call(this, tipo, f, opzioni);
      const cattura = typeof opzioni === 'object' ? Boolean(opzioni?.capture) : Boolean(opzioni);
      const chiave = `${tipo}|${cattura}`;
      const avvolti = mappa.get(f) ?? new Map();
      let w = avvolti.get(chiave);
      if (!w) {
        w = cronometraChiamata(f, `evento ${tipo} su ${this?.constructor?.name ?? '?'}`, origineProgrammazione());
        avvolti.set(chiave, w);
        mappa.set(f, avvolti);
      }
      return aggiungi.call(this, tipo, w, opzioni);
    };
    EventTarget.prototype.removeEventListener = function (tipo, f, opzioni) {
      const cattura = typeof opzioni === 'object' ? Boolean(opzioni?.capture) : Boolean(opzioni);
      return rimuovi.call(this, tipo, mappa.get(f)?.get(`${tipo}|${cattura}`) ?? f, opzioni);
    };
    // gestori assegnati come proprietà (onsuccess, oncomplete, onmessage…)
    const proprieta = [[IDBRequest, 'onsuccess'], [IDBRequest, 'onerror'], [IDBTransaction, 'oncomplete'], [Worker, 'onmessage'], [MessagePort, 'onmessage'], [XMLHttpRequest, 'onload']];
    for (const [Classe, nome] of proprieta) {
      const d = Object.getOwnPropertyDescriptor(Classe.prototype, nome) ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Classe.prototype), nome);
      if (!d?.set) continue;
      Object.defineProperty(Classe.prototype, nome, { ...d, set(f) { d.set.call(this, typeof f === 'function' ? cronometraChiamata(f, `${nome} (${Classe.name})`, origineProgrammazione()) : f); } });
    }
    // analisi e scrittura di JSON grandi
    for (const nome of ['parse', 'stringify']) {
      const originale = JSON[nome];
      JSON[nome] = function (...a) {
        const inizio = performance.now();
        try {
          return originale.apply(this, a);
        } finally {
          const ms = performance.now() - inizio;
          if (ms >= SOGLIA_LAVORO_MS) registra(`JSON.${nome} (${nome === 'parse' ? `${Math.round(String(a[0]).length / 1024)} KB` : 'oggetto'}) da ${origineProgrammazione()}`, ms);
        }
      };
    }
  } catch {
    // alcune sonde non sono possibili su questo browser
  }
}
if (MISURA_ATTIVA) {
  installaSonde();
  installaSondeLavori();
}

// ---------- riepilogo dell'avvio (calcoli puri, con i test) ----------

const kb = (byte) => (byte >= 1024 * 1024 ? `${(byte / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.round(byte / 1024)} KB`);
const nomeFile = (url, origineApp) => {
  try {
    const u = new URL(url);
    return u.origin === origineApp ? u.pathname.split('/').pop() || u.pathname : `${u.host}${u.pathname.length > 24 ? `${u.pathname.slice(0, 24)}…` : u.pathname}`;
  } catch {
    return String(url).slice(0, 40);
  }
};

// gruppo di una risorsa: file dell'app, dati dell'app (json), mappa e servizi esterni
export function gruppoRisorsa(url, origineApp) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return 'altro';
  }
  if (u.origin !== origineApp) return /tile|maplibre|openfree|opentopo|arcgis|waymarked|\.pbf|\.png|\.jpg|\.webp|sprite|glyphs/i.test(u.href) ? 'mappa (tessere, stili, caratteri)' : 'servizi esterni';
  if (/\/dati\//.test(u.pathname)) return 'dati dell\'app (json)';
  if (/\.(woff2?|ttf)$/.test(u.pathname)) return 'caratteri';
  return 'file dell\'app (html, js, css, icone)';
}

// risorse: [{ nome, inizio, fine, trasferiti, compressi, decompressi }]; fineMappa: istante della «mappa usabile»
export function righeRisorse(risorse, origineApp, fineMappa = Infinity) {
  const gruppi = new Map();
  const somma = (g, r, prima) => {
    const x = gruppi.get(g) ?? { n: 0, trasferiti: 0, compressi: 0, decompressi: 0, primaN: 0, primaTrasferiti: 0 };
    x.n++;
    x.trasferiti += r.trasferiti;
    x.compressi += r.compressi;
    x.decompressi += r.decompressi;
    if (prima) {
      x.primaN++;
      x.primaTrasferiti += r.trasferiti;
    }
    gruppi.set(g, x);
  };
  for (const r of risorse) somma(gruppoRisorsa(r.nome, origineApp), r, r.fine <= fineMappa);
  const righe = [...gruppi]
    .sort((a, b) => b[1].trasferiti - a[1].trasferiti)
    .map(([g, x]) => `  ${g}: ${x.n} file · ${kb(x.trasferiti)} dalla rete (${kb(x.compressi)} compressi, ${kb(x.decompressi)} aperti) · fino alla mappa usabile ${x.primaN} file, ${kb(x.primaTrasferiti)}`);
  const grandi = [...risorse]
    .sort((a, b) => b.decompressi - a.decompressi)
    .slice(0, 8)
    .map((r) => `  ${nomeFile(r.nome, origineApp)}: ${kb(r.compressi)} compressi, ${kb(r.decompressi)} aperti · ${r.trasferiti === 0 && r.compressi > 0 ? 'da cache' : `${kb(r.trasferiti)} dalla rete`} · scaricato in ${Math.round(r.fine - r.inizio)} ms, finito a ${Math.round(r.fine)} ms`);
  return { gruppi: righe, grandi };
}

// cronologia: fasi (istanti) e intervalli (da–a), in ordine di inizio
export function righeCronologia(fasi, intervalliLavori) {
  const voci = [
    ...fasi.map((f) => ({ t: f.t, testo: `${String(Math.round(f.t)).padStart(5)} ms  ${f.nome}` })),
    ...intervalliLavori.map((i) => ({ t: i.da, testo: `${String(Math.round(i.da)).padStart(5)} ms  ${i.nome}: ${durata(i.a - i.da)} (finito a ${Math.round(i.a)} ms)` })),
  ];
  return voci.sort((a, b) => a.t - b.t).map((v) => `  ${v.testo}`);
}

// quando la mappa è usabile: la pagina mostrata e la mappa di base disegnata (la più tarda delle due)
export function istanteMappaUsabile(fasi) {
  const t = (nome) => fasi.find((f) => f.nome === nome)?.t;
  const pagina = t('pagina mostrata');
  const base = t('mappa base: prima immagine completa');
  const disegno = t('mappa: primo disegno completato');
  const valori = [pagina, base, disegno].filter(Number.isFinite);
  return valori.length ? Math.max(...valori) : null;
}

// letture e scritture di IndexedDB e dell'archiviazione web
export function righeSonde(sonde) {
  const righe = [];
  const letture = sonde.letture.filter((l) => l.record > 0 || l.ms > 5);
  righe.push(`  letture: ${letture.length ? letture.map((l) => `${l.store} (${l.metodo}) ${l.record} record in ${Math.round(l.ms)} ms`).join(' · ') : 'nessuna'}`);
  const tx = sonde.transazioni.filter((t) => t.scritti > 0);
  righe.push(`  scritture in IndexedDB: ${tx.length ? tx.map((t) => `${t.archivi}: ${t.scritti} record in ${Math.round(t.ms)} ms (a ${Math.round(t.da)} ms)`).join(' · ') : 'nessuna'}`);
  const w = sonde.archivioWeb;
  righe.push(`  localStorage: ${w.localStorage.n} scritture (${kb(w.localStorage.byte)}) · sessionStorage: ${w.sessionStorage.n} scritture (${kb(w.sessionStorage.byte)})`);
  return righe;
}

// Compiti lunghi con quello che c'era dentro: [{ inizio, durata, script?: [{ origine, durata }] }] (ms dall'apertura della
// pagina o dall'inizio della prova), lavori cronometrati ({ nome, da, ms }) ed eventi ({ t, testo }).
// soglia: sotto non si elenca. → righe, dal più lungo
export function attribuisciLunghi(lunghi, lavori, eventi, { soglia = 100, massimo = 12, inizio = 0 } = {}) {
  const oltre = lunghi.filter((l) => l.durata >= soglia).sort((a, b) => b.durata - a.durata);
  const righe = oltre.slice(0, massimo).map((l) => {
    const fine = l.inizio + l.durata;
    const dentro = lavori.filter((w) => w.da < fine && w.da + w.ms > l.inizio).sort((a, b) => b.ms - a.ms).slice(0, 3);
    const prima = [...eventi].filter((e) => e.t <= fine && e.t >= l.inizio - 400).sort((a, b) => b.t - a.t).slice(0, 2);
    const script = (l.script ?? []).filter((x) => x.durata >= 10).sort((a, b) => b.durata - a.durata).slice(0, 2);
    const parti = [
      prima.length ? `evento: ${prima.map((e) => `${e.testo} (${e.t < l.inizio ? '−' : '+'}${Math.abs(Math.round(e.t - l.inizio))} ms)`).join(', ')}` : 'nessun evento vicino',
      dentro.length ? `lavori: ${dentro.map((w) => `${w.nome} ${Math.round(w.ms)} ms`).join(', ')}` : '',
      script.length ? `script: ${script.map((x) => `${x.origine} ${Math.round(x.durata)} ms`).join(', ')}` : '',
    ].filter(Boolean);
    return `  a ${((l.inizio - inizio) / 1000).toFixed(1).replace('.', ',')} s · ${Math.round(l.durata)} ms · ${parti.join(' · ')}`;
  });
  const totale = oltre.reduce((n, l) => n + l.durata, 0);
  const testa = oltre.length ? `${oltre.length} sopra ${soglia} ms (totale ${durata(totale)}, il più lungo ${ms(oltre[0].durata)})` : `nessuno sopra ${soglia} ms`;
  return { testa, righe };
}

// I fotogrammi lunghi che non bloccano (blockingDuration sotto 50 ms) sono attese di disegno o di una pagina in secondo
// piano, non lavoro che ferma lo schermo: si contano a parte. voci: [{ durata, bloccante (ms | undefined), ... }]
export function dividiPerBlocco(voci) {
  const bloccanti = voci.filter((v) => v.bloccante == null || v.bloccante >= 50);
  return { bloccanti, lenti: voci.length - bloccanti.length };
}
