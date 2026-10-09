// Sezione della barra in basso (Mappa, Pianifica, Parchi, Altro) a cui appartiene un percorso
export function sezioneDi(percorso) {
  if (/^\/mappa(\/|$)/.test(percorso)) return 'mappa';
  if (/^\/(pianifica|percorso|domani)(\/|-|$)/.test(percorso)) return 'pianifica';
  if (/^\/(altro|backup)(\/|$)/.test(percorso)) return 'altro';
  // parchi, sentieri, giri e i miei avvistamenti
  return 'parchi';
}
