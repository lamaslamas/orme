// Livelli "Rifugi e bivacchi" e "Acqua" (da OpenStreetMap, file dati/punti.json scaricato dal robot).
// Due interruttori separati; le icone compaiono solo da vicino per non affollare la mappa.
import L from 'leaflet';
import { leggiPuntiIntorno, leggiCellaPunti, salvaCellaPunti } from '../db.js';
import { interrogaOverpass } from '../lib/overpass.js';
import { percorsoCoperto } from '../lib/lungoIlPercorso.js';
import { zoneCoperte } from './copertura.js';
import { puntiDelRobot } from './puntiRobot.js';

const senzaDoppioni = (punti) => [...new Map(punti.map((p) => [p.id, p])).values()];
// da questo zoom i quadrati del robot (file piccoli); le celle da Overpass solo da zoom 13
const ZOOM_ROBOT = 11;
import { escapeHtml } from '../lib/formato.js';
import { celleNelRiquadro, cellaScaduta, ZOOM_CELLE, queryPuntiParco, puntiDallaRisposta, inCentroAbitato } from '../lib/puntiUtili.js';
import { sulMappa, TIPI_PUNTO, noteDelPunto, righeRifugio, puntiLungoIlPercorso, riassuntoPunti, puntiNelRiquadro, RAGGIO_LUNGO_IL_PERCORSO_M, perLaNotte, categoriaAcqua, acquaSuCuiContare, CATEGORIE_ACQUA } from '../lib/puntiUtili.js';
import { kmLungoLaTraccia, lunghezzaDeiPezzi, trattoPiuLungoSenza, km1 } from '../lib/lungoIlPercorso.js';
import { cronometra } from '../lib/misura.js';
import { partiDaSvg } from '../lib/tracciati.js';
import { SegnoSuTela, telaSegni, disegnaTracciati } from './segniSuTela.js';

// da vicino le icone; da lontano pallini colorati (leggeri, su canvas) per avere il quadro d'insieme
export const ZOOM_PUNTI = 12;
export const ZOOM_PALLINI = 8; // più lontano (scala nazionale) sarebbero solo macchie
const GRUPPI = ['rifugi', 'acqua'];
const COLORE_GRUPPO = { rifugi: '#9a4b2f', acqua: '#2a7bbf' };

const ICONE = {
  rifugio: '<path d="M3 11 12 4l9 7v9H3z" fill="currentColor"/><path d="M10 20v-5h4v5" fill="#fff"/>',
  bivacco: '<path d="M12 4 2 20h20z" fill="currentColor"/><path d="M12 12l-3 8h6z" fill="#fff"/>',
  ricovero: '<path d="M2 11 12 5l10 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M5 11v9M19 11v9" stroke="currentColor" stroke-width="3"/>',
  fonte: '<path d="M12 3s7 8 7 12a7 7 0 0 1-14 0c0-4 7-12 7-12z" fill="currentColor"/>',
  fontanella: '<path d="M12 3s7 8 7 12a7 7 0 0 1-14 0c0-4 7-12 7-12z" fill="currentColor"/><path d="M9 15a3 3 0 0 0 3 3" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
};

let datiInCorso = null;
// quelli dei parchi (file pubblico) più quelli di "Intorno a me" (salvati sul telefono)
export function caricaPunti() {
  datiInCorso ??= Promise.all([
    fetch(`${import.meta.env.BASE_URL}dati/punti.json`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
    leggiPuntiIntorno().catch(() => []),
  ]).then(([d, intorno]) => {
    if (!d && !intorno.length) {
      datiInCorso = null; // si riprova la prossima volta
      return null;
    }
    // un punto in due zone sovrapposte si tiene una volta sola
    const visti = new Map();
    for (const { punti } of Object.values(d?.parchi ?? {})) for (const p of punti) visti.set(p.id, p);
    for (const p of intorno) visti.set(p.id, p);
    return [...visti.values()];
  });
  return datiInCorso;
}
// dopo aver scaricato i punti di una zona nuova
export function dimenticaPunti() {
  datiInCorso = null;
}

// Segno di un punto sulla tela, come l'icona HTML di prima: cerchio colorato con bordo bianco, ombra
// leggera e il simbolo. Disegnato una volta per tipo (immagine pronta), poi solo copiato.
const segniPronti = new Map();
function disegnoPunto(tipo, chiuso) {
  const chiave = `${tipo}|${chiuso ? 1 : 0}`;
  if (!segniPronti.has(chiave)) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const lato = 28; // 24 px più l'ombra
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(lato * dpr);
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.save();
    ctx.shadowColor = 'rgba(37, 50, 56, 0.45)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1;
    ctx.beginPath();
    ctx.arc(lato / 2, lato / 2, 11, 0, Math.PI * 2);
    ctx.fillStyle = chiuso ? '#8a8f8c' : COLORE_GRUPPO[TIPI_PUNTO[tipo]?.gruppo] ?? '#2a7bbf';
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    disegnaTracciati(ctx, partiDaSvg(ICONE[tipo] ?? ''), lato / 2, lato / 2, 14, '#fff');
    segniPronti.set(chiave, c);
  }
  const img = segniPronti.get(chiave);
  return (ctx, x, y) => ctx.drawImage(img, x - 14, y - 14, 28, 28);
}

export function htmlIconaPunto(tipo) {
  return `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">${ICONE[tipo]}</svg>`;
}

function popup(p) {
  const t = TIPI_PUNTO[p.tipo];
  const note = noteDelPunto(p);
  const url = `https://www.openstreetmap.org/${{ n: 'node', w: 'way', r: 'relation' }[p.id[0]]}/${p.id.slice(1)}`;
  return `<div class="popup-punto">
    <span class="tipo-punto ${t.gruppo}">${htmlIconaPunto(p.tipo)} ${t.nome}</span>
    ${p.nome ? `<b>${escapeHtml(p.nome)}</b>` : ''}
    ${note.length ? `<p>${escapeHtml(note.join(' · '))}</p>` : ''}
    ${righeRifugio(p).length ? `<dl class="dati-rifugio">${righeRifugio(p).map(([e, v, l]) => `<dt>${e}</dt><dd>${l ? `<a href="${escapeHtml(l)}" ${l.startsWith('http') ? 'target="_blank" rel="noopener noreferrer"' : ''}>${escapeHtml(v)}</a>` : escapeHtml(v)}</dd>`).join('')}</dl>` : ''}
    <p class="tenue piccolo">Dati OpenStreetMap: possono non essere aggiornati, verifica sul posto${t.gruppo === 'acqua' ? ' (una sorgente può essere secca)' : ''}.</p>
    <a href="${url}" target="_blank" rel="noopener">Vedi su OpenStreetMap ↗</a>
  </div>`;
}

export function aggiungiPuntiUtili(mappa) {
  const livelli = Object.fromEntries(GRUPPI.map((g) => [g, L.layerGroup()]));
  const pallini = Object.fromEntries(GRUPPI.map((g) => [g, L.layerGroup()]));
  if (!mappa.getPane('puntiLontani')) {
    mappa.createPane('puntiLontani');
    mappa.getPane('puntiLontani').style.zIndex = 440; // sopra tracce e heatmap, sotto i nomi
  }
  const tela = L.canvas({ pane: 'puntiLontani', padding: 0.2 });
  const accesi = { rifugi: false, acqua: false };
  let dati = null;
  let mancanti = false;
  let rimossa = false;
  mappa.on('unload', () => (rimossa = true));

  const vicino = () => mappa.getZoom() >= ZOOM_PUNTI;
  // misuratore (?misura): disegno di rifugi e acqua
  const aggiorna = cronometra('rifugi e acqua: disegno', () => aggiornaPunti());
  function aggiornaPunti() {
    const z = mappa.getZoom();
    // pallini piccoli da lontano, più grandi avvicinandosi
    const raggio = z >= 11 ? 4.5 : z >= 10 ? 3.5 : 2.5;
    const bordo = z >= 10 ? 1.25 : 0.75;
    for (const g of GRUPPI) {
      for (const [gruppo, mostra] of [
        [livelli[g], accesi[g] && vicino() && dati],
        [pallini[g], accesi[g] && !vicino() && mappa.getZoom() >= ZOOM_PALLINI && dati],
      ]) {
        if (mostra && !mappa.hasLayer(gruppo)) gruppo.addTo(mappa);
        if (!mostra && mappa.hasLayer(gruppo)) gruppo.remove();
      }
      pallini[g].eachLayer((c) => c.setRadius(raggio).setStyle({ weight: bordo }));
    }
    mappa.aggiornaLegenda?.();
  }

  // un punto si disegna una volta sola, anche se arriva da più fonti (parchi, zona, celle)
  const disegnati = new Set();
  const aggiungi = cronometra('rifugi e acqua: segnaposto nuovi', (punti) => aggiungiPunti(punti));
  function aggiungiPunti(punti) {
    for (const p of punti) {
      if (disegnati.has(p.id) || !sulMappa(p)) continue;
      disegnati.add(p.id);
      const t = TIPI_PUNTO[p.tipo];
      // sulla tela, non come segnaposto HTML (con centinaia di punti il telefono rallentava)
      new SegnoSuTela([p.lat, p.lon], { renderer: telaSegni(mappa), radius: 12, disegno: disegnoPunto(p.tipo, p.chiuso) })
        .bindPopup(popup(p))
        .addTo(livelli[t.gruppo]);
      L.circleMarker([p.lat, p.lon], {
        renderer: tela,
        pane: 'puntiLontani',
        radius: 3,
        weight: 1,
        color: '#fff',
        fillColor: p.chiuso ? '#8a8f8c' : COLORE_GRUPPO[t.gruppo],
        fillOpacity: 0.95,
      })
        .bindPopup(() => popup(p))
        .addTo(pallini[t.gruppo]);
    }
  }

  caricaPunti().then((punti) => {
    if (rimossa) return;
    if (!punti) {
      mancanti = true;
      return mappa.aggiornaLegenda?.();
    }
    dati = punti;
    aggiungi(punti);
    aggiorna();
    caricaCelle();
  });

  // Fuori dai parchi e dalla zona cercata: da zoom 13 i punti della zona inquadrata, a celle,
  // da OpenStreetMap (salvati sul telefono per 30 giorni). Una richiesta alla volta.
  let inCorso = false;
  async function caricaCelle() {
    if (rimossa || inCorso || mappa.getZoom() < ZOOM_ROBOT || !(accesi.rifugi || accesi.acqua)) return;
    const b = mappa.getBounds();
    const vista = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()];
    inCorso = true;
    try {
      // prima i quadrati preparati dal robot per tutta Italia
      const robot = await puntiDelRobot(vista);
      if (rimossa) return;
      if (robot.punti.length) {
        dati = senzaDoppioni([...(dati ?? []), ...robot.punti]);
        aggiungi(robot.punti);
        aggiorna();
      }
      // dove il robot non è ancora passato, da vicino: celle chieste a Overpass (riserva)
      const celle = mappa.getZoom() >= ZOOM_CELLE ? celleNelRiquadro(vista) : [];
      if (!celle.length) return;
      const zone = [...(await zoneCoperte(Boolean(dati))), ...robot.coperti.map((bbox) => ({ bbox }))];
      for (const c of celle) {
        if (rimossa) return;
        const [s, o, n, e] = c.bbox;
        const angoli = [[o, s], [e, s], [o, n], [e, n]];
        if (percorsoCoperto([angoli], zone)) continue; // la cella è tutta in un parco o nella zona
        let salvata = await leggiCellaPunti(c.chiave).catch(() => null);
        if (cellaScaduta(salvata)) {
          try {
            const punti = puntiDallaRisposta(await interrogaOverpass(queryPuntiParco({ bbox: c.bbox }), { timeoutMs: 60000 }));
            await salvaCellaPunti(c.chiave, punti);
            salvata = { punti };
          } catch (err) {
            console.warn('Rifugi e acqua della zona non scaricati', err); // si riprova alla prossima mossa
            if (!salvata) break;
          }
        }
        if (salvata?.punti?.length) {
          dati = senzaDoppioni([...(dati ?? []), ...salvata.punti]);
          aggiungi(salvata.punti);
          aggiorna();
        }
      }
    } finally {
      inCorso = false;
    }
  }
  mappa.dopoIlMovimento('rifugi e acqua: celle', () => caricaCelle(), { priorita: 3 });
  // all'apertura la mappa può ancora spostarsi (vista ritrovata, inquadrature): si guarda poco dopo
  setTimeout(caricaCelle, 1500);

  for (const g of GRUPPI) {
    mappa.suLivello(g, (acceso) => {
      accesi[g] = acceso;
      aggiorna();
      if (acceso) caricaCelle();
    });
  }
  mappa.on('zoomend', aggiorna);
  // la legenda conta i punti nella zona inquadrata
  mappa.dopoIlMovimento('legenda', () => mappa.aggiornaLegenda?.(), { priorita: 8 });

  mappa.vociLegenda?.push(() => {
    const voci = GRUPPI.filter((g) => accesi[g]);
    if (!voci.length) return '';
    if (mancanti) return '<p class="voce-legenda tenue">Rifugi e acqua: dati non raggiungibili ora.</p>';
    const tipi = Object.entries(TIPI_PUNTO).filter(([, t]) => voci.includes(t.gruppo));
    return `<div class="voce-legenda">
      <ul class="legenda-punti">${tipi.map(([k, t]) => `<li><span class="punto-utile ${t.gruppo}">${htmlIconaPunto(k)}</span>${t.nome}</li>`).join('')}</ul>
      ${(() => {
        if (!dati) return '';
        const b = mappa.getBounds();
        const qui = puntiNelRiquadro(dati, [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]).filter((p) => voci.includes(TIPI_PUNTO[p.tipo].gruppo));
        return `<p class="piccolo">Qui: <b>${qui.length ? escapeHtml(riassuntoPunti(qui)) : 'nessuno'}</b></p>`;
      })()}
      ${
        mappa.getZoom() < ZOOM_PALLINI
          ? '<p class="tenue piccolo">Avvicinati per vederli.</p>'
          : ''
      }
      <p class="tenue piccolo">Fonte: OpenStreetMap.</p>
    </div>`;
  });
}

// Riquadro della scheda: rifugi, bivacchi e acqua vicino alla traccia
// punti: già pronti (es. Pianifica, con quelli scaricati per la sua zona); avviso: nota in fondo
// pezzi (Pianifica): traccia ordinata, per dire "al km X" e il tratto più lungo senza acqua
export async function mostraPuntiLungoIlPercorso(contenitore, geojson, { punti: dati = null, avviso = '', pezzi = null } = {}) {
  if (!contenitore) return null;
  const punti = dati ?? (await caricaPunti());
  const titolo = '<h2>Rifugi e acqua lungo il percorso</h2>';
  if (!punti) {
    contenitore.innerHTML = `<section class="riquadro punti-percorso">${titolo}<p class="stato-dati stato-assente">Dati non raggiungibili ora (sei offline?).</p></section>`;
    return null;
  }
  // fontanelle in paese: dopo le fonti fuori dai centri abitati (in ordine di km, solo segnate)
  let vicini = puntiLungoIlPercorso(punti, geojson).filter(sulMappa).map((p) => ({ ...p, inPaese: inCentroAbitato(p, punti) }));
  if (pezzi) vicini = vicini.map((p) => ({ ...p, km: kmLungoLaTraccia([p.lon, p.lat], pezzi) })).sort((a, b) => a.km - b.km);
  else vicini.sort((a, b) => a.inPaese - b.inPaese || a.distanzaM - b.distanzaM);
  contenitore.innerHTML = `<section class="riquadro punti-percorso">${titolo}
    ${pezzi && !avviso ? htmlRiassuntoLungo(vicini, pezzi) : ''}
    ${
      vicini.length
        ? `
      <ul class="lista-punti">${vicini
        .map((p) => {
          const t = TIPI_PUNTO[p.tipo];
          const note = noteDelPunto(p);
          return `<li><span class="punto-utile ${t.gruppo}${p.chiuso ? ' chiuso' : ''}">${htmlIconaPunto(p.tipo)}</span>
            <span><b>${escapeHtml(p.nome ?? t.nome)}</b>${p.nome ? ` <span class="tenue">· ${t.nome.toLowerCase()}</span>` : ''}
            <span class="tenue piccolo">${p.km != null ? `al km ${km1(p.km)} · ` : ''}${p.distanzaM < 30 ? 'sul percorso' : `a ${p.distanzaM} m`}${p.inPaese ? ' · in paese' : ''}${note.length ? ` · ${escapeHtml(note.join(' · '))}` : ''}</span></span></li>`;
        })
        .join('')}</ul>`
        : avviso
          ? ''
          : `<p class="tenue">Niente entro ${RAGGIO_LUNGO_IL_PERCORSO_M} m dalla traccia.</p>`
    }
    ${avviso ? `<p class="stato-dati stato-assente">${escapeHtml(avviso)}</p>` : ''}
    <p class="tenue piccolo">OpenStreetMap · verifica sul posto</p>
  </section>`;
  return vicini;
}

// Riassunto per Pianifica: acqua per categoria, il tratto più lungo senza acqua (su fonti potabili
// o con potabilità non indicata, segnalando quando dipende da queste) e dove sono rifugi e bivacchi
function htmlRiassuntoLungo(vicini, pezzi) {
  const totale = lunghezzaDeiPezzi(pezzi);
  const acqua = vicini.filter(acquaSuCuiContare);
  const senza = trattoPiuLungoSenza(acqua.map((p) => p.km), totale);
  const soloPotabili = trattoPiuLungoSenza(vicini.filter((p) => categoriaAcqua(p) === 'potabile').map((p) => p.km), totale);
  const conta = new Map();
  for (const p of vicini) if (categoriaAcqua(p)) conta.set(categoriaAcqua(p), (conta.get(categoriaAcqua(p)) ?? 0) + 1);
  const categorie = Object.entries(CATEGORIE_ACQUA)
    .filter(([k]) => conta.get(k))
    .map(([k, c]) => `${conta.get(k)} ${conta.get(k) === 1 ? c.nome : c.plurale}`)
    .join(' · ');
  const notte = vicini.filter(perLaNotte);
  const righe = [
    categorie ? `Acqua: ${escapeHtml(categorie)}` : '',
    acqua.length
      ? `Tratto più lungo senza acqua: <b>${km1(senza.km)} km</b> <span class="tenue">(dal km ${km1(senza.da)} al km ${km1(senza.a)})</span>${
          soloPotabili.km - senza.km >= 0.1
            ? `<br /><span class="tenue piccolo">Conta su fonti con potabilità non indicata: con sola acqua potabile sono ${km1(soloPotabili.km)} km.</span>`
            : ''
        }`
      : `<b>Nessuna fonte d'acqua sicura</b> lungo i ${km1(totale)} km: porta tutta l'acqua che serve`,
    notte.length
      ? `Rifugi e bivacchi: ${notte.map((p) => `km ${km1(p.km)} <span class="tenue">(${escapeHtml(p.nome ?? TIPI_PUNTO[p.tipo].nome)})</span>`).join(', ')}`
      : 'Nessun rifugio o bivacco lungo il percorso',
  ].filter(Boolean);
  return `<ul class="riassunto-lungo">${righe.map((r) => `<li>${r}</li>`).join('')}</ul>`;
}
