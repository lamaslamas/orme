// Calcoli della pagina iniziale: ricerca di parchi e animali, schede delle specie,
// percorsi di osservazione divisi per parco.
import { ANIMALI } from './costanti.js';
import { PARCHI } from '../datiParchi.js';
import { normalizza } from './filtri.js';
import { animaliPossibili, conFaunaLungoIlPercorso } from './faunaPercorso.js';

// Un percorso è "di osservazione" se l'archivio lo dice (o ha animali delle associazioni)
// oppure se iNaturalist ha osservazioni verificate proprio lungo il percorso
export const diOsservazione = (s) => (s.osservazione ?? (s.animali ?? []).length > 0) || conFaunaLungoIlPercorso(s);

const parole = (testo) => normalizza(testo).split(/\s+/).filter((p) => p.length >= 3);

// Parchi e animali che corrispondono ad almeno una parola cercata
export function cercaParchiESpecie(testo) {
  const cercate = parole(testo);
  if (!cercate.length) return { parchi: [], specie: [] };
  const trova = (campi) => {
    const dove = normalizza(campi.join(' '));
    return cercate.some((p) => dove.includes(p));
  };
  return {
    parchi: PARCHI.filter((p) => trova([p.nome, p.nomeBreve, ...p.regioni])).map((p) => p.id),
    specie: Object.keys(ANIMALI).filter((k) => k !== 'altro' && trova([ANIMALI[k]])),
  };
}

// Per ogni animale presente in un parco: quanti percorsi di osservazione e in quali parchi.
// "visibili" sono i percorsi già filtrati per l'attività scelta.
export function riepilogoSpecie(visibili) {
  const ordine = [...new Set(PARCHI.flatMap((p) => p.animali))];
  return ordine.map((animale) => {
    const percorsi = visibili.filter((s) => animaliPossibili(s).includes(animale));
    const parchi = PARCHI.filter((p) => p.animali.includes(animale)).map((p) => p.id);
    return { animale, nome: ANIMALI[animale], percorsi: percorsi.length, parchi };
  });
}

// Percorsi di osservazione divisi per parco (nell'ordine dei parchi), eventualmente per un animale
export function osservazionePerParco(visibili, specie = '') {
  const scelti = visibili.filter((s) => (specie ? animaliPossibili(s).includes(specie) : diOsservazione(s)));
  return PARCHI.map((p) => ({ parco: p.id, percorsi: scelti.filter((s) => (s.parchi ?? [s.parco]).includes(p.id)) })).filter(
    (g) => g.percorsi.length,
  );
}
