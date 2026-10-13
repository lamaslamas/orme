// Tracciati di un piccolo SVG (solo <path>) per disegnarli su canvas con Path2D:
// [{ d, fill, stroke, larghezza }]. Senza fill: nessun riempimento se c'è un contorno, altrimenti
// il colore del segno (come currentColor)
export function partiDaSvg(svg) {
  const parti = [];
  for (const m of String(svg ?? '').matchAll(/<path\b([^>]*)\/?>/g)) {
    const attr = (n) => m[1].match(new RegExp(`\\b${n}="([^"]*)"`))?.[1] ?? null;
    const d = attr('d');
    if (!d) continue;
    const stroke = attr('stroke');
    parti.push({ d, fill: attr('fill') ?? (stroke ? 'none' : 'currentColor'), stroke, larghezza: Number(attr('stroke-width')) || 2 });
  }
  return parti;
}
