// I punti di interesse sulla mappa MapLibre del pianificatore: un livello della mappa (come le icone della fauna), non marcatori.
// Rifugi, posti per dormire e acqua sono i punti che già scarichiamo; capanni, torrette, belvedere, cime e parcheggi si chiedono a
// OpenStreetMap a celle da 0,1° e restano sul telefono. Si vedono solo quelli entro 300 m dal percorso, per categoria.
import { leggiPoiCella, salvaPoiCella } from '../db.js';
import { interrogaOverpass } from '../lib/overpass.js';
import { puntiPerIlPercorso } from './puntiPercorso.js';
import { aggiungiImmagine, disegnaPoi, POI_L, POI_A } from './segniGl.js';
import { CATEGORIE_POI, celleDelRiquadro, riquadroCella, queryPoiNuovi, poiDallaRisposta, poiLungoIlPercorso, riquadroDelPercorso, nomePoi, leggiCategorie, salvaCategorie } from '../lib/poiPianificatore.js';

const GIORNI_CELLA = 30;
const ATTESA_MS = 1200; // dopo l'ultimo cambio del percorso

async function poiNuovi(riquadro, segnale) {
  const tutti = [];
  for (const id of celleDelRiquadro(riquadro)) {
    if (segnale.annullato) return null;
    const salvata = await leggiPoiCella(id).catch(() => null);
    if (salvata?.scaricato && (Date.now() - new Date(salvata.scaricato)) / 86_400_000 < GIORNI_CELLA) {
      tutti.push(...salvata.punti);
      continue;
    }
    try {
      const punti = poiDallaRisposta(await interrogaOverpass(queryPoiNuovi(riquadroCella(id)), { timeoutMs: 70_000 }));
      await salvaPoiCella(id, punti).catch(() => {});
      tutti.push(...punti);
    } catch (e) {
      console.warn('POI della cella', id, e);
      if (salvata?.punti) tutti.push(...salvata.punti); // meglio quelli vecchi che niente
      else segnale.mancanti = true;
    }
  }
  return tutti;
}

// → { aggiorna(linea), categorie, imposta(chiave, acceso), poiAl(point), lungo(), tutti(), rimuovi() }
// alCambio({ lungo, tutti, mancanti }): i POI lungo il percorso sono cambiati (i comandi del punto toccato stanno nel fumetto del pianificatore)
export function creaPoiGl(mappa, maplibregl, { alCambio = () => {}, prima = null } = {}) {
  let categorie = leggiCategorie();
  let tutti = [];
  let lungo = [];
  let linea = null;
  let attesa = null;
  let segnale = { annullato: false };
  let rimossa = false;

  for (const c of CATEGORIE_POI) aggiungiImmagine(mappa, `poi|${c.chiave}`, POI_L, POI_A, (ctx) => disegnaPoi(ctx, c));
  mappa.addSource('poi', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  mappa.addLayer({ id: 'poi', type: 'symbol', source: 'poi', layout: { 'icon-image': ['concat', 'poi|', ['get', 'categoria']], 'icon-anchor': 'bottom', 'icon-allow-overlap': true, 'icon-ignore-placement': true } }, prima && mappa.getLayer(prima) ? prima : undefined);

  const disegna = () => {
    const visibili = lungo.filter((p) => categorie.has(p.categoria));
    mappa.getSource('poi')?.setData({ type: 'FeatureCollection', features: visibili.map((p) => ({ type: 'Feature', properties: { id: p.id, categoria: p.categoria }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })) });
  };
  const ricalcola = () => {
    lungo = linea ? poiLungoIlPercorso(tutti, linea) : [];
    disegna();
    alCambio({ lungo: lungo.filter((p) => categorie.has(p.categoria)), tutti, mancanti: segnale.mancanti ?? false });
  };

  async function carica() {
    if (!linea || linea.length < 2) return;
    const riquadro = riquadroDelPercorso(linea, 0.004);
    // un percorso lunghissimo non si può coprire con una richiesta per cella: troppe celle
    if (celleDelRiquadro(riquadro).length > 12) {
      segnale.mancanti = true;
      return ricalcola();
    }
    const mio = (segnale = { annullato: false, mancanti: false });
    const [esistenti, nuovi] = await Promise.all([
      puntiPerIlPercorso('pianificatore', [linea]).catch(() => ({ punti: [], avviso: '' })),
      poiNuovi(riquadro, mio),
    ]);
    if (rimossa || mio.annullato || nuovi == null) return;
    if (esistenti.avviso) mio.mancanti = true;
    tutti = [...new Map([...(esistenti.punti ?? []), ...nuovi].map((p) => [p.id, p])).values()];
    ricalcola();
  }

  return {
    // il percorso è cambiato: dopo un attimo si ricercano i punti
    aggiorna(nuovaLinea) {
      linea = nuovaLinea;
      clearTimeout(attesa);
      segnale.annullato = true;
      if (!linea || linea.length < 2) {
        lungo = [];
        disegna();
        return alCambio({ lungo: [], tutti, mancanti: false });
      }
      // i punti già scaricati si ricalcolano subito sul nuovo percorso; poi si cerca se ne mancano
      if (tutti.length) ricalcola();
      attesa = setTimeout(carica, ATTESA_MS);
    },
    categorie: () => categorie,
    imposta(chiave, acceso) {
      categorie = new Set(acceso ? [...categorie, chiave] : [...categorie].filter((k) => k !== chiave));
      salvaCategorie(categorie);
      ricalcola();
    },
    // il POI toccato (le icone dei POI, a differenza della fauna, si toccano: il pianificatore apre il fumetto)
    poiAl(punto) {
      if (!mappa.getLayer('poi')) return null;
      const f = mappa.queryRenderedFeatures([[punto.x - 14, punto.y - 34], [punto.x + 14, punto.y + 6]], { layers: ['poi'] })[0];
      return f ? lungo.find((p) => p.id === f.properties.id) ?? null : null;
    },
    lungo: () => lungo.filter((p) => categorie.has(p.categoria)),
    tutti: () => tutti,
    nome: nomePoi,
    rimuovi() {
      rimossa = true;
      clearTimeout(attesa);
      segnale.annullato = true;
      if (mappa.getLayer('poi')) mappa.removeLayer('poi');
      if (mappa.getSource('poi')) mappa.removeSource('poi');
    },
  };
}
