// Sentieri escursionistici segnati su OpenStreetMap (route=hiking: CAI, Parco, Sentiero Italia)
// dentro un parco: danno a ogni parco percorsi di trekking con traccia.
// Dati © OpenStreetMap, licenza ODbL: la geometria si può salvare citando la fonte.
import { dentroIlParco, interpretaRisposta, combinaTraccia } from '../overpass.js';
import { lunghezzaKm } from '../geo.js';
import { parcoDa } from '../../datiParchi.js';
import { ritagliaESemplifica } from './osmMtb.js';

export const OSM_SENTIERI = { fonte: 'osm-sentieri', parchi: ['pollino', 'foreste-casentinesi', 'appennino-lucano', 'pnalm'] };

export function querySentieriParco(idParco) {
  const { prima, filtro } = dentroIlParco(parcoDa(idParco));
  return `[out:json][timeout:180];
${prima}rel["route"="hiking"]${filtro};
out geom;
way(r);
out tags;`;
}

const DIFFICOLTA_CAI = ['T', 'E', 'EE', 'EEA'];
const MINIMO_KM = 0.5;

export function candidatiSentieri(json, idParco) {
  const parco = parcoDa(idParco);
  const tag = new Map((json?.elements ?? []).filter((e) => e.type === 'relation').map((e) => [e.id, e.tags ?? {}]));
  const candidati = [];
  const viste = new Set();
  for (const c of interpretaRisposta(json)) {
    const t = tag.get(c.idOsm) ?? {};
    const { linee, ritagliata } = ritagliaESemplifica(c.linee, parco.bbox);
    const traccia = combinaTraccia([{ ...c, linee }]);
    const km = Math.round(lunghezzaKm(traccia.geojson) * 10) / 10;
    if (km < MINIMO_KM) continue;
    const impronta = JSON.stringify(linee);
    if (viste.has(impronta)) continue;
    viste.add(impronta);
    const url = `https://www.openstreetmap.org/relation/${c.idOsm}`;
    const ref = (t.ref ?? '').trim();
    // "SI" da solo indica il Sentiero Italia, non un numero di sentiero
    const codici = ref && ref.toUpperCase() !== 'SI' ? [ref] : [];
    traccia.dettagli = { ...traccia.dettagli, codici, fonte: url, ...(ritagliata ? { ritagliata: true } : {}) };
    const zona = [t.from, t.to].filter(Boolean).join(' – ');
    const nome = t.name || (ref.toUpperCase().startsWith('SI') ? `Sentiero Italia CAI${zona ? `: ${zona}` : ''}` : `Sentiero ${ref || c.idOsm}${zona ? `: ${zona}` : ''}`);
    const difficolta = DIFFICOLTA_CAI.includes((t.cai_scale ?? '').toUpperCase()) ? t.cai_scale.toUpperCase() : null;
    candidati.push({
      fonte: `${OSM_SENTIERI.fonte}:${idParco}`,
      tipo: 'sentiero',
      chiave: `${idParco}:${c.idOsm}`,
      id: `osm-sentiero-${c.idOsm}`,
      idOsm: c.idOsm,
      url,
      nome,
      zona,
      codici,
      difficolta,
      organizzatore: t.operator ?? '',
      titoloFonte: 'OpenStreetMap (ODbL)',
      parco: idParco,
      descrizione: [t.description, ritagliata ? "Sentiero più lungo: qui c'è solo il tratto nel parco e nei dintorni." : ''].filter(Boolean).join(' ').slice(0, 280),
      animali: [],
      lunghezzaKm: km,
      // percorribile a piedi perché segnato; la bici resta da valutare (regole del parco e terreno)
      attivita: { trekking: { stato: 'percorribile', motivi: ['Sentiero segnato su OpenStreetMap (CAI, Parco o Sentiero Italia)'] } },
      traccia,
    });
  }
  // nomi uguali: si distinguono con partenza e arrivo, o con il numero
  const conta = new Map();
  for (const c of candidati) conta.set(c.nome, (conta.get(c.nome) ?? 0) + 1);
  const numero = new Map();
  for (const c of candidati) {
    if (conta.get(c.nome) < 2) continue;
    const n = (numero.get(c.nome) ?? 0) + 1;
    numero.set(c.nome, n);
    // se partenza e arrivo sono già nel nome si usa il codice, altrimenti un numero
    const distintivo = c.zona && !c.nome.includes(c.zona) ? c.zona : c.codici[0] && !c.nome.includes(c.codici[0]) ? c.codici[0] : `tratto ${n}`;
    c.nome = `${c.nome} · ${distintivo}`;
  }
  // ultima garanzia: nessun nome uguale (relazioni doppie su OSM)
  const usati = new Map();
  for (const c of candidati) {
    const n = (usati.get(c.nome) ?? 0) + 1;
    usati.set(c.nome, n);
    if (n > 1) c.nome = `${c.nome} (${n})`;
  }
  return candidati;
}
