// "Fauna del parco": stesso metodo per tutti i parchi (osservazioni verificate di iNaturalist,
// riepilogo calcolato ogni settimana in dati/fauna-parchi.json). Tre stati sempre espliciti:
// dati disponibili, dati insufficienti, dati non ancora calcolati (o non raggiungibili).
import { ANIMALI } from '../lib/costanti.js';
import { MINIMO_OSSERVAZIONI, MINIMO_PERSONE, mesiDaTesto } from '../lib/faunaPercorso.js';
import { escapeHtml } from '../lib/formato.js';
import { stato } from '../stato.js';
import { iconaAnimale } from './icone.js';

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
  const massimo = Math.max(...f.specie.map((x) => x.osservazioni));
  // una riga per animale: barra delle osservazioni (rispetto al più osservato), mesi migliori, percorsi
  box.innerHTML = `<div class="fauna-testa"><h2>Fauna del parco</h2><span class="tenue piccolo">${f.osservazioni} osservazioni · iNaturalist</span></div>
    ${scarso ? '<p class="stato-dati stato-scarso"><b>Pochi dati</b>: il quadro è parziale.</p>' : ''}
    <ul class="elenco-fauna-parco">${f.specie
      .map((x) => {
        const n = doveVista(x.animale);
        const mesi = mesiDaTesto(x.mesi);
        const dettaglio = `${x.osservazioni} osservazioni di ${x.persone} persone${x.mesi ? ` · soprattutto ${x.mesi}` : ''}${x.sfumate === x.osservazioni ? ' · posizioni sfumate' : ''}`;
        return `<li><button type="button" class="riga-fauna" data-animale-fauna="${x.animale}" title="${escapeHtml(dettaglio)}" aria-label="${escapeHtml(`${ANIMALI[x.animale]}: ${dettaglio}`)}">
          <b class="fauna-nome">${iconaAnimale(x.animale)}${escapeHtml(ANIMALI[x.animale])}</b>
          <span class="fauna-grafico" aria-hidden="true">
            <span class="fauna-barra"><i style="width:${Math.max(4, Math.round((x.osservazioni / massimo) * 100))}%"></i></span>
            <span class="fauna-mesi">${Array.from({ length: 12 }, (_, m) => `<i class="${mesi.has(m + 1) ? 'si' : ''}"></i>`).join('')}</span>
          </span>
          <span class="fauna-percorsi ${n ? '' : 'tenue'}">${n ? `${n} percorsi ›` : 'zona'}</span>
        </button></li>`;
      })
      .join('')}</ul>
    <p class="tenue piccolo">Barra: quante osservazioni · trattini: i mesi migliori (gen→dic). Tocca un animale per i percorsi e la heatmap.${quando}</p>`;
  box.addEventListener('click', (e) => {
    const a = e.target.closest('[data-animale-fauna]')?.dataset.animaleFauna;
    if (!a) return;
    stato.imposta({ specie: a, livelli: { heatmap: true } });
    contenitore.querySelector('#elenco')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
