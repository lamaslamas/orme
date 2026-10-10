// Sezione della barra in basso (Mappa, Pianifica, Parchi, Intorno, Altro) a cui appartiene un percorso
export function sezioneDi(percorso) {
  if (/^\/mappa(\/|$)/.test(percorso)) return 'mappa';
  // "Intorno a me": la pagina, il suo "Dove vado domani?" e i suoi sentieri
  if (/^\/(intorno(\/|$)|domani\?zona=intorno|sentiero\/intorno-)/.test(percorso)) return 'intorno';
  if (/^\/(pianifica|percorso|domani)(\/|-|$)/.test(percorso)) return 'pianifica';
  if (/^\/(altro|backup)(\/|$)/.test(percorso)) return 'altro';
  // parchi, sentieri, giri e i miei avvistamenti
  return 'parchi';
}
