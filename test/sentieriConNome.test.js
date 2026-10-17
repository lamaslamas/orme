import { describe, it, expect } from 'vitest';
import { nomeDaSentiero, queryVieConNome, sentieriConNome } from '../src/lib/sentieriConNome.js';

// una via: n punti verso nord da lat0, con nodi numerati
const via = (id, name, highway, lat0, n = 6, nodi = null, extra = {}) => ({
  type: 'way',
  id,
  tags: { name, highway, ...extra },
  nodes: nodi ?? Array.from({ length: n }, (_, i) => id * 100 + i),
  geometry: Array.from({ length: n }, (_, i) => ({ lat: lat0 + i * 0.0025, lon: 18.5 })), // ~280 m ogni passo
});

describe('nomi da sentiero', () => {
  it('tengo Sentiero, Cammino, Percorso, i codici di rete e le vie path/footway/bridleway', () => {
    expect(nomeDaSentiero('Sentiero Costa delle Èrgate', 'track')).toBe(true);
    expect(nomeDaSentiero('Cammino dei Dolmen', 'track')).toBe(true);
    expect(nomeDaSentiero('Percorso vita', 'track')).toBe(true);
    expect(nomeDaSentiero('PNR COL N08 Abazia San Nicola', 'track')).toBe(true);
    expect(nomeDaSentiero('Lu Strittu', 'path')).toBe(true); // nome da sentiero: è highway=path
    expect(nomeDaSentiero('Torcito-MonteVergine', 'footway')).toBe(true);
    expect(nomeDaSentiero('XC Montevergine', 'bridleway')).toBe(true);
  });
  it('scarto Via…, Strada…, Vicinale… e le carrarecce senza un nome da sentiero', () => {
    for (const n of ['Via Petrusella', 'Via Lorenzo Spallanzani', 'Strada Vicinale Tramacere', 'Vicinale Monte', 'Viale delle Rose', 'SP 358', 'Strada Provinciale 8']) {
      expect(nomeDaSentiero(n, 'path')).toBe(false); // anche se è highway=path: il nome è da strada
    }
    expect(nomeDaSentiero('Masseria Cippano', 'track')).toBe(false);
    expect(nomeDaSentiero('', 'path')).toBe(false);
  });
  it('la query chiede solo vie con nome, senza i nomi da strada, e chiede la geometria', () => {
    const q = queryVieConNome([40.1, 18.4, 40.25, 18.55]);
    expect(q).toContain('(40.1,18.4,40.25,18.55)');
    expect(q).toContain('"highway"~"^(path|footway|bridleway)$"');
    expect(q).toContain('Via|Viale');
    expect(q).toContain('out body geom');
  });
});

describe('sentieri con nome dalla risposta', () => {
  it('tratti collegati con lo stesso nome, almeno 1 km: un percorso', () => {
    // due tratti da ~1,4 km che condividono un nodo
    const a = via(1, 'Sentiero Lu Strittu', 'path', 40.0, 6, [10, 11, 12, 13, 14, 15]);
    const b = via(2, 'Sentiero Lu Strittu', 'path', 40.0125, 6, [15, 21, 22, 23, 24, 25]);
    const r = sentieriConNome({ elements: [a, b] });
    expect(r).toHaveLength(1);
    expect(r[0].sentiero.nome).toBe('Sentiero Lu Strittu');
    expect(r[0].sentiero.id).toBe('intorno-osm-nome-1');
    expect(r[0].sentiero.lunghezzaKm).toBeGreaterThan(2);
    expect(r[0].traccia.dettagli.intorno).toBe(true);
    expect(r[0].traccia.geojson.coordinates).toHaveLength(2);
    expect(r[0].sentiero.attivita.trekking.stato).toBe('percorribile');
  });
  it('sotto 1 km, o staccati tra loro, non basta', () => {
    expect(sentieriConNome({ elements: [via(3, 'Sentiero Corto', 'path', 40.0, 3)] })).toEqual([]); // ~0,5 km
    const staccati = [via(4, 'Sentiero Doppio', 'path', 40.0, 3), via(5, 'Sentiero Doppio', 'path', 41.0, 3)]; // 2 × 0,5 km lontani
    expect(sentieriConNome({ elements: staccati })).toEqual([]);
  });
  it('nomi da strada, accesso privato e tratti già in un itinerario segnato restano fuori', () => {
    const lunga = (id, nome, extra) => via(id, nome, 'path', 40.0, 8, null, extra);
    const els = [lunga(6, 'Via Petrusella', {}), lunga(7, 'Sentiero Privato', { access: 'private' }), lunga(8, 'Sentiero Segnato', {}), lunga(9, 'Sentiero Libero', {})];
    const rel = { type: 'relation', id: 99, tags: { route: 'hiking' }, members: [{ type: 'way', ref: 8 }] };
    const r = sentieriConNome({ elements: [...els, rel] });
    expect(r.map((x) => x.sentiero.nome)).toEqual(['Sentiero Libero']);
  });
  it('lo stesso nome su due tratti staccati: due percorsi numerati, il più lungo primo', () => {
    const els = [via(11, 'Sentiero Doppio', 'path', 40.0, 6), via(12, 'Sentiero Doppio', 'path', 41.0, 9)];
    const r = sentieriConNome({ elements: els });
    expect(r.map((x) => x.sentiero.nome)).toEqual(['Sentiero Doppio (1)', 'Sentiero Doppio (2)']);
    expect(r[0].sentiero.lunghezzaKm).toBeGreaterThan(r[1].sentiero.lunghezzaKm);
  });
  it('già presente: non si raddoppia', () => {
    const v = via(10, 'Sentiero Presente', 'path', 40.0, 8);
    expect(sentieriConNome({ elements: [v] }, { esistenti: new Set(['osm-nome-10']) })).toEqual([]);
  });
});
