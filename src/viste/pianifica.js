// Sezione "Pianifica": i miei percorsi, caricati da GPX o disegnati seguendo i sentieri.
import { tuttiIPercorsi, leggiPercorso, salvaPercorso } from '../db.js';
import { avviaImportazione } from './importaFile.js';
import { lunghezzaKm } from '../lib/geo.js';
import { dislivello, lineeConQuote } from '../lib/quote.js';
import { quoteDisponibili } from '../lib/quoteSalvate.js';
import { CHIAVE_QD_ELENCHI, leggiQd, salvaQd, passaQuotaDislivello, qdAttivo } from '../lib/quotaDislivello.js';
import { htmlQuotaDislivello, collegaQuotaDislivello } from './quotaDislivello.js';
import { percorsoSentiero } from '../lib/tracce.js';
import { sagomaSvg } from '../lib/sagoma.js';
import { escapeHtml, migliaia } from '../lib/formato.js';
import { linkModificaTraccia } from './modificaTraccia.js';
import { nomeProposto } from './nomeAutomatico.js';
import { nomeDaSostituire } from '../lib/nomePercorso.js';

export function numeriPercorso(p) {
  const pezzi = percorsoSentiero(p.geojson).pezzi;
  // quote: quelle della traccia, altrimenti quelle salvate nel percorso (modello del terreno)
  const conQuote = lineeConQuote(pezzi) ? pezzi : quoteDisponibili(p, pezzi)?.pezzi;
  const quotaMax = conQuote ? conQuote.reduce((m, l) => l.reduce((m2, pt) => Math.max(m2, pt[2]), m), -Infinity) : null;
  return { km: lunghezzaKm({ coordinates: pezzi }), disl: dislivello(conQuote ?? pezzi), quotaMax: Number.isFinite(quotaMax) ? Math.round(quotaMax) : null };
}

export async function vistaPianifica(app) {
  const percorsi = (await tuttiIPercorsi()).sort((a, b) => String(b.modificato).localeCompare(String(a.modificato)));
  const filtro = leggiQd(CHIAVE_QD_ELENCHI);
  const numeri = new Map(percorsi.map((p) => [p.id, numeriPercorso(p)]));
  const htmlVoci = () => {
    const visibili = percorsi.filter((p) => passaQuotaDislivello(filtro, { quotaMax: numeri.get(p.id).quotaMax, salita: numeri.get(p.id).disl?.salita }));
    if (!percorsi.length) return '<li class="vuoto">Nessun percorso. Disegnane uno o importa file GPX, KML o zip.</li>';
    if (!visibili.length) return '<li class="vuoto">Nessun percorso con questa quota e questo dislivello. Allarga il filtro o includi quelli senza dati di quota.</li>';
    return visibili
      .map((p) => {
        const { km, disl, quotaMax } = numeri.get(p.id);
        const d = sagomaSvg(p.geojson, 88, 88, 12);
        return `<li><a class="carta carta-sentiero" href="#/percorso/${encodeURIComponent(p.id)}">
                  ${d ? `<svg class="miniatura" viewBox="0 0 88 88" aria-hidden="true"><path d="${d}" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#2563eb" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>` : '<div class="miniatura vuota"></div>'}
                  <div class="carta-corpo">
                    <div class="nome">${escapeHtml(p.nome || 'Percorso senza nome')}</div>
                    <div class="carta-dati">${p.originale ? 'File importato, modificato' : p.origine === 'disegnato' ? 'Disegnato sulla mappa' : p.origine === 'esteso' ? 'Esteso da sentieri' : p.origine === 'kml' ? 'Da file KML' : 'Da file GPX'}</div>
                    <div class="numeri"><b>${km.toFixed(1).replace('.', ',')}</b> km${disl ? `<span class="sep">·</span><b>+${disl.salita}</b> m` : ''}${quotaMax != null ? `<span class="sep">·</span><span class="quota-max">max ${migliaia(quotaMax)} m</span>` : ''}</div>
                  </div>
                </a>${linkModificaTraccia('percorso', p.id, { stile: 'icona' })}</li>`;
      })
      .join('');
  };
  app.innerHTML = `
    <h1 class="titolo-pagina">Pianifica</h1>
    <a class="invito-meteo" href="#/domani"><span class="icona-meteo" aria-hidden="true">⛅</span><span><b>Dove vado domani?</b><span class="tenue piccolo">I percorsi migliori secondo il meteo, la durata e le tue preferenze</span></span></a>
    <div class="azioni">
      <a class="bottone primario" href="#/percorso-nuovo">Disegna un percorso</a>
      <button type="button" class="bottone" id="caricaGpx">Importa file (GPX, KML, zip)</button>
    </div>
    ${percorsi.length ? `<details class="qd-riquadro" ${qdAttivo(filtro) ? 'open' : ''}><summary>Quota e dislivello${qdAttivo(filtro) ? ' · filtro attivo' : ''}</summary><div class="qd-contenuto">${htmlQuotaDislivello(filtro)}</div></details>` : ''}
    <ul class="lista">${htmlVoci()}</ul>
  `;
  const radice = app.querySelector('.qd-contenuto');
  if (radice)
    collegaQuotaDislivello(radice, filtro, () => {
      salvaQd(CHIAVE_QD_ELENCHI, filtro);
      app.querySelector('.qd-riquadro summary').textContent = `Quota e dislivello${qdAttivo(filtro) ? ' · filtro attivo' : ''}`;
      app.querySelector('.lista').innerHTML = htmlVoci();
    });

  // i percorsi che hanno ancora la data per nome ricevono il nome automatico («Anello da Opi · 7 km»), uno alla volta
  (async () => {
    for (const p of percorsi.filter((x) => nomeDaSostituire(x.nome)).slice(0, 8)) {
      const pezzi = percorsoSentiero(p.geojson).pezzi;
      const nome = pezzi.length ? await nomeProposto(pezzi).catch(() => null) : null;
      if (!nome || !app.isConnected) continue;
      const attuale = (await leggiPercorso(p.id)) ?? p;
      if (!nomeDaSostituire(attuale.nome)) continue; // l'ha già cambiato lui
      await salvaPercorso({ ...attuale, nome });
      const voce = [...app.querySelectorAll('.lista a.carta-sentiero')].find((a) => a.getAttribute('href') === `#/percorso/${encodeURIComponent(p.id)}`);
      if (voce) voce.querySelector('.nome').textContent = nome;
    }
  })();

  app.querySelector('#caricaGpx').addEventListener('click', () => avviaImportazione());
}
