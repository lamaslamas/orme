import { describe, it, expect } from 'vitest';
import { minutiAlBuio, luceAlle, confrontoGiornoNotte } from '../src/lib/giornoNotte.js';

// luci di due giorni (minuti dalla mezzanotte di ciascun giorno): alba civile 6:30, alba 7:00, oro fino alle 7:45, tramonto 18:00, buio 18:30
const g = { albaCivile: 390, alba: 420, oroMattinaFine: 465, oroSeraInizio: 1020, tramonto: 1080, tramontoCivile: 1110 };
const giorni = [g, g, g];
// 10 km, 15 minuti al km
const serie = { km: [0, 5, 10], min: [0, 75, 150] };

describe('buio e luce', () => {
  it('conta i minuti di buio tra due ore (anche a cavallo della notte)', () => {
    expect(minutiAlBuio(14 * 60, 17 * 60, giorni)).toBe(0);
    expect(minutiAlBuio(17 * 60, 20 * 60, giorni)).toBe(90); // dalle 18:30 alle 20:00
    expect(minutiAlBuio(1380, 1440 + 360, giorni)).toBe(1440 + 360 - 1380 - 0 - (0)); // 23:00 → 6:00: tutto buio
    expect(minutiAlBuio(1440 + 360, 1440 + 480, giorni)).toBe(30); // 6:00 → 8:00: buio fino alle 6:30
  });
  it('di giorno, al crepuscolo o di notte', () => {
    expect(luceAlle(12 * 60, giorni)).toBe('di giorno');
    expect(luceAlle(1090, giorni)).toBe('al crepuscolo');
    expect(luceAlle(23 * 60, giorni)).toBe('di notte');
    expect(luceAlle(1440 + 200, giorni)).toBe('di notte');
  });
});

describe('giorno o notte', () => {
  const base = { kmTarget: 8, kmTotale: 10, serieAndata: serie, serieRitorno: serie, inizioMin: 14 * 60, fineMin: 1440 + 18 * 60, giorni };
  it('stesso giorno: km, cammino, arrivo, rientro e buio', () => {
    const { a } = confrontoGiornoNotte(base);
    expect(a.km).toBe(16);
    expect(a.camminoMin).toBe(240); // 8 km all'andata (120) e 8 al ritorno (120)
    expect(a.arrivoMin).toBe(14 * 60 + 120);
    expect(a.luceArrivo).toBe('di giorno');
    expect(a.fineMin).toBe(18 * 60); // 14:00 + 4 h
    expect(a.buioMin).toBe(0);
    expect(a.nelTempo).toBe(true);
  });
  it('stesso giorno che finisce di notte: lo dice', () => {
    const { a } = confrontoGiornoNotte({ ...base, inizioMin: 17 * 60 });
    expect(a.fineMin).toBe(21 * 60);
    expect(a.buioMin).toBe(21 * 60 - 18 * 60 - 30);
  });
  it('notte in rifugio: giorno 1 fino al rifugio, giorno 2 all\'alba al tratto', () => {
    const { b } = confrontoGiornoNotte({ ...base, rifugio: { nome: 'Rifugio Prova', tipo: 'rifugio', km: 5 }, acquaB: 2 });
    expect(b.giorno1).toMatchObject({ km: 5, camminoMin: 75, arrivoMin: 14 * 60 + 75, luceArrivo: 'di giorno', buioMin: 0 });
    // al tratto (km 8) 20 minuti prima dell'alba: 6:40; dal rifugio sono 3 km = 45 minuti → partenza 5:55
    expect(b.giorno2.arrivoTrattoMin).toBe(1440 + 400);
    expect(b.giorno2.partenzaMin).toBe(1440 + 355);
    expect(b.giorno2.buioMin).toBe(1440 + 390 - (1440 + 355)); // 35 minuti prima dell'alba civile
    expect(b.giorno2.km).toBe(3 + 8);
    // resta fino alla fine dell'ora d'oro (7:45) e rientra: 8 km = 2 h
    expect(b.giorno2.fineMin).toBe(1440 + 465 + 120);
    expect(b.nelTempo).toBe(true);
    expect(b.acqua).toBe(2);
  });
  it('il tratto prima del rifugio: giorno 2 torna indietro', () => {
    const { b } = confrontoGiornoNotte({ ...base, kmTarget: 3, rifugio: { nome: 'R', tipo: 'bivacco', km: 6 } });
    expect(b.giorno2.km).toBe(3 + 3);
    expect(b.giorno2.partenzaMin).toBeLessThan(1440 + 400);
  });
  it('senza rifugio il piano B non c\'è; se il tempo non basta lo dice', () => {
    expect(confrontoGiornoNotte(base).b).toBeNull();
    expect(confrontoGiornoNotte({ ...base, fineMin: 15 * 60 }).a.nelTempo).toBe(false);
  });
});
