import { ANIMALI } from './costanti.js';
import { PARCHI, ID_INTORNO } from '../datiParchi.js';
import { animaliPossibili, possibilitaFauna } from './faunaPercorso.js';

export const FILTRI_VUOTI = { parco: '', animale: '', stato: '', difficolta: '', accesso: '', paese: '', bici: '', testo: '', distanza: '', dislivello: '', durata: '', soloBici: '', panorama: '', fauna: '' };

export function normalizza(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

export function filtraSentieri(sentieri, filtri) {
  const testo = normalizza(filtri.testo);
  return sentieri.filter((s) => {
    // "Intorno a me": l'elenco è già quello della zona (anche percorsi dei parchi vicini)
    if (filtri.parco && filtri.parco !== ID_INTORNO && !(s.parchi ?? [s.parco || 'pnalm']).includes(filtri.parco)) return false;
    // animali delle associazioni e quelli osservati su iNaturalist lungo il percorso o nella zona
    if (filtri.animale && !animaliPossibili(s).includes(filtri.animale)) return false;
    if (filtri.stato && s.stato !== filtri.stato) return false;
    if (filtri.accesso && (s.accesso?.tipo || 'nessuno') !== filtri.accesso) return false;
    // "facili" = T ed E insieme (scorciatoia); altrimenti la difficoltà esatta
    if (filtri.difficolta === 'facili' ? !['T', 'E'].includes(s.difficolta) : filtri.difficolta && (s.difficolta || 'nessuna') !== filtri.difficolta) return false;
    // fauna: "frequenti" solo avvistamenti frequenti; "possibili" anche quelli possibili
    if (filtri.fauna) {
      const livello = possibilitaFauna(s)?.livello;
      if (filtri.fauna === 'frequenti' ? livello !== 'frequenti' : !['frequenti', 'possibili'].includes(livello)) return false;
    }
    if (filtri.bici && (s.bici?.consentita || 'da_verificare') !== filtri.bici) return false;
    if (filtri.paese && normalizza(s.partenza?.paese) !== normalizza(filtri.paese)) return false;
    // indice panoramico minimo: i percorsi senza indice restano fuori
    if (filtri.panorama && !((s.panorama?.punteggio ?? -1) >= Number(filtri.panorama))) return false;
    if (testo && !testoNelSentiero(s, testo)) return false;
    return true;
  });
}

// Ricerca libera: ogni parola deve comparire in nome, zona, codici, paese, parco,
// animali, organizzatori o nome dell'uscita (in qualunque ordine)
function testoNelSentiero(s, testo) {
  const parchi = (s.parchi ?? [s.parco]).map((id) => PARCHI.find((p) => p.id === id)).filter(Boolean);
  const dove = normalizza(
    [
      s.nome,
      s.zona,
      ...(s.codici ?? []),
      s.partenza?.paese,
      ...parchi.flatMap((p) => [p.nome, p.nomeBreve]),
      ...animaliPossibili(s).map((a) => ANIMALI[a] ?? a),
      ...(s.organizzatori ?? []),
      s.escursione?.associazione,
      s.escursione?.nomeUscita,
    ]
      .filter(Boolean)
      .join(' '),
  );
  return testo.split(/\s+/).every((parola) => dove.includes(parola));
}

// Elenco dei paesi di partenza presenti, senza doppioni, in ordine alfabetico
export function paesiDiPartenza(sentieri) {
  const visti = new Map();
  for (const s of sentieri) {
    const p = (s.partenza?.paese ?? '').trim();
    if (p && !visti.has(normalizza(p))) visti.set(normalizza(p), p);
  }
  return [...visti.values()].sort((a, b) => a.localeCompare(b, 'it'));
}

// Ordine: prima i "da fare", poi per primo codice, poi per nome
export function ordinaSentieri(sentieri) {
  return [...sentieri].sort((a, b) => {
    if (a.stato !== b.stato) return a.stato === 'da_fare' ? -1 : 1;
    const ca = a.codici?.[0];
    const cb = b.codici?.[0];
    if (ca && !cb) return -1;
    if (!ca && cb) return 1;
    if (ca && cb && ca !== cb) return ca.localeCompare(cb, 'it', { numeric: true });
    return (a.nome ?? '').localeCompare(b.nome ?? '', 'it');
  });
}

// Per la mappa generale: separa i sentieri filtrati con e senza traccia salvata
export function dividiPerTraccia(sentieri, tracce) {
  const conTraccia = [];
  const senzaTraccia = [];
  for (const s of sentieri) {
    const t = tracce.get(s.id);
    if (t?.geojson?.coordinates?.length) conTraccia.push({ sentiero: s, traccia: t });
    else senzaTraccia.push(s);
  }
  return { conTraccia, senzaTraccia };
}

// Unisce più tracce in un'unica geometria (es. per la distanza GPS dalla più vicina)
export function unisciGeometrie(tracce) {
  return { type: 'MultiLineString', coordinates: tracce.flatMap((t) => t.geojson?.coordinates ?? []) };
}
