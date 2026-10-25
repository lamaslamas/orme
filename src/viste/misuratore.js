// Pannello del misuratore (solo con ?misura): prove ripetibili da 10 secondi (mappa con Fauna, zoom 12
// e 15, tendina), poi un riepilogo da copiare con fotogrammi, compiti lunghi, tempi dei lavori a fine
// movimento, disegno delle mappe MapLibre, telefono, schermo e livelli accesi. Si carica solo con ?misura (main.js).
import { stato } from '../stato.js';
import {
  azzeraTempi,
  tempiRegistrati,
  contatoriRegistrati,
  mappeGlRegistrate,
  mappaRegistrata,
  statisticheFotogrammi,
  righeTempi,
  riassuntoLunghi,
  riassuntoFotogrammiLunghi,
  fasiRegistrate,
  intervalliRegistrati,
  sondeRegistrate,
  cronologiaLavori,
  azzeraCronologia,
  righeRisorse,
  righeCronologia,
  righeSonde,
  istanteMappaUsabile,
  attribuisciLunghi,
} from '../lib/misura.js';
import { NOMI_LIVELLI } from './cartografia.js';

const DURATA_S = 10;
const PREPARA_MS = 3000; // la mappa si mette nel punto di prova e carica, poi parte il conto
// punto di prova: PNALM, Pescasseroli; la prova lo rimette da sola, così lo zoom è sempre lo stesso
const CENTRO_PROVA = [41.8, 13.79];
const PROVE = {
  mappa: {
    nome: 'mappa (PNALM, zoom 13, Fauna)',
    zoom: 13,
    testo: 'Fauna accesa con heatmap e segnaposto. Quando parte il conto, per 10 secondi trascina la mappa con un dito in tutte le direzioni, senza fermarti, senza zoom e senza toccare la tendina.',
  },
  lontano: {
    nome: 'mappa da lontano (zoom 12)',
    zoom: 12,
    testo: 'Solo trascinare: per 10 secondi sposta la mappa avanti e indietro senza fermarti e senza zoom.',
  },
  vicino: {
    nome: 'mappa da vicino (zoom 15)',
    zoom: 15,
    testo: 'Come sopra, a zoom 15 (con rifugi, acqua e fauna da vicino): solo trascinare, senza zoom.',
  },
  tendina: {
    nome: 'tendina',
    testo: 'Apri «Percorsi qui» e per 10 secondi trascina la tendina su e giù, e scorri l\'elenco.',
  },
};

const VERSIONE = typeof __VERSIONE__ !== 'undefined' ? __VERSIONE__ : 'sviluppo';

async function dispositivo() {
  const ua = navigator.userAgentData;
  let modello = '';
  let browser = '';
  let sistema = '';
  try {
    const v = await ua?.getHighEntropyValues?.(['model', 'platformVersion', 'fullVersionList']);
    modello = v?.model ?? '';
    sistema = ua?.platform ? `${ua.platform} ${v?.platformVersion ?? ''}`.trim() : '';
    const b = (v?.fullVersionList ?? []).find((x) => /Chrome|Edge|Opera|Samsung/i.test(x.brand) && !/Chromium/i.test(x.brand));
    browser = b ? `${b.brand} ${b.version}` : '';
  } catch {
    // browser senza userAgentData: si usa la stringa intera
  }
  if (!browser) browser = navigator.userAgent;
  return [browser, sistema, modello].filter(Boolean).join(' · ');
}

function livelliAccesi() {
  const s = stato.leggi();
  const accesi = Object.entries(s.livelli ?? {})
    .filter(([, v]) => v)
    .map(([k]) => NOMI_LIVELLI[k] ?? k);
  let gruppi = '';
  try {
    gruppi = JSON.parse(localStorage.getItem('orme.gruppiIntorno') ?? 'null')?.join?.(', ') ?? '';
  } catch {
    // niente gruppi ricordati
  }
  return `${accesi.join(', ') || 'nessuno'} · base ${s.base ?? '?'}${gruppi ? ` · gruppi fauna: ${gruppi}` : ''}`;
}

function conteggi() {
  const segnaposto = document.querySelectorAll('.leaflet-marker-icon').length;
  const tele = document.querySelectorAll('.leaflet-pane canvas, .leaflet-overlay-pane canvas').length;
  const webgl = document.querySelectorAll('canvas.maplibregl-canvas').length;
  const altri = [...contatoriRegistrati()].map(([nome, n]) => ` · ${nome} ${n}`).join('');
  return `segnaposto HTML ${segnaposto} · tele canvas Leaflet ${tele} · mappe WebGL ${webgl}${mappeGlRegistrate().length ? ` (${mappeGlRegistrate().join(', ')})` : ''}${altri}`;
}

// origine di uno script di un fotogramma lungo: file (senza l'impronta della build) e tipo di chiamata
function origine(sc) {
  const file = String(sc.sourceURL ?? '')
    .split('/')
    .pop()
    .replace(/[-.][\w-]{8}\.js$/, '')
    .replace(/\?.*$/, '');
  const chiamata = sc.invokerType === 'event-listener' ? String(sc.invoker ?? '').split('.').pop() : sc.invokerType;
  return [file || 'sconosciuto', chiamata].filter(Boolean).join(' · ');
}

export function avviaMisuratore() {
  const pannello = document.createElement('section');
  pannello.className = 'misuratore';
  pannello.setAttribute('aria-label', 'Misura delle prestazioni');
  document.body.appendChild(pannello);
  let ultimo = '';

  function iniziale() {
    pannello.classList.remove('in-corso');
    pannello.innerHTML = `
      <div class="misuratore-testa"><b>Misura</b><span class="piccolo">versione ${VERSIONE.split(' ')[0]}</span><span><button type="button" class="bottone testo" data-m="riduci" aria-label="Riduci">–</button><button type="button" class="bottone testo" data-m="chiudi" aria-label="Chiudi il misuratore" title="Chiudi">✕</button></span></div>
      <div class="misuratore-corpo">
        <p class="piccolo"><button type="button" class="bottone testo" data-m="aggiorna">Aggiorna l'app</button> <span data-aggiornamento></span></p>
        <ol>
          <li>Scegli la prova: la mappa va da sola sul PNALM (Pescasseroli) con Fauna accesa, poi parte il conto.
            <div class="misuratore-prove">
              <button type="button" class="bottone primario" data-m="mappa">Mappa (10 s)</button>
              <button type="button" class="bottone" data-m="lontano">Zoom 12 (10 s)</button>
              <button type="button" class="bottone" data-m="vicino">Zoom 15 (10 s)</button>
              <button type="button" class="bottone" data-m="tendina">Tendina (10 s)</button>
            </div>
            <p class="piccolo">Mappa: ${PROVE.mappa.testo}<br>Zoom 12 e 15: ${PROVE.lontano.testo}<br>Tendina: ${PROVE.tendina.testo}</p>
            <div class="misuratore-prove">
              <button type="button" class="bottone" data-m="avvio">Avvio (subito)</button>
              <button type="button" class="bottone" data-m="uso">Uso normale (30 s)</button>
              <button type="button" class="bottone testo" data-m="ricarica">Ricarica la pagina</button>
            </div>
            <p class="piccolo">Avvio: il riepilogo di come si è aperta questa pagina (tempi, file scaricati, letture e scritture sul telefono). Per un avvio a freddo chiudi la scheda e riaprila con ?misura, oppure «Ricarica la pagina» e poi «Avvio».<br>Uso normale: per 30 secondi usa l'app come sempre (sposta la mappa, zoom, apri Fauna e Percorsi qui); il riepilogo dice cosa ha bloccato lo schermo per più di 100 ms.</p></li>
          <li>Copia il riepilogo e incollalo nella chat.</li>
        </ol>
        ${ultimo ? `<pre class="misuratore-riepilogo">${ultimo.replace(/</g, '&lt;')}</pre><button type="button" class="bottone primario" data-m="copia">Copia il riepilogo</button><p class="piccolo" data-esito></p>` : ''}
      </div>`;
  }

  // mappa della home nel punto di prova, con Fauna accesa
  async function puntoDiProva(zoom) {
    if (location.hash && location.hash !== '#/') location.hash = '#/';
    stato.imposta({ livelli: { heatmap: true } });
    for (let i = 0; i < 20 && !mappaRegistrata()?._loaded; i++) await new Promise((r) => setTimeout(r, 250));
    mappaRegistrata()?.setView(CENTRO_PROVA, zoom, { animate: false });
  }

  async function prova(chiave) {
    const p = PROVE[chiave];
    if (p.zoom) {
      pannello.classList.add('in-corso');
      pannello.innerHTML = `<div class="misuratore-testa"><b>Preparo la mappa… non toccare ancora</b></div><p class="piccolo">${p.testo}</p>`;
      await puntoDiProva(p.zoom);
      await new Promise((r) => setTimeout(r, PREPARA_MS));
    }
    const zoomInizio = mappaRegistrata()?._loaded ? mappaRegistrata().getZoom() : null;
    azzeraTempi();
    const durate = [];
    const lunghi = [];
    const fotogrammiLunghi = [];
    const osservatori = [];
    try {
      const o = new PerformanceObserver((l) => l.getEntries().forEach((e) => lunghi.push(e.duration)));
      o.observe({ type: 'longtask' });
      osservatori.push(o);
    } catch {
      // longtask non disponibile
    }
    try {
      const o = new PerformanceObserver((l) =>
        l.getEntries().forEach((e) => {
          const fine = e.startTime + e.duration;
          const scripts = e.scripts ?? [];
          const script = scripts.reduce((n, sc) => n + sc.duration, 0);
          const stile = e.styleAndLayoutStart ? Math.max(0, fine - e.styleAndLayoutStart) : 0;
          fotogrammiLunghi.push({ script, stile, altro: Math.max(0, e.duration - script - stile), origini: scripts.map((sc) => ({ origine: origine(sc), durata: sc.duration })) });
        }),
      );
      o.observe({ type: 'long-animation-frame' });
      osservatori.push(o);
    } catch {
      // long-animation-frame non disponibile (browser vecchio o non Chrome)
    }
    // conto alla rovescia piccolo, per lasciare libera la mappa
    pannello.classList.add('in-corso');
    pannello.innerHTML = `<div class="misuratore-testa"><b>${p.zoom ? 'Via! Trascina la mappa' : `Prova ${p.nome}`}</b> <span data-conto>${DURATA_S}</span> s</div><p class="piccolo">${p.testo}</p>`;
    const inizio = performance.now();
    let prima = inizio;
    await new Promise((fine) => {
      const passo = (t) => {
        durate.push(t - prima);
        prima = t;
        const resto = DURATA_S - (t - inizio) / 1000;
        const conto = pannello.querySelector('[data-conto]');
        if (conto) conto.textContent = String(Math.max(0, Math.ceil(resto)));
        if (resto > 0) requestAnimationFrame(passo);
        else fine();
      };
      requestAnimationFrame(passo);
    });
    osservatori.forEach((o) => o.disconnect());
    const secondi = (performance.now() - inizio) / 1000;
    const f = statisticheFotogrammi(durate.slice(1), secondi);
    const m = mappaRegistrata();
    const c = m?._loaded ? m.getCenter() : null;
    ultimo = [
      `Orme · misura «${p.nome}» · ${new Date().toLocaleString('it-IT')}`,
      `Versione: ${VERSIONE}`,
      `Dispositivo: ${await dispositivo()}`,
      `Schermo: ${innerWidth}×${innerHeight} CSS · dpr ${devicePixelRatio} · ${navigator.hardwareConcurrency ?? '?'} core${navigator.deviceMemory ? ` · ${navigator.deviceMemory} GB` : ''}`,
      `Mappa: ${c ? `zoom ${zoomInizio != null ? `${zoomInizio.toFixed(1)} → ` : ''}${m.getZoom().toFixed(1)} · centro ${c.lat.toFixed(3)}, ${c.lng.toFixed(3)}` : 'non aperta'} · pagina ${location.hash || '#/'}`,
      `Livelli: ${livelliAccesi()}`,
      `Fotogrammi: ${f.fotogrammi} in ${secondi.toFixed(1).replace('.', ',')} s · ${f.fps} al secondo · persi ${f.persi} (${f.quotaPersi}%) · mediana ${f.mediana} ms · p95 ${f.p95} ms · peggiore ${f.peggiore} ms`,
      `Compiti lunghi (>50 ms): ${riassuntoLunghi(lunghi)}`,
      'Fotogrammi lunghi:',
      ...(riassuntoFotogrammiLunghi(fotogrammiLunghi).length ? riassuntoFotogrammiLunghi(fotogrammiLunghi) : ['  nessuno (o non misurabili su questo browser)']),
      'Lavori misurati:',
      ...(righeTempi(tempiRegistrati()).length ? righeTempi(tempiRegistrati()) : ['  nessuno']),
      `Elementi: ${conteggi()}`,
    ].join('\n');
    iniziale();
  }

  async function testaRiepilogo(nome) {
    const m = mappaRegistrata();
    const c = m?._loaded ? m.getCenter() : null;
    return [
      `Orme · misura «${nome}» · ${new Date().toLocaleString('it-IT')}`,
      `Versione: ${VERSIONE}`,
      `Dispositivo: ${await dispositivo()}`,
      `Schermo: ${innerWidth}×${innerHeight} CSS · dpr ${devicePixelRatio} · ${navigator.hardwareConcurrency ?? '?'} core${navigator.deviceMemory ? ` · ${navigator.deviceMemory} GB` : ''}`,
      `Mappa: ${c ? `zoom ${m.getZoom().toFixed(1)} · centro ${c.lat.toFixed(3)}, ${c.lng.toFixed(3)}` : 'non aperta'} · pagina ${location.hash || '#/'}`,
      `Livelli: ${livelliAccesi()}`,
    ];
  }

  // osserva (da subito, anche per quello che è già successo) un tipo di voci del browser
  function leggiVoci(tipo, attesaMs = 250) {
    return new Promise((fine) => {
      const voci = [];
      try {
        const o = new PerformanceObserver((l) => voci.push(...l.getEntries()));
        o.observe({ type: tipo, buffered: true });
        setTimeout(() => {
          o.disconnect();
          fine(voci);
        }, attesaMs);
      } catch {
        fine(null); // tipo non disponibile su questo browser
      }
    });
  }
  const comeLunghi = (voci, loaf) =>
    (voci ?? []).map((e) => ({
      inizio: e.startTime,
      durata: e.duration,
      script: loaf ? (e.scripts ?? []).map((sc) => ({ origine: origine(sc), durata: sc.duration })) : [],
    }));

  // Avvio: come si è aperta la pagina (dall'apertura fino a ora)
  async function provaAvvio() {
    pannello.classList.add('in-corso');
    pannello.innerHTML = '<div class="misuratore-testa"><b>Leggo i dati dell\'avvio…</b></div>';
    const nav = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime;
    const lcpVoci = await leggiVoci('largest-contentful-paint');
    const lcp = lcpVoci?.at(-1)?.startTime;
    const fasi = fasiRegistrate();
    const usabile = istanteMappaUsabile(fasi);
    const origineApp = location.origin;
    const risorse = performance.getEntriesByType('resource').map((r) => ({
      nome: r.name,
      inizio: r.startTime,
      fine: r.responseEnd,
      trasferiti: r.transferSize,
      compressi: r.encodedBodySize,
      decompressi: r.decodedBodySize,
    }));
    const { gruppi, grandi } = righeRisorse(risorse, origineApp, usabile ?? Infinity);
    const lunghi = comeLunghi(await leggiVoci('longtask'));
    const lunghiLoaf = comeLunghi(await leggiVoci('long-animation-frame'), true);
    const base = lunghiLoaf.length ? lunghiLoaf : lunghi;
    const attribuiti = attribuisciLunghi(base, cronologiaLavori(), fasi.map((f) => ({ t: f.t, testo: f.nome })), { soglia: 100, massimo: 8 });
    const ms = (x) => (Number.isFinite(x) ? `${Math.round(x)} ms` : 'non disponibile');
    ultimo = [
      ...(await testaRiepilogo('avvio')),
      `Pagina aperta con: ${nav?.type ?? '?'} · service worker che controlla la pagina: ${navigator.serviceWorker?.controller ? 'sì' : 'no'} · rete: ${navigator.connection?.effectiveType ?? '?'}`,
      `Tempi dall'apertura: risposta HTML ${ms(nav?.responseStart)} · DOM interattivo ${ms(nav?.domInteractive)} · pagina caricata ${ms(nav?.loadEventEnd)} · primo contenuto ${ms(fcp)} · contenuto più grande ${ms(lcp)}`,
      `MAPPA USABILE (pagina mostrata, base disegnata, primo disegno): ${ms(usabile)}`,
      'Cronologia:',
      ...righeCronologia(fasi, intervalliRegistrati()),
      `File ricevuti dalla rete (${risorse.length} richieste):`,
      ...gruppi,
      'I più grandi:',
      ...grandi,
      'Letture e scritture sul telefono:',
      ...righeSonde(sondeRegistrate()),
      `Compiti lunghi dall'apertura (${lunghiLoaf.length ? 'fotogrammi lunghi' : 'long task'}): ${attribuiti.testa}`,
      ...attribuiti.righe,
      `Elementi: ${conteggi()}`,
    ].join('\n');
    iniziale();
  }

  // descrizione breve di dove si è toccato
  function descrivi(el) {
    const e = el?.closest?.('button,a,label,input,select,[data-azione],[data-scelta],[role=radio],.leaflet-container') ?? el;
    if (!e?.tagName) return 'tocco';
    const id = e.id ? `#${e.id}` : e.dataset?.azione ? `[${e.dataset.azione}]` : e.dataset?.scelta ? `[${e.dataset.scelta}=${e.dataset.valore ?? ''}]` : `${e.tagName.toLowerCase()}${e.classList?.[0] ? `.${e.classList[0]}` : ''}`;
    const testo = (e.innerText ?? '').trim().replace(/\s+/g, ' ').slice(0, 18);
    return `tocco su ${id}${testo ? ` «${testo}»` : ''}`;
  }

  // Uso normale: 30 secondi di uso libero; compiti lunghi sopra 100 ms con evento e lavori che li accompagnano
  async function provaUso() {
    azzeraTempi();
    azzeraCronologia();
    const eventi = [];
    const aggiungi = (testo) => eventi.push({ t: performance.now(), testo });
    const sulTocco = (e) => aggiungi(descrivi(e.target));
    document.addEventListener('pointerdown', sulTocco, true);
    const m = mappaRegistrata();
    const suMappa = ['movestart', 'zoomstart', 'moveend', 'zoomend'];
    const registraMoto = (e) => aggiungi(`mappa: ${{ movestart: 'inizio spostamento', zoomstart: 'inizio zoom', moveend: 'fine spostamento', zoomend: 'fine zoom' }[e.type]} (zoom ${m.getZoom().toFixed(1)})`);
    if (m) for (const t of suMappa) m.on(t, registraMoto);
    let prima = stato.leggi();
    const scollega = stato.ascolta((nuovo) => {
      const cambiati = Object.keys(nuovo.livelli ?? {}).filter((k) => nuovo.livelli[k] !== prima.livelli?.[k]);
      if (cambiati.length) aggiungi(`livello: ${cambiati.map((k) => `${NOMI_LIVELLI[k] ?? k} ${nuovo.livelli[k] ? 'acceso' : 'spento'}`).join(', ')}`);
      if (nuovo.specie !== prima.specie) aggiungi(`animale: ${nuovo.specie || 'nessuno'}`);
      prima = nuovo;
    });
    const lunghi = [];
    const lunghiLoaf = [];
    const osservatori = [];
    for (const [tipo, dove] of [['longtask', lunghi], ['long-animation-frame', lunghiLoaf]]) {
      try {
        const o = new PerformanceObserver((l) => dove.push(...l.getEntries()));
        o.observe({ type: tipo });
        osservatori.push(o);
      } catch {
        // tipo non disponibile
      }
    }
    const inizio = performance.now();
    pannello.classList.add('in-corso');
    pannello.innerHTML = `<div class="misuratore-testa"><b>Usa l'app come sempre</b> <span data-conto>30</span> s</div><p class="piccolo">Sposta la mappa, fai zoom, apri Fauna e Percorsi qui, sceglili… senza fermarti.</p>`;
    await new Promise((fine) => {
      const passo = () => {
        const resto = 30 - (performance.now() - inizio) / 1000;
        const conto = pannello.querySelector('[data-conto]');
        if (conto) conto.textContent = String(Math.max(0, Math.ceil(resto)));
        if (resto > 0) setTimeout(passo, 250);
        else fine();
      };
      passo();
    });
    await new Promise((r) => setTimeout(r, 300)); // gli ultimi compiti arrivano un attimo dopo
    document.removeEventListener('pointerdown', sulTocco, true);
    if (m) for (const t of suMappa) m.off(t, registraMoto);
    scollega();
    osservatori.forEach((o) => o.disconnect());
    const base = lunghiLoaf.length ? comeLunghi(lunghiLoaf, true) : comeLunghi(lunghi);
    const attribuiti = attribuisciLunghi(base, cronologiaLavori(), eventi, { soglia: 100, inizio });
    const lunghi50 = comeLunghi(lunghi).map((x) => x.durata);
    const fotogrammi = lunghiLoaf.map((e) => ({
      script: (e.scripts ?? []).reduce((n, sc) => n + sc.duration, 0),
      stile: e.styleAndLayoutStart ? Math.max(0, e.startTime + e.duration - e.styleAndLayoutStart) : 0,
      altro: 0,
      origini: (e.scripts ?? []).map((sc) => ({ origine: origine(sc), durata: sc.duration })),
    }));
    const tocchi = eventi.filter((e) => e.testo.startsWith('tocco')).length;
    const mosse = eventi.filter((e) => e.testo.startsWith('mappa: fine')).length;
    ultimo = [
      ...(await testaRiepilogo('uso normale (30 s)')),
      `Cosa è successo: ${tocchi} tocchi, ${mosse} spostamenti o zoom della mappa, ${eventi.length - tocchi - mosse} altri eventi`,
      `Compiti lunghi: ${attribuiti.testa}`,
      ...attribuiti.righe,
      `Compiti lunghi sopra 50 ms (tutti): ${riassuntoLunghi(lunghi50)}`,
      'Fotogrammi lunghi (script, stile, altro):',
      ...(fotogrammi.length ? riassuntoFotogrammiLunghi(fotogrammi) : ['  nessuno (o non misurabili su questo browser)']),
      'Lavori misurati:',
      ...(righeTempi(tempiRegistrati()).length ? righeTempi(tempiRegistrati()) : ['  nessuno']),
      `Elementi: ${conteggi()}`,
    ].join('\n');
    iniziale();
  }

  // "Aggiorna l'app": chiede al service worker se c'è una versione nuova; se sì, la pagina si
  // ricarica da sola quando è pronta (main.js, controllerchange)
  async function aggiorna() {
    const testo = pannello.querySelector('[data-aggiornamento]');
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (!reg) return void (testo.textContent = 'Aggiornamento automatico non disponibile qui.');
    testo.textContent = 'Controllo…';
    try {
      await reg.update();
    } catch {
      return void (testo.textContent = 'Non riesco a controllare (sei offline?).');
    }
    const nuova = reg.installing ?? reg.waiting;
    if (!nuova) return void (testo.textContent = `È già l'ultima versione (${VERSIONE.split(' ')[0]}).`);
    testo.textContent = 'Scarico la versione nuova: la pagina si ricarica da sola.';
    nuova.addEventListener('statechange', () => nuova.state === 'activated' && location.reload());
  }

  pannello.addEventListener('click', async (e) => {
    const azione = e.target.closest('[data-m]')?.dataset.m;
    if (azione === 'riduci') pannello.classList.toggle('ridotto');
    else if (azione === 'chiudi') pannello.remove(); // torna con ?misura alla prossima apertura
    else if (azione === 'aggiorna') aggiorna();
    else if (azione === 'avvio') provaAvvio();
    else if (azione === 'uso') provaUso();
    else if (azione === 'ricarica') location.reload();
    else if (PROVE[azione]) prova(azione);
    else if (azione === 'copia') {
      const esito = pannello.querySelector('[data-esito]');
      try {
        await navigator.clipboard.writeText(ultimo);
        esito.textContent = 'Copiato.';
      } catch {
        // senza appunti: si seleziona il testo da copiare a mano
        const sel = getSelection();
        sel.selectAllChildren(pannello.querySelector('.misuratore-riepilogo'));
        esito.textContent = 'Testo selezionato: copialo con «Copia».';
      }
    }
  });
  iniziale();
}
