// Indice spaziale a griglia: dato un riquadro [sud, ovest, nord, est] dice subito quali oggetti (punti o riquadri di
// percorsi) ci passano, senza scorrerli tutti. Ogni oggetto sta nelle celle che il suo riquadro tocca.
// Serve a contare i percorsi della zona inquadrata, ai punti da disegnare (rifugi e acqua) e ai tocchi.
export function creaIndice(cella = 0.1) {
  const celle = new Map(); // "i,j" → Set di id
  const riquadri = new Map(); // id → [s, o, n, e]
  const comeCelle = ([s, o, n, e]) => {
    const r = [];
    for (let i = Math.floor(s / cella); i <= Math.floor(n / cella); i++) for (let j = Math.floor(o / cella); j <= Math.floor(e / cella); j++) r.push(`${i},${j}`);
    return r;
  };
  return {
    aggiungi(id, riquadro) {
      if (riquadri.has(id)) this.togli(id);
      riquadri.set(id, riquadro);
      for (const c of comeCelle(riquadro)) {
        if (!celle.has(c)) celle.set(c, new Set());
        celle.get(c).add(id);
      }
    },
    togli(id) {
      const q = riquadri.get(id);
      if (!q) return;
      for (const c of comeCelle(q)) celle.get(c)?.delete(id);
      riquadri.delete(id);
    },
    // gli id il cui riquadro si sovrappone davvero a quello cercato
    nelRiquadro([s, o, n, e]) {
      const trovati = new Set();
      for (const c of comeCelle([s, o, n, e])) {
        for (const id of celle.get(c) ?? []) {
          if (trovati.has(id)) continue;
          const [s2, o2, n2, e2] = riquadri.get(id);
          if (s2 <= n && n2 >= s && o2 <= e && e2 >= o) trovati.add(id);
        }
      }
      return trovati;
    },
    ha: (id) => riquadri.has(id),
    riquadro: (id) => riquadri.get(id),
    get size() {
      return riquadri.size;
    },
    svuota() {
      celle.clear();
      riquadri.clear();
    },
  };
}
