import { describe, it, expect } from 'vitest';
import { creaNascoste, chiaveSpecie, voceSpecie, normalizzaNascoste, specieComuniDaRisposta, urlSpecieComuni } from '../src/lib/specieNascoste.js';

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
    const elenco = [{ scientifico: 'Turdus merula', nome: 'Merlo', inat: 12716 }, { scientifico: 'Pica pica', nome: 'Gazza', inat: 891696 }];
    expect(n.esclude({ scientifico: 'Pica pica' })).toBe(false);
    n.impostaComuni(true, elenco);
    expect(n.esclude({ scientifico: 'Pica pica' })).toBe(true);
    expect(n.conta()).toBe(2);
    expect(n.idInat()).toEqual([12716, 891696]);
    n.nascondi({ scientifico: 'Pica pica' }); // già tra le comuni: non si conta due volte
    expect(n.conta()).toBe(2);
    n.impostaComuni(false);
    expect(n.esclude({ scientifico: 'Turdus merula' })).toBe(false);
    expect(n.esclude({ scientifico: 'Pica pica' })).toBe(true); // nascosto anche a mano
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

describe('specie più comuni: le più osservate in Italia', () => {
  const r = (id, name, count, comune = null) => ({ count, taxon: { id, name, preferred_common_name: comune } });
  const json = { results: [r(13858, 'Passer domesticus', 22050, 'passera europea'), r(42048, 'Canis lupus', 20000, 'lupo'), r(6930, 'Anas platyrhynchos', 19301, 'germano reale'), r(5267, 'Milvus milvus', 10645, 'nibbio reale'), r(1, 'Canis lupus familiaris', 9000, 'cane'), r(12716, 'Turdus merula', 19214, 'merlo'), r(13858, 'Passer domesticus', 5)] };
  it('la richiesta è per tutta Italia, animali selvatici verificati', () => {
    const u = new URL(urlSpecieComuni());
    expect(u.searchParams.get('place_id')).toBe('6774');
    expect(u.searchParams.get('captive')).toBe('false');
    expect(u.searchParams.get('taxon_id')).toBe('40151,3,26036,20978');
    expect(u.searchParams.get('without_taxon_id')).toBe('71261,67570,4730,4929,4262,4255');
  });
  it('mai le specie di «Quale animale» né i domestici; le altre dalla più osservata', () => {
    const e = specieComuniDaRisposta(json);
    expect(e.map((x) => x.nome)).toEqual(['Passera europea', 'Germano reale', 'Merlo']);
    expect(e[0]).toMatchObject({ chiave: 'passer domesticus', inat: 13858, osservazioni: 22050 });
  });
  it('mai rapaci, cicogne, aironi, cormorani, fenicotteri; sempre cornacchia grigia e lucertole se ci sono', () => {
    const con = (id, name, count, antenati) => ({ count, taxon: { id, name, ancestor_ids: antenati } });
    const j = { results: [con(5366, 'Gyps fulvus', 9000, [3, 71261]), con(4943, 'Egretta garzetta', 8000, [3, 4929]), con(4270, 'Phalacrocorax carbo', 7000, [4262]), con(472766, 'Falco tinnunculus', 6000, [67570]), con(4733, 'Ciconia ciconia', 5000, [4730]), con(73222, 'Phoenicopterus roseus', 4000, [4255]), con(12716, 'Turdus merula', 3000, [3]), con(8, 'Corvus cornix', 10, [3]), con(9, 'Podarcis muralis', 9, [26036])] };
    expect(specieComuniDaRisposta(j).map((x) => x.scientifico)).toEqual(['Turdus merula', 'Corvus cornix', 'Podarcis muralis']);
    // anche se fuori dalle prime 30
    const molte = { results: [...Array.from({ length: 40 }, (_, i) => r(1000 + i, `Genus specie${i}`, 1000 - i)), r(8, 'Corvus cornix', 1)] };
    const e = specieComuniDaRisposta(molte);
    expect(e).toHaveLength(30);
    expect(e.some((x) => x.scientifico === 'Corvus cornix')).toBe(true);
  });
  it('al massimo 30', () => {
    const molte = { results: Array.from({ length: 80 }, (_, i) => r(1000 + i, `Genus specie${i}`, 1000 - i)) };
    expect(specieComuniDaRisposta(molte)).toHaveLength(30);
    expect(specieComuniDaRisposta(molte, { massimo: 5 })).toHaveLength(5);
  });
  it('un elenco salvato prima con le specie di «Quale animale» non le nasconde', () => {
    const n = creaNascoste(memoria());
    n.impostaComuni(true, [{ animale: 'cervo', nome: 'Cervo' }, { scientifico: 'Turdus merula', nome: 'Merlo', inat: 12716 }]);
    expect(n.esclude({ animale: 'cervo' })).toBe(false);
    expect(n.esclude({ scientifico: 'Turdus merula' })).toBe(true);
    n.nascondi({ animale: 'cervo' }); // a mano sì
    expect(n.esclude({ animale: 'cervo' })).toBe(true);
  });
});
