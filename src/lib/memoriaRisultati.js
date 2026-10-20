// I risultati di Suggerisci da ritrovare tornando indietro dalla pagina di un sentiero: stesse scelte, stessa pagina
// di risultati, stessa posizione di scorrimento, il sentiero aperto evidenziato. Resta in memoria (non nel
// telefono): la pagina non si ricarica tornando indietro, la cronologia del browser fa il resto.
let memoria = null;

// stato: { chiave (le scelte), classifica, da (prima proposta della pagina), scroll, idAperto, posizioneTendina, ... }
export function salvaRisultati(stato) {
  memoria = { ...stato, inAttesa: true };
}

// Al ritorno: lo stato salvato, una volta sola, solo se le scelte sono le stesse (altrimenti si ricalcola)
export function riprendiRisultati(chiave) {
  if (!memoria?.inAttesa) return null;
  memoria.inAttesa = false;
  return memoria.chiave === chiave ? memoria : null;
}

export const dimenticaRisultati = () => (memoria = null);
