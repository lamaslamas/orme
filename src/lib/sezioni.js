// Sezione della barra in basso (Esplora, Mappa, Giri, Altro) a cui appartiene un percorso
export function sezioneDi(percorso) {
  if (/^\/mappa(\/|$)/.test(percorso)) return 'mappa';
  if (/^\/(giri|giro-nuovo|giro\/)/.test(percorso)) return 'giri';
  if (/^\/(altro|backup|avvistament[oi])(\/|$)/.test(percorso)) return 'altro';
  return 'esplora';
}
