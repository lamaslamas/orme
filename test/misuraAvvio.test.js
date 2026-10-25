import { describe, it, expect } from 'vitest';
import { gruppoRisorsa, righeRisorse, righeCronologia, istanteMappaUsabile, righeSonde, attribuisciLunghi } from '../src/lib/misura.js';

const APP = 'https://lamaslamas.github.io';

describe('riepilogo dell\'avvio', () => {
  it('divide le risorse: file dell\'app, dati, caratteri, mappa, servizi esterni', () => {
    expect(gruppoRisorsa(`${APP}/orme/assets/index-1.js`, APP)).toBe('file dell\'app (html, js, css, icone)');
    expect(gruppoRisorsa(`${APP}/orme/dati/archivio.json`, APP)).toBe('dati dell\'app (json)');
    expect(gruppoRisorsa(`${APP}/orme/assets/inter-latin.woff2`, APP)).toBe('caratteri');
    expect(gruppoRisorsa('https://tiles.openfreemap.org/planet/1/2/3.pbf', APP)).toBe('mappa (tessere, stili, caratteri)');
    expect(gruppoRisorsa('https://nominatim.openstreetmap.org/search?q=a', APP)).toBe('servizi esterni');
  });
  it('totali per gruppo e file più grandi, con quanto arriva prima della mappa usabile', () => {
    const risorse = [
      { nome: `${APP}/orme/dati/archivio.json`, inizio: 100, fine: 900, trasferiti: 1_200_000, compressi: 1_150_000, decompressi: 5_300_000 },
      { nome: `${APP}/orme/assets/index.js`, inizio: 50, fine: 400, trasferiti: 0, compressi: 250_000, decompressi: 810_000 },
      { nome: 'https://tiles.openfreemap.org/a.pbf', inizio: 500, fine: 3000, trasferiti: 40_000, compressi: 40_000, decompressi: 90_000 },
    ];
    const { gruppi, grandi } = righeRisorse(risorse, APP, 1000);
    expect(gruppi[0]).toContain('dati dell\'app (json): 1 file');
    expect(gruppi.find((g) => g.includes('mappa (tessere'))).toContain('fino alla mappa usabile 0 file');
    expect(grandi[0]).toContain('archivio.json');
    expect(grandi.find((g) => g.includes('index.js'))).toContain('da cache');
  });
  it('cronologia in ordine di inizio, fasi e lavori insieme', () => {
    const r = righeCronologia([{ nome: 'pagina mostrata', t: 1500 }], [{ nome: 'archivio: scarico', da: 300, a: 1200 }]);
    expect(r).toHaveLength(2);
    expect(r[0]).toContain('archivio: scarico: 900 ms');
    expect(r[1]).toContain('pagina mostrata');
  });
  it('mappa usabile: la più tarda tra pagina mostrata, base disegnata e primo disegno', () => {
    expect(istanteMappaUsabile([{ nome: 'pagina mostrata', t: 1200 }, { nome: 'mappa base: prima immagine completa', t: 2500 }, { nome: 'mappa: primo disegno completato', t: 1100 }])).toBe(2500);
    expect(istanteMappaUsabile([])).toBeNull();
  });
  it('letture e scritture sul telefono', () => {
    const r = righeSonde({
      letture: [{ store: 'sentieri', metodo: 'getAll', record: 758, ms: 85.4, da: 900 }],
      transazioni: [{ archivi: 'sentieri+tracce', modo: 'readwrite', scritti: 1500, ms: 420, da: 1000 }, { archivi: 'meta', modo: 'readwrite', scritti: 0, ms: 3, da: 5 }],
      archivioWeb: { localStorage: { n: 2, byte: 300 }, sessionStorage: { n: 5, byte: 2048 } },
    });
    expect(r[0]).toContain('sentieri (getAll) 758 record in 85 ms');
    expect(r[1]).toContain('sentieri+tracce: 1500 record in 420 ms');
    expect(r[1]).not.toContain('meta');
    expect(r[2]).toContain('localStorage: 2 scritture');
  });
});

describe('compiti lunghi con la causa', () => {
  it('elenca solo quelli sopra soglia, dal più lungo, con evento e lavori cronometrati', () => {
    const lunghi = [
      { inizio: 5000, durata: 240, script: [{ origine: 'index · moveend', durata: 200 }] },
      { inizio: 9000, durata: 60 },
      { inizio: 12000, durata: 130 },
    ];
    const lavori = [{ nome: 'elenco della zona', da: 5020, ms: 150 }, { nome: 'legenda', da: 5200, ms: 30 }];
    const eventi = [{ t: 4950, testo: 'mappa: fine movimento' }];
    const { testa, righe } = attribuisciLunghi(lunghi, lavori, eventi, { soglia: 100 });
    expect(testa).toContain('2 sopra 100 ms');
    expect(righe).toHaveLength(2);
    expect(righe[0]).toContain('240 ms');
    expect(righe[0]).toContain('mappa: fine movimento (−50 ms)');
    expect(righe[0]).toContain('elenco della zona 150 ms');
    expect(righe[0]).toContain('script: index · moveend 200 ms');
    expect(righe[1]).toContain('nessun evento vicino');
  });
  it('nessun compito lungo', () => {
    expect(attribuisciLunghi([{ inizio: 1, durata: 40 }], [], []).testa).toBe('nessuno sopra 100 ms');
  });
});
