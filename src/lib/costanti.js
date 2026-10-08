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

// Nome scientifico per iNaturalist
export const TAXON_INATURALIST = {
  orso: 'Ursus arctos',
  lupo: 'Canis lupus',
  camoscio: 'Rupicapra pyrenaica',
  cervo: 'Cervus elaphus',
  capriolo: 'Capreolus capreolus',
  daino: 'Dama dama',
  muflone: 'Ovis gmelini',
  cinghiale: 'Sus scrofa',
  volpe: 'Vulpes vulpes',
  lontra: 'Lutra lutra',
  gatto_selvatico: 'Felis silvestris',
  aquila_reale: 'Aquila chrysaetos',
  gufo_reale: 'Bubo bubo',
  nibbio_reale: 'Milvus milvus',
  cicogna_nera: 'Ciconia nigra',
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
