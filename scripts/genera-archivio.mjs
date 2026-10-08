// Crea public/dati/archivio.json (l'archivio pubblico dei percorsi) dai sentieri iniziali
// e dalle loro tracce. Da qui in poi l'archivio è aggiornato dall'importazione automatica.
// Uso: node scripts/genera-archivio.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { DATI_INIZIALI } from '../src/datiIniziali.js';
import { completaSentiero } from '../src/lib/sentiero.js';
import { recordDaSentiero } from '../src/lib/archivio.js';

const oggi = new Date().toISOString().slice(0, 10);
const tracce = new Map(JSON.parse(readFileSync('src/tracceIniziali.json', 'utf8')).map((t) => [t.sentieroId, t]));

function attivitaIniziali(s) {
  const limitato = ['guida', 'numero_chiuso', 'chiusure_periodiche'].includes(s.accesso?.tipo);
  const trekking = limitato
    ? { stato: 'con_limitazioni', motivi: [s.accesso.nota].filter(Boolean) }
    : s.codici?.length
      ? { stato: 'consentito', motivi: ['Sentiero segnato del Parco o del CAI'] }
      : { stato: 'da_verificare', motivi: ['Percorso descritto da una fonte, senza codice ufficiale'] };
  // la bici va valutata a parte (regole del parco e caratteristiche del sentiero)
  const bici = s.bici?.consentita === 'no' ? { stato: 'non_percorribile', motivi: ['Bici vietata (dato del sentiero)'] } : { stato: 'da_verificare', motivi: [] };
  return { trekking, mtb: bici, emtb: { ...bici } };
}

const percorsi = DATI_INIZIALI.map((originale) => {
  const s = recordDaSentiero(completaSentiero(originale));
  delete s.aggiunto;
  const e = s.escursione ?? {};
  const t = tracce.get(s.id);
  return {
    ...s,
    parchi: [s.parco],
    attivita: attivitaIniziali(s),
    // percorso di osservazione: ha animali associati (dalle uscite o dall'elenco iniziale)
    osservazione: (s.animali ?? []).length > 0,
    organizzatori: e.associazione ? [e.associazione] : [],
    fonti: e.url ? [{ url: e.url, titolo: e.fonte || e.nomeUscita || 'Fonte', visto: oggi }] : [],
    verifica: { stato: s.daVerificare ? 'da_verificare' : 'verificato', ultimoControllo: oggi },
    attivo: true,
    ...(t ? { traccia: { origine: t.origine, geojson: t.geojson, dettagli: t.dettagli } } : {}),
  };
});

const archivio = { app: 'orme-archivio', versione: 1, aggiornato: new Date().toISOString(), percorsi };
writeFileSync('public/dati/archivio.json', JSON.stringify(archivio));
console.log(`archivio: ${percorsi.length} percorsi, ${percorsi.filter((p) => p.traccia).length} con traccia, ${percorsi.filter((p) => p.osservazione).length} di osservazione`);
