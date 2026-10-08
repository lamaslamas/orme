import { leggiSentiero, salvaSentiero, leggiTraccia, tuttiIGiri } from '../db.js';
import { giriConSentiero } from '../lib/giro.js';
import { ANIMALI, ACCESSI, LINK_PARCO, BICI_CONSENTITA, PEDALABILITA, DIFFICOLTA } from '../lib/costanti.js';
import { escapeHtml, codici, durata } from '../lib/formato.js';
import { descriviSuggerimento, valoriSuggeriti, haInformazioniBici } from '../lib/bici.js';
import { bollinoBici, bollinoDifficolta } from './lista.js';
import { misureSentiero } from '../lib/riassunto.js';
import { profiloAltimetrico, percorsoProfiloSvg } from '../lib/profilo.js';
import { percorsoSentiero } from '../lib/tracce.js';
import { creaMappa } from './mappa.js';
import { disegnaPercorso } from './disegnoTraccia.js';
import { impostaBanner } from './banner.js';
import { parcoDa } from '../datiParchi.js';

// Riga di numeri grandi: lunghezza, dislivello, durata
function numeriGrandi(m) {
  const casella = (valore, etichetta, nota = '') =>
    `<div class="numero"><b>${valore ?? '–'}</b><span>${etichetta}${nota}</span></div>`;
  return `<div class="numeri-grandi">
    ${casella(m.km != null ? `${m.km.toFixed(1).replace('.', ',')} km` : null, 'Lunghezza', m.kmCalcolati ? ' (traccia)' : '')}
    ${casella(m.salita != null ? `+${m.salita} m` : null, 'Dislivello')}
    ${casella(m.durataMin != null ? durata(m.durataMin) : null, 'Durata', m.durataStimata ? ' (stima)' : '')}
  </div>`;
}

// Grafico del profilo altimetrico in SVG
function graficoProfilo(profilo) {
  if (!profilo) return '';
  const L = 320;
  const A = 110;
  const { linea, area } = percorsoProfiloSvg(profilo, L, A);
  const kmTot = profilo.totaleKm.toFixed(1).replace('.', ',');
  return `<section class="riquadro">
    <h2>Profilo altimetrico</h2>
    <svg class="profilo" viewBox="0 0 ${L} ${A}" preserveAspectRatio="none" role="img"
      aria-label="Profilo altimetrico: da ${Math.round(profilo.minimo)} a ${Math.round(profilo.massimo)} metri su ${kmTot} km">
      <path d="${area}" fill="var(--verde-chiaro)"/>
      <path d="${linea}" fill="none" stroke="var(--verde)" stroke-width="2" vector-effect="non-scaling-stroke"/>
    </svg>
    <div class="profilo-assi"><span>0 km</span><span>min ${Math.round(profilo.minimo)} m · max ${Math.round(profilo.massimo)} m</span><span>${kmTot} km</span></div>
  </section>`;
}

function riga(etichetta, valore) {
  if (valore == null || valore === '') return '';
  return `<div class="riga"><dt>${etichetta}</dt><dd>${valore}</dd></div>`;
}

function riquadroBici(s, traccia) {
  const b = s.bici;
  const link = linkSicuro(b.link) ?? parcoDa(s.parco)?.sito ?? LINK_PARCO;
  const suggerimento = traccia?.dettagli?.suggerimentoBici;
  const proposti = valoriSuggeriti(suggerimento);
  const daApplicare = Object.entries(proposti).filter(([k, v]) => b[k] !== v);
  const etichette = { consentita: (v) => BICI_CONSENTITA[v], scalaMtb: (v) => `scala ${v}` };
  return `
    <section class="riquadro bici bici-${b.consentita}">
      <h2>Bici / MTB: ${BICI_CONSENTITA[b.consentita]}</h2>
      ${b.nota ? `<p>${escapeHtml(b.nota)}</p>` : ''}
      ${
        b.consentita !== 'no' && (b.pedalabilita || b.scalaMtb)
          ? `<dl>
              ${riga('Pedalabilità', b.pedalabilita ? PEDALABILITA[b.pedalabilita] : '')}
              ${riga('Scala MTB', escapeHtml(b.scalaMtb ?? ''))}
            </dl>`
          : ''
      }
      <a href="${escapeHtml(link)}" target="_blank" rel="noopener">Verifica sul sito del Parco ↗</a>
      ${
        haInformazioniBici(suggerimento)
          ? `<div class="suggerimento">
              <p><b>Suggerimento da OpenStreetMap:</b> ${escapeHtml(descriviSuggerimento(suggerimento))}.</p>
              <p class="tenue">I tag di OpenStreetMap non sono il regolamento del Parco: conferma solo dopo aver verificato.</p>
              ${
                daApplicare.length
                  ? `<button type="button" class="bottone" id="usaSuggerimento">Usa questi valori (${daApplicare
                      .map(([k, v]) => etichette[k](v))
                      .join(', ')})</button>`
                  : ''
              }
            </div>`
          : ''
      }
    </section>`;
}

function oggi() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function linkSicuro(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

export async function vistaScheda(app, id) {
  const [s, traccia, giri] = await Promise.all([leggiSentiero(id), leggiTraccia(id), tuttiIGiri()]);
  if (!s) {
    app.innerHTML = '<p class="vuoto">Sentiero non trovato. <a href="#/">Torna alla lista</a></p>';
    return;
  }

  impostaBanner(s.parco);
  const parco = parcoDa(s.parco);
  const tipo = s.accesso?.tipo || 'nessuno';
  const linkParco = linkSicuro(s.accesso?.link) ?? parco?.sito ?? LINK_PARCO;
  const p = s.partenza ?? {};
  const haCoordinate = Number.isFinite(p.lat) && Number.isFinite(p.lon);
  const partenza = [p.paese, p.descrizione].filter(Boolean).map(escapeHtml).join(' – ');
  const e = s.escursione ?? {};
  const haEscursione = e.associazione || e.nomeUscita || e.periodo;
  const misure = misureSentiero(s, traccia);
  const profilo = traccia ? profiloAltimetrico(percorsoSentiero(traccia.geojson).pezzi) : null;
  const idUrl = encodeURIComponent(s.id);

  app.innerHTML = `
    <a class="indietro" href="#/">‹ Esplora</a>
    <article class="scheda">
      ${
        traccia
          ? `<a class="anteprima-mappa" href="#/sentiero/${idUrl}/mappa" aria-label="Apri la mappa del sentiero"><div id="miniMappa"></div></a>`
          : `<a class="anteprima-mappa vuota" href="#/sentiero/${idUrl}/mappa"><span>Nessuna traccia salvata</span><b>Recupera la traccia ›</b></a>`
      }
      <div class="carta-titolo intestazione">
        ${bollinoDifficolta(s)}
        ${s.codici?.length ? `<span class="codice">${escapeHtml(codici(s))}</span>` : ''}
      </div>
      <h1>${escapeHtml(s.nome)}</h1>
      ${parco ? `<a class="link-parco" href="#/parco/${encodeURIComponent(parco.id)}">${escapeHtml(parco.nomeBreve)} ›</a>` : ''}
      ${s.zona ? `<p class="zona">${escapeHtml(s.zona)}</p>` : ''}
      <div class="chips">
        ${(s.animali ?? []).map((a) => `<span class="chip chip-${a}">${ANIMALI[a] ?? escapeHtml(a)}</span>`).join('')}
        ${bollinoBici(s)}
        ${s.daVerificare ? '<span class="chip chip-verifica">Da verificare</span>' : ''}
      </div>
      ${numeriGrandi(misure)}
      ${s.descrizione ? `<p class="descrizione">${escapeHtml(s.descrizione)}</p>` : ''}

      <div class="barra-azioni">
        <a class="bottone primario" href="#/sentiero/${idUrl}/mappa">${traccia ? 'Apri la mappa' : 'Mappa e traccia'}</a>
        <a class="bottone" href="#/sentiero/${idUrl}/modifica">Modifica</a>
      </div>

      <section class="riquadro accesso accesso-${tipo}">
        <h2>Accesso: ${ACCESSI[tipo] ?? ACCESSI.nessuno}</h2>
        ${s.accesso?.nota ? `<p>${escapeHtml(s.accesso.nota)}</p>` : ''}
        <a href="${escapeHtml(linkParco)}" target="_blank" rel="noopener">Verifica sul sito del Parco ↗</a>
      </section>

      ${riquadroBici(s, traccia)}

      ${graficoProfilo(profilo)}

      <section class="riquadro">
        <h2>Percorso</h2>
        <dl>
          ${riga('Difficoltà', s.difficolta ? escapeHtml(DIFFICOLTA[s.difficolta]) : '')}
          ${riga('Partenza', partenza)}
          ${riga('Traccia', traccia ? (traccia.origine === 'osm' ? 'Salvata (da OpenStreetMap)' : 'Salvata (da file GPX)') : 'Non ancora salvata')}
        </dl>
        ${
          haCoordinate
            ? `<a class="bottone" href="geo:${p.lat},${p.lon}?q=${p.lat},${p.lon}(${encodeURIComponent('Partenza')})">Naviga alla partenza</a>`
            : ''
        }
      </section>

      ${
        haEscursione
          ? `<section class="riquadro">
              <h2>Escursione d'origine</h2>
              <dl>
                ${riga('Associazione', escapeHtml(e.associazione))}
                ${riga('Uscita', escapeHtml(e.nomeUscita))}
                ${riga('Periodo', escapeHtml(e.periodo))}
              </dl>
            </section>`
          : ''
      }

      ${(() => {
        const suoi = giriConSentiero(giri, s.id);
        return suoi.length
          ? `<section class="riquadro">
              <h2>Fa parte di ${suoi.length === 1 ? 'un giro' : `${suoi.length} giri`}</h2>
              <ul class="elenco-link">${suoi
                .map((g) => `<li><a href="#/giro/${encodeURIComponent(g.id)}">${escapeHtml(g.nome)}</a>${g.stato === 'fatto' ? ' <span class="chip chip-fatto">Fatto</span>' : ''}</li>`)
                .join('')}</ul>
            </section>`
          : '';
      })()}

      <section class="riquadro">
        <h2>Il mio diario</h2>
        <div class="stato-riga">
          <label class="interruttore">
            <input type="checkbox" id="fatto" ${s.stato === 'fatto' ? 'checked' : ''} />
            <span>Percorso fatto</span>
          </label>
          <input type="date" id="dataPercorso" value="${escapeHtml(s.dataPercorso ?? '')}" ${s.stato === 'fatto' ? '' : 'hidden'} aria-label="Data in cui l'ho percorso" />
        </div>
        <p class="salvato" id="salvato" hidden>Salvato</p>
        ${s.notePersonali ? `<p class="note">${escapeHtml(s.notePersonali)}</p>` : '<p class="tenue">Nessuna nota personale.</p>'}
      </section>
    </article>
  `;

  const casella = app.querySelector('#fatto');
  const campoData = app.querySelector('#dataPercorso');
  const avviso = app.querySelector('#salvato');
  let attuale = s;

  async function salva(modifiche) {
    attuale = await salvaSentiero({ ...attuale, ...modifiche });
    avviso.hidden = false;
    clearTimeout(salva.timer);
    salva.timer = setTimeout(() => (avviso.hidden = true), 1500);
  }

  app.querySelector('#usaSuggerimento')?.addEventListener('click', async () => {
    const proposti = valoriSuggeriti(traccia.dettagli.suggerimentoBici);
    await salvaSentiero({ ...attuale, bici: { ...attuale.bici, ...proposti } });
    vistaScheda(app, id);
  });

  casella.addEventListener('change', () => {
    if (casella.checked) {
      if (!campoData.value) campoData.value = oggi();
      campoData.hidden = false;
      salva({ stato: 'fatto', dataPercorso: campoData.value });
    } else {
      campoData.hidden = true;
      salva({ stato: 'da_fare' });
    }
  });
  campoData.addEventListener('change', () => salva({ dataPercorso: campoData.value || null }));

  // anteprima della mappa: ferma, si tocca per aprire la mappa completa
  const contenitoreMini = app.querySelector('#miniMappa');
  if (!contenitoreMini) return;
  const mini = creaMappa(contenitoreMini, { anteprima: true });
  const gruppo = disegnaPercorso(traccia.geojson, { colore: '#c2410c', frecce: false }).addTo(mini);
  mini.attenuaSentieri(true);
  requestAnimationFrame(() => {
    mini.invalidateSize();
    mini.fitBounds(gruppo.getBounds(), { padding: [28, 28] });
  });
  return () => mini.remove();
}
