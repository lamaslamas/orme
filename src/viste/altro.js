import { infoArchivio } from '../db.js';
import { FOTO } from '../datiFoto.js';
import { parcoDa } from '../datiParchi.js';
import { ANIMALI } from '../lib/costanti.js';
import { escapeHtml } from '../lib/formato.js';

export async function vistaAltro(app) {
  const archivio = await infoArchivio();
  app.innerHTML = `
    <h1 class="titolo-pagina">Altro</h1>
    <ul class="menu-altro">
      <li><a href="#/backup"><b>Backup</b><span>Esporta e importa sentieri, tracce e giri</span></a></li>
      <li><a href="#/nuovo"><b>Aggiungi un sentiero</b><span>Inserisci a mano un nuovo sentiero</span></a></li>
      <li><a href="#/giro-nuovo"><b>Nuovo giro</b><span>Combina più sentieri in un unico percorso</span></a></li>
    </ul>

    <section class="riquadro">
      <h2>Regole del Parco</h2>
      <p>Nel Parco è vietato uscire dai sentieri. Alcuni sentieri hanno accesso solo con guida, a numero chiuso o con chiusure periodiche, che cambiano ogni anno: verifica sempre sul sito del Parco prima di partire.</p>
      <p>I tuoi avvistamenti restano solo su questo telefono: non sono mai nel codice dell'app e sono esclusi dai backup da condividere.</p>
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
      <p class="tenue">Mappe e sentieri © collaboratori di OpenStreetMap, OpenTopoMap, Waymarked Trails (CC-BY-SA). Quote stimate con Open-Meteo (modello del terreno Copernicus).</p>
    </section>
  `;
}
