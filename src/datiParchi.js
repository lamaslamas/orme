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
];

export const PARCO_PREDEFINITO = 'pnalm';

export function parcoDa(id) {
  return PARCHI.find((p) => p.id === id) ?? null;
}
