// Animali: nome in italiano. Ogni parco ne mostra un sottoinsieme (src/datiParchi.js).
export const ANIMALI = {
  orso: 'Orso',
  lupo: 'Lupo',
  camoscio: 'Camoscio',
  cervo: 'Cervo',
  capriolo: 'Capriolo',
  daino: 'Daino',
  muflone: 'Muflone',
  cinghiale: 'Cinghiale',
  volpe: 'Volpe',
  lontra: 'Lontra',
  gatto_selvatico: 'Gatto selvatico',
  aquila_reale: 'Aquila reale',
  gufo_reale: 'Gufo reale',
  nibbio_reale: 'Nibbio reale',
  cicogna_nera: 'Cicogna nera',
  // fuori dai parchi di montagna ("Intorno a me")
  fenicottero: 'Fenicottero',
  falco_grillaio: 'Falco grillaio',
  riccio: 'Riccio',
  tasso: 'Tasso',
  altro: 'Altro',
};

// Dove vive, in breve (per le schede degli animali)
export const HABITAT = {
  orso: 'Faggete e pascoli d\'altura, si sposta molto',
  lupo: 'Boschi e praterie, ampi territori di branco',
  camoscio: 'Pareti rocciose e praterie sopra il bosco',
  cervo: 'Boschi aperti e radure, bramito in autunno',
  capriolo: 'Margini del bosco e radure',
  daino: 'Boschi misti con ampie radure',
  muflone: 'Versanti rocciosi e boschi radi',
  cinghiale: 'Boschi di latifoglie, ovunque',
  volpe: 'Ovunque, dal bosco ai paesi',
  lontra: 'Fiumi puliti con rive naturali',
  gatto_selvatico: 'Boschi fitti e macchia, molto elusivo',
  aquila_reale: 'Pareti rocciose e praterie d\'alta quota',
  gufo_reale: 'Rupi e gole, attivo al crepuscolo',
  nibbio_reale: 'Campi aperti e valli, plana a lungo',
  cicogna_nera: 'Fiumi e boschi tranquilli',
  fenicottero: 'Lagune, saline e stagni costieri',
  falco_grillaio: 'Campagne aperte e centri storici dove nidifica',
  riccio: 'Campagne, siepi e giardini, di notte',
  tasso: 'Boschi, macchia e campagne con siepi',
};

// Specie su iNaturalist (id del taxon a livello di specie: in Appennino molte osservazioni
// non indicano la sottospecie). Verificati con l'API di iNaturalist.
export const TAXON_INATURALIST = {
  orso: { id: 41641, nome: 'Ursus arctos (orso bruno marsicano)' },
  lupo: { id: 42048, nome: 'Canis lupus (lupo appenninico)' },
  camoscio: { id: 42346, nome: 'Rupicapra pyrenaica (camoscio appenninico)' },
  cervo: { id: 204113, nome: 'Cervus elaphus' },
  capriolo: { id: 42184, nome: 'Capreolus capreolus' },
  daino: { id: 42161, nome: 'Dama dama' },
  muflone: { id: 340942, nome: 'Ovis aries musimon' },
  cinghiale: { id: 42134, nome: 'Sus scrofa' },
  volpe: { id: 42069, nome: 'Vulpes vulpes' },
  lontra: { id: 41850, nome: 'Lutra lutra' },
  gatto_selvatico: { id: 922459, nome: 'Felis silvestris' },
  aquila_reale: { id: 5074, nome: 'Aquila chrysaetos' },
  gufo_reale: { id: 20059, nome: 'Bubo bubo' },
  nibbio_reale: { id: 5267, nome: 'Milvus milvus' },
  cicogna_nera: { id: 4736, nome: 'Ciconia nigra' },
  fenicottero: { id: 73222, nome: 'Phoenicopterus roseus' },
  falco_grillaio: { id: 59845, nome: 'Falco naumanni' },
  riccio: { id: 43042, nome: 'Erinaceus europaeus' },
  tasso: { id: 855297, nome: 'Meles meles' },
};

// Le stesse specie su GBIF (chiavi del suo elenco dei nomi). Camoscio: tutto il genere Rupicapra,
// perché molte osservazioni appenniniche sono registrate con il nome della specie alpina.
// Muflone: solo la sottospecie musimon (non le pecore domestiche).
export const TAXON_GBIF = {
  orso: 2433433,
  lupo: 5219173,
  camoscio: 5220169,
  cervo: 2440958,
  capriolo: 5220126,
  daino: 5220136,
  muflone: 6165157,
  cinghiale: 7705930,
  volpe: 5219243,
  lontra: 2433753,
  gatto_selvatico: 7964291,
  aquila_reale: 2480506,
  gufo_reale: 5959092,
  nibbio_reale: 5229168,
  cicogna_nera: 2481909,
  fenicottero: 4352332,
  falco_grillaio: 9584698,
  riccio: 5219616,
  tasso: 2433875,
};

// Specie cercate solo in "Intorno a me": i dati dei parchi restano quelli di sempre
export const SPECIE_SOLO_INTORNO = ['fenicottero', 'falco_grillaio', 'riccio', 'tasso'];

export const STATI = {
  da_fare: 'Da fare',
  fatto: 'Fatto',
};

// "nessuno" = tipo di accesso non ancora indicato
export const ACCESSI = {
  libero: 'Libero',
  guida: 'Solo con guida',
  numero_chiuso: 'Numero chiuso stagionale',
  chiusure_periodiche: 'Chiusure periodiche',
  nessuno: 'Non indicato',
};

export const LINK_PARCO = 'https://www.parcoabruzzo.it/';


export const BICI_CONSENTITA = {
  si: 'Consentita',
  no: 'Vietata',
  da_verificare: 'Da verificare',
};

export const PEDALABILITA = {
  facile: 'Facile',
  media: 'Media',
  difficile: 'Difficile',
  a_spinta: 'A spinta',
};

export const SCALE_MTB = ['S0', 'S1', 'S2', 'S3', 'S4', 'S5'];

// Scala di difficoltà escursionistica del CAI
export const DIFFICOLTA = {
  T: 'T – turistico',
  E: 'E – escursionistico',
  EE: 'EE – per escursionisti esperti',
  EEA: 'EEA – esperti con attrezzatura',
};
