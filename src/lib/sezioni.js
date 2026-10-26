// Sezione della barra in basso (Mappa, I miei percorsi, Associazioni, Altro) a cui appartiene un percorso
export function sezioneDi(percorso) {
  // i miei percorsi: salvati, disegnati o importati
  if (/^\/(miei|pianifica|salvati|percorso)(\/|-|\?|$)/.test(percorso)) return 'miei';
  if (/^\/associazioni(\/|\?|$)/.test(percorso)) return 'associazioni';
  // elenco dei parchi, backup e il resto
  if (/^\/(altro|backup|parchi|parco|domani|nuovo)(\/|\?|$)/.test(percorso)) return 'altro';
  // la mappa e le schede dei sentieri che si aprono da lì
  return 'mappa';
}

// Indirizzi delle sezioni di prima: portano alla schermata che le ha sostituite
const REINDIRIZZA = [
  [/^\/(mappa|intorno)\/?$/, () => '/'],
  [/^\/pianifica\/?$/, () => '/miei?scheda=percorsi'],
  [/^\/salvati\/?$/, () => '/miei?scheda=salvati'],
  [/^\/(giri|giro(?:-nuovo|\/.*)?)\/?$/, () => '/miei?scheda=percorsi'],
  [/^\/(avvistamenti|avvistamento\/.*)\/?$/, () => '/'],
];
export function reindirizza(percorso) {
  for (const [regola, verso] of REINDIRIZZA) if (regola.test(percorso)) return verso(percorso);
  return null;
}
