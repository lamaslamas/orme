import { infoArchivio } from '../db.js';
import { FOTO } from '../datiFoto.js';
import { parcoDa } from '../datiParchi.js';
import { ANIMALI } from '../lib/costanti.js';
import { escapeHtml } from '../lib/formato.js';
import { collegaInstalla } from './installa.js';
import { leggiTema, impostaTema, leggiNotte, impostaNotte } from './tema.js';
import { htmlRitmo, collegaRitmo } from './ritmo.js';

export async function vistaAltro(app) {
  const archivio = await infoArchivio();
  app.innerHTML = `
    <h1 class="titolo-pagina">Altro</h1>
    <ul class="menu-altro">
      <li class="voce-installa" hidden><button type="button" class="voce-menu" data-azione="installa"><b>Installa l'app</b><span>Sulla schermata Home, funziona anche offline</span></button></li>
      <li><a href="#/parchi"><b>Parchi</b><span>L'elenco dei parchi, con fauna e sentieri di ognuno</span></a></li>
      <li><a href="#/codice"><b>Codice di comportamento</b><span>Buone pratiche per la fotografia naturalistica</span></a></li>
      <li><a href="#/backup"><b>Backup</b><span>Esporta e importa sentieri, tracce e percorsi</span></a></li>
      <li><a href="#/nuovo"><b>Aggiungi un sentiero</b><span>Inserisci a mano un nuovo sentiero</span></a></li>
    </ul>

    <section class="riquadro aspetto">
      <h2>Aspetto</h2>
      <div class="segmenti" role="radiogroup" aria-label="Modalità chiara o scura">
        ${[
          ['auto', 'Automatico'],
          ['chiaro', 'Chiaro'],
          ['scuro', 'Scuro'],
        ]
          .map(([v, et]) => `<button type="button" role="radio" class="segmento" data-tema="${v}">${et}</button>`)
          .join('')}
      </div>
      <p class="tenue piccolo">Automatico segue l'impostazione del telefono. Le mappe già aperte cambiano alla prossima apertura.</p>
      <button type="button" class="bottone interruttore-notte" role="switch" aria-checked="false" data-notte-toggle>Modo notturno rosso</button>
      <p class="tenue piccolo">Schermo rosso scuro su nero, per non abbagliarti al buio. Resta acceso finché non lo spegni.</p>
    </section>

    <section class="riquadro ritmo-altro">
      <h2>Ritmo di cammino</h2>
      ${htmlRitmo()}
      <p class="tenue piccolo">I tempi CAI sono senza soste. «Con soste» li allunga del 25%, «Fotografico» del 75% (per chi si ferma spesso ad aspettare la luce o ad appostarsi). Vale per durata, orari, «parti entro», luce e fotografia, su più giorni e Suggerisci.</p>
    </section>

    <section class="riquadro">
      <h2>Regole del Parco</h2>
      <p>Nel Parco è vietato uscire dai sentieri. Alcuni sentieri hanno accesso solo con guida, a numero chiuso o con chiusure periodiche, che cambiano ogni anno: verifica sempre sul sito del Parco prima di partire.</p>
      <a href="https://www.parcoabruzzo.it/" target="_blank" rel="noopener">Sito del Parco ↗</a>
    </section>

    <section class="riquadro">
      <h2>Archivio dei percorsi</h2>
      <p>I percorsi arrivano da un archivio pubblico aggiornato automaticamente (sentieri ufficiali e uscite di associazioni ed enti parco, con le fonti). Le tue modifiche, note e tracce restano tue: l'archivio aggiorna solo i campi che non hai cambiato.</p>
      <p class="tenue piccolo">${archivio ? `Archivio del ${new Date(archivio.aggiornato).toLocaleString('it-IT')}, ricevuto il ${new Date(archivio.sincronizzato).toLocaleString('it-IT')}.` : 'Archivio non ancora ricevuto.'}</p>
    </section>

    <details class="riquadro crediti-foto">
      <summary><b>Crediti delle foto</b></summary>
      <p class="tenue piccolo">Foto di parchi e animali da Wikimedia Commons. Le foto lungo i sentieri e delle osservazioni hanno i crediti nella foto aperta a schermo pieno.</p>
      <ul>${Object.entries(FOTO)
        .map(([k, f]) => `<li>${escapeHtml(parcoDa(k)?.nomeBreve ?? ANIMALI[k] ?? k)}: <a href="${escapeHtml(f.pagina)}" target="_blank" rel="noopener">${escapeHtml(f.autore)}</a> · ${escapeHtml(f.licenza)}</li>`)
        .join('')}</ul>
    </details>

    <section class="riquadro">
      <h2>I tuoi dati</h2>
      <p>Tutto resta su questo dispositivo: nessun account e nessun server. Fai spesso un backup.</p>
    </section>

    <section class="riquadro">
      <h2>Fonti</h2>
      <p class="tenue">Mappe e sentieri © collaboratori di OpenStreetMap, OpenTopoMap, Waymarked Trails (CC-BY-SA). Quote: TINITALY 10 m dell'INGV (CC BY 4.0) e, come riserva, Open-Meteo (Copernicus).</p>
      <p class="tenue piccolo">Icone degli animali: <a href="https://github.com/microsoft/fluentui-emoji" target="_blank" rel="noopener">Fluent Emoji</a> © Microsoft, licenza MIT.</p>
    </section>
  `;
  const segna = () => {
    for (const b of app.querySelectorAll('[data-tema]')) {
      const scelto = b.dataset.tema === leggiTema();
      b.classList.toggle('attivo', scelto);
      b.setAttribute('aria-checked', String(scelto));
    }
  };
  app.querySelector('.aspetto').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tema]')?.dataset.tema;
    if (!t) return;
    impostaTema(t);
    segna();
  });
  collegaRitmo(app.querySelector('.ritmo-altro'), () => vistaAltro(app));
  const segnaNotte = () => {
    const b = app.querySelector('[data-notte-toggle]');
    b.setAttribute('aria-checked', String(leggiNotte()));
    b.classList.toggle('attiva', leggiNotte());
    b.textContent = leggiNotte() ? 'Modo notturno rosso: acceso' : 'Modo notturno rosso: spento';
  };
  app.querySelector('[data-notte-toggle]').addEventListener('click', () => {
    impostaNotte(!leggiNotte());
    segnaNotte();
  });
  segna();
  segnaNotte();
  return collegaInstalla(app);
}
