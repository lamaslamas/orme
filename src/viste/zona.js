// Percorsi di una zona fuori dai parchi (il motore di "Intorno a me", ora usato dalla mappa):
// percorsi segnati e reti di sentieri delle aree protette da OpenStreetMap, rifugi e acqua, poi con
// calma dislivelli (Open-Meteo) e fauna (GBIF). Si tiene una zona alla volta, sul telefono.
import { tuttiISentieri, tutteLeTracce, leggiIntorno, salvaIntorno, aggiornaCalcolati, salvaPuntiIntorno, leggiPuntiIntorno } from '../db.js';
import { ID_INTORNO } from '../datiParchi.js';
import { interrogaOverpass } from '../lib/overpass.js';
import { quoteDellaTraccia } from '../lib/riassunto.js';
import { improntaTraccia } from '../lib/panorama.js';
import { lunghezzaKm } from '../lib/geo.js';
import { queryPuntiParco, puntiDallaRisposta } from '../lib/puntiUtili.js';
import { interpretaGbif } from '../lib/gbif.js';
import { faunaDalleOsservazioni } from '../lib/faunaPercorso.js';
import {
  queryIntorno,
  percorsiIntorno,
  puntiPerLeQuote,
  urlQuote,
  leggiQuote,
  profiloIntorno,
  riquadroIntorno,
  urlFaunaIntorno,
  PAGINE_GBIF_MAX,
  faunaDaRicalcolare,
  VERSIONE_RICERCA,
  retiAreeProtette,
  senzaAree,
} from '../lib/intorno.js';
import { sentieriConNome } from '../lib/sentieriConNome.js';
import { dimenticaPunti } from './puntiUtili.js';
import { respira, aspettaQuiete } from '../lib/lavoro.js';
import { profiloDaTerrain } from './quote.js';

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

// avanzamento(testo): messaggi brevi per chi aspetta; chiusa(): true se la schermata non c'è più
export async function scaricaZona(centro, raggio, { avanzamento = () => {}, chiusa = () => false, segnale = null } = {}) {
  avanzamento(`Cerco i percorsi entro ${raggio} km…`);
  // Overpass a volte è occupato: un secondo tentativo dopo qualche secondo
  let json;
  try {
    json = await interrogaOverpass(queryIntorno(centro, raggio), { timeoutMs: 120000, segnale });
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    if (chiusa()) return null;
    avanzamento('OpenStreetMap è occupato, riprovo…');
    await attendi(5000);
    json = await interrogaOverpass(queryIntorno(centro, raggio), { timeoutMs: 120000, segnale });
  }
  const esistenti = new Set((await tuttiISentieri()).filter((s) => s.parco !== ID_INTORNO).map((s) => s.id));
  // nella stessa risposta anche i sentieri non segnati delle aree protette
  const reti = retiAreeProtette(json, centro, raggio);
  // e i sentieri con nome che non sono un itinerario segnato (≥ 1 km, nomi da sentiero)
  const conNome = sentieriConNome(senzaAree(json), { esistenti });
  const percorsi = [...percorsiIntorno(json, centro, raggio, { esistenti }), ...reti, ...conNome];
  await salvaIntorno({ centro, raggioKm: raggio, versione: VERSIONE_RICERCA, percorsi });
  if (!chiusa()) await scaricaPunti(centro, raggio, { avanzamento, chiusa });
  return percorsi.length;
}

// Rifugi, bivacchi e acqua della zona: servono alla scheda del sentiero e alla mappa
async function scaricaPunti(centro, km, { avanzamento, chiusa }) {
  const query = queryPuntiParco({ bbox: riquadroIntorno(centro, km) });
  for (let tentativo = 1; tentativo <= 2 && !chiusa(); tentativo++) {
    try {
      avanzamento('Cerco rifugi e acqua…');
      await salvaPuntiIntorno(puntiDallaRisposta(await interrogaOverpass(query, { timeoutMs: 90000 })));
      dimenticaPunti();
      return;
    } catch (e) {
      console.warn('Rifugi e acqua non scaricati', e); // restano quelli di prima; si riprova
      await attendi(5000);
    }
  }
}

// Dopo lo scaricamento: dislivelli e fauna, uno dopo l'altro (servizi gratuiti, con calma).
// true se ha calcolato qualcosa (la mappa può ridisegnarsi)
export async function completaZona({ avanzamento = () => {}, chiusa = () => false } = {}) {
  const zona = await leggiIntorno();
  if (!zona) return false;
  if (!(await leggiPuntiIntorno()).length) await scaricaPunti(zona.centro, zona.raggioKm, { avanzamento, chiusa });
  const quote = await calcolaQuote({ avanzamento, chiusa });
  const fauna = chiusa() ? false : await calcolaFauna(zona, { avanzamento, chiusa });
  avanzamento('');
  return quote || fauna;
}

async function calcolaQuote({ avanzamento, chiusa }) {
  const [tutti, tracce] = await Promise.all([tuttiISentieri(), tutteLeTracce()]);
  // le reti di sentieri non hanno un giro: niente profilo
  const daFare = tutti.filter((s) => s.parco === ID_INTORNO && !s.scaricato && s.tipoPercorso !== 'rete_sentieri' && tracce.get(s.id)?.geojson && !['terrain', 'tinitaly'].includes(quoteDellaTraccia(s, tracce.get(s.id))?.fonte));
  // (anche quelli con le quote di Open-Meteo: si rifanno una volta con le Terrain Tiles)
  let fatti = 0;
  for (const s of daFare) {
    if (chiusa()) break;
    // un percorso alla volta, e non mentre si tocca o si sposta la mappa
    await respira();
    await aspettaQuiete();
    avanzamento(`Calcolo i dislivelli… ${fatti + 1} di ${daFare.length}`);
    const g = tracce.get(s.id).geojson;
    // prima le Terrain Tiles (~30 m, come il disegno e le schede); Open-Meteo solo se non rispondono
    const daTerrain = await profiloDaTerrain(g);
    if (daTerrain) {
      await aggiornaCalcolati(s.id, { quote: { ...daTerrain, impronta: improntaTraccia(g).split('-')[1], fonte: 'terrain' } });
      fatti++;
      continue;
    }
    const memoria = new Map();
    try {
      for (const { url, punti } of urlQuote(puntiPerLeQuote(g))) {
        let r = await fetch(url);
        if (r.status === 429) {
          // limite gratuito al minuto: si aspetta e si riprova una volta
          avanzamento('Dislivelli: pausa di un minuto (limite del servizio gratuito)');
          await attendi(65_000);
          if (chiusa()) return fatti > 0;
          r = await fetch(url);
        }
        if (!r.ok) throw new Error(`risposta ${r.status}`);
        leggiQuote(await r.json(), punti, memoria);
        await attendi(150); // con calma: Open-Meteo è gratuito
      }
      const profilo = profiloIntorno(g, memoria);
      if (profilo) await aggiornaCalcolati(s.id, { quote: profilo });
    } catch (e) {
      console.warn('Quote non calcolate', s.id, e);
      break; // si riprova alla prossima volta
    }
    fatti++;
  }
  return fatti > 0;
}

// Osservazioni GBIF di una zona, solo i campi che servono (dell'osservatore resta un codice anonimo).
// null se GBIF non risponde o la schermata si è chiusa (si riprova la prossima volta)
export async function osservazioniDellaZona(centro, km, { chiusa = () => false } = {}) {
  const osservazioni = [];
  try {
    for (let pagina = 0; pagina < PAGINE_GBIF_MAX; pagina++) {
      const r = await fetch(urlFaunaIntorno(centro, km, pagina));
      if (!r.ok) throw new Error(`GBIF ha risposto ${r.status}`);
      const json = await r.json();
      for (const o of interpretaGbif(json)) osservazioni.push({ animale: o.animale, lat: o.lat, lon: o.lon, sfumata: o.sfumata, osservatore: o.osservatore, data: o.data });
      if (chiusa()) return null;
      await aspettaQuiete();
      if (json.endOfRecords || !json.results?.length) break;
      await attendi(300); // con calma: GBIF è gratuito
    }
  } catch (e) {
    console.warn('Fauna non calcolata', e);
    return null;
  }
  return osservazioni;
}

// fauna di un percorso dalle osservazioni (lo stesso calcolo dei parchi)
export const faunaDelPercorso = (osservazioni, g, oggi = new Date().toISOString().slice(0, 10)) => ({
  specie: faunaDalleOsservazioni(osservazioni, g),
  calcolato: oggi,
  impronta: improntaTraccia(g).split('-')[1],
  km: Math.round(lunghezzaKm(g) * 10) / 10,
});

// Fauna: le osservazioni GBIF della zona, poi lo stesso calcolo dei parchi per ogni percorso
async function calcolaFauna(zona, { avanzamento, chiusa }) {
  const [tutti, tracce] = await Promise.all([tuttiISentieri(), tutteLeTracce()]);
  const daFare = tutti.filter((s) => s.parco === ID_INTORNO && !s.scaricato && tracce.get(s.id)?.geojson && faunaDaRicalcolare(s, tracce.get(s.id).geojson));
  if (!daFare.length) return false;
  avanzamento('Cerco la fauna osservata nella zona…');
  const osservazioni = await osservazioniDellaZona(zona.centro, zona.raggioKm, { chiusa });
  if (!osservazioni) return false;
  const oggi = new Date().toISOString().slice(0, 10);
  for (const s of daFare) {
    await respira();
    await aspettaQuiete();
    const g = tracce.get(s.id).geojson;
    await aggiornaCalcolati(s.id, { faunaInat: faunaDelPercorso(osservazioni, g, oggi) });
  }
  return true;
}
