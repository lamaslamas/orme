import { describe, it, expect } from 'vitest';
import { nomeDaSostituire, nomeAutomatico, luogoDaRisposta, urlReverse, testoKm } from '../src/lib/nomePercorso.js';

describe('nome automatico', () => {
  it('la data o il vuoto si sostituiscono, un nome vero no', () => {
    for (const n of ['', '  ', 'Percorso senza nome', '24 ott 26', '24 ottobre 2026', '3 mag 2026', 'Percorso 24 ott 26', '2026-10-24', '2026-10-24 09:30', '24/10/2026', '24.10.26']) expect(nomeDaSostituire(n), n).toBe(true);
    for (const n of ['Anello del lago', 'Sentiero 713', 'Monte Amaro', '713 + 709', 'Da Opi a Barrea · 7 km']) expect(nomeDaSostituire(n), n).toBe(false);
  });
  it('anello e andata', () => {
    expect(nomeAutomatico({ anello: true, km: 7.2, partenza: 'Opi', arrivo: 'Opi' })).toBe('Anello da Opi · 7,2 km');
    expect(nomeAutomatico({ anello: false, km: 12.4, partenza: 'Opi', arrivo: 'Barrea' })).toBe('Da Opi a Barrea · 12 km');
    expect(nomeAutomatico({ anello: false, km: 7, partenza: 'Opi', arrivo: 'Opi' })).toBe('Da Opi · 7 km');
    expect(nomeAutomatico({ anello: false, km: 7, partenza: null, arrivo: 'X' })).toBeNull();
  });
  it('km: interi da 10 in su, un decimale sotto', () => {
    expect(testoKm(7)).toBe('7 km');
    expect(testoKm(7.04)).toBe('7 km');
    expect(testoKm(3.26)).toBe('3,3 km');
    expect(testoKm(10.6)).toBe('11 km');
  });
  it('il luogo dalla risposta di Nominatim', () => {
    expect(luogoDaRisposta({ address: { village: 'Opi', county: 'L\'Aquila' } })).toBe('Opi');
    expect(luogoDaRisposta({ address: { hamlet: 'Val Fondillo', village: 'Opi' } })).toBe('Val Fondillo');
    expect(luogoDaRisposta({ address: { county: 'L\'Aquila' } })).toBeNull();
    expect(luogoDaRisposta({})).toBeNull();
  });
  it('l\'indirizzo della richiesta', () => {
    const u = new URL(urlReverse(41.77931, 13.85631));
    expect(u.searchParams.get('lat')).toBe('41.77931');
    expect(u.searchParams.get('zoom')).toBe('14');
    expect(u.searchParams.get('accept-language')).toBe('it');
  });
});
