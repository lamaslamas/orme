# Aggiungere un'associazione o una guida

Le uscite arrivano nell'archivio con `scripts/importa-archivio.mjs` (ogni giorno, GitHub Actions).
Ogni fonte restituisce candidati nello schema comune di `src/lib/fonti/schema.js`.

## Prima di iniziare

- **robots.txt e condizioni d'uso**: la lettura deve essere consentita. Il robot rispetta `Disallow` e `Crawl-delay` e aspetta comunque almeno 5 s tra due pagine.
- **Niente siti esclusi**: Wikiloc, Komoot e simili restano fuori.
- **Niente dati personali**: nomi delle guide, email e telefoni non si salvano. I testi passano da `togliDatiPersonali`, e un candidato che li contiene ancora viene scartato.
- **Niente tracce inventate**: se la pagina non ha un GPX, l'uscita entra senza traccia.

## Cosa serve sapere della fonte

| Dato | Esempio (Ecotur) | Obbligatorio |
| --- | --- | --- |
| Pagina con l'elenco delle uscite | `https://www.ecotur.org/en/excursions.xhtml` | sì |
| Come riconoscere i link alle uscite | `/excursions/….xhtml` | sì |
| Nome dell'uscita | titolo `<h1>` | sì |
| Organizzatore (associazione) | Ecotur | sì |
| Parco | `pnalm` (id in `src/datiParchi.js`) | sì |
| Descrizione breve | primi paragrafi | no |
| Periodo o date | sezione "Dates" | no |
| Lunghezza, dislivello, durata | dal testo | no |
| Luogo di partenza | sezione "Meeting" | no |
| Traccia GPX | (Ecotur non ne ha) | no |

## Come aggiungerla

1. Crea `src/lib/fonti/<nome>.js` con la definizione:
   `{ fonte, organizzatore, parco, elenco, attesaMs, link(html, base), leggi(html, url) }`.
   - `link` restituisce gli indirizzi delle pagine;
   - `leggi` restituisce `candidatoUscita(def, { url, nome, descrizione, testo, partenza, periodo })`. Restituisce `null` se la pagina ha una forma inattesa, o `{ segnaposto: true }` per una pagina ancora vuota.
   - Facoltativo, `traduzione: { link(html, url), testo(html) }`: legge anche la pagina in un'altra lingua, con la stessa attesa tra le pagine. Il testo serve solo a trovare i nomi dei luoghi per i "Sentieri probabili". Esempio: Ecotur, dove le pagine inglesi non hanno il programma e quelle italiane sì.
2. Aggiungi la definizione in `src/lib/fonti/associazioni.js`.
3. Salva un esempio di pagina in `test/fixtures/` e scrivi un test, come quello di Ecotur in `test/importazione.test.js`.
4. Prova solo quella fonte:

   ```bash
   node scripts/importa-archivio.mjs <fonte>
   ```

Le fonti con una forma diversa (PDF, come il calendario Wolf Howling) hanno un lettore a parte in `importa-archivio.mjs`, ma restituiscono candidati nello stesso schema.
