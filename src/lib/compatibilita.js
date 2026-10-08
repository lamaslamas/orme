// Compatibilità di un percorso con trekking, MTB ed e-MTB (stima prudente).
// Due aspetti distinti: percorribilità legale (regole, divieti) e fattibilità tecnica.
// Senza informazioni sufficienti lo stato è sempre "da_verificare".
import { analizzaPendenze } from './pendenza.js';
import { percorsoSentiero } from './tracce.js';

export const STATI_COMPATIBILITA = {
  percorribile: 'Percorribile',
  con_limitazioni: 'Percorribile con limitazioni',
  non_percorribile: 'Non percorribile',
  da_verificare: 'Da verificare',
};

export const ATTIVITA = { trekking: 'Trekking', mtb: 'MTB', emtb: 'e-MTB' };

const ACCESSI_SOLO_GUIDATI = ['guida', 'numero_chiuso'];

function trekking(s) {
  const a = s.attivita?.trekking;
  const tipo = s.accesso?.tipo;
  if (ACCESSI_SOLO_GUIDATI.includes(tipo) || tipo === 'chiusure_periodiche') {
    return { stato: 'con_limitazioni', motivi: [s.accesso?.nota || 'Accesso regolato dal Parco in alcuni periodi'] };
  }
  if (a?.stato === 'consentito' || a?.stato === 'percorribile') return { stato: 'percorribile', motivi: a.motivi ?? [] };
  if (a?.stato) return { stato: a.stato, motivi: a.motivi ?? [] };
  return s.codici?.length
    ? { stato: 'percorribile', motivi: ['Sentiero segnato'] }
    : { stato: 'da_verificare', motivi: ['Percorso senza codice ufficiale'] };
}

// Dati tecnici dalla traccia: scala MTB dai tag OSM, pendenze se ci sono le quote
function tecnica(traccia) {
  const sugg = traccia?.dettagli?.suggerimentoBici;
  const analisi = traccia?.geojson ? analizzaPendenze(percorsoSentiero(traccia.geojson).pezzi) : null;
  return {
    vietataOsm: (sugg?.bicycle?.no ?? 0) > 0,
    spintaOsm: (sugg?.bicycle?.a_spinta ?? 0) > 0,
    consentitaOsm: sugg ? sugg.bicycle.si > 0 && sugg.bicycle.si + sugg.bicycle.a_spinta === sugg.tratti : false,
    scalaMax: sugg?.mtbScale?.max ?? null,
    pendenzaMax: analisi ? Math.max(analisi.maxSalita, -analisi.maxDiscesa) : null,
  };
}

function bici(s, traccia, { elettrica = false } = {}) {
  const motivi = [];
  const t = tecnica(traccia);
  // 1. divieti
  if (s.bici?.consentita === 'no') return { stato: 'non_percorribile', motivi: ['Bici vietata (regole indicate per il sentiero)'] };
  if (t.vietataOsm) return { stato: 'non_percorribile', motivi: ['Su OpenStreetMap alcuni tratti hanno il divieto per le bici'] };
  if (ACCESSI_SOLO_GUIDATI.includes(s.accesso?.tipo)) {
    return { stato: 'non_percorribile', motivi: ['Accesso solo a piedi con guida o a numero chiuso'] };
  }
  const archivio = s.attivita?.[elettrica ? 'emtb' : 'mtb'];
  if (archivio?.stato === 'non_percorribile') return { stato: 'non_percorribile', motivi: archivio.motivi ?? [] };

  // 2. permesso: dal sentiero, da una fonte dell'archivio o dai tag OSM di tutti i tratti
  const permesso = s.bici?.consentita === 'si' || archivio?.stato === 'percorribile' || t.consentitaOsm;
  if (!permesso) motivi.push('Permesso per le bici non documentato');
  if (elettrica && s.bici?.emtb !== 'si' && archivio?.stato !== 'percorribile') motivi.push('Regole per le bici elettriche non documentate');

  // 3. tecnica
  const scala = s.bici?.scalaMtb ? Number(s.bici.scalaMtb.slice(1)) : t.scalaMax;
  const limiti = [];
  if (s.bici?.pedalabilita === 'a_spinta' || t.spintaOsm) limiti.push('Tratti da fare a piedi spingendo la bici');
  if (scala != null && scala >= 3) limiti.push(`Difficoltà tecnica elevata (S${scala})`);
  if (t.pendenzaMax != null && t.pendenzaMax > 25) limiti.push(`Pendenze fino al ${Math.round(t.pendenzaMax)}%`);
  const tecnicaNota = scala != null || t.pendenzaMax != null || s.bici?.pedalabilita;
  if (!tecnicaNota) motivi.push('Caratteristiche tecniche non note');

  if (motivi.length) return { stato: 'da_verificare', motivi: [...motivi, ...limiti] };
  if (limiti.length) return { stato: 'con_limitazioni', motivi: limiti };
  return { stato: 'percorribile', motivi: [scala != null ? `Difficoltà tecnica S${scala}` : 'Pendenze moderate'] };
}

export function valutaCompatibilita(s, traccia) {
  return {
    trekking: trekking(s),
    mtb: bici(s, traccia),
    emtb: bici(s, traccia, { elettrica: true }),
  };
}

// Il percorso va mostrato nella modalità scelta? (in bici si nascondono i non percorribili)
export function visibileInModalita(compat, attivita, { soloPercorribili = false } = {}) {
  const stato = compat[attivita]?.stato ?? 'da_verificare';
  if (stato === 'non_percorribile') return attivita === 'trekking' ? true : false;
  if (soloPercorribili) return stato === 'percorribile' || stato === 'con_limitazioni';
  return true;
}
