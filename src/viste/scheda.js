import { leggiSentiero, salvaSentiero, leggiTraccia, salvaTraccia, tuttiIGiri } from '../db.js';
import { giriConSentiero } from '../lib/giro.js';
import { ANIMALI, ACCESSI, LINK_PARCO, BICI_CONSENTITA, PEDALABILITA, DIFFICOLTA } from '../lib/costanti.js';
import { escapeHtml, codici, durata } from '../lib/formato.js';
import { descriviSuggerimento, valoriSuggeriti, haInformazioniBici } from '../lib/bici.js';
import { bollinoBici, bollinoDifficolta } from './lista.js';
import { misureSentiero } from '../lib/riassunto.js';
import { percorsoSentiero, statoTraccia, sceltaAutomatica } from '../lib/tracce.js';
import { cercaSuOsm, combinaTraccia } from '../lib/overpass.js';
import { leggiGpx } from '../lib/gpx.js';
import { puntoDiPartenza, linkGoogleMaps, linkGeo } from '../lib/navigazione.js';

const STATI_VERIFICA = {
  verificato: 'Verificato',
  da_verificare: 'Da verificare',
  non_piu_verificabile: 'Fonte non più raggiungibile',
};

// Compatibilità con trekking, MTB ed e-MTB (stima prudente, sezione 15 del piano)
function htmlCompatibilita(s, traccia) {
  const c = valutaCompatibilita(s, traccia);
  const attuale = statoApp.leggi().attivita;
  return `<section class="riquadro compatibilita">
    <h2>Compatibilità del percorso</h2>
    <dl>${Object.entries(ATTIVITA)
      .map(
        ([k, nome]) => `<div class="riga ${k === attuale ? 'attivita-scelta' : ''}"><dt>${nome}</dt><dd>
          <span class="chip compat compat-${c[k].stato}">${STATI_COMPATIBILITA[c[k].stato]}</span>
          ${c[k].motivi.length ? `<div class="tenue piccolo">${c[k].motivi.map(escapeHtml).join(' · ')}</div>` : ''}
        </dd></div>`,
      )
      .join('')}</dl>
    <p class="tenue piccolo">Prima contano divieti e regole del parco, poi le caratteristiche tecniche. Se mancano informazioni lo stato è "da verificare": la presenza di un sentiero su OpenStreetMap non basta a dire che è percorribile in bici. Le regole del parco prevalgono sempre.</p>
  </section>`;
}

// Fonti, organizzatori e stato di verifica (solo informativo) dell'archivio
function htmlFontiVerifica(s) {
  const fonti = (s.fonti ?? []).filter((f) => linkSicuro(f.url));
  if (!fonti.length && !s.verifica && !(s.organizzatori ?? []).length) return '';
  return `<section class="riquadro">
    <h2>Fonti e verifica</h2>
    ${(s.organizzatori ?? []).length ? `<p>Organizzato da <b>${s.organizzatori.map(escapeHtml).join(', ')}</b></p>` : ''}
    ${
      fonti.length
        ? `<ul class="elenco-link">${fonti
            .map((f) => `<li><a href="${escapeHtml(linkSicuro(f.url))}" target="_blank" rel="noopener">${escapeHtml(f.titolo || 'Fonte')} ↗</a>${f.visto ? ` <span class="tenue">· controllata il ${escapeHtml(new Date(f.visto).toLocaleDateString('it-IT'))}</span>` : ''}</li>`)
            .join('')}</ul>`
        : ''
    }
    ${s.verifica ? `<p class="tenue piccolo">Stato: ${STATI_VERIFICA[s.verifica.stato] ?? escapeHtml(s.verifica.stato)} (informativo, dall'archivio di Orme).</p>` : ''}
  </section>`;
}

// Pulsanti per raggiungere la partenza con un'app esterna, partendo da dove mi trovo
export function htmlPortamiAllaPartenza(punto) {
  if (!punto) return '';
  return `<section class="riquadro">
    <h2>Portami alla partenza</h2>
    <p class="tenue">Apre Google Maps (o un'altra app di navigazione) dalla tua posizione fino ${
      punto.fonte === 'manuale' ? 'al punto di partenza indicato' : "all'inizio della traccia"
    }.</p>
    <div class="azioni-mappa">
      <a class="bottone primario" href="${linkGoogleMaps(punto, 'auto')}" target="_blank" rel="noopener">In auto</a>
      <a class="bottone" href="${linkGoogleMaps(punto, 'piedi')}" target="_blank" rel="noopener">A piedi</a>
      <a class="bottone" href="${linkGeo(punto)}">Altra app</a>
    </div>
  </section>`;
}

// Testo del riquadro "Traccia"
function descriviStatoTraccia(stato, traccia) {
  const elenco = (codici) => codici.map((c) => `<b>${escapeHtml(c)}</b>`).join(', ');
  if (stato.tipo === 'nessuna') {
    return stato.serveGpx
      ? 'Serve un GPX: questo sentiero non ha un codice da cercare su OpenStreetMap.'
      : 'Nessuna traccia salvata.';
  }
  const fonte =
    traccia.origine === 'gpx'
      ? `Dal tuo file GPX${traccia.dettagli?.nomeFile ? ` “${escapeHtml(traccia.dettagli.nomeFile)}”` : ''}.`
      : traccia.dettagli?.iniziale
        ? 'Da OpenStreetMap, inclusa nell’app: da verificare.'
        : traccia.dettagli?.automatica
          ? 'Scaricata in automatico da OpenStreetMap: da verificare.'
          : 'Da OpenStreetMap.';
  const ricostruita = traccia.dettagli?.ricostruita
    ? ` <span class="avviso-parziale">Ricostruita da descrizione, da verificare.</span>${
        linkSicuro(traccia.dettagli.fonte) ? ` <a href="${escapeHtml(linkSicuro(traccia.dettagli.fonte))}" target="_blank" rel="noopener">Fonte ↗</a>` : ''
      }`
    : '';
  if (stato.tipo === 'parziale') {
    const motivo = stato.mancanti.length
      ? `${elenco(stato.mancanti)} ${stato.mancanti.length === 1 ? 'non è' : 'non sono'} su OpenStreetMap.`
      : escapeHtml(stato.nota ?? '');
    return `<span class="avviso-parziale">Traccia parziale:</span> ${motivo} Per il percorso completo serve un GPX. <span class="tenue">${fonte}</span>${ricostruita}`;
  }
  return fonte + ricostruita;
}
import { creaMappa } from './mappa.js';
import { htmlProfiloPendenze } from './profilo.js';
import { htmlNaturaSentiero, collegaNaturaSentiero } from './natura.js';
import { valutaCompatibilita, STATI_COMPATIBILITA, ATTIVITA } from '../lib/compatibilita.js';
import { stato as statoApp } from '../stato.js';
import { disegnaPercorso } from './disegnoTraccia.js';
import { impostaBanner } from './banner.js';
import { parcoDa } from '../datiParchi.js';

// Riga di numeri grandi: lunghezza, dislivello, durata
export function numeriGrandi(m) {
  const casella = (valore, etichetta, nota = '') =>
    `<div class="numero"><b>${valore ?? '–'}</b><span>${etichetta}${nota}</span></div>`;
  return `<div class="numeri-grandi">
    ${casella(m.km != null ? `${m.km.toFixed(1).replace('.', ',')} km` : null, 'Lunghezza', m.kmCalcolati ? ' (traccia)' : '')}
    ${casella(m.salita != null ? `+${m.salita} m` : null, 'Dislivello')}
    ${casella(m.durataMin != null ? durata(m.durataMin) : null, 'Durata', m.durataStimata ? ' (stima)' : '')}
  </div>`;
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
  const partenza = [p.paese, p.descrizione].filter(Boolean).map(escapeHtml).join(' – ');
  const e = s.escursione ?? {};
  const haEscursione = e.associazione || e.nomeUscita || e.periodo || e.fonte;
  const misure = misureSentiero(s, traccia);
  const idUrl = encodeURIComponent(s.id);
  const statoT = statoTraccia(s, traccia);

  app.innerHTML = `
    <a class="indietro" href="#/">‹ Parchi</a>
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

      <section class="riquadro traccia-stato traccia-${statoT.tipo}">
        <h2>Traccia</h2>
        <p id="testoTraccia">${descriviStatoTraccia(statoT, traccia)}</p>
        <div class="azioni-mappa">
          <button type="button" class="bottone" id="caricaGpx">Carica il mio GPX</button>
        </div>
        <input type="file" id="fileGpxScheda" accept=".gpx,application/gpx+xml,application/xml,text/xml" hidden />
      </section>
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

      ${htmlCompatibilita(s, traccia)}

      ${riquadroBici(s, traccia)}

      ${traccia ? htmlProfiloPendenze(percorsoSentiero(traccia.geojson).pezzi) : ''}
      ${traccia ? htmlNaturaSentiero() : ''}

      <section class="riquadro">
        <h2>Percorso</h2>
        <dl>
          ${riga('Difficoltà', s.difficolta ? escapeHtml(DIFFICOLTA[s.difficolta]) : '')}
          ${riga('Partenza', partenza)}
        </dl>
      </section>

      ${htmlPortamiAllaPartenza(puntoDiPartenza(s, traccia))}

      ${
        haEscursione
          ? `<section class="riquadro">
              <h2>Escursione d'origine</h2>
              <dl>
                ${riga('Associazione', escapeHtml(e.associazione))}
                ${riga('Uscita', escapeHtml(e.nomeUscita))}
                ${riga('Periodo', escapeHtml(e.periodo))}
                ${riga(
                  'Date in calendario',
                  (e.date ?? [])
                    .map((d) => new Date(`${d}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }))
                    .map(escapeHtml)
                    .join(', '),
                )}
                ${riga('Fonte', linkSicuro(e.url) ? `<a href="${escapeHtml(linkSicuro(e.url))}" target="_blank" rel="noopener">${escapeHtml(e.fonte || 'pagina')} ↗</a>` : escapeHtml(e.fonte ?? ''))}
              </dl>
            </section>`
          : ''
      }

      ${htmlFontiVerifica(s)}

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

  if (traccia) collegaNaturaSentiero(app.querySelector('#naturaSentiero'), percorsoSentiero(traccia.geojson).pezzi);

  // --- il mio GPX: ha sempre la precedenza sulle tracce di OpenStreetMap ---
  const fileGpx = app.querySelector('#fileGpxScheda');
  const testoTraccia = app.querySelector('#testoTraccia');
  app.querySelector('#caricaGpx').addEventListener('click', () => fileGpx.click());
  fileGpx.addEventListener('change', async () => {
    const file = fileGpx.files?.[0];
    fileGpx.value = '';
    if (!file) return;
    if (traccia && !confirm('Sostituire la traccia attuale con il tuo GPX?')) return;
    try {
      const { geojson } = leggiGpx(await file.text());
      await salvaTraccia({ sentieroId: s.id, origine: 'gpx', geojson, dettagli: { nomeFile: file.name } });
      vistaScheda(app, id);
    } catch (e) {
      testoTraccia.innerHTML = `<span class="errore">${escapeHtml(e.message)}</span>`;
    }
  });

  // --- traccia mancante: provo a scaricarla da OSM in automatico (una volta per sessione) ---
  const chiaveTentativo = `orme.cercata.${s.id}`;
  let giaTentato = false;
  try {
    giaTentato = sessionStorage.getItem(chiaveTentativo) === '1';
  } catch {
    // niente memoria di sessione: si riprova
  }
  if (!traccia && s.codici?.length && !giaTentato) {
    if (!navigator.onLine) {
      testoTraccia.textContent = 'Nessuna traccia salvata. Senza rete: la cercherò su OpenStreetMap quando sarai online, oppure carica un GPX.';
    } else {
      try {
        sessionStorage.setItem(chiaveTentativo, '1');
      } catch {
        // pazienza
      }
      testoTraccia.textContent = 'Cerco la traccia su OpenStreetMap…';
      const elenco = s.codici.map((c) => c.toUpperCase());
      cercaSuOsm(elenco, { parco: s.parco })
        .then(async (gruppi) => {
          const { scelti, mancanti, ambigui } = sceltaAutomatica(elenco, gruppi);
          if (!scelti.length) {
            testoTraccia.innerHTML = ambigui.length
              ? `Su OpenStreetMap ci sono più sentieri ${ambigui.map(escapeHtml).join(', ')}: scegli quello giusto dalla <a href="#/sentiero/${idUrl}/mappa">mappa</a>.`
              : `${elenco.map(escapeHtml).join(', ')} non ${elenco.length === 1 ? 'è' : 'sono'} su OpenStreetMap: per la traccia serve un GPX.`;
            return;
          }
          const nuova = combinaTraccia(scelti);
          await salvaTraccia({
            sentieroId: s.id,
            ...nuova,
            dettagli: { ...nuova.dettagli, mancanti: [...mancanti, ...ambigui], automatica: true },
          });
          if (location.hash === `#/sentiero/${idUrl}`) vistaScheda(app, id);
        })
        .catch(() => {
          testoTraccia.innerHTML = `Non sono riuscito a scaricare la traccia da OpenStreetMap. Riprova dalla <a href="#/sentiero/${idUrl}/mappa">mappa</a> o carica un GPX.`;
        });
    }
  }

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
