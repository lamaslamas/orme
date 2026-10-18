// Il tratto con più fauna di un percorso mio (GPX, disegnato): non c'è un robot che lo calcola, quindi si ricava
// qui dalle osservazioni GBIF attorno alla traccia, per i gruppi scelti nel pannello Fauna (src/lib/trattoFauna.js).
import { urlOsservazioniGbif, interpretaGbif } from '../lib/gbif.js';
import { leggiGruppiSalvati } from '../lib/gruppiFauna.js';
import { GRUPPI_FAUNA } from '../lib/costanti.js';
import { riquadroTraccia } from '../lib/inaturalistTraccia.js';
import { trattiFauna, RAGGIO_TRATTO_M } from '../lib/trattoFauna.js';
import { lunghezzaDeiPezzi } from '../lib/lungoIlPercorso.js';

const PAGINE = 5;

// → { daKm, aKm, persone, specie } o null (traccia corta, rete assente, poche osservazioni)
export async function trattoDelMioPercorso(pezzi, { annullata = () => false } = {}) {
  if (!pezzi?.length || lunghezzaDeiPezzi(pezzi) < 3) return null;
  const gruppi = leggiGruppiSalvati().filter((g) => GRUPPI_FAUNA[g]?.gbif);
  if (!gruppi.length) return null;
  const riquadro = riquadroTraccia(pezzi, RAGGIO_TRATTO_M * 2);
  const osservazioni = [];
  try {
    for (let pagina = 0; pagina < PAGINE; pagina++) {
      const r = await fetch(urlOsservazioniGbif(riquadro, { specie: 'notevoli', gruppi }, { limite: 300, scarto: pagina * 300 }));
      if (!r.ok) return null;
      const json = await r.json();
      for (const x of interpretaGbif(json)) osservazioni.push({ animale: x.animale, nomeScientifico: x.nomeScientifico, ordine: x.ordine, data: x.data, lat: x.lat, lon: x.lon, sfumata: x.sfumata, osservatore: x.osservatore });
      if (annullata()) return null;
      if (json.endOfRecords || !json.results?.length) break;
    }
  } catch {
    return null;
  }
  return trattiFauna(osservazioni, pezzi).migliore;
}
