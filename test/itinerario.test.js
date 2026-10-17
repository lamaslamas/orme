import { describe, it, expect } from 'vitest';
import { queryItinerario, itinerarioDallaRisposta, itinerarioPresente, testoItinerario, zonaDellaTraccia, idItinerario } from '../src/lib/itinerario.js';

// relazione di prova lunga circa 2,2 km, con due tratti
const risposta = {
  elements: [
    {
      type: 'relation',
      id: 123,
      tags: { type: 'route', route: 'hiking', ref: 'F2', name: 'Val Fondillo – Sorgente Tornareccia', network: 'lwn', cai_scale: 'E' },
      members: [
        { type: 'way', ref: 1, role: '', geometry: [{ lat: 41.76, lon: 13.84 }, { lat: 41.77, lon: 13.85 }] },
        { type: 'way', ref: 2, role: '', geometry: [{ lat: 41.77, lon: 13.85 }, { lat: 41.775, lon: 13.865 }] },
      ],
    },
    { type: 'way', id: 1, tags: { highway: 'path' } },
    { type: 'way', id: 2, tags: { highway: 'path' } },
  ],
};

describe('scarica questo itinerario', () => {
  it('richiesta per la sola relazione, intera', () => {
    expect(queryItinerario(123)).toContain('rel(123);\nout geom;');
  });
  it('relazione → percorso intero sul telefono, nel parco dove parte', () => {
    const r = itinerarioDallaRisposta(risposta, 123, 'pnalm', '2026-10-13');
    expect(r.sentiero).toMatchObject({ id: 'osm-sentiero-123', parco: 'pnalm', parchi: ['pnalm'], codici: ['F2'], difficolta: 'E', scaricato: { data: '2026-10-13' } });
    expect(r.sentiero.nome).toBe('Val Fondillo – Sorgente Tornareccia');
    expect(r.traccia.sentieroId).toBe('osm-sentiero-123');
    expect(r.traccia.dettagli).toMatchObject({ relazioniOsm: [123], scaricato: true });
    expect(r.traccia.dettagli.ritagliata).toBeUndefined();
    expect(itinerarioDallaRisposta(risposta, 999, 'pnalm')).toBeNull();
  });
  it('riconosce un itinerario già sul telefono', () => {
    expect(itinerarioPresente(123, new Set(['osm-sentiero-123']))).toBe('osm-sentiero-123');
    expect(itinerarioPresente(123, new Set(['intorno-osm-sentiero-123']))).toBe('intorno-osm-sentiero-123');
    expect(itinerarioPresente(123, new Set(), new Map([['pnalm-f2', { dettagli: { relazioniOsm: [5, 123] } }]]))).toBe('pnalm-f2');
    expect(itinerarioPresente(123, new Set(['osm-sentiero-1234']))).toBeNull();
    expect(idItinerario('77')).toBe('osm-sentiero-77');
  });
  it('testo per scegliere tra più itinerari', () => {
    expect(testoItinerario({ id: 1, ref: 'SI', nome: 'Sentiero Italia CAI', rete: 'nwn' })).toBe('SI · Sentiero Italia CAI · rete nazionale');
    expect(testoItinerario({ id: 7, ref: null, nome: null, rete: null })).toBe('Itinerario 7');
  });
  it('zona della fauna intorno alla traccia', () => {
    const z = zonaDellaTraccia({ type: 'MultiLineString', coordinates: [[[13.84, 41.76], [13.865, 41.775]]] });
    expect(z.centro.map((x) => Number(x.toFixed(4)))).toEqual([13.8525, 41.7675]);
    expect(z.km).toBe(3);
  });
});

import { queryTagRelazione, eRoundtrip } from '../src/lib/itinerario.js';
describe('roundtrip=yes della relazione', () => {
  it('query leggera e riconoscimento', () => {
    expect(queryTagRelazione(13431887)).toContain('rel(13431887)');
    expect(queryTagRelazione(13431887)).toContain('out tags');
    expect(eRoundtrip({ elements: [{ type: 'relation', id: 1, tags: { roundtrip: 'yes' } }] })).toBe(true);
    expect(eRoundtrip({ elements: [{ type: 'relation', id: 1, tags: { roundtrip: 'no' } }] })).toBe(false);
    expect(eRoundtrip({ elements: [{ type: 'relation', id: 1, tags: {} }] })).toBe(false);
    expect(eRoundtrip(null)).toBe(false);
  });
});

import { unisciImportazione } from '../src/lib/importazione.js';
describe('roundtrip=yes nell\'archivio', () => {
  const conTag = (roundtrip) => ({ elements: [{ ...risposta.elements[0], tags: { ...risposta.elements[0].tags, ...(roundtrip ? { roundtrip: 'yes' } : {}) } }, ...risposta.elements.slice(1)] });
  it('il tag della relazione arriva nei dettagli della traccia (solo se è yes)', () => {
    expect(itinerarioDallaRisposta(conTag(true), 123, 'pnalm').traccia.dettagli.roundtrip).toBe(true);
    expect(itinerarioDallaRisposta(conTag(false), 123, 'pnalm').traccia.dettagli.roundtrip).toBeUndefined();
  });
  it('l\'importazione notturna lo salva: sui percorsi creati dall\'importazione e, senza toccare la traccia, su quelli scritti a mano', () => {
    const { sentiero, traccia } = itinerarioDallaRisposta(conTag(false), 123, 'pnalm', '2026-10-13');
    const nuovo = itinerarioDallaRisposta(conTag(true), 123, 'pnalm', '2026-10-14');
    const candidato = { fonte: 'osm-sentieri:pnalm', chiave: 'pnalm:123', id: 'osm-sentiero-123', idOsm: 123, tipo: 'sentiero', nome: sentiero.nome, codici: ['F2'], parco: 'pnalm', url: 'https://www.openstreetmap.org/relation/123', animali: [], traccia: nuovo.traccia };
    // creato dall'importazione: la traccia nuova sostituisce la vecchia, e porta roundtrip
    const creato = { ...sentiero, traccia, importazione: { fonte: 'osm-sentieri:pnalm', chiave: 'pnalm:123', creato: true }, fonti: [] };
    const r1 = unisciImportazione({ percorsi: [creato] }, [{ fonte: 'osm-sentieri:pnalm', ok: true, candidati: [candidato] }], '2026-10-14');
    expect(r1.archivio.percorsi[0].traccia.dettagli.roundtrip).toBe(true);
    // scritto a mano, con una sua traccia: si aggiunge solo il flag
    const aMano = { ...sentiero, id: 'f2-mano', traccia: { ...traccia, dettagli: { ...traccia.dettagli, relazioniOsm: [123] } }, importazione: undefined, fonti: [] };
    const r2 = unisciImportazione({ percorsi: [aMano] }, [{ fonte: 'osm-sentieri:pnalm', ok: true, candidati: [candidato] }], '2026-10-14');
    const p = r2.archivio.percorsi.find((x) => x.id === 'f2-mano');
    expect(p.traccia.dettagli.roundtrip).toBe(true);
    expect(p.traccia.geojson).toEqual(aMano.traccia.geojson);
  });
});
