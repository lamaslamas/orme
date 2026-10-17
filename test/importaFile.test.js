// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { leggiZip } from '../src/lib/zip.js';
import { leggiKml } from '../src/lib/kml.js';
import { leggiGpxTracce } from '../src/lib/gpx.js';
import { leggiFileDiPercorsi, leggiFiles, riassuntoPercorso } from '../src/lib/importaFile.js';

const enc = (t) => new TextEncoder().encode(t);

// un file zip fatto a mano: voci { nome, dati: Uint8Array, comprimi }
function creaZip(voci) {
  const parti = [];
  const centrale = [];
  let offset = 0;
  const u16 = (n) => [n & 255, (n >> 8) & 255];
  const u32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  for (const v of voci) {
    const nome = enc(v.nome);
    const comp = v.comprimi === false ? v.dati : new Uint8Array(deflateRawSync(v.dati));
    const metodo = v.comprimi === false ? 0 : 8;
    const locale = [...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(metodo), ...u16(0), ...u16(0), ...u32(0), ...u32(comp.length), ...u32(v.dati.length), ...u16(nome.length), ...u16(0)];
    parti.push(Uint8Array.from(locale), nome, comp);
    centrale.push(Uint8Array.from([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(metodo), ...u16(0), ...u16(0), ...u32(0), ...u32(comp.length), ...u32(v.dati.length), ...u16(nome.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), nome);
    offset += locale.length + nome.length + comp.length;
  }
  const dimCentrale = centrale.reduce((n, c) => n + c.length, 0);
  const fine = Uint8Array.from([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(voci.length), ...u16(voci.length), ...u32(dimCentrale), ...u32(offset), ...u16(0)]);
  const tutto = [...parti, ...centrale, fine];
  const out = new Uint8Array(tutto.reduce((n, c) => n + c.length, 0));
  let p = 0;
  for (const c of tutto) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

const gpx = (nomi) => `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">${nomi
  .map((n, i) => `<trk><name>${n}</name><trkseg><trkpt lat="${41.8 + i * 0.1}" lon="13.8"><ele>1000</ele></trkpt><trkpt lat="${41.82 + i * 0.1}" lon="13.8"><ele>1100</ele></trkpt></trkseg></trk>`)
  .join('')}<wpt lat="41.8" lon="13.8"><name>Rifugio</name></wpt></gpx>`;
const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <Placemark><name>Anello del lago</name><LineString><coordinates>13.8,41.8,1000 13.81,41.81,1050 13.82,41.8,1000</coordinates></LineString></Placemark>
  <Placemark><name>Un punto</name><Point><coordinates>13.8,41.8</coordinates></Point></Placemark>
  <Placemark><name>Due pezzi</name><MultiGeometry><LineString><coordinates>13.9,41.9 13.91,41.9</coordinates></LineString><LineString><coordinates>13.92,41.9 13.93,41.9</coordinates></LineString></MultiGeometry></Placemark>
</Document></kml>`;

describe('GPX con più tracce', () => {
  it('un percorso per traccia, i punti (waypoint) si ignorano, le rotte solo se mancano le tracce', () => {
    const r = leggiGpxTracce(gpx(['Uno', 'Due']));
    expect(r.map((x) => x.nome)).toEqual(['Uno', 'Due']);
    expect(r[0].geojson.coordinates[0][0]).toEqual([13.8, 41.8, 1000]);
    const rotte = '<gpx xmlns="http://www.topografix.com/GPX/1/1"><rte><name>R</name><rtept lat="41.8" lon="13.8"/><rtept lat="41.81" lon="13.8"/></rte></gpx>';
    expect(leggiGpxTracce(rotte)[0].nome).toBe('R');
    expect(() => leggiGpxTracce('<gpx xmlns="http://www.topografix.com/GPX/1/1"><wpt lat="1" lon="1"/></gpx>')).toThrow(/non ci sono tracce/);
    expect(() => leggiGpxTracce('<kml/>')).toThrow(/non è un GPX/);
  });
});

describe('KML', () => {
  it('ogni Placemark con una linea è un percorso; i punti no; MultiGeometry resta uno; quote se ci sono', () => {
    const r = leggiKml(kml);
    expect(r.map((x) => x.nome)).toEqual(['Anello del lago', 'Due pezzi']);
    expect(r[0].geojson.coordinates[0]).toEqual([[13.8, 41.8, 1000], [13.81, 41.81, 1050], [13.82, 41.8, 1000]]);
    expect(r[1].geojson.coordinates).toHaveLength(2);
    expect(() => leggiKml('<kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><Point><coordinates>1,2</coordinates></Point></Placemark></kml>')).toThrow(/solo punti/);
    expect(() => leggiKml('<gpx/>')).toThrow(/non è un KML/);
  });
  it('gx:Track', () => {
    const t = '<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Placemark><name>Traccia</name><gx:Track><gx:coord>13.8 41.8 900</gx:coord><gx:coord>13.81 41.81 950</gx:coord></gx:Track></Placemark></kml>';
    expect(leggiKml(t)[0].geojson.coordinates[0]).toEqual([[13.8, 41.8, 900], [13.81, 41.81, 950]]);
  });
});

describe('zip', () => {
  it('apre file compressi e non compressi, salta le cartelle', async () => {
    const z = creaZip([{ nome: 'cartella/', dati: new Uint8Array(0), comprimi: false }, { nome: 'a.gpx', dati: enc(gpx(['A'])) }, { nome: 'b.txt', dati: enc('ciao'), comprimi: false }]);
    const { file, saltati } = await leggiZip(z);
    expect(file.map((f) => f.nome)).toEqual(['a.gpx', 'b.txt']);
    expect(new TextDecoder().decode(file[1].dati)).toBe('ciao');
    expect(new TextDecoder().decode(file[0].dati)).toContain('<gpx');
    expect(saltati).toEqual([]);
  });
  it('un file che non è uno zip: errore chiaro', async () => {
    await expect(leggiZip(enc('non sono uno zip, ma abbastanza lungo per non essere vuoto'))).rejects.toThrow(/zip valido/);
  });
});

describe('importazione di file', () => {
  it('gpx, kml, zip con dentro più file: tutti i percorsi, con il nome del file se manca quello della traccia', async () => {
    const z = creaZip([{ nome: 'giri/uno.gpx', dati: enc(gpx(['Giro uno'])) }, { nome: 'giri/due.kml', dati: enc(kml) }, { nome: '__MACOSX/._uno.gpx', dati: enc('x') }, { nome: 'leggimi.txt', dati: enc('x') }]);
    const r = await leggiFileDiPercorsi('raccolta.zip', z);
    expect(r.percorsi.map((p) => p.nome)).toEqual(['Giro uno', 'Anello del lago', 'Due pezzi']);
    expect(r.percorsi.map((p) => p.origine)).toEqual(['gpx', 'kml', 'kml']);
    expect(r.errori).toEqual([]);
    const senzaNome = await leggiFileDiPercorsi('Salita.gpx', enc('<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg><trkpt lat="41.8" lon="13.8"/><trkpt lat="41.81" lon="13.8"/></trkseg></trk></gpx>'));
    expect(senzaNome.percorsi[0].nome).toBe('Salita');
  });
  it('i file sbagliati finiscono tra gli errori, senza fermare gli altri', async () => {
    const r = await leggiFiles([
      { nome: 'buono.gpx', dati: enc(gpx(['Buono'])) },
      { nome: 'rotto.gpx', dati: enc('<gpx><trk') },
      { nome: 'foto.jpg', dati: enc('x') },
      { nome: 'vuoto.zip', dati: creaZip([{ nome: 'a.txt', dati: enc('x'), comprimi: false }]) },
    ]);
    expect(r.percorsi.map((p) => p.nome)).toEqual(['Buono']);
    expect(r.errori.map((e) => e.file)).toEqual(['rotto.gpx', 'foto.jpg', 'vuoto.zip']);
    expect(r.errori[1].motivo).toMatch(/formato non supportato/);
    expect(r.errori[2].motivo).toMatch(/Nello zip non ci sono/);
  });
  it('lo stesso percorso in due file non si raddoppia; riassunto con km e dislivello', async () => {
    const r = await leggiFiles([{ nome: 'a.gpx', dati: enc(gpx(['Stesso'])) }, { nome: 'copia.gpx', dati: enc(gpx(['Stesso'])) }]);
    expect(r.percorsi).toHaveLength(1);
    const s = riassuntoPercorso(r.percorsi[0]);
    expect(s.km).toBeGreaterThan(2);
    expect(s.punti).toBe(2);
    expect(s.salita).toBe(100);
  });
});
