// Per gli avvisi dei parchi (disegno e "Crea un anello"): in quale parco cade un punto (confine, o
// riquadro se manca) e i nostri sentieri ad accesso regolato, con la traccia. Si preparano una volta.
import { tuttiISentieri, tutteLeTracce } from '../db.js';
import { ACCESSI_REGOLATI } from '../lib/avvisiParco.js';
import { puntoNelPoligono } from '../lib/confini.js';
import { PARCHI } from '../datiParchi.js';
import { caricaConfini } from './copertura.js';

let datiAvvisi = null;
export function preparaAvvisi() {
  datiAvvisi ??= Promise.all([caricaConfini(), tuttiISentieri(), tutteLeTracce()]).then(([confini, sentieri, tracce]) => {
    const parchi = PARCHI.filter((p) => !p.zona);
    const parcoDi = ([lon, lat]) =>
      parchi.find((p) => (lat >= p.bbox[0] && lat <= p.bbox[2] && lon >= p.bbox[1] && lon <= p.bbox[3] ? (confini[p.id]?.length ? puntoNelPoligono([lon, lat], confini[p.id]) : true) : false)) ?? null;
    const regolati = sentieri
      .filter((x) => ACCESSI_REGOLATI[x.accesso?.tipo] && tracce.get(x.id)?.geojson)
      .map((x) => ({ nome: [x.codici?.join(' + '), x.nome].filter(Boolean).join(' '), accesso: x.accesso.tipo, geojson: tracce.get(x.id).geojson }));
    return { parcoDi, regolati };
  });
  return datiAvvisi;
}
