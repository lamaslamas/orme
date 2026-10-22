// Itinerari MTB segnati su OpenStreetMap (route=mtb, o route=bicycle della rete MTB) dentro un parco.
// Dati © OpenStreetMap, licenza ODbL: la geometria si può salvare citando la fonte.
import { dentroIlParco, interpretaRisposta, combinaTraccia } from '../overpass.js';
import { lunghezzaKm } from '../geo.js';
import { semplifica, puntoNelPoligono, ritagliaCatena } from '../confini.js';
import { parcoDa } from '../../datiParchi.js';

export const OSM_MTB = { fonte: 'osm-mtb' };

export function queryMtbParco(idParco) {
  const parco = parcoDa(idParco);
  const { prima, filtro } = dentroIlParco(parco);
  return `[out:json][timeout:180];
${prima}(
  rel["route"="mtb"]${filtro};
  rel["route"="bicycle"]["network"~"mtb",i]${filtro};
  rel["route"="bicycle"]["mtb"="yes"]${filtro};
);
out geom;
way(r);
out tags;`;
}

// Tolleranza della semplificazione (circa 8 m: per seguire un sentiero basta) e margine attorno al parco (circa 2 km)
const TOLLERANZA = 0.00008;
const MARGINE = 0.02;
const MINIMO_KM = 1;

// Tiene solo i tratti dentro il riquadro del parco (più un margine): gli itinerari lunghi
// che lo attraversano restano leggeri. Poi semplifica e arrotonda a 5 decimali (circa 1 m).
export function ritagliaESemplifica(linee, [s, o, n, e], margine = MARGINE) {
  const dentro = ([lon, lat]) => lat >= s - margine && lat <= n + margine && lon >= o - margine && lon <= e + margine;
  const r = ritagliaCatena(linee, dentro);
  const arrotonda = (l) => l.map(([lon, lat]) => [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5]);
  const parti = r.parti.map((p) => p.map((l) => arrotonda(semplifica(l, TOLLERANZA))).filter((l) => l.length > 1)).filter((p) => p.length);
  return { linee: parti.flat(), parti, ritagliata: r.ritagliata };
}

// Nome, id, chiave e indirizzo di una parte quando l'itinerario si divide in più parti (la prima resta com'era;
// l'indirizzo cambia con un'àncora, così ogni parte è un percorso a sé)
export const parteDi = (k, quante) => ({ numero: quante > 1 ? ` ${k + 1}` : '', id: k ? `-${k + 1}` : '', ancora: k ? `#parte-${k + 1}` : '' });

// area: il parco, oppure una zona con il suo riquadro (es. "Intorno a me")
// cicloturistici: itinerari ciclabili qualsiasi (route=bicycle), non solo quelli MTB: su strade e
// sterrate, segnati per le bici. Sono "itinerari per bici" come gli MTB (visibili in MTB).
export function candidatiMtb(json, idParco, parco = parcoDa(idParco), { cicloturistici = false } = {}) {
  const tag = new Map((json?.elements ?? []).filter((e) => e.type === 'relation').map((e) => [e.id, e.tags ?? {}]));
  const candidati = [];
  const geometrieViste = new Set();
  for (const c of interpretaRisposta(json)) {
    const t = tag.get(c.idOsm) ?? {};
    const grezzo = ritagliaESemplifica(c.linee, parco.bbox);
    const ritagliata = grezzo.ritagliata;
    // un itinerario che esce a lungo dal parco si divide in più parti: ognuna è un percorso a sé
    const parti = grezzo.parti
      .map((linee) => {
        const traccia = combinaTraccia([{ ...c, linee }]);
        return { linee, traccia, km: Math.round(lunghezzaKm(traccia.geojson) * 10) / 10 };
      })
      .filter((x) => x.km >= MINIMO_KM); // le parti che passano appena dal bordo del parco si scartano
    for (const [k, { linee, traccia, km }] of parti.entries()) {
      const { numero, id: sfx, ancora } = parteDi(k, parti.length);
      // la stessa geometria in due relazioni (es. tappa e itinerario completo) si tiene una volta
      const impronta = JSON.stringify(linee);
      if (geometrieViste.has(impronta)) continue;
      geometrieViste.add(impronta);
      const url = `https://www.openstreetmap.org/relation/${c.idOsm}${ancora}`;
      traccia.dettagli = { ...traccia.dettagli, codici: [], fonte: url, ...(ritagliata ? { ritagliata: true } : {}), ...(t.roundtrip === 'yes' ? { roundtrip: true } : {}) };
      const mtb = !cicloturistici || t.route === 'mtb' || /mtb/i.test(t.network ?? '') || t.mtb === 'yes';
      const rif = t.ref ? `${mtb ? 'MTB ' : ''}${t.ref}` : mtb ? 'MTB' : '';
      const zona = [t.from, t.to].filter(Boolean).join(' – ');
      const nomeBase = mtb
        ? t.name ? (/\bmtb\b/i.test(t.name) && !t.ref ? t.name : `${t.name} (${rif})`) : `Itinerario ${rif}`
        : t.name ? (rif && !t.name.includes(rif) ? `${t.name} (${rif})` : t.name) : `Itinerario ciclabile${rif ? ` ${rif}` : zona ? `: ${zona}` : ''}`;
      const nome = numero ? `${nomeBase} · tratto${numero}` : nomeBase;
      const descrizione = [t.description, ritagliata ? `Itinerario più lungo: qui c'è solo il tratto ${parco.zona ? 'nella zona' : 'nel parco e nei dintorni'}.` : '']
        .filter(Boolean)
        .join(' ')
        .slice(0, 280);
      candidati.push({
        // una fonte per parco: se un parco oggi non risponde, gli altri si aggiornano lo stesso
        fonte: `${OSM_MTB.fonte}:${idParco}`,
        // gli itinerari ciclabili si fanno anche a piedi: non sono "solo bici" come gli MTB
        tipo: mtb ? 'itinerario_mtb' : 'itinerario_bici',
        chiave: `${idParco}:${c.idOsm}${sfx}`,
        id: `osm-mtb-${c.idOsm}${sfx}`,
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
          trekking: mtb
            ? { stato: 'da_verificare', motivi: ['Itinerario per bici: a piedi va verificato'] }
            : { stato: 'percorribile', motivi: ['Itinerario segnato su OpenStreetMap, su strade secondarie e sterrate'] },
          mtb: mtb
            ? { stato: 'percorribile', motivi: ['Itinerario MTB segnato su OpenStreetMap: verifica sempre le regole del Parco'] }
            : { stato: 'percorribile', motivi: ['Itinerario ciclabile segnato su OpenStreetMap: spesso su strade secondarie e sterrate'] },
        },
        traccia,
      });
    }
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

// Per i parchi cercati con il riquadro (es. Pollino): restano solo gli itinerari
// che passano davvero dentro il confine. anelli: [[lon, lat]] come in confini.js
export function soloDentroIlConfine(candidati, anelli) {
  if (!anelli?.length) return candidati;
  return candidati.filter((c) => c.traccia.geojson.coordinates.some((linea) => linea.some((p) => puntoNelPoligono(p, anelli))));
}
