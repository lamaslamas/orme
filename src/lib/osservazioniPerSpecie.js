// Le osservazioni raggruppate per specie ("Volpe · 4 osservazioni · ultima 12/07/2026"), dalla più osservata.
// osservazioni: [{ specie, nomeScientifico, animale, icona, data, ... }]
export function raggruppaPerSpecie(osservazioni) {
  const gruppi = new Map();
  for (const o of osservazioni ?? []) {
    const chiave = o.nomeScientifico || o.specie;
    const g = gruppi.get(chiave) ?? { chiave, nome: o.specie, scientifico: o.nomeScientifico ?? '', icona: o.icona ?? o.animale ?? null, oss: [] };
    g.oss.push(o);
    gruppi.set(chiave, g);
  }
  return [...gruppi.values()]
    .map((g) => {
      const oss = g.oss.sort((a, b) => String(b.data ?? '').localeCompare(String(a.data ?? '')));
      return { ...g, oss, n: oss.length, ultima: oss.find((o) => o.data)?.data ?? null };
    })
    .sort((a, b) => b.n - a.n || String(b.ultima ?? '').localeCompare(String(a.ultima ?? '')));
}

// "12/07/2026" da "2026-07-12"
export const dataBreve = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : 'data non indicata');
