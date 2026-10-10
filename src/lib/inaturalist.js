// iNaturalist: heatmap e osservazioni. Dati © osservatori iNaturalist, licenze Creative Commons.
// Per le specie protette iNaturalist sfuma la posizione in un quadrato di circa 20 km.
import { TAXON_INATURALIST, ANIMALI } from './costanti.js';

export const API_INATURALIST = 'https://api.inaturalist.org/v1';

export const STAGIONI = {
  tutto: { nome: "Tutto l'anno", mesi: [] },
  primavera: { nome: 'Primavera (mar–mag)', mesi: [3, 4, 5] },
  estate: { nome: 'Estate (giu–ago)', mesi: [6, 7, 8] },
  autunno: { nome: 'Autunno (set–nov)', mesi: [9, 10, 11] },
  inverno: { nome: 'Inverno (dic–feb)', mesi: [12, 1, 2] },
};

// Specie scelte: "rare" = la lista curata (tutte insieme), "minacciate" = filtro iNaturalist,
// altrimenti la chiave di un animale
export const SPECIE_RARE = ['orso', 'lupo', 'camoscio', 'lontra', 'gatto_selvatico', 'aquila_reale', 'cervo', 'cicogna_nera', 'nibbio_reale', 'gufo_reale'];

export const FILTRI_INAT_PREDEFINITI = { specie: 'rare', stagione: 'tutto', anni: 0, soloVerificate: true, correggiSforzo: false };

// specie "tutte": nessun filtro di specie, per il riferimento della correzione dello sforzo
export const TUTTE_LE_SPECIE = 'tutte';

// Parametri comuni a tile e ricerche; "oggi" serve ai test
// Gruppi di iNaturalist ("iconic taxa") per le ricerche lungo i percorsi
export const GRUPPI = {
  fauna: { nome: 'Fauna (mammiferi, uccelli, rettili, anfibi)', taxa: 'Mammalia,Aves,Reptilia,Amphibia' },
  Mammalia: { nome: 'Mammiferi', taxa: 'Mammalia' },
  Aves: { nome: 'Uccelli', taxa: 'Aves' },
  Reptilia: { nome: 'Rettili', taxa: 'Reptilia' },
  Amphibia: { nome: 'Anfibi', taxa: 'Amphibia' },
  Insecta: { nome: 'Insetti', taxa: 'Insecta' },
  Plantae: { nome: 'Piante', taxa: 'Plantae' },
  Fungi: { nome: 'Funghi', taxa: 'Fungi' },
  tutti: { nome: 'Tutti i gruppi', taxa: '' },
};

export const TAXA_NOTEVOLI_INAT = [
  41573, 152870, 43094, 40268, 533971, 44167, 45933, 71385, 43791, // mammiferi
  71261, 67570, 19350, // rapaci
  4929, 4730, 23, 4255, 71361, 3727, // grandi uccelli d'acqua
  20967, 2183, 2314, 2262, 17599, 71343, // colorati o insoliti
];

export function parametriInat(filtri, oggi = new Date()) {
  const p = new URLSearchParams();
  if (filtri.gruppo) {
    // ricerca per gruppo (lungo i percorsi): nessun filtro di specie
    if (GRUPPI[filtri.gruppo]?.taxa) p.set('iconic_taxa', GRUPPI[filtri.gruppo].taxa);
  } else if (filtri.specie === 'minacciate') p.set('threatened', 'true');
  // animali imperdibili: gli stessi gruppi di GBIF (TAXA_NOTEVOLI_GBIF), con gli id di iNaturalist
  else if (filtri.specie === 'notevoli') p.set('taxon_id', TAXA_NOTEVOLI_INAT.join(','));
  else {
    const chiavi = filtri.specie === 'rare' ? SPECIE_RARE : [filtri.specie];
    const ids = chiavi.map((k) => TAXON_INATURALIST[k]?.id).filter(Boolean);
    if (ids.length) p.set('taxon_id', ids.join(','));
  }
  if (filtri.soloVerificate) p.set('quality_grade', 'research');
  const mesi = STAGIONI[filtri.stagione]?.mesi ?? [];
  if (mesi.length) p.set('month', mesi.join(','));
  if (filtri.anni > 0) p.set('d1', `${oggi.getFullYear() - filtri.anni}-01-01`);
  return p;
}

export function urlTileHeatmap(filtri, oggi) {
  return `${API_INATURALIST}/heatmap/{z}/{x}/{y}.png?${parametriInat(filtri, oggi)}`;
}

export function urlTileGriglia(filtri, oggi) {
  return `${API_INATURALIST}/grid/{z}/{x}/{y}.grid.json?${parametriInat(filtri, oggi)}`;
}

// Osservazioni dentro un riquadro [sud, ovest, nord, est], con foto
export function urlOsservazioni(riquadro, filtri, { perPagina = 30, pagina = 1, oggi } = {}) {
  const p = parametriInat(filtri, oggi);
  const [s, o, n, e] = riquadro;
  p.set('swlat', s.toFixed(5));
  p.set('swlng', o.toFixed(5));
  p.set('nelat', n.toFixed(5));
  p.set('nelng', e.toFixed(5));
  p.set('per_page', String(perPagina));
  if (pagina > 1) p.set('page', String(pagina));
  p.set('order_by', 'observed_on');
  p.set('locale', 'it');
  return `${API_INATURALIST}/observations?${p}`;
}

const NOMI_IT = new Map(Object.entries(TAXON_INATURALIST).map(([k, t]) => [t.id, ANIMALI[k]]));
const CHIAVI = new Map(Object.entries(TAXON_INATURALIST).map(([k, t]) => [t.id, k]));

// Dalla risposta API agli elementi da mostrare (nessun nome di osservatore salvato)
export function interpretaOsservazioni(json) {
  return (json?.results ?? []).map((o) => {
    const t = o.taxon ?? {};
    const foto = o.photos?.[0];
    const [lat, lon] = String(o.location ?? ',').split(',').map(Number);
    const antenati = [t.id, ...(t.ancestor_ids ?? [])];
    const nomeIt = antenati.map((id) => NOMI_IT.get(id)).find(Boolean);
    return {
      id: o.id,
      animale: antenati.map((id) => CHIAVI.get(id)).find(Boolean) ?? null,
      specie: nomeIt ?? t.preferred_common_name ?? t.name ?? 'Specie non indicata',
      nomeScientifico: t.name ?? '',
      data: o.observed_on ?? null,
      sfumata: Boolean(o.obscured),
      precisioneM: o.positional_accuracy ?? null,
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
      // solo foto con licenza Creative Commons: quelle "tutti i diritti riservati" restano su iNaturalist
      foto: foto?.license_code ? { url: foto.url, attribuzione: foto.attribution ?? '', licenza: foto.license_code } : null,
      licenza: o.license_code ?? null,
      url: o.uri ?? `https://www.inaturalist.org/observations/${o.id}`,
      verificata: o.quality_grade === 'research',
      // solo per contare le persone diverse: un codice anonimo, mai il nome
      osservatore: o.user?.id != null ? codiceAnonimo(o.user.id) : null,
    };
  });
}

function codiceAnonimo(id) {
  let h = 2166136261;
  for (const c of `orme:${id}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h.toString(36);
}

// Riquadro attorno a un punto toccato: "raggio" in pixel convertito con la funzione della mappa
export function riquadroAttorno(centro, angoloNO, angoloSE) {
  return [angoloSE.lat, angoloNO.lng, angoloNO.lat, angoloSE.lng];
}
