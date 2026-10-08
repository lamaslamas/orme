import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  righeDaHtml,
  togliDatiPersonali,
  animaliNelTesto,
  misureDalTesto,
  periodoDalTesto,
  riassunto,
  unisciImportazione,
} from '../src/lib/importazione.js';
import { linkEscursioni, leggiPaginaEcotur } from '../src/lib/fonti/ecotur.js';
import { righeTabella, candidatiWolfHowling, linkPdfWolfHowling, linkNotizieWolfHowling } from '../src/lib/fonti/wolfHowling.js';
import { candidatiMtb, queryMtbParco } from '../src/lib/fonti/osmMtb.js';

const fixture = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const OGGI = '2026-10-08';

describe('testo', () => {
  it('righe leggibili senza script e con le entità decodificate', () => {
    expect(righeDaHtml('<p>Ciao &amp; <b>buona</b>&nbsp;giornata</p><script>x()</script><div>&euro; 20</div>')).toEqual([
      'Ciao & buona giornata',
      '€ 20',
    ]);
  });

  it('toglie email, telefoni e nomi delle guide', () => {
    const t = togliDatiPersonali('Ritrovo alle 17. Guida: Mario Rossi. Email: mario.rossi@example.com CEL: 333 1234567 Tel 0575 123456');
    expect(t).not.toMatch(/Mario|@|333|0575/);
    expect(t).toContain('Ritrovo alle 17.');
  });

  it('riassunto breve che finisce con una frase intera', () => {
    const r = riassunto('Prima frase abbastanza lunga da contare. Seconda frase che non ci sta tutta perché è lunghissima.', 60);
    expect(r).toBe('Prima frase abbastanza lunga da contare.');
  });
});

describe('animali nel testo', () => {
  it('riconosce parole italiane e inglesi', () => {
    expect(animaliNelTesto('Notte con il Lupo e wolf howling')).toEqual(['lupo']);
    expect(animaliNelTesto('Discovering the bear (bearwatching)')).toEqual(['orso']);
    expect(animaliNelTesto('Il bramito del cervo e i camosci')).toEqual(['camoscio', 'cervo']);
    expect(animaliNelTesto('roe deer and fallow deer')).toEqual(['capriolo', 'daino']);
  });

  it('non confonde nomi propri o parole simili', () => {
    expect(animaliNelTesto('Guida Volpone Alessandro, corso di cucina')).toEqual([]);
  });
});

describe('misure dal testo', () => {
  it('formati di Ecotur', () => {
    expect(misureDalTesto('Uphill and downhill: about 100 m. Walking time: 1 hour and 30 minutes bout. Distance: about 3 km.')).toEqual({
      lunghezzaKm: 3,
      dislivelloM: 100,
      durataMin: 90,
    });
  });

  it('formati del calendario del Parco', () => {
    expect(misureDalTesto('Lunghezza: 6 km. Dislivello positivo: 200 m. Durata: 3 ore circa.')).toEqual({ lunghezzaKm: 6, dislivelloM: 200, durataMin: 180 });
    expect(misureDalTesto('Escursione ad anello di 8km con emissione di ululati')).toMatchObject({ lunghezzaKm: 8, dislivelloM: null });
    expect(misureDalTesto('Durata circa 3 ore, distanza massima circa 5 km, dislivello d+ 250 m.')).toEqual({ lunghezzaKm: 5, dislivelloM: 250, durataMin: 180 });
  });

  it('periodo dai mesi citati', () => {
    expect(periodoDalTesto('Dates October 2026 4, September 2026 11')).toBe('Settembre, Ottobre');
  });
});

describe('Ecotur', () => {
  it('trova le pagine delle escursioni nell\'elenco', () => {
    const link = linkEscursioni(fixture('ecotur-elenco.html'));
    expect(link).toHaveLength(8);
    expect(link).toContain('https://www.ecotur.org/en/excursions/Discovering_the_bear_%28bearwatching%29.xhtml');
  });

  it('legge una pagina: nome, animali, misure, ritrovo', () => {
    const url = 'https://www.ecotur.org/en/excursions/On_the_tracks_of_the_wolf.xhtml';
    const c = leggiPaginaEcotur(fixture('ecotur-lupo.html'), url);
    expect(c).toMatchObject({
      nome: 'On the tracks of the wolf',
      id: 'ecotur-on-the-tracks-of-the-wolf',
      tipo: 'uscita_guidata',
      parco: 'pnalm',
      animali: ['lupo'],
      lunghezzaKm: 3,
      dislivelloM: 100,
      durataMin: 90,
      periodo: 'Settembre',
    });
    expect(c.partenza).toBe('Ecotur, Via Piave 9 Pescasseroli');
    expect(c.descrizione.length).toBeGreaterThan(40);
    // il menu del sito (orso, camoscio, cervo) non conta
    expect(c.animali).not.toContain('orso');
  });

  it('una pagina diversa non produce candidati', () => {
    expect(leggiPaginaEcotur('<html><h1>Altro</h1></html>', 'x')).toBeNull();
  });

  it('una pagina ancora da scrivere è un segnaposto', () => {
    const html = '<h1>Colli</h1><div>Excursions</div><div>Colli</div><div>Meeting</div><div>work in progress</div><div>Watch our videos!</div>';
    expect(leggiPaginaEcotur(html, 'x')).toEqual({ segnaposto: true });
  });
});

// Tabella finta con la stessa disposizione del PDF del Parco (nomi e contatti inventati)
const PAGINA_WH = [
  { x: 90, y: 777, s: 'DATA' },
  { x: 214, y: 777, s: 'LUOGO' },
  { x: 389, y: 777, s: 'GUIDA' },
  { x: 517, y: 777, s: 'NOME PROGETTO/ESCURSIONE' },
  { x: 793, y: 777, s: 'DESCRIZIONE' },
  { x: 976, y: 777, s: 'PER INFO E PRENOTAZIONI' },
  { x: 81, y: 734, s: '6/11/2026' },
  { x: 199, y: 734, s: 'Lago di Ponte' },
  { x: 364, y: 734, s: 'Nome Inventato' },
  { x: 513, y: 740, s: 'Ululati nella notte - Wolf Howling al' },
  { x: 574, y: 727, s: 'Tramazzo' },
  { x: 743, y: 752, s: 'Ore 16:30 ritrovo presso il rifugio.' },
  { x: 696, y: 726, s: 'Escursione ad anello di 8km con emissione di ululati.' },
  { x: 988, y: 765, s: 'Guida: Nome Inventato' },
  { x: 978, y: 727, s: 'nome.inventato@example.com' },
  { x: 1004, y: 715, s: 'CEL: 3330000000' },
  { x: 78, y: 669, s: '07/11/2026' },
  { x: 211, y: 669, s: 'Pratalino' },
  { x: 357, y: 669, s: 'Altra Persona' },
  { x: 519, y: 675, s: 'Le notti del Wolf howling: Trek e' },
  { x: 548, y: 662, s: 'formazione sul Lupo' },
  { x: 699, y: 669, s: 'Lunghezza: 6 km. Dislivello positivo: 200 m. Durata: 3 ore circa.' },
  { x: 78, y: 600, s: '05/12/2026' },
  { x: 211, y: 600, s: 'Pratalino' },
  { x: 357, y: 600, s: 'Altra Persona' },
  { x: 519, y: 606, s: 'Le notti del Wolf howling: Trek e' },
  { x: 548, y: 593, s: 'formazione sul Lupo' },
  { x: 699, y: 600, s: 'Lunghezza: 6 km.' },
];

describe('Wolf Howling del Parco', () => {
  const urlPdf = 'https://www.parcoforestecasentinesi.it/sites/default/files/WH%202026_rev.pdf';

  it('legge le righe della tabella senza le colonne con i contatti', () => {
    const righe = righeTabella([PAGINA_WH]);
    expect(righe).toHaveLength(3);
    expect(righe[0]).toEqual({
      data: '2026-11-06',
      luogo: 'Lago di Ponte',
      nome: 'Ululati nella notte - Wolf Howling al Tramazzo',
      descrizione: 'Ore 16:30 ritrovo presso il rifugio. Escursione ad anello di 8km con emissione di ululati.',
    });
    expect(JSON.stringify(righe)).not.toMatch(/Inventato|Persona|@|333/);
  });

  it('la stessa uscita in più date diventa un solo percorso guidato', () => {
    const c = candidatiWolfHowling(righeTabella([PAGINA_WH]), urlPdf);
    expect(c).toHaveLength(2);
    const notti = c.find((x) => x.zona === 'Pratalino');
    expect(notti).toMatchObject({
      date: ['2026-11-07', '2026-12-05'],
      periodo: 'Novembre, Dicembre',
      animali: ['lupo'],
      lunghezzaKm: 6,
      parco: 'foreste-casentinesi',
      tipo: 'uscita_guidata',
    });
    expect(notti.id).toBe('wh-pratalino-le-notti-del-wolf-howling-trek-e');
  });

  it('trova notizie e PDF del calendario', () => {
    expect(linkNotizieWolfHowling('<a href="/it/news/wolf-howling-20262027">x</a><a href="/it/news/altro">y</a>')).toEqual([
      'https://www.parcoforestecasentinesi.it/it/news/wolf-howling-20262027',
    ]);
    expect(linkPdfWolfHowling('<a href="https://www.parcoforestecasentinesi.it/sites/default/files/WH%202026_rev.pdf">pdf</a><a href="/x/modulo.pdf">m</a>')).toEqual([urlPdf]);
  });
});

describe('itinerari MTB da OpenStreetMap', () => {
  const json = {
    elements: [
      {
        type: 'relation',
        id: 74606,
        tags: { route: 'bicycle', network: 'mtb', ref: '09', name: "Coppa dell'Orso", operator: 'Vallelongabike' },
        members: [{ type: 'way', ref: 1, geometry: [{ lat: 41.9, lon: 13.7 }, { lat: 41.91, lon: 13.7123456 }] }],
      },
      { type: 'way', id: 1, tags: { highway: 'track', bicycle: 'yes' } },
    ],
  };

  it('query dentro il confine del parco', () => {
    expect(queryMtbParco('pnalm')).toContain('area(id:3608426003)');
  });

  it('percorribile in MTB, e-MTB e trekking da verificare, nessun codice escursionistico', () => {
    const [c] = candidatiMtb(json, 'pnalm');
    expect(c.nome).toBe("Coppa dell'Orso (MTB 09)");
    expect(c.codici).toEqual([]);
    expect(c.attivita.mtb.stato).toBe('percorribile');
    expect(c.attivita.emtb.stato).toBe('da_verificare');
    expect(c.attivita.trekking.stato).toBe('da_verificare');
    expect(c.traccia.geojson.coordinates[0][1]).toEqual([13.71235, 41.91]);
    expect(c.lunghezzaKm).toBeGreaterThan(1);
  });

  it('dei percorsi lunghi tiene solo il tratto nel parco; doppioni e nomi uguali', () => {
    const fuori = { lat: 45, lon: 10 };
    const rel = (id, extra = {}) => ({
      type: 'relation',
      id,
      tags: { route: 'mtb', name: 'SICAI Ciclo', ref: 'SI-C', ...extra },
      members: [{ type: 'way', ref: 1, geometry: [fuori, { lat: 41.8, lon: 13.8 }, { lat: 41.81, lon: 13.8 }, { lat: 41.82, lon: 13.8 }, fuori] }],
    });
    const c = candidatiMtb({ elements: [rel(1, { from: 'A', to: 'B' }), rel(2), rel(3, { from: 'C', to: 'D' })] }, 'pnalm');
    expect(c).toHaveLength(1); // stessa geometria: un solo percorso
    expect(c[0].traccia.dettagli.ritagliata).toBe(true);
    expect(c[0].traccia.geojson.coordinates).toEqual([[[13.8, 41.8], [13.8, 41.82]]]);
    expect(c[0].descrizione).toMatch(/tratto nel parco/);
  });
});

describe('unione nell\'archivio', () => {
  const semeEcotur = {
    id: 'cicerana',
    nome: 'Altopiano della Cicerana',
    descrizione: 'Scritta a mano',
    animali: ['orso'],
    lunghezzaKm: 8,
    dislivelloM: 200,
    durataMin: null,
    escursione: { associazione: 'Ecotur', url: 'https://www.ecotur.org/en/excursions/Discovering_the_bear_%28bearwatching%29.xhtml', periodo: 'Ottobre' },
    fonti: [{ url: 'https://www.ecotur.org/en/excursions/Discovering_the_bear_%28bearwatching%29.xhtml', titolo: 'Ecotur', visto: '2026-01-01' }],
    verifica: { stato: 'da_verificare', ultimoControllo: '2026-01-01' },
  };
  const candidato = (extra = {}) => ({
    fonte: 'ecotur',
    tipo: 'uscita_guidata',
    chiave: 'https://www.ecotur.org/en/excursions/Discovering_the_bear_(bearwatching).xhtml',
    id: 'ecotur-discovering-the-bear-bearwatching',
    url: 'https://www.ecotur.org/en/excursions/Discovering_the_bear_(bearwatching).xhtml',
    nome: 'Discovering the bear (bearwatching)',
    organizzatore: 'Ecotur',
    parco: 'pnalm',
    descrizione: 'Testo della fonte',
    animali: ['orso', 'cervo'],
    lunghezzaKm: 9,
    durataMin: 240,
    periodo: 'Settembre, Ottobre',
    ...extra,
  });

  it('un sentiero scritto a mano si riconosce dal link e si aggiorna solo nei campi vuoti', () => {
    const { archivio, resoconto } = unisciImportazione({ percorsi: [semeEcotur] }, [{ fonte: 'ecotur', ok: true, candidati: [candidato()] }], OGGI);
    expect(resoconto).toMatchObject({ nuovi: [], aggiornati: ['cicerana'] });
    const r = archivio.percorsi[0];
    expect(r.descrizione).toBe('Scritta a mano');
    expect(r.lunghezzaKm).toBe(8);
    expect(r.durataMin).toBe(240);
    expect(r.escursione.periodo).toBe('Ottobre');
    expect(r.animali).toEqual(['orso']); // scelti a mano: restano
    expect(r.fonti).toHaveLength(1);
    expect(r.fonti[0].visto).toBe(OGGI);
    expect(r.verifica.ultimoControllo).toBe(OGGI);
    expect(r.importazione).toEqual({ fonte: 'ecotur', chiave: candidato().chiave, creato: false });
  });

  it('un percorso nuovo diventa un\'uscita solo con guida, senza traccia', () => {
    const { archivio, resoconto } = unisciImportazione({ percorsi: [] }, [{ fonte: 'ecotur', ok: true, candidati: [candidato()] }], OGGI);
    expect(resoconto.nuovi).toEqual(['ecotur-discovering-the-bear-bearwatching']);
    const r = archivio.percorsi[0];
    expect(r.accesso.tipo).toBe('guida');
    expect(r.attivita.trekking.stato).toBe('con_limitazioni');
    expect(r.attivita.mtb.stato).toBe('non_percorribile');
    expect(r.osservazione).toBe(true);
    expect(r.traccia).toBeUndefined();
    expect(r.verifica).toEqual({ stato: 'da_verificare', ultimoControllo: OGGI });
    expect(r.bici.consentita).toBe('da_verificare');
  });

  it('se la fonte non risponde non cambia nulla', () => {
    const prima = { percorsi: [{ ...semeEcotur, importazione: { fonte: 'ecotur', chiave: 'x', creato: false } }] };
    const { archivio, resoconto } = unisciImportazione(prima, [{ fonte: 'ecotur', ok: false }], OGGI);
    expect(archivio.percorsi).toEqual(prima.percorsi);
    expect(resoconto.fontiNonRaggiunte).toEqual(['ecotur']);
  });

  it('se la fonte risponde ma il percorso non c\'è più: non più verificabile (quelli scritti a mano restano validi)', () => {
    const creato = { id: 'wh-vecchio', nome: 'Vecchia uscita', fonti: [], verifica: { stato: 'da_verificare' }, attivo: true, importazione: { fonte: 'ecotur', chiave: 'v', creato: true } };
    const seme = { ...semeEcotur, importazione: { fonte: 'ecotur', chiave: 'x', creato: false } };
    const { archivio } = unisciImportazione({ percorsi: [creato, seme] }, [{ fonte: 'ecotur', ok: true, candidati: [] }], OGGI);
    expect(archivio.percorsi[0]).toMatchObject({ attivo: false, verifica: { stato: 'non_piu_verificabile', ultimoControllo: OGGI } });
    expect(archivio.percorsi[1].verifica.stato).toBe('da_verificare');
    expect(archivio.percorsi[1].fonti[0].nonRaggiungibile).toBe(true);
  });

  it('un percorso ritrovato torna attivo e aggiornato', () => {
    const prima = unisciImportazione({ percorsi: [] }, [{ fonte: 'ecotur', ok: true, candidati: [candidato()] }], '2026-01-01').archivio;
    const sparito = unisciImportazione(prima, [{ fonte: 'ecotur', ok: true, candidati: [] }], '2026-02-01').archivio;
    const tornato = unisciImportazione(sparito, [{ fonte: 'ecotur', ok: true, candidati: [candidato({ lunghezzaKm: 10 })] }], OGGI).archivio;
    expect(tornato.percorsi).toHaveLength(1);
    expect(tornato.percorsi[0]).toMatchObject({ attivo: true, lunghezzaKm: 10, verifica: { stato: 'da_verificare', ultimoControllo: OGGI } });
  });
});

describe('date di controllo', () => {
  it('si rinfrescano solo dopo una settimana', async () => {
    const { rinfresca } = await import('../src/lib/importazione.js');
    expect(rinfresca('2026-10-05', OGGI)).toBe('2026-10-05');
    expect(rinfresca('2026-10-01', OGGI)).toBe(OGGI);
    expect(rinfresca(null, OGGI)).toBe(OGGI);
  });

  it('una fonte letta solo in parte non segna nulla come sparito', () => {
    const creato = { id: 'x', nome: 'X', verifica: { stato: 'da_verificare' }, importazione: { fonte: 'ecotur', chiave: 'x', creato: true } };
    const { archivio } = unisciImportazione({ percorsi: [creato] }, [{ fonte: 'ecotur', ok: true, completo: false, candidati: [] }], OGGI);
    expect(archivio.percorsi[0].verifica.stato).toBe('da_verificare');
  });
});

describe('uscite di un calendario e sentieri scritti a mano', () => {
  const PDF = 'https://example.org/wh.pdf';
  const seme = (id, nome, zona, nomeUscita) => ({ id, nome, zona, parco: 'foreste-casentinesi', animali: ['lupo'], escursione: { nomeUscita, url: PDF }, fonti: [] });
  const semi = [
    seme('fc-tramazzo', 'Anello del Tramazzo da Lago di Ponte', 'Valle del Tramazzo', 'Ululati nella notte – Wolf Howling al Tramazzo'),
    seme('fc-borbotto', 'Le Pianacce – Rifugio Borbotto', 'Borbotto', 'Ululati nella notte'),
    seme('fc-la-beccia-pratalino', 'La Beccia – Pratalino', 'Pratalino', 'Le notti del Wolf howling: trek e formazione sul lupo'),
    seme('fc-camaldoli-montanino', 'Camaldoli – Montanino', 'Camaldoli', 'Le notti del Wolf howling: trek e formazione sul lupo'),
    seme('fc-passo-braccina', 'Passo della Braccina', 'Passo della Braccina', 'Il richiamo del selvaggio'),
  ];
  const cand = (nome, zona, data) => ({ fonte: 'wolf-howling', tipo: 'uscita_guidata', parco: 'foreste-casentinesi', url: PDF, nome, zona, chiave: `${zona}|${nome}`, id: `wh-${zona}`, animali: ['lupo'], date: [data] });

  it('si riconoscono per nome (anche accorciato) e luogo, senza doppioni', () => {
    const { archivio, resoconto } = unisciImportazione(
      { percorsi: semi },
      [
        {
          fonte: 'wolf-howling',
          ok: true,
          candidati: [
            cand('Ululati nella notte - Wolf Howling al Tramazzo', 'Lago di Ponte', '2026-11-06'),
            cand('ULULATI NELLA NOTTE', 'Borbotto', '2026-11-14'),
            cand('Le notti del Wolf howling: Trek e formazione sul Lupo', 'Pratalino', '2026-11-07'),
            cand('Le notti del Wolf howling: Trek e formazione sul Lupo', 'Montanino', '2026-11-21'),
            cand('IL RICHIAMO DEL SELVAGGIO - Escursione serale dedicata al wolf howling', 'Braccina', '2026-12-05'),
            cand('Notte con il Lupo', 'Borbotto', '2027-01-08'),
          ],
        },
      ],
      OGGI,
    );
    expect(resoconto.aggiornati).toEqual(['fc-tramazzo', 'fc-borbotto', 'fc-la-beccia-pratalino', 'fc-camaldoli-montanino', 'fc-passo-braccina']);
    expect(resoconto.nuovi).toEqual(['wh-Borbotto']);
    expect(archivio.percorsi.find((p) => p.id === 'fc-camaldoli-montanino').escursione.date).toEqual(['2026-11-21']);
    expect(archivio.percorsi.find((p) => p.id === 'fc-tramazzo').nome).toBe('Anello del Tramazzo da Lago di Ponte');
  });
});

describe('modalità e titoli', () => {
  it('i titoli in maiuscolo diventano leggibili', () => {
    const [c] = candidatiWolfHowling([{ data: '2026-11-14', luogo: 'Pratalino', nome: 'OCCHI DI BOSCO e OCCHI DI LUPO', descrizione: '' }], 'u');
    expect(c.nome).toBe('Occhi di bosco e occhi di lupo');
  });

  it('gli itinerari MTB non compaiono tra i percorsi a piedi', async () => {
    const { filtraPercorsi, preparaPercorsi } = await import('../src/lib/motore.js');
    const { FILTRI_VUOTI } = await import('../src/lib/filtri.js');
    const sentieri = [
      { id: 'a', nome: 'A', parco: 'pnalm', codici: [], tipoPercorso: 'itinerario_mtb', attivita: { mtb: { stato: 'percorribile', motivi: [] } } },
      { id: 'b', nome: 'B', parco: 'pnalm', codici: ['B1'] },
    ];
    const p = preparaPercorsi(sentieri, new Map());
    expect(filtraPercorsi(p, FILTRI_VUOTI, 'trekking').map((x) => x.sentiero.id)).toEqual(['b']);
    expect(filtraPercorsi(p, FILTRI_VUOTI, 'mtb').map((x) => x.sentiero.id)).toContain('a');
  });
});

describe('freno di sicurezza', () => {
  it('una fonte che perde di colpo più di metà dei percorsi non ne segna nessuno come sparito', () => {
    const percorsi = Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, nome: `M${i}`, attivo: true, verifica: { stato: 'da_verificare' }, importazione: { fonte: 'osm-mtb:pnalm', chiave: `k${i}`, creato: true } }));
    const { archivio, resoconto } = unisciImportazione({ percorsi }, [{ fonte: 'osm-mtb:pnalm', ok: true, candidati: [] }], OGGI);
    expect(archivio.percorsi.every((p) => p.attivo && p.verifica.stato === 'da_verificare')).toBe(true);
    expect(resoconto.fontiSospette).toEqual(['osm-mtb:pnalm']);
    expect(resoconto.nonPiuVerificabili).toEqual([]);
  });
});

describe('percorsi riportati da più fonti', () => {
  const mtb = (fonte, parco, km) => ({
    fonte, tipo: 'itinerario_mtb', chiave: `${parco}:7`, id: 'osm-mtb-7', url: 'https://www.openstreetmap.org/relation/7',
    nome: 'Giro', parco, animali: [], lunghezzaKm: km, attivita: { mtb: { stato: 'percorribile', motivi: [] } },
  });

  it('la prima fonte resta principale, la seconda si annota e aggiunge il parco', () => {
    const a = unisciImportazione({ percorsi: [] }, [{ fonte: 'osm-mtb:lucano', ok: true, candidati: [mtb('osm-mtb:lucano', 'appennino-lucano', 30)] }], OGGI).archivio;
    const b = unisciImportazione(a, [{ fonte: 'osm-mtb:pollino', ok: true, candidati: [mtb('osm-mtb:pollino', 'pollino', 12)] }], OGGI).archivio;
    expect(b.percorsi).toHaveLength(1);
    expect(b.percorsi[0].importazione).toMatchObject({ fonte: 'osm-mtb:lucano', altreFonti: ['osm-mtb:pollino'] });
    expect(b.percorsi[0].parchi).toEqual(['appennino-lucano', 'pollino']);
    expect(b.percorsi[0].lunghezzaKm).toBe(30); // i contenuti li decide la fonte principale
    // la seconda fonte non lo riporta più: si toglie solo lei, il percorso resta attivo
    const c = unisciImportazione(b, [{ fonte: 'osm-mtb:pollino', ok: true, candidati: [] }], OGGI).archivio;
    expect(c.percorsi[0]).toMatchObject({ attivo: true, importazione: { fonte: 'osm-mtb:lucano', altreFonti: [] } });
  });
});

describe('itinerari dentro il confine vero', () => {
  it('scarta quelli che passano solo nel riquadro', async () => {
    const { soloDentroIlConfine } = await import('../src/lib/fonti/osmMtb.js');
    const quadrato = [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]];
    const c = (id, punti) => ({ id, traccia: { geojson: { coordinates: [punti] } } });
    const r = soloDentroIlConfine([c('dentro', [[0.5, 0.5], [2, 2]]), c('fuori', [[1.5, 1.5], [2, 2]])], quadrato);
    expect(r.map((x) => x.id)).toEqual(['dentro']);
  });
});

describe('sentieri escursionistici OSM (Pollino)', () => {
  it('codice CAI, difficoltà, trekking percorribile e bici da valutare', async () => {
    const { candidatiSentieri, querySentieriParco } = await import('../src/lib/fonti/osmSentieri.js');
    expect(querySentieriParco('pollino')).toContain('rel["route"="hiking"](39.61,15.82,40.23,16.44)');
    const geom = [{ lat: 39.9, lon: 16.1 }, { lat: 39.91, lon: 16.11 }];
    const rel = (id, tags) => ({ type: 'relation', id, tags: { route: 'hiking', ...tags }, members: [{ type: 'way', ref: id, geometry: geom.map((p) => ({ lat: p.lat + id / 1000, lon: p.lon })) }] });
    const c = candidatiSentieri(
      { elements: [rel(1, { ref: '631', name: 'Sentiero del Caramolo', cai_scale: 'EE', operator: 'CAI' }), rel(2, { ref: 'SI', from: 'Piano di Lanzo', to: 'Piano Novacco' })] },
      'pollino',
    );
    expect(c[0]).toMatchObject({ nome: 'Sentiero del Caramolo', codici: ['631'], difficolta: 'EE', tipo: 'sentiero', id: 'osm-sentiero-1' });
    expect(c[0].attivita.trekking.stato).toBe('percorribile');
    expect(c[0].attivita.mtb).toBeUndefined();
    expect(c[1]).toMatchObject({ nome: 'Sentiero Italia CAI: Piano di Lanzo – Piano Novacco', codici: [] });
    const r = unisciImportazione({ percorsi: [] }, [{ fonte: 'osm-sentieri:pollino', ok: true, candidati: c }], OGGI).archivio.percorsi[0];
    expect(r).toMatchObject({ difficolta: 'EE', tipoPercorso: 'sentiero', accesso: { tipo: 'nessuno' } });
  });
});

describe('sentieri OSM e sentieri scritti a mano', () => {
  const traccia = { origine: 'osm', geojson: { type: 'MultiLineString', coordinates: [[[13.8, 41.8], [13.81, 41.81]]] }, dettagli: {} };
  const cand = (idOsm, codice) => ({ fonte: 'osm-sentieri:pnalm', tipo: 'sentiero', parco: 'pnalm', chiave: `pnalm:${idOsm}`, id: `osm-sentiero-${idOsm}`, idOsm, url: `https://www.openstreetmap.org/relation/${idOsm}`, nome: `Sentiero ${codice}`, codici: [codice], difficolta: 'E', animali: [], traccia });

  it('si riconoscono dalla relazione OSM (anche due relazioni per un sentiero) o dal codice univoco', () => {
    const semi = [
      { id: 'b5-b4', nome: 'Monte Tranquillo', parco: 'pnalm', codici: ['C5', 'B4'], traccia: { dettagli: { relazioniOsm: [10, 11] } } },
      { id: 'f2', nome: 'Val Fondillo', parco: 'pnalm', codici: ['F2'] },
    ];
    const { archivio, resoconto } = unisciImportazione({ percorsi: semi }, [{ fonte: 'osm-sentieri:pnalm', ok: true, candidati: [cand(10, 'C5'), cand(11, 'B4'), cand(20, 'F2'), cand(30, 'Z9')] }], OGGI);
    expect(resoconto.nuovi).toEqual(['osm-sentiero-30']);
    const f2 = archivio.percorsi.find((p) => p.id === 'f2');
    expect(f2.traccia).toBe(traccia); // il sentiero senza traccia la riceve
    expect(f2.difficolta).toBe('E');
    expect(archivio.percorsi.find((p) => p.id === 'b5-b4').traccia.dettagli.relazioniOsm).toEqual([10, 11]); // la sua resta
  });
});
