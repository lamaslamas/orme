import { describe, it, expect } from 'vitest';
import { trattiFauna, testoTratto } from '../src/lib/trattoFauna.js';
import { lineaTraKm } from '../src/lib/lungoIlPercorso.js';

// traccia dritta verso est di circa 10 km (0,1° di lon a 42° N ≈ 8,3 km): punti ogni 0,005°
const LAT = 42;
const pezzi = [Array.from({ length: 25 }, (_, i) => [13 + i * 0.005, LAT])];
const kmDi = (lon) => (lon - 13) * 111.32 * Math.cos((LAT * Math.PI) / 180);
const lonAl = (km) => 13 + km / (111.32 * Math.cos((LAT * Math.PI) / 180));
const oss = (km, persona, animale = 'cervo', extra = {}) => ({ animale, lat: LAT + 0.0005, lon: lonAl(km), sfumata: false, osservatore: persona, ...extra });

describe('tratto con più fauna', () => {
  it('il tratto migliore sono due km di fila con più osservatori diversi', () => {
    const o = [oss(0.5, 'a'), oss(1.5, 'b'), oss(1.2, 'c'), oss(1.8, 'd', 'camoscio'), oss(0.2, 'a'), oss(0.2, 'a')];
    const r = trattiFauna(o, pezzi);
    expect(r.migliore).toMatchObject({ daKm: 0, aKm: 2, persone: 4 });
    expect(r.migliore.specie).toEqual(['cervo', 'camoscio']);
    expect(testoTratto(r.migliore)).toBe('km 0–2');
  });
  it('conta le persone, non le osservazioni: una persona sola non basta', () => {
    const o = [oss(5.2, 'a'), oss(5.3, 'a'), oss(5.4, 'a'), oss(5.5, 'a')];
    expect(trattiFauna(o, pezzi).migliore).toBeNull();
  });
  it('specie sensibili e posizioni sfumate non entrano mai nel tratto', () => {
    const o = [oss(4.1, 'a', 'orso'), oss(4.2, 'b', 'lupo'), oss(4.3, 'c', 'aquila_reale'), oss(4.4, 'd', 'cervo', { sfumata: true }), oss(4.5, 'e', 'cervo')];
    expect(trattiFauna(o, pezzi).migliore).toBeNull(); // resta un solo osservatore ammesso
  });
  it('poiana e gheppio contano fuori dalla nidificazione; i rapaci sensibili mai; nidificazione febbraio–luglio no', () => {
    const rap = (km, p, sci, data, extra = {}) => ({ animale: null, nomeScientifico: sci, ordine: 'Accipitriformes', data, lat: LAT + 0.0005, lon: lonAl(km), sfumata: false, osservatore: p, ...extra });
    const ott = (sci, p) => rap(4.1, p, sci, '2025-10-05');
    expect(trattiFauna([ott('Buteo buteo', 'a'), ott('Falco tinnunculus', 'b'), ott('Buteo buteo', 'c')], pezzi).migliore).toMatchObject({ persone: 3, specie: ['poiana', 'gheppio'] });
    expect(trattiFauna([rap(4.2, 'a', 'Buteo buteo', '2025-06-05'), rap(4.2, 'b', 'Buteo buteo', '2025-06-06'), rap(4.2, 'c', 'Buteo buteo', '2025-06-07')], pezzi).migliore).toBeNull();
    expect(trattiFauna([ott('Aquila chrysaetos', 'a'), ott('Bubo bubo', 'b'), ott('Gyps fulvus', 'c'), ott('Falco peregrinus', 'd'), ott('Neophron percnopterus', 'e'), ott('Falco biarmicus', 'f')], pezzi).migliore).toBeNull();
    // una specie senza nome noto (né in Orme né tra i rapaci) non entra
    expect(trattiFauna([ott('Specie sconosciuta', 'a'), ott('Specie sconosciuta', 'b'), ott('Specie sconosciuta', 'c')], pezzi).migliore).toBeNull();
  });
  it('lontano dalla traccia (oltre 150 m) o senza osservatore: non conta', () => {
    const lontano = { ...oss(3, 'a'), lat: LAT + 0.003 };
    const o = [lontano, oss(3, null), oss(3.2, 'b'), oss(3.3, 'c')];
    expect(trattiFauna(o, pezzi).migliore).toBeNull();
  });
  it('un percorso corto non ha un tratto da evidenziare', () => {
    const corto = [Array.from({ length: 6 }, (_, i) => [13 + i * 0.005, LAT])];
    expect(trattiFauna([oss(0.5, 'a'), oss(0.6, 'b'), oss(0.7, 'c')], corto).migliore).toBeNull();
  });
  it('lineaTraKm restituisce la traccia tra due km', () => {
    const l = lineaTraKm(pezzi, 2, 4);
    expect(kmDi(l[0][0])).toBeCloseTo(2, 1);
    expect(kmDi(l.at(-1)[0])).toBeCloseTo(4, 1);
  });
});
