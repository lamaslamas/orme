// «Condividi» un mio percorso: link senza server (traccia semplificata, nome, note e verso nell'indirizzo) o GPX (nome,
// note, traccia con quote). Nel link e nel file solo traccia, nome, note e verso: niente osservazioni, posizioni GPS mie
// o altri dati del telefono.
import { creaGpx, nomeFileGpx } from '../lib/gpxScrittura.js';
import { costruisciLink } from '../lib/condividi.js';
import { escapeHtml } from '../lib/formato.js';
import { quoteDeiPezzi } from './quote.js';
import { finestraTrascinabile } from './tendina.js';
import { nomeProposto } from './nomeAutomatico.js';
import { nomeDaSostituire } from '../lib/nomePercorso.js';

// un avviso breve in basso («Link copiato»)
export function mostraAvviso(testo, ms = 3200) {
  document.querySelector('.avviso-condividi')?.remove();
  const el = document.createElement('div');
  el.className = 'avviso-condividi';
  el.setAttribute('role', 'status');
  el.textContent = testo;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// il nome da usare nel link: se è ancora una data, quello automatico (ma senza far aspettare: il menu di condivisione
// vuole partire subito dal tocco)
async function nomeBuono({ nome, pezzi }) {
  if (!nomeDaSostituire(nome)) return nome;
  const automatico = await Promise.race([nomeProposto(pezzi).catch(() => null), new Promise((r) => setTimeout(() => r(null), 1500))]);
  return automatico || nome || 'Percorso Orme';
}

const baseLink = () => `${location.origin}${location.pathname}`;
const costruisci = (info, nome) => costruisciLink({ nome, note: info.note, verso: info.verso, pezzi: info.originali ?? info.pezzi, base: baseLink() });
const AVVISO_SEMPLIFICATA = 'Traccia semplificata per il link.';

// «Condividi»: subito il menu di condivisione del sistema con il link (titolo = nome del percorso).
// Senza menu di condivisione il link si copia, e lo dice.
export async function condividiLink(info) {
  const nome = await nomeBuono(info);
  const r = costruisci(info, nome);
  if (!r.url) return mostraAvviso('Il percorso è troppo lungo per un link: usa Altro e il GPX.');
  if (navigator.share) {
    try {
      await navigator.share({ title: nome, url: r.url });
      if (r.semplificata) mostraAvviso(AVVISO_SEMPLIFICATA);
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  const copiato = await copiaTesto(r.url);
  mostraAvviso(copiato ? `Link copiato (il browser non ha il menu di condivisione).${r.semplificata ? ` ${AVVISO_SEMPLIFICATA}` : ''}` : 'Non riesco a copiarlo da solo.');
  if (!copiato) mostraLinkADito(r.url);
}

// «Copia link»: direttamente negli appunti
export async function copiaLink(info) {
  const nome = await nomeBuono(info);
  const r = costruisci(info, nome);
  if (!r.url) return mostraAvviso('Il percorso è troppo lungo per un link: usa Altro e il GPX.');
  if (await copiaTesto(r.url)) mostraAvviso(`Link copiato${r.semplificata ? `. ${AVVISO_SEMPLIFICATA}` : ''}`);
  else {
    mostraAvviso('Non riesco a copiarlo da solo: ecco il link.');
    mostraLinkADito(r.url);
  }
}

async function copiaTesto(testo) {
  try {
    await navigator.clipboard.writeText(testo);
    return true;
  } catch {
    return false;
  }
}
function mostraLinkADito(url) {
  const f = document.createElement('dialog');
  f.className = 'foglio foglio-condividi';
  f.innerHTML = `<h2 class="foglio-titolo">Il link</h2><textarea readonly rows="5" class="condividi-link">${escapeHtml(url)}</textarea><button type="button" class="bottone pieno-largo">Chiudi</button>`;
  document.body.appendChild(f);
  f.querySelector('button').addEventListener('click', () => f.close());
  f.addEventListener('close', () => f.remove());
  f.showModal();
  f.querySelector('textarea').select();
}

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

// «GPX»: il file con le quote (dalle Terrain Tiles se mancano), al menu di condivisione del telefono o scaricato
export async function condividiGpx({ nome, note = '', pezzi }) {
  mostraAvviso('Preparo il GPX…', 1500);
  const linee = await conQuote(pezzi);
  const file = new File([creaGpx({ nome, note, linee })], nomeFileGpx(nome), { type: 'application/gpx+xml' });
  const esito = await condividiFile(file, nome);
  if (esito === 'scaricato') mostraAvviso('GPX scaricato.');
}

// Il foglio «Condividi» (disegno): GPX e link
// soloAltro: senza «Copia link» (c'è già accanto a «Condividi»): resta il GPX
export function apriCondividi({ nome, note = '', pezzi, originali = pezzi, verso = false, soloAltro = false }) {
  const finestra = document.createElement('dialog');
  finestra.className = 'foglio foglio-condividi';
  finestra.innerHTML = `
    <div class="foglio-maniglia" aria-hidden="true"></div>
    <h2 class="foglio-titolo">${soloAltro ? 'GPX' : 'Condividi'}</h2>
    <p class="tenue piccolo">${escapeHtml(nome || 'Percorso')}. Nel link e nel file vanno solo traccia, nome, note e verso.</p>
    <div class="condividi-azioni">
      <button type="button" class="bottone pieno-largo" data-fai="gpx">Condividi GPX</button>
      ${soloAltro ? '' : '<button type="button" class="bottone pieno-largo" data-fai="link">Copia link</button>'}
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
    else if (['gpx', 'link'].includes(cosa)) fai(cosa);
  });
  finestra.showModal();
}
