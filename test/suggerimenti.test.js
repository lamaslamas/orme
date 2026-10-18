import { describe, it, expect } from 'vitest';
import { dataDelQuando, stimaAuto, testoAuto, adattoAlTempo, adattoAllaFatica, valuta, ordinaProposte, testoPerche, SCELTE_PREDEFINITE } from '../src/lib/suggerimenti.js';

const base = (extra = {}) => ({
  misure: { km: 8, salita: 450, durataMin: 200 },
  anello: false,
  difficolta: 'E',
  fauna: null,
  panorama: 40,
  bosco: 20,
  apertura: 20,
  quotaMax: 1300,
  acqua: 0,
  rifugioNotte: null,
  uscite: [],
  auto: { lineaKm: 30, minuti: 45 },
  ...extra,
});

describe('Suggeriscimi: regole', () => {
  it('scelte predefinite: oggi, mezza giornata, media, entro 1 h', () => {
    expect(SCELTE_PREDEFINITE).toMatchObject({ quando: 'oggi', tempo: 'mezza', fatica: 'media', distanza: '60' });
  });
  it('il giorno di "quando" (martedì 13 ottobre 2026)', () => {
    expect(dataDelQuando('oggi', '2026-10-13')).toBe('2026-10-13');
    expect(dataDelQuando('domani', '2026-10-13')).toBe('2026-10-14');
    expect(dataDelQuando('sabato', '2026-10-13')).toBe('2026-10-17');
    expect(dataDelQuando('domenica', '2026-10-13')).toBe('2026-10-18');
    expect(dataDelQuando('sabato', '2026-10-17')).toBe('2026-10-17');
  });
  it('auto: stima "circa" e linea d\'aria', () => {
    const a = stimaAuto([13.79, 41.8], [13.4, 41.8]); // circa 32 km in linea d'aria
    expect(a.lineaKm).toBe(32);
    expect(a.minuti).toBe(49);
    expect(testoAuto(a)).toBe("circa 49 min in auto (32 km in linea d'aria)");
  });
  it('tempo e fatica', () => {
    expect(adattoAlTempo(240, 'mezza')).toBe(true);
    expect(adattoAlTempo(300, 'mezza')).toBe(false);
    expect(adattoAlTempo(300, 'giornata')).toBe(true);
    expect(adattoAlTempo(600, 'due')).toBe(true);
    expect(adattoAllaFatica({ salita: 300, durataMin: 150 }, 'E', 'facile')).toBe(true);
    expect(adattoAllaFatica({ salita: 800, durataMin: 300 }, 'E', 'facile')).toBe(false);
    expect(adattoAllaFatica({ salita: 1200, durataMin: 400 }, 'EE', 'impegnativa')).toBe(true);
    expect(adattoAllaFatica({ salita: 900, durataMin: 300 }, 'EEA', 'media')).toBe(false);
  });
  it('esclude cosa non va: tempo, distanza, due giorni senza rifugio', () => {
    expect(valuta(base({ misure: { km: 20, salita: 450, durataMin: 400 } }), SCELTE_PREDEFINITE)).toBeNull();
    expect(valuta(base({ auto: { lineaKm: 80, minuti: 113 } }), SCELTE_PREDEFINITE)).toBeNull();
    const lungo = base({ misure: { km: 25, salita: 900, durataMin: 600 } });
    expect(valuta(lungo, { ...SCELTE_PREDEFINITE, tempo: 'due' })).toBeNull();
    expect(valuta({ ...lungo, rifugioNotte: 'Rifugio di Forca Resuni' }, { ...SCELTE_PREDEFINITE, tempo: 'due' })).not.toBeNull();
  });
  it('le cose cercate alzano il punteggio, la fauna secondo il giudizio nel periodo', () => {
    const scelte = { ...SCELTE_PREDEFINITE, cerco: ['fauna', 'associazioni'] };
    const ricco = valuta(base({ fauna: { livello: 'frequenti', specie: ['cervo'] }, uscite: ['Il bramito'] }), scelte);
    const niente = valuta(base(), scelte);
    expect(ricco.trovati).toEqual(['fauna', 'associazioni']);
    expect(ricco.punteggio).toBeGreaterThan(niente.punteggio);
  });
  it('il meteo riordina: sconsigliato in fondo', () => {
    const v = (id, p, g) => ({ id, valutazione: { punteggio: p }, giudizio: { giudizio: g } });
    expect(ordinaProposte([v('a', 120, 'sconsigliato'), v('b', 90, 'ok'), v('c', 100, 'attenzione')]).map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });
  it('la riga del perché', () => {
    const c = base({ anello: true, bosco: 70, fauna: { livello: 'frequenti', specie: ['cervo', 'camoscio'] }, acqua: 2, misure: { km: 9, salita: 580, durataMin: 250 } });
    expect(testoPerche(c)).toBe('Anello nel bosco, ricco di fauna (cervo, camoscio), 2 punti acqua, +580 m · 4 h 10');
    expect(testoPerche(base({ rifugioNotte: 'Rifugio Acquanera' }), { modo: 'ar' })).toBe('Andata e ritorno, Rifugio Acquanera a fine primo giorno, +450 m · 3 h 20');
  });
});

describe('specie scelta in "Cosa cerchi"', () => {
  const base = { misure: { km: 8, salita: 300, durataMin: 200 }, anello: false, difficolta: 'E', auto: null };
  const scelte = { ...SCELTE_PREDEFINITE, tempo: 'mezza', cerco: ['fauna'], specie: 'cervo' };
  const specie = (punti) => ({ punti, animale: 'cervo', dove: 'zona', nelPeriodo: 10, nome: 'molto segnalato', persone: 146, ultimoAnno: 2025, testo: '146 osservatori, ultima osservazione nel 2025' });
  it('senza segnalazioni nel periodo il percorso non si propone; più punti salgono in classifica', () => {
    expect(valuta({ ...base, specie: null }, scelte)).toBeNull();
    expect(valuta({ ...base, specie: specie(0) }, scelte)).toBeNull();
    expect(valuta({ ...base, specie: specie(30) }, scelte).punteggio).toBeGreaterThan(valuta({ ...base, specie: specie(5) }, scelte).punteggio);
  });
  it('senza "Fauna" tra le cose cercate la specie non conta', () => {
    expect(valuta({ ...base, specie: null }, { ...scelte, cerco: [] })).not.toBeNull();
  });
  it('la riga dice la specie, l\'affidabilità e l\'anno', () => {
    const t = testoPerche({ ...base, specie: specie(30) }, { trovati: ['fauna'] });
    expect(t).toContain('cervo molto segnalato');
    expect(t).toContain('146 osservatori, ultima osservazione nel 2025, dato di zona');
  });
});
