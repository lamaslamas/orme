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
  altro: 'Altro',
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
};

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
