// "Fauna del parco": stesso metodo per tutti i parchi (osservazioni verificate di iNaturalist,
// riepilogo calcolato ogni settimana in dati/fauna-parchi.json). Tre stati sempre espliciti:
// dati disponibili, dati insufficienti, dati non ancora calcolati (o non raggiungibili).
import { ANIMALI } from '../lib/costanti.js';
import { MINIMO_OSSERVAZIONI, MINIMO_PERSONE } from '../lib/faunaPercorso.js';
import { escapeHtml } from '../lib/formato.js';
import { stato } from '../stato.js';

let datiInCorso = null;
const caricaDati = () =>
  (datiInCorso ??= fetch(`${import.meta.env.BASE_URL}dati/fauna-parchi.json`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`risposta ${r.status}`))))
    .catch((e) => {
      datiInCorso = null;
      throw e;
    }));

export function htmlFaunaParco() {
  return `<section class="riquadro fauna-parco" id="faunaParco">
    <h2>Fauna del parco</h2>
    <p class="tenue">Carico i dati di iNaturalist…</p>
  </section>`;
}

// sentieri: percorsi del parco (per contare dove è stata osservata ogni specie)
export async function collegaFaunaParco(contenitore, parco, sentieri) {
  const box = contenitore.querySelector('#faunaParco');
  if (!box) return;
  const titolo = '<h2>Fauna del parco</h2>';
  let dati;
  try {
    dati = await caricaDati();
  } catch {
    box.innerHTML = `${titolo}<p class="stato-dati stato-assente">Dati non raggiungibili ora (sei offline?). Riprova più tardi: non è un errore del parco.</p>`;
    return;
  }
  const f = dati.parchi?.[parco.id];
  const quando = f?.calcolato ? ` Aggiornato il ${new Date(f.calcolato).toLocaleDateString('it-IT')}.` : '';
  if (!f) {
    box.innerHTML = `${titolo}<p class="stato-dati stato-assente"><b>Dati non ancora calcolati per questo parco.</b> Il riepilogo arriva con il prossimo aggiornamento automatico dell'archivio (ogni giorno).</p>`;
    return;
  }
  if (!f.specie.length) {
    box.innerHTML = `${titolo}<p class="stato-dati stato-scarso"><b>Dati insufficienti.</b> Su iNaturalist ci sono ${f.osservazioni} osservazioni verificate delle specie seguite da Orme in questo parco: troppo poche per un riepilogo (servono almeno ${MINIMO_OSSERVAZIONI} osservazioni di ${MINIMO_PERSONE} persone per specie).${quando}</p>`;
    return;
  }
  const doveVista = (animale) => sentieri.filter((s) => (s.faunaInat?.specie ?? []).some((x) => x.animale === animale && x.livello === 'percorso')).length;
  const scarso = f.osservazioni < 50;
  box.innerHTML = `${titolo}
    <p class="stato-dati ${scarso ? 'stato-scarso' : 'stato-ok'}">${
      scarso ? '<b>Pochi dati</b>: le osservazioni sono ancora poche, il quadro è parziale.' : '<b>Dati disponibili</b>'
    } · ${f.osservazioni} osservazioni verificate su iNaturalist.${quando}</p>
    <ul class="elenco-fauna-parco">${f.specie
      .map((x) => {
        const n = doveVista(x.animale);
        return `<li><button type="button" class="riga-fauna" data-animale-fauna="${x.animale}">
          <b>${escapeHtml(ANIMALI[x.animale])}</b>
          <span class="tenue">${x.osservazioni} osservazioni di ${x.persone} persone${x.mesi ? ` · soprattutto ${escapeHtml(x.mesi)}` : ''}${
            x.sfumate === x.osservazioni ? ' · posizioni sfumate' : ''
          }</span>
          <span class="tenue piccolo">${n ? `osservato lungo ${n} ${n === 1 ? 'percorso' : 'percorsi'}` : 'nessun percorso con osservazioni precise'} ›</span>
        </button></li>`;
      })
      .join('')}</ul>
    <p class="tenue piccolo">Tocca un animale per vedere i percorsi e la heatmap. Non è un censimento: conta dove le persone osservano e fotografano.</p>`;
  box.addEventListener('click', (e) => {
    const a = e.target.closest('[data-animale-fauna]')?.dataset.animaleFauna;
    if (!a) return;
    stato.imposta({ specie: a, livelli: { heatmap: true } });
    contenitore.querySelector('#elenco')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
