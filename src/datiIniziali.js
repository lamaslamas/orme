import { LINK_PARCO } from './lib/costanti.js';
import { parcoDa } from './datiParchi.js';

// Sentieri di partenza: tutti con daVerificare = true.
// Dove un'informazione non era nota il campo è lasciato vuoto.
// "aggiunto" indica in quale versione dei dati iniziali è comparso il sentiero:
// sui telefoni che hanno già i dati vengono aggiunti solo i sentieri nuovi.
// Qui vanno solo sentieri ufficiali: mai avvistamenti, nomi o contatti personali.
function sentiero(dati) {
  return {
    parco: 'pnalm',
    aggiunto: 1,
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

const PNALM = [
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

// Foreste Casentinesi: località e percorsi dal programma "Wolf Howling 2026/2027"
// del Parco (uscite con guide ambientali consigliate dal Parco, novembre–gennaio).
const FONTE_WH = {
  fonte: 'Programma Wolf Howling 2026/2027 – Parco Nazionale Foreste Casentinesi',
  url: 'https://www.parcoforestecasentinesi.it/it/news/wolf-howling-20262027',
};

function casentinesi(dati) {
  const sito = parcoDa('foreste-casentinesi').sito;
  return sentiero({
    parco: 'foreste-casentinesi',
    aggiunto: 2,
    animali: ['lupo'],
    accesso: {
      tipo: 'nessuno',
      nota: 'Nato come uscita serale guidata di wolf howling: in autonomia verifica regole, orari e accessi del Parco.',
      link: sito,
    },
    ...dati,
    escursione: { associazione: '', nomeUscita: '', periodo: 'Novembre – gennaio', ...FONTE_WH, ...dati.escursione },
  });
}

const CASENTINESI = [
  casentinesi({
    id: 'fc-tramazzo',
    nome: 'Anello del Tramazzo da Lago di Ponte',
    zona: 'Valle del Tramazzo',
    descrizione: 'Anello di circa 8 km con partenza dal Rifugio Casaponte (Lago di Ponte).',
    lunghezzaKm: 8,
    partenza: { paese: 'Tredozio', descrizione: 'Rifugio Casaponte, Lago di Ponte', lat: null, lon: null },
    escursione: { associazione: 'Romagna Selvatica', nomeUscita: 'Ululati nella notte – Wolf Howling al Tramazzo' },
  }),
  casentinesi({
    id: 'fc-la-beccia-pratalino',
    nome: 'La Beccia – Pratalino',
    zona: 'Pratalino',
    lunghezzaKm: 6,
    dislivelloM: 200,
    durataMin: 180,
    partenza: { paese: 'Chiusi della Verna', descrizione: 'Località La Beccia', lat: null, lon: null },
    escursione: { nomeUscita: 'Le notti del Wolf howling: trek e formazione sul lupo' },
  }),
  casentinesi({
    id: 'fc-casanova-romiceto',
    nome: "Casanova dell'Alpe – Podere Romiceto",
    zona: "Casanova dell'Alpe",
    descrizione: 'Trekking di circa 9 km con sosta al Podere Romiceto.',
    lunghezzaKm: 9,
    partenza: { paese: '', descrizione: "Casanova dell'Alpe", lat: null, lon: null },
    escursione: { nomeUscita: 'La notte dei lupi – Wolf howling nelle Foreste Casentinesi' },
  }),
  casentinesi({
    id: 'fc-casanova-pista',
    nome: "Casanova dell'Alpe – pista forestale",
    zona: "Casanova dell'Alpe",
    descrizione: 'Facile passeggiata di circa 4 km lungo una pista forestale.',
    difficolta: 'T',
    lunghezzaKm: 4,
    partenza: { paese: '', descrizione: "Casanova dell'Alpe (ritrovo all'Idro Ecomuseo di Ridracoli)", lat: null, lon: null },
    escursione: { nomeUscita: "Lupi a Casanova dell'Alpe" },
  }),
  casentinesi({
    id: 'fc-borbotto',
    nome: 'Le Pianacce – Rifugio Borbotto',
    zona: 'Borbotto',
    partenza: { paese: '', descrizione: 'Parcheggio de Le Pianacce', lat: null, lon: null },
    escursione: { associazione: 'Ecotondo', nomeUscita: 'Ululati nella notte' },
  }),
  casentinesi({
    id: 'fc-frassineta-bellaria',
    nome: 'Frassineta – Bellaria (Vallesanta)',
    zona: 'Vallesanta',
    descrizione: 'Facile percorso notturno di circa 5 km nella Vallesanta.',
    lunghezzaKm: 5,
    dislivelloM: 250,
    durataMin: 180,
    partenza: { paese: 'Chiusi della Verna', descrizione: 'Piazzetta di Frassineta', lat: null, lon: null },
    escursione: { associazione: 'Occhi di Bosco', nomeUscita: 'Occhi di Bosco, la notte e il lupo' },
  }),
  casentinesi({
    id: 'fc-corezzo-bellaria',
    nome: 'Corezzo – Bellaria',
    zona: 'Bellaria',
    lunghezzaKm: 6,
    dislivelloM: 200,
    durataMin: 180,
    partenza: { paese: 'Chiusi della Verna', descrizione: 'Località Corezzo', lat: null, lon: null },
    escursione: { nomeUscita: 'Le notti del Wolf howling: trek e formazione sul lupo' },
  }),
  casentinesi({
    id: 'fc-camaldoli-montanino',
    nome: 'Camaldoli – Montanino',
    zona: 'Camaldoli',
    lunghezzaKm: 5,
    dislivelloM: 150,
    durataMin: 180,
    partenza: { paese: 'Poppi', descrizione: 'Monastero di Camaldoli', lat: null, lon: null },
    escursione: { associazione: 'Cooperativa In Quiete', nomeUscita: 'Le notti del Wolf howling: trek e formazione sul lupo' },
  }),
  casentinesi({
    id: 'fc-via-dei-legni',
    nome: 'Via dei Legni: Valagnesi – Prato alle Cogne',
    zona: 'Prato alle Cogne',
    partenza: { paese: '', descrizione: 'Valagnesi', lat: null, lon: null },
    escursione: { nomeUscita: 'Il bosco che ulula' },
  }),
  casentinesi({
    id: 'fc-passo-braccina',
    nome: 'Passo della Braccina',
    zona: 'Passo della Braccina',
    partenza: { paese: 'Premilcuore', descrizione: 'Passo della Braccina', lat: null, lon: null },
    escursione: { associazione: 'Wilder Trekk', nomeUscita: 'Il richiamo del selvaggio' },
  }),
  casentinesi({
    id: 'fc-moggiona',
    nome: 'Moggiona, il paese del lupo – percorso faunistico',
    zona: 'Moggiona',
    partenza: { paese: 'Poppi', descrizione: 'Moggiona', lat: null, lon: null },
    escursione: { associazione: 'Altertrek', nomeUscita: 'Wolf Day nel paese del lupo' },
  }),
];

// Appennino Lucano: itinerari ufficiali del Parco. Il Parco non indica la fauna
// dei singoli itinerari, quindi gli animali restano da compilare.
function lucano(dati) {
  const sito = parcoDa('appennino-lucano').sito;
  return sentiero({
    parco: 'appennino-lucano',
    aggiunto: 2,
    accesso: { tipo: 'nessuno', nota: '', link: sito },
    ...dati,
    escursione: {
      associazione: '',
      nomeUscita: '',
      periodo: '',
      fonte: "Itinerari ufficiali del Parco Nazionale dell'Appennino Lucano",
      url: 'https://www.parcoappenninolucano.it/iti-nostri.php',
      ...dati.escursione,
    },
  });
}

const LUCANO = [
  lucano({
    id: 'al-lago-laudemio',
    nome: 'Anello del Lago Laudemio e Monte Papa',
    zona: 'Massiccio Sirino-Papa',
    descrizione: 'Anello dal lago glaciale Laudemio (1525 m) sulle pendici del Sirino-Papa, con vista dal Monte Papa.',
    difficolta: 'EE',
    lunghezzaKm: 9.8,
    durataMin: 330,
    partenza: { paese: '', descrizione: 'Lago Laudemio', lat: null, lon: null },
  }),
  lucano({
    id: 'al-monte-volturino',
    nome: 'Sorgente Copone – Monte Volturino',
    zona: 'Monte Volturino',
    difficolta: 'E',
    lunghezzaKm: 11.5,
    durataMin: 260,
    partenza: { paese: 'Marsicovetere', descrizione: 'Sorgente Copone', lat: null, lon: null },
  }),
  lucano({
    id: 'al-sentiero-ventennale',
    nome: 'Sentiero del Ventennale',
    zona: 'Monte Volturino',
    descrizione:
      "Dalla Sorgente Copone attraverso prateria e faggeta al Piano dell'Imperatore, fino alla vetta più alta del complesso del Volturino.",
    difficolta: 'E',
    lunghezzaKm: 15,
    durataMin: 400,
    partenza: { paese: 'Marsicovetere', descrizione: 'Sorgente Copone', lat: null, lon: null },
  }),
  lucano({
    id: 'al-sentiero-frassati',
    nome: 'Sentiero Frassati',
    zona: 'Sasso di Castalda',
    descrizione: "Anello dal centro di Sasso di Castalda lungo l'Oasi del Cervo, il Mulino del Conte e il Faggio di San Michele.",
    difficolta: 'EE',
    lunghezzaKm: 22,
    durataMin: 400,
    partenza: { paese: 'Sasso di Castalda', descrizione: 'Centro storico', lat: null, lon: null },
  }),
];

// 1: sentieri PNALM; 2: nuovi parchi; 3: tracce OSM dei sentieri PNALM (src/tracceIniziali.json)
export const VERSIONE_DATI_INIZIALI = 3;
export const VERSIONE_TRACCE_INIZIALI = 3;

export const DATI_INIZIALI = [...PNALM, ...CASENTINESI, ...LUCANO];
