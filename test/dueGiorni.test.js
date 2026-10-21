import { describe, it, expect } from 'vitest';
import { pianoDueGiorni, dislivelloTra, tempoDeviazione } from '../src/lib/dueGiorni.js';
import { adattoAllaFatica } from '../src/lib/suggerimenti.js';

// cammino di 20 km, 15 minuti al km (300 minuti ogni 20 km)... 20 km → 300 min? no: 15 min/km → 20 km = 300 min
const serie = (km, minPerKm, salitaPerKm = 0) => {
  const ks = Array.from({ length: km + 1 }, (_, i) => i);
  return { km: ks, min: ks.map((k) => k * minPerKm), punti: ks.map((k) => [15.8 + k * 0.01, 40.3, 1000 + k * salitaPerKm]) };
};
const sole = (alba, tramonto) => ({ alba, tramonto });
const T1 = { alba: 7 * 60 + 10, tramonto: 17 * 60 + 58 }; // sabato
const T2 = { alba: 7 * 60 + 11, tramonto: 17 * 60 + 56 }; // domenica
const posti = (...km) => km.map((k) => ({ km: k, nome: `P${k}` }));

describe('due giorni secondo la luce', () => {
  it('primo giorno: dalla partenza al tramonto meno 30 minuti; secondo: dalle 8:00 al tramonto meno 30', () => {
    const r = pianoDueGiorni({ serie: serie(20, 30), posti: posti(8, 9), lunghezzaKm: 20, conRitorno: false, partenzaMin: 9 * 60, sole1: T1, sole2: T2 });
    // d1 = 17:28 − 9:00 = 508 min (km 16,9); totale 600 min; il posto al km 9 → 270 min di primo giorno, 330 di secondo (8:00 → 13:30)
    expect(r.ok).toBe(true);
    expect(r.d1).toBe(508);
    expect(r.kmPosto).toBe(9); // il più vicino alla fine del primo giorno
    expect(r.giorno1).toMatchObject({ daMin: 540, aMin: 540 + 270, durataMin: 270 });
    expect(r.giorno2).toMatchObject({ daMin: 480, aMin: 480 + 330, durataMin: 330, dallAlba: false });
  });
  it('partenza alle 15:00: il primo giorno dura solo fino al tramonto (2 h 28) e il posto deve stare lì', () => {
    const r = pianoDueGiorni({ serie: serie(16, 30), posti: posti(6, 12), lunghezzaKm: 16, conRitorno: false, partenzaMin: 15 * 60, sole1: T1, sole2: T2 });
    // d1 = 148 min → km 4,9: il posto al km 6 (180 min) è dopo il tramonto: nessun posto raggiungibile
    expect(r).toMatchObject({ ok: false, motivo: 'luce' });
    const dalle8 = pianoDueGiorni({ serie: serie(22, 30), posti: posti(6, 12), lunghezzaKm: 22, conRitorno: false, partenzaMin: 8 * 60, sole1: T1, sole2: T2 });
    expect(dalle8.ok).toBe(true);
  });
  it('con un tratto con più fauna il secondo giorno parte all\'alba', () => {
    const r = pianoDueGiorni({ serie: serie(20, 30), posti: posti(9), lunghezzaKm: 20, conRitorno: false, partenzaMin: 9 * 60, sole1: T1, sole2: T2, tratto: { daKm: 12, aKm: 14 } });
    expect(r.giorno2).toMatchObject({ daMin: T2.alba, dallAlba: true });
  });
  it('troppo lungo per due giornate di luce, troppo corto (basta un giorno), nessun posto', () => {
    expect(pianoDueGiorni({ serie: serie(40, 30), posti: posti(15), lunghezzaKm: 40, conRitorno: false, partenzaMin: 9 * 60, sole1: T1, sole2: T2 }).motivo).toBe('troppo-lungo');
    expect(pianoDueGiorni({ serie: serie(8, 30), posti: posti(4), lunghezzaKm: 8, conRitorno: false, partenzaMin: 9 * 60, sole1: T1, sole2: T2 }).motivo).toBe('breve');
    expect(pianoDueGiorni({ serie: serie(20, 30), posti: [], lunghezzaKm: 20, conRitorno: false, partenzaMin: 9 * 60, sole1: T1, sole2: T2 }).motivo).toBe('nessun-posto');
  });
  it('andata e ritorno: il posto può cadere anche sul ritorno', () => {
    // andata 10 km, ritorno 10: 20 km di cammino a 30 min/km; il posto al km 9 dell'andata = km 11 del cammino
    const s = serie(20, 30);
    const r = pianoDueGiorni({ serie: s, posti: posti(9), lunghezzaKm: 10, conRitorno: true, partenzaMin: 9 * 60, sole1: T1, sole2: T2 });
    expect(r.ok).toBe(true);
    expect([9, 11]).toContain(r.kmPosto);
  });
  it('la fatica vale per ciascuna giornata: due giornate medie, non un totale che supera la media', () => {
    const s = serie(20, 30, 100); // +100 m a ogni km: 2000 m in tutto, 1000 m per giornata
    const r = pianoDueGiorni({ serie: s, posti: posti(10), lunghezzaKm: 20, conRitorno: false, partenzaMin: 9 * 60, sole1: T1, sole2: T2 });
    expect(r.ok).toBe(true);
    expect(r.giorno1.salita).toBeGreaterThan(900);
    expect(r.giorno1.salita + r.giorno2.salita).toBeGreaterThan(1100); // il totale supererebbe «Media» (1100 m)...
    expect(adattoAllaFatica(r.giorno1, 'E', 'media')).toBe(true); // ...ma ogni giornata è media
    expect(adattoAllaFatica(r.giorno2, 'E', 'media')).toBe(true);
    expect(adattoAllaFatica({ salita: 2000, durataMin: 600 }, 'E', 'media')).toBe(false);
  });
  it('dislivelloTra senza quote: niente', () => {
    const s = { km: [0, 1, 2], min: [0, 10, 20], punti: [[1, 1], [1, 2], [1, 3]] };
    expect(dislivelloTra(s, 0, 2)).toEqual({ salita: null, discesa: null });
  });
});

describe('notte vicino alla partenza, deviazione per dormire, ordine', () => {
  it('primo giorno sotto i 30 minuti: «notte vicino alla partenza» e il giorno dopo tutto il percorso', async () => {
    const r = pianoDueGiorni({ serie: serie(20, 30), posti: [{ km: 0.2, nome: 'Albergo', distanzaM: 0 }], lunghezzaKm: 20, conRitorno: false, partenzaMin: 15 * 60 + 30, sole1: T1, sole2: T2 });
    // 20 km a 30 min/km = 600 min: troppo per un solo giorno di luce (d1 = 118), ma il giorno dopo ci sta tutto (480 → 18:00 > tramonto−30? 600 > 566): non ci sta
    expect(r.tipo).not.toBe('notte-vicina');
    const corto = pianoDueGiorni({ serie: serie(18, 30), posti: [{ km: 0.2, nome: 'Albergo', distanzaM: 0 }], lunghezzaKm: 18, conRitorno: false, partenzaMin: 17 * 60 + 10, sole1: T1, sole2: T2 });
    // 540 min: d1 = 18 min (>0); il posto al km 0,2 = 6 min → primo giorno sotto i 30; il giorno dopo 540 ≤ 566
    expect(corto).toMatchObject({ ok: true, tipo: 'notte-vicina', giorno1: null, kmPosto: 0 });
    expect(corto.giorno2).toMatchObject({ daMin: 480, durataMin: 540, km: 18 });
  });
  it('deviazione: +25 minuti per un ostello a 1,7 km, all\'andata e al ritorno, dentro gli orari', async () => {
    const { tempoDeviazione } = await import('../src/lib/dueGiorni.js');
    expect(tempoDeviazione(1700)).toEqual({ andataMin: 26, ritornoMin: 26 });
    expect(tempoDeviazione(10).andataMin).toBe(0);
    const senza = pianoDueGiorni({ serie: serie(20, 30), posti: [{ km: 9, distanzaM: 0 }], lunghezzaKm: 20, conRitorno: false, partenzaMin: 9 * 60, sole1: T1, sole2: T2 });
    const con = pianoDueGiorni({ serie: serie(20, 30), posti: [{ km: 9, distanzaM: 1700 }], lunghezzaKm: 20, conRitorno: false, partenzaMin: 9 * 60, sole1: T1, sole2: T2 });
    expect(con.giorno1.durataMin).toBe(senza.giorno1.durataMin + 26);
    expect(con.giorno1.aMin).toBe(senza.giorno1.aMin + 26);
    expect(con.giorno2.durataMin).toBe(senza.giorno2.durataMin + 26);
    expect(con.giorno2).toMatchObject({ deviazioneMin: 26 });
    // con il dislivello (il posto è più in alto) l'andata dura di più del ritorno
    const salita = tempoDeviazione(1700, { salita: 300, discesa: 0 });
    expect(salita.andataMin).toBeGreaterThan(salita.ritornoMin);
  });
  it('ordine: prima il secondo giorno all\'alba nel tratto con più fauna, poi le giornate equilibrate', async () => {
    const { confrontaNotte } = await import('../src/lib/dueGiorni.js');
    const piano = (d1, d2, alba) => ({ giorno1: { durataMin: d1 }, giorno2: { durataMin: d2, dallAlba: alba } });
    const lista = [piano(60, 300, false), piano(240, 250, false), piano(100, 400, true), piano(200, 210, true)];
    lista.sort(confrontaNotte);
    expect(lista.map((p) => [p.giorno2.dallAlba, p.giorno1.durataMin])).toEqual([[true, 200], [true, 100], [false, 240], [false, 60]]);
  });
});
