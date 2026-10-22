// Sentieri escursionistici segnati su OpenStreetMap (route=hiking: CAI, Parco, Sentiero Italia)
// dentro un parco: danno a ogni parco percorsi di trekking con traccia.
// Dati © OpenStreetMap, licenza ODbL: la geometria si può salvare citando la fonte.
import { dentroIlParco, interpretaRisposta, combinaTraccia } from '../overpass.js';
import { lunghezzaKm } from '../geo.js';
import { parcoDa } from '../../datiParchi.js';
import { ritagliaESemplifica, parteDi } from './osmMtb.js';
import { ritagliaSulConfine, quotaDentroIlConfine, semplifica } from '../confini.js';

export const OSM_SENTIERI = { fonte: 'osm-sentieri', parchi: ['pollino', 'foreste-casentinesi', 'appennino-lucano', 'pnalm', 'gallipoli-cognato', 'majella', 'gravine'] };
export const OSM_NOMI = { fonte: 'osm-nomi', parchi: ['gravine'] };

export function querySentieriParco(idParco) {
  const { prima, filtro } = dentroIlParco(parcoDa(idParco));
  return `[out:json][timeout:180];
${prima}rel["route"="hiking"]${filtro};
out geom;
way(r);
out tags;`;
}

const DIFFICOLTA_CAI = ['T', 'E', 'EE', 'EEA'];

// Vie ferrate: su OSM sono spesso route=hiking, ma non sono sentieri qualunque
export function eViaFerrata(tagRelazione = {}, tagTratti = []) {
  if (/via ferrata|ferrata/i.test(`${tagRelazione.name ?? ''} ${tagRelazione.route ?? ''}`)) return true;
  if (tagRelazione.via_ferrata_scale != null) return true;
  return tagTratti.some((t) => t.highway === 'via_ferrata' || t.via_ferrata_scale != null);
}
const MOTIVO_FERRATA = 'Via ferrata: servono imbrago, set da ferrata, casco ed esperienza';
const MINIMO_KM = 0.5;

// Ritaglio sul confine vero (parchi con `ritaglio: { margineM, minimoDentro }`, come Terra delle Gravine, dove gli itinerari
// lunghi attraversano il parco per un tratto): si tengono solo quelli con almeno `minimoDentro` della lunghezza dentro il
// confine, ritagliati sul confine con un margine, semplificati e arrotondati a 5 decimali (circa 1 m)
export function ritagliaNelParco(linee, anelli, { margineM = 200, minimoDentro = 0 } = {}) {
  if (quotaDentroIlConfine(linee, anelli) < minimoDentro) return null;
  const r = ritagliaSulConfine(linee, anelli, margineM);
  const arrotonda = (l) => l.map(([lon, lat]) => [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5]);
  const parti = r.parti.map((p) => p.map((l) => arrotonda(semplifica(l, 0.00008))).filter((l) => l.length > 1)).filter((p) => p.length);
  return { linee: parti.flat(), parti, ritagliata: r.ritagliata };
}
export const SUFFISSO_TRATTO = ' · tratto nel parco';

// area: il parco, oppure una zona con il suo riquadro (es. "Intorno a me")
// anelli: il confine del parco, per i parchi con `ritaglio`
export function candidatiSentieri(json, idParco, parco = parcoDa(idParco), { anelli = null } = {}) {
  const tag = new Map((json?.elements ?? []).filter((e) => e.type === 'relation').map((e) => [e.id, e.tags ?? {}]));
  // tag dei tratti di ogni relazione (per riconoscere le vie ferrate)
  const tagWay = new Map((json?.elements ?? []).filter((e) => e.type === 'way').map((e) => [e.id, e.tags ?? {}]));
  const tagTratti = new Map(
    (json?.elements ?? [])
      .filter((e) => e.type === 'relation')
      .map((e) => [e.id, (e.members ?? []).filter((m) => m.type === 'way').map((m) => tagWay.get(m.ref)).filter(Boolean)]),
  );
  const candidati = [];
  const viste = new Set();
  for (const c of interpretaRisposta(json)) {
    const t = tag.get(c.idOsm) ?? {};
    const sulConfine = parco.ritaglio && anelli?.length ? ritagliaNelParco(c.linee, anelli, parco.ritaglio) : null;
    if (parco.ritaglio && anelli?.length && !sulConfine) continue; // passa appena dal parco
    const grezzo = sulConfine ?? ritagliaESemplifica(c.linee, parco.bbox);
    const ritagliata = grezzo.ritagliata;
    // un itinerario che esce a lungo dall'area si divide in più parti: ognuna è un percorso a sé
    const parti = grezzo.parti
      .map((linee) => {
        const traccia = combinaTraccia([{ ...c, linee }]);
        return { linee, traccia, km: Math.round(lunghezzaKm(traccia.geojson) * 10) / 10 };
      })
      .filter((x) => x.km >= MINIMO_KM);
    for (const [k, { linee, traccia, km }] of parti.entries()) {
      const { numero, id: sfx, ancora } = parteDi(k, parti.length);
      const impronta = JSON.stringify(linee);
      if (viste.has(impronta)) continue;
      viste.add(impronta);
      const url = `https://www.openstreetmap.org/relation/${c.idOsm}${ancora}`;
      const ref = (t.ref ?? '').trim();
      // "SI" da solo indica il Sentiero Italia, non un numero di sentiero
      const codici = ref && ref.toUpperCase() !== 'SI' ? [ref] : [];
      // roundtrip=yes: la relazione stessa dice che è un anello (niente andata e ritorno)
      traccia.dettagli = { ...traccia.dettagli, codici, fonte: url, ...(ritagliata ? { ritagliata: true } : {}), ...(t.roundtrip === 'yes' ? { roundtrip: true } : {}) };
      const zona = [t.from, t.to].filter(Boolean).join(' – ');
      const nomeBase = t.name || (ref.toUpperCase().startsWith('SI') ? `Sentiero Italia CAI${zona ? `: ${zona}` : ''}` : `Sentiero ${ref || c.idOsm}${zona ? `: ${zona}` : ''}`);
      const nome = sulConfine ? `${nomeBase}${SUFFISSO_TRATTO}${numero}` : numero ? `${nomeBase} · tratto${numero}` : nomeBase;
      const ferrata = eViaFerrata(t, tagTratti.get(c.idOsm) ?? []);
      const difficolta = ferrata ? 'EEA' : DIFFICOLTA_CAI.includes((t.cai_scale ?? '').toUpperCase()) ? t.cai_scale.toUpperCase() : null;
      candidati.push({
        fonte: `${OSM_SENTIERI.fonte}:${idParco}`,
        tipo: 'sentiero',
        chiave: `${idParco}:${c.idOsm}${sfx}`,
        id: `osm-sentiero-${c.idOsm}${sfx}`,
        idOsm: c.idOsm,
        url,
        nome,
        zona,
        codici,
        difficolta,
        organizzatore: t.operator ?? '',
        titoloFonte: 'OpenStreetMap (ODbL)',
        parco: idParco,
        descrizione: [t.description, ritagliata ? `Sentiero più lungo: qui c'è solo il tratto ${parco.zona ? 'nella zona' : sulConfine ? 'nel parco, con 200 m di margine' : 'nel parco e nei dintorni'}.` : ''].filter(Boolean).join(' ').slice(0, 280),
        animali: [],
        lunghezzaKm: km,
        // percorribile a piedi perché segnato; la bici resta da valutare (regole del parco e terreno)
        attivita: {
          trekking: ferrata
            ? { stato: 'con_limitazioni', motivi: [MOTIVO_FERRATA] }
            : { stato: 'percorribile', motivi: ['Sentiero segnato su OpenStreetMap (CAI, Parco o Sentiero Italia)'] },
        },
        traccia,
      });
    }
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
