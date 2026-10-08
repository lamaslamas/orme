// Esportazione di un percorso in GPX 1.1 (con le quote, se ci sono)

const xml = (s) =>
  String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

export function creaGpx({ nome, linee }) {
  const segmenti = linee
    .filter((l) => l.length > 1)
    .map(
      (l) =>
        `    <trkseg>\n${l
          .map(([lon, lat, ele]) =>
            Number.isFinite(ele)
              ? `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"><ele>${ele.toFixed(1)}</ele></trkpt>`
              : `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"/>`,
          )
          .join('\n')}\n    </trkseg>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Orme" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${xml(nome)}</name></metadata>
  <trk>
    <name>${xml(nome)}</name>
${segmenti}
  </trk>
</gpx>
`;
}

export function nomeFileGpx(nome) {
  const base = String(nome || 'percorso')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'percorso'}.gpx`;
}
