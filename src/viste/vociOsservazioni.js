// Una osservazione in elenco: miniatura (o icona del gruppo) di larghezza fissa a sinistra, testo sempre accanto.
// Usata nell'elenco lungo il percorso e in quello di una zona toccata sulla mappa.
import { escapeHtml } from '../lib/formato.js';
import { ANIMALI } from '../lib/costanti.js';
import { iconaPerOsservazione } from '../lib/gbif.js';
import { dataBreve } from '../lib/osservazioniPerSpecie.js';
import { iconaAnimale } from './icone.js';
import { chiaveSpecie } from '../lib/specieNascoste.js';
import { htmlNascondi } from './nascondiSpecie.js';

const nomeDi = (o) => (o.animale ? ANIMALI[o.animale] : o.specie);
const linkFonte = (o) => `<a href="${escapeHtml(o.url)}" target="_blank" rel="noopener">${o.fonte === 'iNaturalist' ? 'Apri su iNaturalist' : 'Apri la fonte'} ↗</a>`;

// extra: testo in più dopo la data (es. "a 120 m dalla traccia")
export function htmlVoceOsservazione(o, { extra = '', conNome = true } = {}) {
  const foto = o.foto
    ? `<button type="button" class="foto-apri" data-foto="${escapeHtml(JSON.stringify({ url: o.foto.url, autore: o.foto.attribuzione, licenza: o.foto.licenza ?? '', pagina: o.url, titolo: nomeDi(o) }))}" aria-label="Apri la foto"><img src="${escapeHtml(o.foto.url)}" alt="" width="64" height="64" loading="lazy" /></button>`
    : `<span class="senza-foto" aria-hidden="true">${iconaAnimale(iconaPerOsservazione(o))}</span>`;
  const specie = { animale: o.animale ?? null, scientifico: o.nomeScientifico ?? null, nome: nomeDi(o) };
  const chiave = chiaveSpecie(specie);
  return `<li class="voce-oss"${chiave ? ` data-specie-chiave="${escapeHtml(chiave)}"` : ''}>
    ${foto}
    <div class="voce-oss-testo">
      ${conNome ? `<b>${escapeHtml(nomeDi(o))}</b> ${o.nomeScientifico ? `<i class="tenue">${escapeHtml(o.nomeScientifico)}</i>` : ''}<br />` : ''}
      ${escapeHtml(dataBreve(o.data))}${extra ? ` · ${escapeHtml(extra)}` : ''}${o.verificata === false ? ' <span class="chip">da confermare</span>' : ''}${o.sfumata ? ' <span class="chip chip-verifica">posizione approssimata dalla fonte</span>' : ''}
      <br /><span class="tenue">${escapeHtml(o.fonte ?? '')}${o.licenza ? ` · ${escapeHtml(o.licenza)}` : ''}</span> · ${linkFonte(o)}
    ${chiave && conNome ? `<br />${htmlNascondi(specie)}` : ''}
    </div>
  </li>`;
}
