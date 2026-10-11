import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach } from 'vitest';
import { luoghiNelTesto, codiciNelTesto, testoDellUscita, sentieriProbabili, tracciaConfermata, MAX_CANDIDATI } from '../src/lib/sentieriProbabili.js';
import * as db from '../src/db.js';
import { tracciaDaArchivio } from '../src/lib/archivio.js';

const linea = (coord) => ({ type: 'MultiLineString', coordinates: [coord] });
const percorso = (id, nome, coord, extra = {}) => ({ sentiero: { id, nome, parco: 'foreste-casentinesi', parchi: ['foreste-casentinesi'], ...extra }, traccia: { sentieroId: id, origine: 'osm', geojson: linea(coord) } });

const uscita = {
  id: 'fc-corezzo-bellaria',
  nome: 'Corezzo – Bellaria',
  parco: 'foreste-casentinesi',
  parchi: ['foreste-casentinesi'],
  organizzatori: ['Parco'],
  zona: 'Località Corezzo',
  escursione: { nomeUscita: 'Le notti del Wolf howling', associazione: '' },
  descrizione: 'Ritrovo a Chiusi della Verna, poi verso Bellaria.',
  lunghezzaKm: 5,
  luoghi: { punti: [{ nome: 'Bellaria', lat: 43.7, lon: 11.85 }] },
};

describe('sentieri probabili per le uscite senza traccia', () => {
  it('trova i nomi di luogo, anche con "della" e l\'apostrofo, senza parole comuni', () => {
    expect(luoghiNelTesto("Ritrovo a Chiusi della Verna. Si sale a Forca d'Acero e al Lago di Ponte. Facile anello.")).toEqual(['Chiusi della Verna', "Forca d'Acero", 'Lago di Ponte']);
    expect(luoghiNelTesto('Località La Beccia')).toEqual(['La Beccia']);
    expect(codiciNelTesto('Si segue il sentiero F2 e poi il K6')).toEqual(['F2', 'K6']);
  });

  it('il ritrovo nell\'ufficio dell\'associazione non conta', () => {
    const ecotur = { nome: 'Uscita', escursione: { associazione: 'Ecotur' }, partenza: { descrizione: 'Ecotur, Via Piave 9, Pescasseroli' } };
    expect(testoDellUscita(ecotur)).not.toMatch(/Piave|Pescasseroli/);
    expect(testoDellUscita({ nome: 'X', partenza: { descrizione: 'Rifugio Casaponte' } })).toMatch(/Casaponte/);
  });

  it('candidati con i motivi: nome nel testo, luogo vicino sulla mappa, lunghezza; al massimo 3', () => {
    const percorsi = [
      percorso('a', 'Sentiero 051: Chiusi della Verna – Santuario', [[11.9, 43.69], [11.91, 43.7]], { lunghezzaKm: 4.5 }),
      percorso('b', 'Pratalino – Monte Penna', [[11.849, 43.7], [11.86, 43.71]]), // passa da Bellaria
      percorso('c', 'Badia Prataglia – Camaldoli', [[11.7, 43.8], [11.71, 43.81]]),
      percorso('d', 'Chiusi della Verna (MTB)', [[11.9, 43.69], [11.91, 43.7]], { tipoPercorso: 'itinerario_mtb' }),
      percorso('e', 'Altro parco – Chiusi della Verna', [[11.9, 43.69], [11.91, 43.7]], { parco: 'pnalm', parchi: ['pnalm'] }),
      percorso('f', 'Chiusi della Verna 2', [[11.9, 43.69], [11.91, 43.7]]),
    ];
    const r = sentieriProbabili(uscita, percorsi);
    expect(r).toHaveLength(MAX_CANDIDATI);
    expect(r.map((c) => c.id)).toEqual(['a', 'f', 'b']); // il nome nel testo pesa più del luogo vicino
    expect(r[0]).toMatchObject({ id: 'a', motivi: ['nomina Chiusi della Verna', 'lunghezza simile (4,5 km)'] });
    expect(r.map((c) => c.id)).toContain('b');
    expect(r.find((c) => c.id === 'b').motivi).toEqual(['passa da Bellaria']);
    expect(r.map((c) => c.id)).not.toContain('d'); // le uscite sono a piedi
    expect(r.map((c) => c.id)).not.toContain('e'); // altro parco
  });
});

describe('conferma di un sentiero probabile', () => {
  beforeEach(async () => {
    await db.chiudiDb();
    globalThis.indexedDB = new IDBFactory();
  });

  it('la traccia confermata è "mia": l\'archivio non la sostituisce, il backup la porta con sé', async () => {
    const t = tracciaConfermata(uscita.id, { id: 'a', nome: 'Sentiero 051' }, { origine: 'osm', geojson: linea([[11.9, 43.69], [11.91, 43.7]]) }, '2026-10-11');
    expect(tracciaDaArchivio(t, { geojson: linea([[1, 1], [2, 2]]), dettagli: { archivio: true } })).toBe(false);
    await db.salvaSentiero({ id: uscita.id, nome: uscita.nome });
    await db.salvaTraccia(t);
    const backup = JSON.parse(JSON.stringify(await db.esporta()));
    expect(backup.tracce.find((x) => x.sentieroId === uscita.id).dettagli.conferma).toEqual({ sentiero: 'a', nome: 'Sentiero 051', data: '2026-10-11' });
    await db.chiudiDb();
    globalThis.indexedDB = new IDBFactory();
    await db.importa(backup, 'sostituisci');
    expect((await db.leggiTraccia(uscita.id)).dettagli.conferma.sentiero).toBe('a');
  });
});
