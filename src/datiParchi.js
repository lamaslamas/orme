// Catalogo dei parchi. Testi e animali ricavati dai siti ufficiali: da verificare.
// Gli avvistamenti personali NON vanno mai messi in questo file né in altri file del codice.

export const REGOLA_GENERALE =
  'Nei parchi resta sempre sui sentieri. Chiusure, divieti e numeri chiusi cambiano ogni anno: verifica sul sito del Parco.';

export const PARCHI = [
  {
    id: 'pnalm',
    nome: "Parco Nazionale d'Abruzzo, Lazio e Molise",
    nomeBreve: 'PNALM',
    regioni: ['Abruzzo', 'Lazio', 'Molise'],
    sito: 'https://www.parcoabruzzo.it/',
    osm: { relazione: 8426003 },
    bbox: [41.6, 13.64, 42.02, 14.05],
    centro: [41.79, 13.85],
    animali: ['orso', 'lupo', 'camoscio', 'cervo', 'capriolo', 'cinghiale', 'volpe', 'gatto_selvatico', 'aquila_reale'],
    regole:
      'Nel Parco è vietato uscire dai sentieri. Chiusure e numeri chiusi cambiano ogni anno: verifica sempre sul sito del Parco.',
    descrizione:
      "Il parco dell'orso marsicano e del camoscio appenninico, tra faggete, valli glaciali e altopiani. Molti sentieri hanno accesso regolato in alcuni periodi dell'anno.",
    daVerificare: true,
  },
  {
    id: 'foreste-casentinesi',
    nome: 'Parco Nazionale delle Foreste Casentinesi, Monte Falterona e Campigna',
    nomeBreve: 'Foreste Casentinesi',
    regioni: ['Toscana', 'Emilia-Romagna'],
    sito: 'https://www.parcoforestecasentinesi.it/',
    osm: { relazione: 1691471 },
    bbox: [43.7, 11.61, 44.04, 11.96],
    centro: [43.85, 11.78],
    animali: ['lupo', 'cervo', 'daino', 'capriolo', 'muflone', 'cinghiale', 'aquila_reale', 'gufo_reale'],
    regole:
      'Resta sui sentieri. Le riserve integrali (Sasso Fratino, La Pietra, Monte Falco – Poggio Piancancelli, Monte Penna) hanno la tutela più alta: verifica accessi e divieti sul sito del Parco.',
    descrizione:
      'Grandi foreste di faggio e abete tra Toscana e Romagna, con le faggete vetuste di Sasso Fratino patrimonio UNESCO. Il Parco organizza ogni anno uscite di wolf howling e il censimento del cervo al bramito.',
    daVerificare: true,
  },
  {
    id: 'appennino-lucano',
    nome: "Parco Nazionale dell'Appennino Lucano – Val d'Agri – Lagonegrese",
    nomeBreve: 'Appennino Lucano',
    regioni: ['Basilicata'],
    sito: 'https://www.parcoappenninolucano.it/',
    osm: { relazione: 6274746 },
    bbox: [40.08, 15.59, 40.59, 16.17],
    centro: [40.33, 15.88],
    animali: ['lupo', 'lontra', 'cinghiale', 'gatto_selvatico', 'volpe', 'aquila_reale', 'gufo_reale', 'nibbio_reale', 'cicogna_nera'],
    regole:
      'Resta sui sentieri segnati. Divieti, chiusure e autorizzazioni cambiano nel tempo: verifica sempre sul sito del Parco.',
    descrizione:
      "Le montagne più alte dell'Appennino lucano, dal Volturino al massiccio Sirino-Papa, con la Val d'Agri. Tra gli animali citati dal Parco: lupo, lontra lungo l'Agri, gatto selvatico e rapaci come nibbio reale e aquila reale.",
    daVerificare: true,
  },
  {
    id: 'pollino',
    nome: 'Parco Nazionale del Pollino',
    nomeBreve: 'Pollino',
    regioni: ['Basilicata', 'Calabria'],
    // sito dell'Ente Parco (indicato dall'ISPRA)
    sito: 'https://www.parcopollino.gov.it/',
    // su OpenStreetMap il confine è una sola linea chiusa, non una relazione
    osm: { way: 33911573 },
    bbox: [39.61, 15.82, 40.23, 16.44],
    centro: [39.92, 16.13],
    animali: ['lupo', 'capriolo', 'lontra', 'cinghiale', 'gatto_selvatico', 'volpe', 'aquila_reale', 'gufo_reale', 'nibbio_reale'],
    regole:
      'Resta sui sentieri segnati. Divieti, chiusure e autorizzazioni cambiano nel tempo: verifica sempre sul sito del Parco.',
    descrizione:
      "Il parco nazionale più grande d'Italia, tra Basilicata e Calabria: il massiccio del Pollino e i Monti di Orsomarso, con il pino loricato. Tra gli animali: lupo, capriolo italico, lontra, aquila reale e gufo reale.",
    daVerificare: true,
  },
  {
    id: 'gallipoli-cognato',
    nome: 'Parco regionale di Gallipoli Cognato e Piccole Dolomiti Lucane',
    nomeBreve: 'Gallipoli Cognato',
    regioni: ['Basilicata'],
    sito: 'https://www.parcogallipolicognato.it/',
    // parco regionale; su OpenStreetMap il confine è una sola linea chiusa, non una relazione
    osm: { way: 1004022533 },
    bbox: [40.42, 15.97, 40.61, 16.25],
    centro: [40.52, 16.11],
    // da Wikipedia; daini e cervi solo nell'oasi faunistica recintata, quindi non elencati
    animali: ['lupo', 'gatto_selvatico', 'cinghiale', 'volpe', 'nibbio_reale'],
    regole:
      'Resta sui sentieri segnati. Divieti, chiusure e autorizzazioni cambiano nel tempo: verifica sempre sul sito del Parco.',
    descrizione:
      'Parco regionale tra le province di Matera e Potenza: la foresta di Gallipoli Cognato, fino ai 1319 m del Monte Croccia, e le guglie di arenaria delle Dolomiti Lucane attorno a Castelmezzano e Pietrapertosa. Tra gli animali: lupo, gatto selvatico, cinghiale e rapaci come il nibbio reale.',
    daVerificare: true,
  },
  {
    id: 'majella',
    nome: 'Parco Nazionale della Majella',
    nomeBreve: 'Majella',
    regioni: ['Abruzzo'],
    sito: 'https://www.parcomajella.it/',
    osm: { relazione: 3159222 },
    bbox: [41.84, 13.83, 42.25, 14.25],
    centro: [42.05, 14.05],
    // da Wikipedia
    animali: ['orso', 'lupo', 'camoscio', 'cervo', 'capriolo', 'cinghiale', 'gatto_selvatico', 'lontra', 'volpe', 'aquila_reale'],
    regole:
      'Resta sui sentieri segnati. Divieti, chiusure e autorizzazioni cambiano nel tempo: verifica sempre sul sito del Parco.',
    descrizione:
      "Il massiccio della Majella con il Monte Amaro (2793 m), il Morrone, i Monti Pizzi e il Porrara, fino agli altipiani maggiori d'Abruzzo. Ospita la popolazione più numerosa di camoscio appenninico, un nucleo di orso marsicano, lupi, cervi e caprioli.",
    daVerificare: true,
  },
];

export const PARCO_PREDEFINITO = 'pnalm';

// "Intorno a me": i percorsi scaricati dal telefono attorno alla mia posizione. Non è un parco
// e resta separato dalle pagine dei parchi; zona e posizione stanno solo sul dispositivo.
export const ID_INTORNO = 'intorno';
export const INTORNO = {
  id: ID_INTORNO,
  zona: true,
  nome: 'Intorno a me',
  nomeBreve: 'Intorno a me',
  regioni: [],
  sito: null,
  animali: [],
  regole: 'Fuori dai parchi molti sentieri attraversano campagne e proprietà private: resta sul tracciato segnato e rispetta recinzioni, muretti e coltivi.',
  descrizione: '',
};

export function parcoDa(id) {
  return PARCHI.find((p) => p.id === id) ?? (id === ID_INTORNO ? INTORNO : null);
}

// I percorsi dei parchi (senza quelli di "Intorno a me")
export const diUnParco = (s) => s.parco !== ID_INTORNO;
