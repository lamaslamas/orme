export function vistaAltro(app) {
  app.innerHTML = `
    <h1 class="titolo-pagina">Altro</h1>
    <ul class="menu-altro">
      <li><a href="#/avvistamenti"><b>I miei avvistamenti</b><span>Restano solo su questo telefono</span></a></li>
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
      <h2>I tuoi dati</h2>
      <p>Tutto resta su questo dispositivo: nessun account e nessun server. Fai spesso un backup.</p>
    </section>

    <section class="riquadro">
      <h2>Fonti</h2>
      <p class="tenue">Mappe e sentieri © collaboratori di OpenStreetMap, OpenTopoMap, Waymarked Trails (CC-BY-SA). Quote stimate con Open-Meteo (modello del terreno Copernicus).</p>
    </section>
  `;
}
