import { describe, it, expect } from 'vitest';
import { riquadroIntorno, queryIntorno, percorsiIntorno, nelRaggio, puntiPerLeQuote, urlQuote, leggiQuote, profiloIntorno, haDatiMiei, testoDistanza, urlFaunaIntorno, faunaDaRicalcolare, animaliDellaZona } from '../src/lib/intorno.js';
import { diUnParco, parcoDa } from '../src/datiParchi.js';
import { improntaTraccia } from '../src/lib/panorama.js';

const COPERTINO = [18.05, 40.27];

// relazione con un tratto di circa 2,2 km verso nord-est vicino a Copertino
const relazione = (id, tags, wayRef) => ({
  type: 'relation',
  id,
  tags,
  members: [
    {
      type: 'way',
      ref: wayRef,
      role: '',
      // ogni relazione un po' spostata: geometrie uguali si terrebbero una volta sola
      geometry: [
        { lat: 40.27, lon: 18.05 + id / 10000 },
        { lat: 40.28, lon: 18.06 + id / 10000 },
        { lat: 40.285, lon: 18.07 + id / 10000 },
      ],
    },
  ],
});

const risposta = {
  elements: [
    relazione(1, { route: 'hiking', name: 'Cammino del Salento', cai_scale: 'T' }, 100),
    relazione(2, { route: 'mtb', name: 'Anello delle masserie' }, 101),
    relazione(3, { route: 'hiking', name: 'Già nei parchi' }, 102),
    relazione(4, { route: 'bicycle', network: 'lcn', ref: 'CIE01', name: 'Ciclo Ionica - Anello 1' }, 103),
    relazione(5, { route: 'foot', name: 'Percorso natura' }, 104),
    { type: 'way', id: 100, tags: { highway: 'track' } },
    { type: 'way', id: 101, tags: { highway: 'track' } },
    { type: 'way', id: 102, tags: { highway: 'path' } },
    { type: 'way', id: 103, tags: { highway: 'tertiary' } },
    { type: 'way', id: 104, tags: { highway: 'path' } },
  ],
};

describe('Intorno a me: zona e ricerca', () => {
  it('il riquadro contiene il cerchio', () => {
    const [s, o, n, e] = riquadroIntorno(COPERTINO, 25);
    expect(n - s).toBeCloseTo(0.45, 2);
    expect(e - o).toBeGreaterThan(n - s); // a 40° di latitudine un grado di longitudine è più corto
  });

  it('la ricerca usa il raggio e chiede la geometria solo nel riquadro', () => {
    const q = queryIntorno(COPERTINO, 10);
    expect(q).toContain('rel["route"~"^(hiking|foot|walking)$"](around:10000,40.2700,18.0500)');
    expect(q).toContain('rel["route"~"^(mtb|bicycle)$"]');
    expect(q).toMatch(/out geom\([\d.]+,[\d.]+,[\d.]+,[\d.]+\)/);
  });
});

describe('Intorno a me: percorsi', () => {
  const percorsi = percorsiIntorno(risposta, COPERTINO, 10, { esistenti: new Set(['osm-sentiero-3']), oggi: '2026-10-09' });

  it('sentieri a piedi e itinerari MTB, separati dai parchi e senza doppioni', () => {
    expect(percorsi.map((p) => p.sentiero.id)).toEqual(['intorno-osm-sentiero-1', 'intorno-osm-sentiero-5', 'intorno-osm-mtb-2', 'intorno-osm-mtb-4']);
    const [sentiero, , mtb, ciclabile] = percorsi.map((p) => p.sentiero);
    expect(ciclabile).toMatchObject({ nome: 'Ciclo Ionica - Anello 1 (CIE01)', tipoPercorso: 'itinerario_mtb' });
    expect(ciclabile.attivita.mtb.motivi[0]).toMatch(/ciclabile/);
    expect(mtb.nome).toMatch(/MTB/);
    expect(sentiero).toMatchObject({ parco: 'intorno', parchi: ['intorno'], tipoPercorso: 'sentiero', difficolta: 'T' });
    expect(mtb).toMatchObject({ tipoPercorso: 'itinerario_mtb' });
    expect(diUnParco(sentiero)).toBe(false);
    expect(parcoDa('intorno').zona).toBe(true);
  });

  it('la verifica rimanda a OpenStreetMap, non al sito di un parco', () => {
    const s = percorsi[0].sentiero;
    expect(s.accesso.link).toBe('https://www.openstreetmap.org/relation/1');
    expect(s.bici.link).toBe('https://www.openstreetmap.org/relation/1');
    expect(s.bici.consentita).toBe('da_verificare');
  });

  it('ogni percorso ha la sua traccia', () => {
    const t = percorsi[0].traccia;
    expect(t.sentieroId).toBe('intorno-osm-sentiero-1');
    expect(t.geojson.coordinates[0].length).toBeGreaterThan(1);
    expect(t.dettagli.intorno).toBe(true);
  });

  it('nel raggio, dal più vicino', () => {
    const lontano = { sentiero: { id: 'x' }, traccia: { geojson: { type: 'MultiLineString', coordinates: [[[18.6, 40.0], [18.61, 40.01]]] } } };
    const r = nelRaggio([lontano, ...percorsi.slice(0, 1)], COPERTINO, 10);
    expect(r.map((p) => p.sentiero.id)).toEqual(['intorno-osm-sentiero-1']);
    expect(r[0].distanzaM).toBeLessThan(50);
  });
});

describe('Intorno a me: quote', () => {
  const g = { type: 'MultiLineString', coordinates: [[[18.05, 40.27], [18.06, 40.28], [18.07, 40.285]]] };

  it('chiede le quote a Open-Meteo a gruppi di 100 punti', () => {
    const punti = puntiPerLeQuote(g);
    expect(punti.length).toBeGreaterThan(8); // un punto ogni 200 m su circa 2,2 km
    const tanti = Array.from({ length: 230 }, (_, i) => [18 + i / 1000, 40]);
    const url = urlQuote(tanti);
    expect(url.map((u) => u.punti.length)).toEqual([100, 100, 30]);
    expect(url[0].url).toMatch(/^https:\/\/api\.open-meteo\.com\/v1\/elevation\?latitude=40\.0000,/);
  });

  it('con le quote ricava dislivello e punto più alto', () => {
    const punti = puntiPerLeQuote(g);
    const memoria = leggiQuote({ elevation: punti.map((_, i) => 50 + i) }, punti);
    const p = profiloIntorno(g, memoria);
    expect(p.min).toBe(50);
    expect(p.max).toBe(50 + punti.length - 1);
    expect(p.salita).toBeGreaterThan(0);
    expect(p.impronta).toBeTruthy();
    expect(profiloIntorno(g, new Map())).toBeNull();
  });

  it('riconosce i percorsi con dati miei da non cancellare', () => {
    expect(haDatiMiei({ stato: 'da_fare' })).toBe(false);
    expect(haDatiMiei({ salvato: '2026-10-01' })).toBe(true);
    expect(haDatiMiei({ stato: 'fatto' })).toBe(true);
  });
});

describe('Intorno a me: distanza', () => {
  it('in breve', () => {
    expect([40, 820, 3240, 18_400].map(testoDistanza)).toEqual(['qui', 'a 800 m', 'a 3,2 km', 'a 18 km']);
  });
});

describe('Intorno a me: fauna', () => {
  it('cerca su GBIF anche le specie fuori dai parchi, solo nella zona', () => {
    const url = new URL(urlFaunaIntorno(COPERTINO, 10, 2));
    const taxa = url.searchParams.getAll('taxonKey');
    expect(taxa).toContain('4352332'); // fenicottero
    expect(taxa).toContain('5219243'); // volpe
    expect(url.searchParams.get('offset')).toBe('600');
    expect(url.searchParams.get('decimalLatitude')).toMatch(/^40\.17\d*,40\.36/);
  });

  it('i parchi non cercano le specie di "Intorno a me"', async () => {
    const { parametriGbif } = await import('../src/lib/gbif.js');
    expect(parametriGbif({ specie: 'tutte' }).getAll('taxonKey')).not.toContain('4352332');
  });

  it('ricalcola se manca, se cambia la traccia o dopo un mese', () => {
    const g = { type: 'MultiLineString', coordinates: [[[18.05, 40.27], [18.06, 40.28]]] };
    const impronta = improntaTraccia(g).split('-')[1];
    expect(faunaDaRicalcolare({}, g)).toBe(true);
    expect(faunaDaRicalcolare({ faunaInat: { calcolato: '2026-10-01', impronta: 'altra' } }, g, new Date('2026-10-05'))).toBe(true);
    expect(faunaDaRicalcolare({ faunaInat: { calcolato: '2026-10-01', impronta } }, g, new Date('2026-10-05'))).toBe(false);
    expect(faunaDaRicalcolare({ faunaInat: { calcolato: '2026-08-01', impronta } }, g, new Date('2026-10-05'))).toBe(true);
  });

  it('al massimo 6 animali, dai più diffusi', () => {
    const sentieri = [
      { faunaInat: { specie: [{ animale: 'volpe' }, { animale: 'fenicottero' }] } },
      { faunaInat: { specie: [{ animale: 'volpe' }] } },
      { animali: ['riccio'] },
    ];
    expect(animaliDellaZona(sentieri)).toEqual([
      { animale: 'volpe', percorsi: 2 },
      { animale: 'fenicottero', percorsi: 1 },
      { animale: 'riccio', percorsi: 1 },
    ]);
    expect(animaliDellaZona(sentieri, 1)).toHaveLength(1);
  });
});
