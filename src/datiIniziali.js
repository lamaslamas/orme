import { LINK_PARCO } from './lib/costanti.js';

// Sentieri di partenza: tutti con daVerificare = true.
// Dove un'informazione non era nota il campo è lasciato vuoto.
function sentiero(dati) {
  return {
    codici: [],
    nome: '',
    zona: '',
    descrizione: '',
    animali: [],
    escursione: { associazione: '', nomeUscita: '', periodo: '' },
    lunghezzaKm: null,
    dislivelloM: null,
    durataMin: null,
    partenza: { paese: '', descrizione: '', lat: null, lon: null },
    accesso: { tipo: 'nessuno', nota: '', link: LINK_PARCO },
    stato: 'da_fare',
    dataPercorso: null,
    notePersonali: '',
    daVerificare: true,
    ...dati,
  };
}

export const DATI_INIZIALI = [
  sentiero({
    id: 'cicerana',
    nome: 'Altopiano della Cicerana',
    zona: 'Passo del Diavolo – Cicerana',
    descrizione:
      "Da Passo del Diavolo all'altopiano della Cicerana (1560 m), con il Vallone Lampazzo.",
    animali: ['orso'],
    escursione: { associazione: 'Ecotur', nomeUscita: 'Bearwatching', periodo: 'Ottobre' },
    lunghezzaKm: 8,
    dislivelloM: 200,
    partenza: { paese: '', descrizione: 'Passo del Diavolo', lat: null, lon: null },
  }),
  sentiero({
    id: 'f10-pianezza',
    codici: ['F10'],
    nome: 'Pianezza – Monte Marsicano',
    zona: 'Monte Marsicano',
    animali: ['orso', 'cervo'],
    escursione: { associazione: '', nomeUscita: 'Bramito del cervo', periodo: 'Settembre–ottobre' },
    partenza: { paese: 'Opi', descrizione: 'Dalla SS Sangritana, a est di Opi', lat: null, lon: null },
    accesso: {
      tipo: 'chiusure_periodiche',
      nota: 'Chiuso in tarda primavera nel 2024 e nel 2025.',
      link: LINK_PARCO,
    },
  }),
  sentiero({
    id: 't2-u1-morrone-del-diavolo',
    codici: ['T2', 'U1'],
    nome: 'Morrone del Diavolo – La Lungara – Gioia Vecchio',
    zona: 'Gioia Vecchio',
    animali: ['orso'],
    partenza: { paese: 'Gioia Vecchio', descrizione: '', lat: null, lon: null },
    accesso: { tipo: 'nessuno', nota: 'Percorso concordato tra CAI e Parco.', link: LINK_PARCO },
  }),
  sentiero({
    id: 'f2-val-fondillo',
    codici: ['F2'],
    nome: 'Val Fondillo – Sorgente Tornareccia',
    zona: 'Val Fondillo',
    descrizione: 'Fino alla Sorgente Tornareccia, andata e ritorno.',
    animali: ['lupo'],
    escursione: { associazione: 'Ecotur', nomeUscita: '', periodo: '' },
    lunghezzaKm: 5,
    partenza: { paese: 'Opi', descrizione: 'Val Fondillo', lat: null, lon: null },
  }),
  sentiero({
    id: 'i1-k6-val-di-rose-jannanghera',
    codici: ['I1', 'K6'],
    nome: 'Val di Rose e Valle Jannanghera',
    zona: 'Val di Rose – Valle Jannanghera',
    animali: ['camoscio'],
    partenza: { paese: 'Civitella Alfedena', descrizione: '', lat: null, lon: null },
    accesso: {
      tipo: 'guida',
      nota: 'In estate accesso solo da questi sentieri e con guida.',
      link: LINK_PARCO,
    },
  }),
  sentiero({
    id: 'f1-monte-amaro',
    codici: ['F1'],
    nome: 'Monte Amaro',
    zona: 'Monte Amaro',
    animali: ['camoscio'],
    partenza: { paese: 'Opi', descrizione: '', lat: null, lon: null },
    accesso: { tipo: 'numero_chiuso', nota: 'Numero chiuso in estate.', link: LINK_PARCO },
  }),
  sentiero({
    id: 'l1-m1-n1-monte-meta',
    codici: ['L1', 'M1', 'N1'],
    nome: 'Monte Meta',
    zona: 'Monte Meta',
    animali: ['camoscio'],
    accesso: { tipo: 'numero_chiuso', nota: 'Numero chiuso in estate.', link: LINK_PARCO },
  }),
  sentiero({
    id: 'camosciara-scerto',
    nome: 'Camosciara – Torrente Scerto',
    zona: 'Camosciara (Riserva Integrale)',
    animali: ['camoscio'],
    escursione: { associazione: 'Ecotur', nomeUscita: '', periodo: '' },
  }),
  sentiero({
    id: 'b5-b4-monte-tranquillo',
    codici: ['B5', 'B4'],
    nome: 'Monte Tranquillo – Valico di Valcallano – Valle Carbonara',
    zona: 'Monte Tranquillo',
    descrizione:
      'Il B5 e il tratto del B4 tra il Valico di Valcallano e Valle Carbonara.',
    animali: ['orso'],
    accesso: {
      tipo: 'chiusure_periodiche',
      nota: 'Chiusi nel periodo di maturazione del ramno (fine estate).',
      link: LINK_PARCO,
    },
  }),
];
