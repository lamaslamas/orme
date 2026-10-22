// «Condividi» un mio percorso: GPX (nome, note, traccia con quote), link senza server (traccia semplificata, nome,
// note e verso nell'indirizzo) o immagine verticale. Nel link e nel file solo traccia, nome, note e verso: niente
// osservazioni, posizioni GPS mie o altri dati del telefono.
import { creaGpx, nomeFileGpx } from '../lib/gpxScrittura.js';
import { costruisciLink } from '../lib/condividi.js';
import { misureDeiPezzi } from '../lib/lungoIlPercorso.js';
import { escapeHtml } from '../lib/formato.js';
import { quoteDeiPezzi } from './quote.js';
import { creaImmagine } from './immagineCondivisione.js';
import { finestraTrascinabile } from './tendina.js';

const haQuote = (pezzi) => pezzi.flat().length > 1 && pezzi.flat().every((p) => Number.isFinite(p[2]));

// i pezzi con le quote: già presenti oppure dalle Terrain Tiles (se non si riesce, restano senza)
async function conQuote(pezzi) {
  if (haQuote(pezzi)) return pezzi;
  try {
    return (await quoteDeiPezzi(pezzi.map((l) => l.map(([lon, lat]) => [lon, lat])))).pezzi;
  } catch {
    return pezzi;
  }
}

function scarica(file) {
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Passa il file al menu di condivisione del telefono; se il browser non lo supporta (o si annulla altro), lo scarica.
// → 'condiviso' | 'annullato' | 'scaricato'
export async function condividiFile(file, titolo) {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: titolo });
      return 'condiviso';
    } catch (err) {
      if (err.name === 'AbortError') return 'annullato';
    }
  }
  scarica(file);
  return 'scaricato';
}

export function apriCondividi({ nome, note = '', pezzi, originali = pezzi, verso = false }) {
  const finestra = document.createElement('dialog');
  finestra.className = 'foglio foglio-condividi';
  finestra.innerHTML = `
    <div class="foglio-maniglia" aria-hidden="true"></div>
    <h2 class="foglio-titolo">Condividi</h2>
    <p class="tenue piccolo">${escapeHtml(nome || 'Percorso')}. Nel link e nel file vanno solo traccia, nome, note e verso.</p>
    <div class="condividi-azioni">
      <button type="button" class="bottone pieno-largo" data-fai="gpx">Condividi GPX</button>
      <button type="button" class="bottone pieno-largo" data-fai="link">Copia link</button>
      <fieldset class="condividi-tema"><legend class="tenue piccolo">Immagine</legend>
        <label><input type="radio" name="tema" value="chiaro" checked /> Chiaro</label>
        <label><input type="radio" name="tema" value="scuro" /> Scuro</label>
      </fieldset>
      <button type="button" class="bottone pieno-largo" data-fai="immagine">Crea l'immagine</button>
    </div>
    <p class="condividi-stato tenue" role="status" aria-live="polite"></p>
    <div class="condividi-anteprima" hidden></div>
    <button type="button" class="bottone testo pieno-largo" data-fai="chiudi">Chiudi</button>`;
  document.body.appendChild(finestra);
  finestraTrascinabile(finestra);
  const stato = finestra.querySelector('.condividi-stato');
  const anteprima = finestra.querySelector('.condividi-anteprima');
  let occupato = false;
  let urlAnteprima = null;
  const chiudi = () => finestra.close();
  finestra.addEventListener('close', () => {
    if (urlAnteprima) URL.revokeObjectURL(urlAnteprima);
    finestra.remove();
  });
  finestra.addEventListener('click', (e) => e.target === finestra && chiudi());

  async function fai(cosa) {
    if (occupato) return;
    occupato = true;
    finestra.querySelectorAll('button').forEach((b) => (b.disabled = true));
    try {
      if (cosa === 'gpx') {
        stato.textContent = 'Preparo il GPX…';
        const linee = await conQuote(pezzi);
        const file = new File([creaGpx({ nome, note, linee })], nomeFileGpx(nome), { type: 'application/gpx+xml' });
        const esito = await condividiFile(file, nome);
        stato.textContent = esito === 'scaricato' ? 'GPX scaricato.' : esito === 'condiviso' ? 'GPX condiviso.' : '';
      } else if (cosa === 'link') {
        const r = costruisciLink({ nome, note, verso, pezzi: originali, base: `${location.origin}${location.pathname}` });
        if (!r.url) {
          stato.textContent = 'Il percorso è troppo lungo per stare in un link: condividi il GPX.';
        } else {
          const avviso = [r.semplificata ? `Traccia semplificata per il link (precisione circa ${r.toleranzaM} m).` : '', r.noteTagliate ? 'Note accorciate.' : ''].filter(Boolean).join(' ');
          let fatto = '';
          if (navigator.share) {
            try {
              await navigator.share({ title: nome, url: r.url });
              fatto = 'Link condiviso.';
            } catch (err) {
              if (err.name === 'AbortError') fatto = 'annullato';
            }
          }
          if (!fatto) {
            try {
              await navigator.clipboard.writeText(r.url);
              fatto = 'Link copiato negli appunti.';
            } catch {
              fatto = 'Non riesco a copiarlo da solo: tienilo premuto e copialo.';
              anteprima.hidden = false;
              anteprima.innerHTML = `<textarea readonly rows="4" class="condividi-link">${escapeHtml(r.url)}</textarea>`;
              anteprima.querySelector('textarea').select();
            }
          }
          stato.textContent = [fatto === 'annullato' ? '' : fatto, avviso].filter(Boolean).join(' ');
        }
      } else if (cosa === 'immagine') {
        stato.textContent = 'Creo l\'immagine…';
        const linee = await conQuote(pezzi);
        const m = misureDeiPezzi(linee);
        const tema = finestra.querySelector('[name=tema]:checked')?.value ?? 'chiaro';
        const blob = await creaImmagine({ nome, pezzi: linee, misure: m, tema });
        const file = new File([blob], `${nomeFileGpx(nome).replace(/\.gpx$/, '')}.png`, { type: 'image/png' });
        if (urlAnteprima) URL.revokeObjectURL(urlAnteprima);
        urlAnteprima = URL.createObjectURL(blob);
        anteprima.hidden = false;
        anteprima.innerHTML = `<img src="${urlAnteprima}" alt="Immagine del percorso" /><button type="button" class="bottone primario pieno-largo" data-fai="manda-immagine">Condividi o scarica</button>`;
        anteprima.querySelector('[data-fai=manda-immagine]').addEventListener('click', async () => {
          const esito = await condividiFile(file, nome);
          stato.textContent = esito === 'scaricato' ? 'Immagine scaricata.' : esito === 'condiviso' ? 'Immagine condivisa.' : '';
        });
        stato.textContent = 'Immagine pronta.';
      }
    } catch (err) {
      console.warn('Condividi', err);
      stato.textContent = 'Qualcosa non ha funzionato: riprova.';
    } finally {
      occupato = false;
      finestra.querySelectorAll('.condividi-azioni button, [data-fai=chiudi]').forEach((b) => (b.disabled = false));
    }
  }

  finestra.addEventListener('click', (e) => {
    const cosa = e.target.closest('[data-fai]')?.dataset.fai;
    if (cosa === 'chiudi') chiudi();
    else if (['gpx', 'link', 'immagine'].includes(cosa)) fai(cosa);
  });
  finestra.showModal();
}
