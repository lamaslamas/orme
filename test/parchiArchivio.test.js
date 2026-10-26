import { describe, it, expect } from 'vitest';
import { dividiArchivio, parchiNelRaggio, parcoSulPunto, parchiDaAggiornare, statoParco, sentieriDaTogliere, riquadroDegliAnelli, confineSemplificato, controllaIndice, fileParco } from '../src/lib/parchiArchivio.js';

const quadrato = (lon, lat, l = 0.2) => [[[lon, lat], [lon + l, lat], [lon + l, lat + l], [lon, lat + l], [lon, lat]]];
const archivio = {
  app: 'orme-archivio',
  versione: 1,
  aggiornato: '2026-10-26T04:00:00Z',
  percorsi: [
    { id: 'a1', nome: 'A1', parco: 'alfa' },
    { id: 'a2', nome: 'A2', parco: 'alfa' },
    { id: 'b1', nome: 'B1', parco: 'beta' },
  ],
};
const firma = (t) => String(t.length);
const diviso = () => dividiArchivio(archivio, { nomi: { alfa: 'Alfa', beta: 'Beta', vuoto: 'Vuoto' }, confini: { alfa: quadrato(13, 41), beta: quadrato(11, 44) }, parchi: ['alfa', 'beta', 'vuoto'], firma });

describe('archivio diviso per parco', () => {
  it('un file per parco e un indice con nome, numero di sentieri, riquadro e confine', () => {
    const { indice, file } = diviso();
    expect([...file.keys()]).toEqual(['alfa', 'beta']);
    expect(file.get('alfa').percorsi.map((p) => p.id)).toEqual(['a1', 'a2']);
    expect(controllaIndice(indice).parchi.map((p) => [p.id, p.nome, p.sentieri])).toEqual([['alfa', 'Alfa', 2], ['beta', 'Beta', 1], ['vuoto', 'Vuoto', 0]]);
    const alfa = indice.parchi[0];
    expect(alfa).toMatchObject({ file: fileParco('alfa'), riquadro: [41, 13, 41.2, 13.2] });
    expect(alfa.confine[0].length).toBeGreaterThanOrEqual(4);
    expect(indice.parchi[2]).toMatchObject({ file: null, firma: null, byte: 0 });
  });
  it("l'impronta cambia solo se cambiano i percorsi di quel parco", () => {
    const prima = diviso().indice;
    const dopo = dividiArchivio({ ...archivio, percorsi: [...archivio.percorsi.slice(0, 2), { id: 'b1', nome: 'B1 nuovo nome', parco: 'beta' }] }, { nomi: {}, confini: {}, parchi: [], firma }).indice;
    expect(dopo.parchi.find((p) => p.id === 'alfa').firma).toBe(prima.parchi[0].firma);
    expect(dopo.parchi.find((p) => p.id === 'beta').firma).not.toBe(prima.parchi[1].firma);
  });
  it('un percorso senza parco finisce in «altro», non si perde', () => {
    const { file } = dividiArchivio({ ...archivio, percorsi: [{ id: 'x', nome: 'X' }] }, { firma });
    expect(file.get('altro').percorsi).toHaveLength(1);
  });
  it('il confine nell\'indice è semplificato', () => {
    const giro = Array.from({ length: 400 }, (_, i) => [13 + 0.1 * Math.cos((i / 400) * 2 * Math.PI) + (i % 2) * 0.0003, 41 + 0.1 * Math.sin((i / 400) * 2 * Math.PI)]);
    const lungo = [[...giro, giro[0]]];
    const corto = confineSemplificato(lungo)[0];
    expect(corto.length).toBeGreaterThanOrEqual(4);
    expect(corto.length).toBeLessThan(60);
    expect(riquadroDegliAnelli([])).toBeNull();
  });
});

describe('quali parchi scaricare', () => {
  const { indice } = diviso();
  it('i parchi che toccano un cerchio', () => {
    expect(parchiNelRaggio(indice, [13.1, 41.1], 1).map((p) => p.id)).toEqual(['alfa']);
    expect(parchiNelRaggio(indice, [13.5, 41.1], 10)).toEqual([]); // a ~25 km dal bordo: fuori
    expect(parchiNelRaggio(indice, [13.5, 41.1], 30).map((p) => p.id)).toEqual(['alfa']);
    expect(parchiNelRaggio(indice, [12, 42.5], 400).map((p) => p.id)).toEqual(['alfa', 'beta']);
    expect(parchiNelRaggio(indice, [0, 0], 50)).toEqual([]);
  });
  it('il parco su cui sta il centro della mappa', () => {
    expect(parcoSulPunto(indice, [13.1, 41.1])?.id).toBe('alfa');
    expect(parcoSulPunto(indice, [13.5, 41.1])).toBeNull();
  });
  it('quelli già sul telefono con il file cambiato; il resto non si tocca', () => {
    const scaricati = new Map([['alfa', { firma: 'vecchia' }], ['beta', { firma: indice.parchi[1].firma }]]);
    expect(parchiDaAggiornare(indice, scaricati).map((p) => p.id)).toEqual(['alfa']);
    expect(statoParco(indice.parchi[0], scaricati)).toBe('sul-telefono');
    expect(statoParco(indice.parchi[2], scaricati)).toBe('vuoto');
    expect(statoParco(indice.parchi[0], new Map())).toBe('da-scaricare');
  });
});

describe('Togli dal telefono', () => {
  it("toglie solo i sentieri dell'archivio senza niente di mio", () => {
    const sentieri = [
      { id: 'a1', parco: 'alfa', stato: 'da_fare' },
      { id: 'a2', parco: 'alfa', stato: 'fatto' },
      { id: 'a3', parco: 'alfa', stato: 'da_fare', notePersonali: 'bello' },
      { id: 'a4', parco: 'alfa', stato: 'da_fare' }, // con una traccia mia (GPX)
      { id: 'a5', parco: 'alfa', stato: 'da_fare' }, // creato da me: non viene dall'archivio
      { id: 'b1', parco: 'beta', stato: 'da_fare' },
    ];
    const basi = new Map(['a1', 'a2', 'a3', 'a4', 'b1'].map((id) => [id, {}]));
    const tracce = new Map([['a1', { dettagli: { archivio: true } }], ['a4', { dettagli: {} }]]);
    expect(sentieriDaTogliere(sentieri, 'alfa', { basi, tracce })).toEqual({ daTogliere: ['a1'], tenuti: ['a2', 'a3', 'a4', 'a5'] });
  });
});
