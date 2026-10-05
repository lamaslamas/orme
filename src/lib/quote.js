// Dislivello di una traccia. Le coordinate con quota sono [lon, lat, quota].

// Oscillazioni sotto questa soglia vengono ignorate (rumore di GPS o modello del terreno)
export const SOGLIA_RUMORE_M = 10;

export const haQuota = (punto) => punto?.length >= 3 && Number.isFinite(punto[2]);

export function lineeConQuote(linee) {
  return linee.length > 0 && linee.every((l) => l.length > 0 && l.every(haQuota));
}

// Somma salite e discese di una linea, con isteresi: si conta un cambio di quota
// solo quando supera la soglia rispetto all'ultimo punto di riferimento.
function dislivelloLinea(linea, soglia) {
  let salita = 0;
  let discesa = 0;
  let riferimento = linea[0][2];
  for (let i = 1; i < linea.length; i++) {
    const q = linea[i][2];
    const diff = q - riferimento;
    if (diff >= soglia) {
      salita += diff;
      riferimento = q;
    } else if (diff <= -soglia) {
      discesa -= diff;
      riferimento = q;
    }
  }
  // l'ultimo tratto sotto soglia conta comunque, così il bilancio torna con la quota finale
  const resto = linea[linea.length - 1][2] - riferimento;
  if (resto > 0) salita += resto;
  else discesa -= resto;
  return { salita, discesa };
}

// Restituisce { salita, discesa } in metri, oppure null se mancano le quote
export function dislivello(linee, soglia = SOGLIA_RUMORE_M) {
  if (!lineeConQuote(linee)) return null;
  let salita = 0;
  let discesa = 0;
  for (const linea of linee) {
    const d = dislivelloLinea(linea, soglia);
    salita += d.salita;
    discesa += d.discesa;
  }
  return { salita: Math.round(salita), discesa: Math.round(discesa) };
}
