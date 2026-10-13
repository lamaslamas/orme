// Elenco "Percorsi qui": i percorsi senza traccia della zona inquadrata e la frase dei filtri.

// Senza traccia non sono sulla mappa: si mostrano solo quelli del parco scelto, oppure (senza parco)
// quelli che partono nella zona inquadrata o sono di un parco che si vede.
// vista: [sud, ovest, nord, est]; riquadroParco(id): [sud, ovest, nord, est] o null
export function senzaTracciaNellaZona(sentieri, vista, { parco = '', riquadroParco = () => null } = {}) {
  const [s, o, n, e] = vista;
  const dentro = (lat, lon) => lat >= s && lat <= n && lon >= o && lon <= e;
  const siVede = (b) => b && b[0] <= n && b[2] >= s && b[1] <= e && b[3] >= o;
  return sentieri.filter((x) => {
    const parchi = x.parchi ?? [x.parco].filter(Boolean);
    if (parco) return parchi.includes(parco);
    const p = x.partenza;
    if (p?.lat != null && p?.lon != null) return dentro(p.lat, p.lon);
    return parchi.some((id) => siVede(riquadroParco(id)));
  });
}

// "17 percorsi con i filtri attivi" / "733 percorsi sulla mappa"
export function testoRiassunto(conTraccia, filtriAttivi) {
  const n = `${conTraccia} ${conTraccia === 1 ? 'percorso' : 'percorsi'}`;
  return filtriAttivi ? `${n} con i filtri attivi` : `${n} sulla mappa`;
}
