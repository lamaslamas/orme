// «Nascondi questa specie»: un solo gestore per tutti i pulsanti (anche dentro i fumetti della mappa, i fogli e le
// liste delle osservazioni). Il pulsante porta la specie in data-nascondi-specie (JSON: animale, scientifico, nome).
import { nascoste, chiaveSpecie } from '../lib/specieNascoste.js';
import { urlNomeItaliano } from '../lib/specieZona.js';
import { mostraAvviso } from './condividi.js';

// attributo di un pulsante «Nascondi questa specie» per una specie (animale di Orme e/o nome scientifico)
export function attributoNascondi({ animale = null, scientifico = null, nome = null, inat = null } = {}) {
  return JSON.stringify({ animale, scientifico, nome, ...(inat ? { inat } : {}) }).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
export const htmlNascondi = (specie) => `<button type="button" class="link nascondi-specie" data-nascondi-specie="${attributoNascondi(specie)}">Nascondi questa specie</button>`;

// il taxon iNaturalist di una specie senza (serve alla heatmap): si cerca per nome scientifico, una volta
async function trovaTaxon(chiave, scientifico) {
  try {
    const r = await fetch(urlNomeItaliano(scientifico));
    const trovato = (await r.json())?.results?.find((t) => chiaveSpecie({ scientifico: t.name }) === chiave);
    if (trovato?.id) nascoste.conTaxon(chiave, trovato.id);
  } catch {
    // senza taxon la specie resta nascosta da liste e icone; la heatmap la mostra finché non si riprova
  }
}

export function nascondi(specie) {
  const v = nascoste.nascondi(specie);
  if (!v) return null;
  if (!v.inat && specie.scientifico) trovaTaxon(v.chiave, specie.scientifico);
  // quello che si vede ora sparisce subito (le liste già aperte)
  for (const el of document.querySelectorAll('[data-specie-chiave]')) if (el.dataset.specieChiave === v.chiave) (el.closest('li') ?? el).remove();
  mostraAvviso(`${v.nome} nascosta. La rimetti da Fauna › Nascoste.`, 4500);
  return v;
}

// un solo ascolto per tutta l'app; in fase di cattura, perché i fumetti di Leaflet fermano i clic prima del documento
export function collegaNascondiSpecie() {
  document.addEventListener(
    'click',
    (e) => {
      const b = e.target.closest?.('[data-nascondi-specie]');
      if (!b) return;
      e.preventDefault();
      let specie;
      try {
        specie = JSON.parse(b.dataset.nascondiSpecie);
      } catch {
        return;
      }
      b.closest('.leaflet-popup')?.querySelector('.leaflet-popup-close-button')?.click();
      nascondi(specie);
    },
    true,
  );
}
