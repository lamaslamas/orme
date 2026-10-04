import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach } from 'vitest';
import * as db from '../src/db.js';
import { DATI_INIZIALI } from '../src/datiIniziali.js';

beforeEach(async () => {
  await db.chiudiDb();
  globalThis.indexedDB = new IDBFactory();
});

describe('archivio locale', () => {
  it('carica i dati iniziali una sola volta', async () => {
    expect(await db.caricaDatiIniziali()).toBe(true);
    expect(await db.tuttiISentieri()).toHaveLength(DATI_INIZIALI.length);
    await db.eliminaSentiero('cicerana');
    expect(await db.caricaDatiIniziali()).toBe(false);
    expect(await db.tuttiISentieri()).toHaveLength(DATI_INIZIALI.length - 1);
  });

  it('tutti i dati iniziali sono da verificare', () => {
    expect(DATI_INIZIALI.every((s) => s.daVerificare)).toBe(true);
    expect(new Set(DATI_INIZIALI.map((s) => s.id)).size).toBe(DATI_INIZIALI.length);
  });

  it('salva e modifica un sentiero tenendo la data di creazione', async () => {
    const primo = await db.salvaSentiero({ id: 'prova', nome: 'Prova' });
    const secondo = await db.salvaSentiero({ ...primo, nome: 'Prova 2' });
    expect(secondo.creato).toBe(primo.creato);
    expect((await db.leggiSentiero('prova')).nome).toBe('Prova 2');
  });

  it('eliminando un sentiero elimina anche la sua traccia', async () => {
    await db.salvaSentiero({ id: 'prova', nome: 'Prova' });
    await db.salvaTraccia({ sentieroId: 'prova', origine: 'gpx', geojson: { type: 'MultiLineString', coordinates: [] } });
    expect(await db.sentieriConTraccia()).toEqual(new Set(['prova']));
    await db.eliminaSentiero('prova');
    expect(await db.leggiTraccia('prova')).toBeUndefined();
  });

  it('esporta e reimporta (sostituisci e unisci)', async () => {
    await db.caricaDatiIniziali();
    await db.salvaTraccia({ sentieroId: 'f2-val-fondillo', origine: 'gpx', geojson: { type: 'MultiLineString', coordinates: [[[13.8, 41.8], [13.81, 41.81]]] } });
    const backup = JSON.parse(JSON.stringify(await db.esporta()));
    expect(backup.app).toBe('orme');

    await db.salvaSentiero({ id: 'extra', nome: 'Extra' });
    await db.importa(backup, 'sostituisci');
    expect(await db.leggiSentiero('extra')).toBeUndefined();
    expect(await db.tuttiISentieri()).toHaveLength(DATI_INIZIALI.length);
    expect(await db.leggiTraccia('f2-val-fondillo')).toBeTruthy();

    await db.salvaSentiero({ id: 'extra', nome: 'Extra' });
    await db.importa(backup, 'unisci');
    expect(await db.leggiSentiero('extra')).toBeTruthy();
  });

  it('rifiuta file che non sono backup di Orme', async () => {
    await expect(db.importa({ app: 'altro', sentieri: [], tracce: [] })).rejects.toThrow('non è un backup');
    await expect(db.importa({ app: 'orme', versione: 1, sentieri: [{}], tracce: [] })).rejects.toThrow('senza id');
    await expect(db.importa(null)).rejects.toThrow();
  });
});
