// Distribuzione ufficiale delle specie (Direttiva Habitat, Art. 17, rapporto 2013-2018)
// dall'Agenzia europea dell'ambiente (EEA): celle di 10 km riportate dall'Italia.
// Licenza CC BY 4.0 — © DG ENV, European Environment Agency.

export const FONTE_ART17 = {
  nome: 'EEA – Direttiva Habitat, Art. 17 (2013-2018)',
  licenza: 'CC BY 4.0',
  attribuzione: '© DG ENV, European Environment Agency (EEA)',
  url: 'https://www.eea.europa.eu/en/datahub/datahubitem-view/d8b47719-9213-485a-845b-db1bfe93598d',
  servizio:
    'https://bio.discomap.eea.europa.eu/arcgis/rest/services/Article17/HabitatsDirective_ART_17_WMS_version_2020_08_public/MapServer/3',
};

// Codici Natura 2000 delle specie dei parchi presenti nell'allegato II/IV.
// Gli uccelli (aquila, gufo, nibbio, cicogna) rientrano nella Direttiva Uccelli: niente dati qui.
export const CODICI_ART17 = {
  orso: '1354',
  lupo: '1352',
  lontra: '1355',
  gatto_selvatico: '1363',
  camoscio: '1374',
};

export const REGIONI_BIOGEOGRAFICHE = { ALP: 'alpina', CON: 'continentale', MED: 'mediterranea' };

export const STATI_CONSERVAZIONE = {
  FV: { nome: 'Favorevole', colore: '#2f9e6b' },
  U1: { nome: 'Inadeguato', colore: '#e0a400' },
  U2: { nome: 'Cattivo', colore: '#c2410c' },
  XX: { nome: 'Sconosciuto o non valutato', colore: '#64748b' },
};

export const TENDENZE = { '+': 'in miglioramento', '=': 'stabile', '-': 'in peggioramento', x: 'sconosciuta' };

export const haDistribuzione = (animale) => Boolean(CODICI_ART17[animale]);

const arrotonda = (n) => Math.round(n * 1e4) / 1e4;

// Risposta del servizio ArcGIS (outSR 4326) -> { animale: [{ regione, stato, tendenza, anelli }] }
// Gli anelli sono [lat, lon] per Leaflet; i buchi si disegnano con la regola "evenodd".
export function distribuzioneDaEsri(json) {
  const perCodice = Object.fromEntries(Object.entries(CODICI_ART17).map(([k, c]) => [c, k]));
  const risultato = {};
  for (const f of json?.features ?? []) {
    const a = f.attributes ?? {};
    const animale = perCodice[a.speciescode];
    if (!animale || (a.maptype && a.maptype !== 'Distribution')) continue;
    const anelli = (f.geometry?.rings ?? []).filter((r) => r.length >= 4).map((r) => r.map(([x, y]) => [arrotonda(y), arrotonda(x)]));
    if (!anelli.length) continue;
    const stato = STATI_CONSERVAZIONE[a.conclusion_assessment_MS] ? a.conclusion_assessment_MS : 'XX';
    const voce = { regione: a.region ?? '', stato, tendenza: a.conclusion_assessment_trend_MS ?? null, anelli };
    // pezzi della stessa regione biogeografica con lo stesso stato: un solo poligono
    const esistente = (risultato[animale] ??= []).find((v) => v.regione === voce.regione && v.stato === voce.stato);
    if (esistente) esistente.anelli.push(...anelli);
    else risultato[animale].push(voce);
  }
  return risultato;
}

// Testo per il riquadro di una zona: "Lupo — regione mediterranea: favorevole, in miglioramento"
export function descriviZona(animale, voce, nomeAnimale) {
  const stato = STATI_CONSERVAZIONE[voce.stato].nome.toLowerCase();
  const regione = REGIONI_BIOGEOGRAFICHE[voce.regione];
  const tendenza = TENDENZE[voce.tendenza];
  return `${nomeAnimale}${regione ? ` — regione ${regione}` : ''}: stato di conservazione ${stato}${tendenza && voce.stato !== 'XX' ? `, ${tendenza}` : ''}`;
}
