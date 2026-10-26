import { describe, it, expect } from 'vitest';
import { creaNascoste, chiaveSpecie, voceSpecie, normalizzaNascoste, specieComuni } from '../src/lib/specieNascoste.js';

const memoria = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), valori: m };
};

describe('specie nascoste', () => {
  it('una specie si riconosce dal nome scientifico o dall\'animale di Orme', () => {
    expect(chiaveSpecie({ animale: 'orso' })).toBe('ursus arctos');
    expect(chiaveSpecie({ scientifico: 'Ursus arctos arctos' })).toBe('ursus arctos');
    expect(chiaveSpecie({ nomeScientifico: 'Turdus merula (Linnaeus, 1758)' })).toBe('turdus merula');
    expect(chiaveSpecie({ animale: 'camoscio', scientifico: 'Rupicapra rupicapra' })).toBe('rupicapra pyrenaica'); // l'animale di Orme vince
    expect(chiaveSpecie({})).toBeNull();
  });
  it('nascondere, rimettere, contare; la scelta resta e non conta due volte la stessa specie', () => {
    const m = memoria();
    const n = creaNascoste(m);
    n.nascondi({ animale: 'lupo', nome: 'Lupo' });
    n.nascondi({ scientifico: 'Canis lupus', nome: 'Lupo' }); // la stessa specie
    n.nascondi({ scientifico: 'Turdus merula', nome: 'Merlo', inat: 12716 });
    expect(n.conta()).toBe(2);
    expect(n.esclude({ animale: 'lupo' })).toBe(true);
    expect(n.esclude({ nomeScientifico: 'Turdus merula' })).toBe(true);
    expect(n.esclude({ animale: 'cervo' })).toBe(false);
    expect(n.idInat()).toEqual([12716, 42048]);
    // la scelta è ricordata sul telefono
    expect(creaNascoste(m).nascoste().map((v) => v.nome)).toEqual(['Lupo', 'Merlo']);
    n.rimetti('canis lupus');
    expect(n.esclude({ animale: 'lupo' })).toBe(false);
    expect(n.conta()).toBe(1);
    n.rimettiTutte();
    expect(n.conta()).toBe(0);
    expect(n.firma()).toBe('');
  });
  it('«senza» toglie dalle liste le specie nascoste e non tocca quelle senza nome', () => {
    const n = creaNascoste(memoria());
    n.nascondi({ animale: 'volpe' });
    const lista = [{ animale: 'volpe' }, { animale: 'orso' }, { nome: 'senza dati' }];
    expect(n.senza(lista).map((x) => x.animale ?? x.nome)).toEqual(['orso', 'senza dati']);
    expect(creaNascoste(memoria()).senza(lista)).toBe(lista);
  });
  it('le più comuni: attive solo se acceso l\'interruttore, con l\'elenco ricordato', () => {
    const n = creaNascoste(memoria());
    const elenco = [{ animale: 'cervo', nome: 'Cervo' }, { animale: 'lupo', nome: 'Lupo' }];
    expect(n.esclude({ animale: 'cervo' })).toBe(false);
    n.impostaComuni(true, elenco);
    expect(n.esclude({ animale: 'cervo' })).toBe(true);
    expect(n.conta()).toBe(2);
    expect(n.idInat()).toEqual([42048, 204113]);
    n.nascondi({ animale: 'lupo' }); // già tra le comuni: non si conta due volte
    expect(n.conta()).toBe(2);
    n.impostaComuni(false);
    expect(n.esclude({ animale: 'cervo' })).toBe(false);
    expect(n.esclude({ animale: 'lupo' })).toBe(true); // nascosto anche a mano
  });
  it('un contenuto rotto dà nessuna esclusione; il taxon trovato dopo si aggiunge', () => {
    const m = memoria();
    m.setItem('orme.specieNascoste', '{rotto');
    expect(creaNascoste(m).conta()).toBe(0);
    expect(normalizzaNascoste([1, 2]).specie).toEqual([]);
    expect(normalizzaNascoste({ specie: [{ chiave: 'a b', nome: 'AB' }, { chiave: 'a b' }, 5], comuni: { attive: 'si' } })).toEqual({ versione: 1, specie: [{ chiave: 'a b', nome: 'AB' }], comuni: { attive: false, specie: [] } });
    const n = creaNascoste(memoria());
    n.nascondi({ scientifico: 'Egretta garzetta', nome: 'Garzetta' });
    expect(n.idInat()).toEqual([]);
    n.conTaxon('egretta garzetta', 4767);
    expect(n.idInat()).toEqual([4767]);
    expect(voceSpecie({ animale: 'orso' })).toMatchObject({ chiave: 'ursus arctos', nome: 'Orso', animale: 'orso', inat: 41641 });
  });
});

describe('specie più comuni dai dati', () => {
  const percorso = (...animali) => ({ faunaInat: { specie: animali.map((animale) => ({ animale })) } });
  const sentieri = [
    ...Array.from({ length: 6 }, () => percorso('lupo', 'cervo')),
    ...Array.from({ length: 3 }, () => percorso('lupo', 'orso')),
    percorso('volpe'),
    percorso(),
    {}, // senza dati di fauna: non conta
  ];
  it('quelle sopra la soglia, dalla più diffusa', () => {
    const r = specieComuni(sentieri);
    expect(r.map((x) => [x.animale, x.percorsi])).toEqual([['lupo', 9], ['cervo', 6], ['orso', 3]]);
    expect(r[0].quota).toBeCloseTo(9 / 11, 5);
    expect(r[0]).toMatchObject({ chiave: 'canis lupus', nome: 'Lupo' });
  });
  it('un tetto al numero di specie e un minimo di percorsi', () => {
    expect(specieComuni(sentieri, { massimo: 1 }).map((x) => x.animale)).toEqual(['lupo']);
    expect(specieComuni(sentieri, { minimo: 7 }).map((x) => x.animale)).toEqual(['lupo']);
    expect(specieComuni([{}])).toEqual([]);
  });
});
