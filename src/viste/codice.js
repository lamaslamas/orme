// Codice di comportamento per chi fotografa la natura: pagina in Altro, richiamata da Suggerisci (specie),
// dalla fauna della scheda, e da «Giorno o notte?». Testo di buone pratiche, non un regolamento.
export const REGOLE = [
  ['Resta sui sentieri', 'nei parchi uscire dai sentieri può essere vietato, e il disturbo maggiore agli animali viene da chi si avvicina.'],
  ['Mantieni la distanza', "se un animale cambia comportamento per causa tua (smette di mangiare, si allerta, si allontana) sei troppo vicino. Usa il teleobiettivo, non i passi."],
  ['Niente richiami, esche o cibo', 'abituano gli animali all\'uomo e possono metterli in pericolo, soprattutto orsi e lupi.'],
  ['Nidi e tane', 'non avvicinarti e non spostare la vegetazione. In primavera e inizio estate il disturbo può far abbandonare la covata.'],
  ['Di notte', 'niente flash né luci puntate sugli animali; usa la frontale solo per camminare.'],
  ['Silenzio e gruppi piccoli', 'parla a bassa voce, niente musica, niente droni nelle aree protette senza autorizzazione.'],
  ['Capanni e appostamenti', "nei parchi solo con l'autorizzazione dell'ente gestore."],
];
export const NOTA_REGOLE = "Le regole del parco hanno sempre la precedenza su questa pagina: verificale sul sito dell'ente prima di partire.";
export const NOTA_FINALE = 'Testo di buone pratiche, non un regolamento.';

// Il rimando breve usato nelle altre pagine
export const linkCodice = '<a class="link-codice" href="#/codice">Codice di comportamento ›</a>';

export function vistaCodice(app) {
  app.innerHTML = `
    <a class="indietro" href="#/altro">‹ Altro</a>
    <h1 class="titolo-pagina">Codice di comportamento</h1>
    <p class="tenue">Per chi fotografa gli animali: le buone pratiche che proteggono loro e il posto dove vivono.</p>
    <ul class="codice-regole">${REGOLE.map(([titolo, testo]) => `<li><b>${titolo}</b>: ${testo}</li>`).join('')}
      <li>${NOTA_REGOLE}</li>
    </ul>
    <p class="tenue piccolo">${NOTA_FINALE}</p>`;
}
