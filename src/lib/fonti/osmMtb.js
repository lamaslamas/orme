// Itinerari MTB segnati su OpenStreetMap (route=mtb, o route=bicycle della rete MTB) dentro un parco.
// Dati © OpenStreetMap, licenza ODbL: la geometria si può salvare citando la fonte.
import { areaDaRelazione, interpretaRisposta, combinaTraccia } from '../overpass.js';
import { lunghezzaKm } from '../geo.js';
import { semplifica } from '../confini.js';
import { parcoDa } from '../../datiParchi.js';

export const OSM_MTB = { fonte: 'osm-mtb' };

export function queryMtbParco(idParco) {
  const parco = parcoDa(idParco);
  return `[out:json][timeout:180];
area(id:${areaDaRelazione(parco.osm.relazione)})->.parco;
(
  rel["route"="mtb"](area.parco);
  rel["route"="bicycle"]["network"~"mtb",i](area.parco);
  rel["route"="bicycle"]["mtb"="yes"](area.parco);
);
out geom;
way(r);
out tags;`;
}

// Tolleranza della semplificazione (circa 4 m) e margine attorno al parco (circa 2 km)
const TOLLERANZA = 0.00004;
const MARGINE = 0.02;
const MINIMO_KM = 1;

// Tiene solo i tratti dentro il riquadro del parco (più un margine): gli itinerari lunghi
// che lo attraversano restano leggeri. Poi semplifica e arrotonda a 5 decimali (circa 1 m).
export function ritagliaESemplifica(linee, [s, o, n, e], margine = MARGINE) {
  const dentro = ([lon, lat]) => lat >= s - margine && lat <= n + margine && lon >= o - margine && lon <= e + margine;
  let ritagliata = false;
  const pezzi = [];
  for (const linea of linee) {
    let attuale = [];
    for (const p of linea) {
      if (dentro(p)) attuale.push(p);
      else {
        ritagliata = true;
        if (attuale.length > 1) pezzi.push(attuale);
        attuale = [];
      }
    }
    if (attuale.length > 1) pezzi.push(attuale);
  }
  const arrotonda = (l) => l.map(([lon, lat]) => [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5]);
  return { linee: pezzi.map((l) => arrotonda(semplifica(l, TOLLERANZA))).filter((l) => l.length > 1), ritagliata };
}

export function candidatiMtb(json, idParco) {
  const parco = parcoDa(idParco);
  const tag = new Map((json?.elements ?? []).filter((e) => e.type === 'relation').map((e) => [e.id, e.tags ?? {}]));
  const candidati = [];
  const geometrieViste = new Set();
  for (const c of interpretaRisposta(json)) {
    const t = tag.get(c.idOsm) ?? {};
    const { linee, ritagliata } = ritagliaESemplifica(c.linee, parco.bbox);
    const traccia = combinaTraccia([{ ...c, linee }]);
    const km = Math.round(lunghezzaKm(traccia.geojson) * 10) / 10;
    if (km < MINIMO_KM) continue; // passa appena dal bordo del parco
    // la stessa geometria in due relazioni (es. tappa e itinerario completo) si tiene una volta
    const impronta = JSON.stringify(linee);
    if (geometrieViste.has(impronta)) continue;
    geometrieViste.add(impronta);
    const url = `https://www.openstreetmap.org/relation/${c.idOsm}`;
    traccia.dettagli = { ...traccia.dettagli, codici: [], fonte: url, ...(ritagliata ? { ritagliata: true } : {}) };
    const rif = t.ref ? `MTB ${t.ref}` : 'MTB';
    const zona = [t.from, t.to].filter(Boolean).join(' – ');
    const nome = t.name ? (/\bmtb\b/i.test(t.name) && !t.ref ? t.name : `${t.name} (${rif})`) : `Itinerario ${rif}`;
    const descrizione = [t.description, ritagliata ? "Itinerario più lungo: qui c'è solo il tratto nel parco e nei dintorni." : '']
      .filter(Boolean)
      .join(' ')
      .slice(0, 280);
    candidati.push({
      // una fonte per parco: se un parco oggi non risponde, gli altri si aggiornano lo stesso
      fonte: `${OSM_MTB.fonte}:${idParco}`,
      tipo: 'itinerario_mtb',
      chiave: `${idParco}:${c.idOsm}`,
      id: `osm-mtb-${c.idOsm}`,
      url,
      nome,
      zona,
      // codici vuoti: i numeri della rete MTB non sono codici dei sentieri escursionistici
      codici: [],
      organizzatore: t.operator ?? '',
      titoloFonte: 'OpenStreetMap (ODbL)',
      parco: idParco,
      descrizione,
      animali: [],
      lunghezzaKm: km,
      attivita: {
        trekking: { stato: 'da_verificare', motivi: ['Itinerario per bici: a piedi va verificato'] },
        mtb: { stato: 'percorribile', motivi: ['Itinerario MTB segnato su OpenStreetMap: verifica sempre le regole del Parco'] },
        emtb: { stato: 'da_verificare', motivi: ['Regole per le bici elettriche non documentate'] },
      },
      traccia,
    });
  }
  // nomi uguali (es. le tappe del Sentiero Italia in bici): si distinguono con partenza e arrivo
  const conteggio = new Map();
  for (const c of candidati) conteggio.set(c.nome, (conteggio.get(c.nome) ?? 0) + 1);
  const numero = new Map();
  for (const c of candidati) {
    if (conteggio.get(c.nome) < 2) continue;
    const n = (numero.get(c.nome) ?? 0) + 1;
    numero.set(c.nome, n);
    c.nome = `${c.nome} · ${c.zona || `tratto ${n}`}`;
  }
  return candidati;
}
