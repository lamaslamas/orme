// Indice panoramico nell'app: riquadro della scheda e livello "Panoramicità" sulla mappa.
// L'indice è calcolato in anticipo (scripts/calcola-panorama.mjs) e arriva con l'archivio.
import L from 'leaflet';
import { escapeHtml } from '../lib/formato.js';
import { NOMI_CRITERI, PESI, NOTE_METODO, campionaPercorso, improntaTraccia, riassuntoPanorama, etichettaIndice } from '../lib/panorama.js';
import { stato } from '../stato.js';

export const COLORI_PANORAMA = { limitata: '#8fa39a', intermedia: '#d8b26e', panoramica: '#e0811a' };
const NOMI_CLASSI = { limitata: 'Visuale limitata', intermedia: 'Intermedia', panoramica: 'Panoramica' };
const classe = (v) => (v < 35 ? 'limitata' : v < 65 ? 'intermedia' : 'panoramica');
const km = (n) => n.toFixed(1).replace('.', ',');

// L'indice vale per la traccia su cui è stato calcolato (quella dell'archivio)
export const panoramaPerTraccia = (s, traccia) => Boolean(s.panorama && traccia?.geojson && improntaTraccia(traccia.geojson) === s.panorama.impronta);

export function htmlPanorama(s, traccia, idUrl) {
  const p = s.panorama;
  if (!p) {
    return traccia
      ? ''
      : `<section class="riquadro panorama vuoto-panorama"><h2>Indice panoramico</h2><p class="tenue">Non calcolabile: serve una traccia del percorso.</p></section>`;
  }
  const r = riassuntoPanorama(p);
  const stessaTraccia = panoramaPerTraccia(s, traccia);
  return `<section class="riquadro panorama">
    <h2>Indice panoramico</h2>
    <div class="panorama-testa">
      <div class="panorama-punteggio" style="--valore:${p.punteggio}"><b>${p.punteggio}</b><span>/100</span></div>
      <div>
        <div class="panorama-etichetta">${escapeHtml(etichettaIndice(p.punteggio))}</div>
        <div class="tenue piccolo">${p.metodo === 'viewshed' ? 'Stima con analisi di visibilità' : 'Stima preliminare'} · affidabilità <b>${escapeHtml(p.affidabilita)}</b></div>
      </div>
    </div>
    <div class="panorama-numeri">
      <div><b>${r.visuale}</b><span>Visuale</span></div>
      <div><b>${r.belvedere}</b><span>${r.belvedere === 1 ? 'Belvedere' : 'Belvedere'}</span></div>
      <div><b>${r.paesaggio}</b><span>Paesaggio</span></div>
    </div>
    ${htmlFotoBelvedere(p.belvedere)}
    ${p.migliore ? `<p class="piccolo">Tratto più panoramico: <b>km ${km(p.migliore.daKm)}–${km(p.migliore.aKm)}</b>${stessaTraccia ? ` · <a href="#/sentiero/${idUrl}/mappa" data-azione="mostra-panorama">vedi sulla mappa</a>` : ''}</p>` : ''}
    ${!stessaTraccia && traccia ? '<p class="tenue piccolo">Calcolato sulla traccia dell\'archivio: la tua traccia è diversa.</p>' : ''}
    <details class="spiegazione">
      <summary>Come si calcola</summary>
      <ul class="panorama-criteri">${Object.entries(PESI)
        .map(
          ([k, peso]) =>
            `<li><span>${NOMI_CRITERI[k]} <span class="tenue">(${Math.round(peso * 100)}%)</span></span><span class="barra-criterio"><i style="width:${p.criteri[k]}%"></i></span><b>${p.criteri[k]}</b></li>`,
        )
        .join('')}</ul>
      <p class="piccolo">${[
        p.belvedere.length ? `Belvedere lungo il percorso: ${p.belvedere.map((b) => escapeHtml(b.nome || 'senza nome')).join(', ')}.` : '',
        p.vetteRaggiunte?.length ? `Vette raggiunte: ${p.vetteRaggiunte.map(escapeHtml).join(', ')}.` : '',
        p.vetteVisibili ? `Altre vette probabilmente visibili: ${p.vetteVisibili}.` : '',
        p.laghiVisibili?.length ? `Laghi in vista: ${p.laghiVisibili.map(escapeHtml).join(', ')}.` : '',
        `Bosco: circa ${p.boscoPercento}% del percorso.`,
        p.visibileMedio != null ? `In media da ogni punto si vede il ${p.visibileMedio}% del territorio entro 8 km.` : '',
      ]
        .filter(Boolean)
        .join(' ')}</p>
      <p class="tenue piccolo">${[NOTE_METODO[p.metodo] ?? '', ...p.motivi.filter((m) => !Object.values(NOTE_METODO).includes(m))].filter(Boolean).map(escapeHtml).join('. ')}. È una stima algoritmica, non un giudizio sulla bellezza: quota alta e assenza di bosco da sole non garantiscono un bel panorama.</p>
      ${p.metodo === 'viewshed' ? '<p class="tenue piccolo">Metodo: da un punto ogni 100 m si tracciano 72 direzioni fino a 8 km e si controlla quali zone del terreno si vedono davvero (curvatura terrestre inclusa); il bosco entro 1 km copre la vista come una chioma di 15 m. La visuale combina quanto territorio si vede e quanto è basso l\'orizzonte.</p>' : ''}
      <p class="tenue piccolo">Dati: quote Terrain Tiles (AWS Open Data), bosco © ESA WorldCover 2021 (CC BY 4.0), belvedere, vette e laghi © OpenStreetMap (ODbL). Calcolato il ${escapeHtml(new Date(p.calcolato).toLocaleDateString('it-IT'))}.</p>
    </details>
  </section>`;
}

// Foto dei belvedere lungo il percorso (Wikimedia Commons, licenze libere, con autore)
function htmlFotoBelvedere(belvedere = []) {
  const conFoto = belvedere.filter((b) => b.foto?.url);
  if (!conFoto.length) return '';
  return `<ul class="foto-belvedere">${conFoto
    .map(
      (b) => `<li><a href="${escapeHtml(b.foto.pagina)}" target="_blank" rel="noopener">
        <img src="${escapeHtml(b.foto.url)}" alt="Vista vicino al belvedere ${escapeHtml(b.nome || '')}" loading="lazy" decoding="async" />
        <span class="foto-belvedere-nome">${escapeHtml(b.nome || 'Belvedere')}</span></a>
        <span class="credito">Foto: ${escapeHtml(b.foto.autore)} · ${escapeHtml(b.foto.licenza)}</span></li>`,
    )
    .join('')}</ul>`;
}

// Il collegamento "vedi sulla mappa" accende il livello
export function collegaPanorama(contenitore) {
  contenitore.querySelector('[data-azione="mostra-panorama"]')?.addEventListener('click', () => stato.imposta({ livelli: { panoramicita: true } }));
}

// Livello sulla mappa del sentiero: tratti colorati ogni 100 m e il chilometro migliore
export function aggiungiLivelloPanorama(mappa, s, leggiTraccia) {
  const gruppo = L.layerGroup();
  function disegna() {
    gruppo.clearLayers();
    const traccia = leggiTraccia();
    if (!panoramaPerTraccia(s, traccia)) return;
    const punti = campionaPercorso(traccia.geojson);
    const v = s.panorama.visuale;
    let corrente = null;
    for (let i = 0; i < punti.length - 1; i++) {
      const c = classe(v[i] ?? 0);
      const a = [punti[i].lat, punti[i].lon];
      const b = [punti[i + 1].lat, punti[i + 1].lon];
      if (corrente?.classe === c) corrente.linea.push(b);
      else {
        if (corrente) gruppo.addLayer(L.polyline(corrente.linea, { color: COLORI_PANORAMA[corrente.classe], weight: 7, opacity: 0.95, interactive: false }));
        corrente = { classe: c, linea: [a, b] };
      }
    }
    if (corrente) gruppo.addLayer(L.polyline(corrente.linea, { color: COLORI_PANORAMA[corrente.classe], weight: 7, opacity: 0.95, interactive: false }));
    const m = s.panorama.migliore;
    if (m) {
      const tratto = punti.filter((p) => p.km >= m.daKm - 0.01 && p.km <= m.aKm + 0.01).map((p) => [p.lat, p.lon]);
      if (tratto.length > 1) {
        gruppo.addLayer(L.polyline(tratto, { color: '#fff', weight: 14, opacity: 0.7, interactive: false }));
        gruppo.addLayer(L.polyline(tratto, { color: COLORI_PANORAMA.panoramica, weight: 8, interactive: false }).bindTooltip('Tratto più panoramico', { permanent: false }));
      }
    }
  }
  mappa.vociLegenda?.push(() => {
    if (!stato.leggi().livelli.panoramicita) return '';
    if (!panoramaPerTraccia(s, leggiTraccia())) return '<p class="voce-legenda tenue">Panoramicità: non disponibile per questa traccia.</p>';
    return `<div class="voce-legenda"><b>Panoramicità stimata</b><ul class="legenda-stati">${Object.entries(NOMI_CLASSI)
      .map(([k, n]) => `<li><span class="campione" style="background:${COLORI_PANORAMA[k]}"></span>${n}</li>`)
      .join('')}</ul><p class="tenue piccolo">${s.panorama.metodo === 'viewshed' ? 'Visibilità calcolata sul terreno e sul bosco' : 'Stima preliminare dalla forma del terreno e dal bosco'}. In evidenza il chilometro più panoramico.</p></div>`;
  });
  mappa.suLivello('panoramicita', (acceso) => {
    if (acceso) {
      disegna();
      gruppo.addTo(mappa);
    } else gruppo.remove();
    mappa.aggiornaLegenda?.();
  });
  return { ridisegna: disegna };
}
