// Sezione "Pianifica": i miei percorsi (caricati da GPX o disegnati).
// Per ora solo la struttura: caricamento, disegno e analisi arrivano nei passi successivi.
export function vistaPianifica(app) {
  app.innerHTML = `
    <h1 class="titolo-pagina">Pianifica</h1>
    <section class="riquadro">
      <h2>I tuoi percorsi</h2>
      <p>Qui potrai caricare un GPX o disegnare un percorso sulla mappa seguendo i sentieri, e vederne pendenze, terreno e osservazioni naturalistiche lungo il tragitto.</p>
      <p class="tenue">In arrivo nei prossimi passi.</p>
    </section>
  `;
}
