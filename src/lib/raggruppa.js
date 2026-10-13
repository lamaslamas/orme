// Punti troppo vicini sullo schermo uniti in un gruppo (per i segni con un numero sulla mappa).
// proietta(punto) → [x, y] in pixel; distanza: pixel sotto i quali due segni si sovrappongono.
// Il gruppo sta nella media dei suoi punti; il primo punto (il più pesante, se ordinati) lo apre.
export function raggruppaVicini(punti, proietta, distanza = 34) {
  const gruppi = [];
  for (const p of punti) {
    const [x, y] = proietta(p);
    const g = gruppi.find((v) => Math.hypot(v.x - x, v.y - y) < distanza);
    if (g) {
      g.punti.push(p);
      g.x = (g.x * (g.punti.length - 1) + x) / g.punti.length;
      g.y = (g.y * (g.punti.length - 1) + y) / g.punti.length;
    } else gruppi.push({ x, y, punti: [p] });
  }
  return gruppi;
}
