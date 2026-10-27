// Ciò che le mappe della Fauna (Leaflet e MapLibre) hanno in comune: le osservazioni di tutte le fonti già filtrate
// (src/lib/filtroFauna.js), i gruppi di icone, il fumetto di un gruppo e i nomi italiani delle specie.
import { ANIMALI } from '../lib/costanti.js';
import { urlOsservazioniGbif, interpretaGbif, iconaPerOsservazione } from '../lib/gbif.js';
import { conMinacciate, taxaDeiGruppi } from '../lib/gruppiFauna.js';
import { urlNomeItaliano, nomeItalianoDaRisposta } from '../lib/specieZona.js';
import { htmlNascondi } from './nascondiSpecie.js';
import { filtraOsservazioni } from '../lib/filtroFauna.js';
import { escapeHtml } from '../lib/formato.js';
import { urlOsservazioni, interpretaOsservazioni } from '../lib/inaturalist.js';

const intorno = true; // stesse icone, fonti e regole ovunque

// nessun gruppo scelto (e nessun animale): niente heatmap, non una heatmap piena
export const senzaGruppi = (f) => f.specie === 'notevoli' && !f.taxon && !f.gruppi?.length;

// Nome italiano delle specie fuori dalla lista (da iNaturalist, una volta sola per specie)
// (la stessa memoria di Suggerisci: orme.nomiSpecie)
export const NOMI_IT = new Map(Object.entries(leggiNomiSalvati()));
function leggiNomiSalvati() {
  try {
    return JSON.parse(localStorage.getItem('orme.nomiSpecie') ?? '{}');
  } catch {
    return {};
  }
}
function salvaNomi() {
  try {
    localStorage.setItem('orme.nomiSpecie', JSON.stringify(Object.fromEntries(NOMI_IT)));
  } catch {
    // senza memoria si richiedono alla prossima visita
  }
}
export function nomeGruppo(g) {
  return g.animale ? ANIMALI[g.animale] : NOMI_IT.get(g.scientifico) || (g.nome !== g.scientifico ? g.nome : '') || g.scientifico;
}
export async function cercaNomeItaliano(scientifico) {
  if (!scientifico || NOMI_IT.has(scientifico)) return NOMI_IT.get(scientifico);
  NOMI_IT.set(scientifico, '');
  try {
    const r = await fetch(urlNomeItaliano(scientifico));
    NOMI_IT.set(scientifico, nomeItalianoDaRisposta(await r.json(), scientifico) ?? '');
    salvaNomi();
  } catch {
    // resta il nome scientifico (si riprova alla prossima visita)
    NOMI_IT.delete(scientifico);
  }
  return NOMI_IT.get(scientifico);
}


// Le osservazioni nel riquadro [sud, ovest, nord, est] da tutte le fonti, già filtrate: stesso filtro per icone, conteggio ed elenco
export async function cercaOsservazioniFauna(riquadro, limite, segnale, filtri) {
  if (senzaGruppi(filtri)) return { totale: 0, osservazioni: [] };
  const extra = filtri.specie === 'notevoli' && !filtri.taxon && conMinacciate(filtri) && taxaDeiGruppi(filtri, 'gbif').length;
  const gbif = [filtri, ...(extra ? [{ ...filtri, specie: 'minacciate' }] : [])];
  const inat = intorno ? [filtri, ...(extra ? [{ ...filtri, gruppi: ['rare'] }] : [])] : [];
  const prendi = async (url, fonte) => {
    const r = await fetch(url, { signal: segnale });
    if (!r.ok) throw new Error(`${fonte} ha risposto ${r.status}`);
    return r.json();
  };
  const [rGbif, rInat] = await Promise.all([
    Promise.all(gbif.map((f) => prendi(urlOsservazioniGbif(riquadro, f, { limite }), 'GBIF'))),
    Promise.all(inat.map((f) => prendi(urlOsservazioni(riquadro, { ...f, soloVerificate: true }, { perPagina: Math.min(200, limite) }), 'iNaturalist'))),
  ]);
  const viste = new Set();
  const osservazioni = [
    ...rInat.flatMap((j) => interpretaOsservazioni(j)).map((o) => ({ ...o, id: `inat-${o.id}` })),
    // da GBIF le altre fonti (eBird, Observation.org…): quelle di iNaturalist ci sono già
    ...rGbif.flatMap((j) => interpretaGbif(j)).filter((o) => !intorno || o.fonte !== 'iNaturalist'),
  ]
    .filter((o) => o.lat != null && !viste.has(o.id) && viste.add(o.id))
    .sort((a, b) => String(b.data).localeCompare(String(a.data)));
  // lo stesso filtro per icone, conteggio ed elenco, da tutte le fonti (src/lib/filtroFauna.js)
  const ammesse = filtraOsservazioni(osservazioni, filtri);
  // il totale: in Intorno a me quelle di iNaturalist (dal suo conteggio) più quelle delle altre fonti
  // arrivate da GBIF; altrove il conteggio di GBIF. Non si contano due volte le stesse osservazioni.
  // il totale è quello delle osservazioni ammesse: i conteggi delle fonti includerebbero anche quelle escluse
  return { totale: ammesse.length, osservazioni: ammesse };
}

// Raggruppa le osservazioni in icone: una per specie in ogni cella di `lato` px; proietta(o) → { x, y } in pixel
export function raggruppaOsservazioni(oss, proietta, lato) {
  const gruppi = new Map();
  for (const o of oss) {
    const p = proietta(o);
    const specie = o.animale ?? o.nomeScientifico;
    const k = `${specie}|${o.sfumata ? 1 : 0}|${Math.floor(p.x / lato)}|${Math.floor(p.y / lato)}`;
    const g = gruppi.get(k) ?? { animale: o.animale, scientifico: o.nomeScientifico, nome: o.specie, icona: iconaPerOsservazione(o), sfumata: o.sfumata, oss: [] };
    // il nome italiano viene da iNaturalist (GBIF di solito ha solo quello scientifico)
    if (o.fonte === 'iNaturalist' && o.specie) g.nome = o.specie;
    g.oss.push(o);
    gruppi.set(k, g);
  }
  return [...gruppi.values()].map((g) => ({
    ...g,
    lat: g.oss.reduce((a, o) => a + o.lat, 0) / g.oss.length,
    lon: g.oss.reduce((a, o) => a + o.lon, 0) / g.oss.length,
    oss: g.oss.sort((a, b) => String(b.data).localeCompare(String(a.data))),
  }));
}

// Il fumetto di un gruppo di osservazioni
export function popupGruppoHtml(g) {
  const data = (o) => (o.data ? escapeHtml(o.data.split('-').reverse().join('/')) : 'data non indicata');
  const datiFoto = (o) =>
    escapeHtml(JSON.stringify({ url: o.foto.url.replace(/\/(square|small)\./, '/medium.'), autore: o.foto.attribuzione, licenza: o.foto.licenza ?? '', pagina: o.url, titolo: nomeGruppo(g) }));
  const link = (o) => `<a href="${escapeHtml(o.url)}" target="_blank" rel="noopener">${o.fonte === 'iNaturalist' ? 'su iNaturalist' : 'dettagli'} ↗</a>`;
  // la più recente con foto in evidenza (foto grande, autore, data e luogo): quasi sempre basta
  // questo, senza aprire siti esterni; le altre in breve, con una foto piccola se c'è
  const prima = g.oss.find((o) => o.foto) ?? g.oss[0];
  const altre = g.oss.filter((o) => o !== prima).slice(0, 4);
  const evidenza = `<div class="oss-evidenza">
      ${prima.foto ? `<button type="button" class="foto-oss grande" data-foto="${datiFoto(prima)}" aria-label="Apri la foto"><img src="${escapeHtml(prima.foto.url.replace(/\/square\./, '/small.'))}" alt="" loading="lazy" /></button>` : ''}
      <span>${data(prima)}${prima.luogo ? ` · ${escapeHtml(prima.luogo.slice(0, 60))}` : ''}</span>
      <span class="tenue piccolo">${escapeHtml(prima.fonte)}${prima.foto?.attribuzione ? ` · foto ${escapeHtml(prima.foto.attribuzione.replace(/^\(c\)\s*/i, '© ').slice(0, 60))}` : ''} · ${link(prima)}</span>
    </div>`;
  const righe = altre
    .map(
      (o) =>
        `<li>${o.foto ? `<button type="button" class="foto-oss" data-foto="${datiFoto(o)}" aria-label="Apri la foto"><img src="${escapeHtml(o.foto.url)}" alt="" width="44" height="44" loading="lazy" /></button>` : ''}<span>${data(o)} · ${escapeHtml(o.fonte)} · ${link(o)}</span></li>`,
    )
    .join('');
  return `<div class="popup-oss"><b>${escapeHtml(nomeGruppo(g))}</b>${g.animale || nomeGruppo(g) === g.scientifico ? '' : ` <i class="tenue">${escapeHtml(g.scientifico)}</i>`} · ${g.oss.length} ${g.oss.length === 1 ? 'osservazione' : 'osservazioni'}
    ${g.sfumata ? '<p class="tenue piccolo">Posizione approssimata dalla fonte: qui è solo la zona.</p>' : ''}
    ${evidenza}
    ${righe ? `<ul>${righe}</ul>` : ''}${g.oss.length > 5 ? `<p class="tenue piccolo">e altre ${g.oss.length - 5}</p>` : ''}
    <p>${htmlNascondi({ animale: g.animale ?? null, scientifico: g.scientifico ?? null, nome: nomeGruppo(g) })}</p></div>`;
}
