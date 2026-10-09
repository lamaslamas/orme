// Livelli "Rifugi e bivacchi" e "Acqua" (da OpenStreetMap, file dati/punti.json scaricato dal robot).
// Due interruttori separati; le icone compaiono solo da vicino per non affollare la mappa.
import L from 'leaflet';
import { escapeHtml } from '../lib/formato.js';
import { TIPI_PUNTO, noteDelPunto, puntiLungoIlPercorso, riassuntoPunti, puntiNelRiquadro, RAGGIO_LUNGO_IL_PERCORSO_M } from '../lib/puntiUtili.js';

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
export function caricaPunti() {
  datiInCorso ??= fetch(`${import.meta.env.BASE_URL}dati/punti.json`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((d) => {
      if (!d) {
        datiInCorso = null; // si riprova la prossima volta
        return null;
      }
      // un punto in due parchi (zone sovrapposte) si tiene una volta sola
      const visti = new Map();
      for (const { punti } of Object.values(d.parchi ?? {})) for (const p of punti) visti.set(p.id, p);
      return [...visti.values()];
    });
  return datiInCorso;
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
  function aggiorna() {
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

  caricaPunti().then((punti) => {
    if (rimossa) return;
    if (!punti) {
      mancanti = true;
      return mappa.aggiornaLegenda?.();
    }
    dati = punti;
    for (const p of punti) {
      const t = TIPI_PUNTO[p.tipo];
      L.marker([p.lat, p.lon], {
        icon: L.divIcon({
          className: `punto-utile ${t.gruppo}${p.chiuso ? ' chiuso' : ''}`,
          html: htmlIconaPunto(p.tipo),
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
        title: p.nome ? `${t.nome}: ${p.nome}` : t.nome,
        keyboard: false,
      })
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
    aggiorna();
  });

  for (const g of GRUPPI) {
    mappa.suLivello(g, (acceso) => {
      accesi[g] = acceso;
      aggiorna();
    });
  }
  mappa.on('zoomend', aggiorna);
  // la legenda conta i punti nella zona inquadrata
  mappa.on('moveend', () => mappa.aggiornaLegenda?.());

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
export async function mostraPuntiLungoIlPercorso(contenitore, geojson) {
  if (!contenitore) return null;
  const punti = await caricaPunti();
  const titolo = '<h2>Rifugi e acqua lungo il percorso</h2>';
  if (!punti) {
    contenitore.innerHTML = `<section class="riquadro punti-percorso">${titolo}<p class="stato-dati stato-assente">Dati non raggiungibili ora (sei offline?).</p></section>`;
    return null;
  }
  const vicini = puntiLungoIlPercorso(punti, geojson);
  contenitore.innerHTML = `<section class="riquadro punti-percorso">${titolo}
    ${
      vicini.length
        ? `
      <ul class="lista-punti">${vicini
        .map((p) => {
          const t = TIPI_PUNTO[p.tipo];
          const note = noteDelPunto(p);
          return `<li><span class="punto-utile ${t.gruppo}${p.chiuso ? ' chiuso' : ''}">${htmlIconaPunto(p.tipo)}</span>
            <span><b>${escapeHtml(p.nome ?? t.nome)}</b>${p.nome ? ` <span class="tenue">· ${t.nome.toLowerCase()}</span>` : ''}
            <span class="tenue piccolo">${p.distanzaM < 30 ? 'sul percorso' : `a ${p.distanzaM} m`}${note.length ? ` · ${escapeHtml(note.join(' · '))}` : ''}</span></span></li>`;
        })
        .join('')}</ul>`
        : `<p class="tenue">Niente entro ${RAGGIO_LUNGO_IL_PERCORSO_M} m dalla traccia.</p>`
    }
    <p class="tenue piccolo">OpenStreetMap · verifica sul posto</p>
  </section>`;
  return vicini;
}
