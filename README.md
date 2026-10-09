# Orme

**I sentieri dei parchi italiani, con gli animali che puoi incontrare e il momento giusto per andarci.**

**Apri l'app:** https://lamaslamas.github.io/orme/ (funziona dal telefono, anche offline: si può installare come app)

Orme è un progetto personale, gratuito e senza pubblicità per scegliere ed esplorare i sentieri
dei parchi dell'Appennino, a piedi, in MTB o in e-MTB, con un'attenzione particolare alla fauna.

## A chi è utile

- a chi va nei parchi nel tempo libero e vuole scegliere bene dove andare;
- a chi cerca la fauna: dove e quando sono stati osservati cervi, camosci, lupi, rapaci;
- a chi va in bici e vuole capire cosa è consentito e percorribile.

Non è una guida ufficiale né un servizio di sicurezza: molte tracce sono "da verificare".

## Cosa fa

- **Centinaia di percorsi** da fonti pubbliche (sentieri segnati su OpenStreetMap, itinerari MTB,
  uscite di associazioni ed enti parco), con lunghezza, dislivello, durata stimata e difficoltà.
- **Fauna**: per ogni percorso gli animali osservati lungo il sentiero o nella zona e i mesi migliori
  (osservazioni verificate da GBIF: iNaturalist, eBird, Observation.org e altre fonti);
  heatmap delle osservazioni e distribuzione ufficiale europea delle specie.
- **Dove vado domani?**: i percorsi migliori per oggi o domani secondo il meteo (pioggia, vento,
  freddo in quota, fango, ore di luce), la durata e le tue preferenze.
- **Compatibilità** con trekking, MTB ed e-MTB, sempre prudente: le regole del parco prevalgono.
- **Lungo il percorso**: rifugi, bivacchi e acqua, indice panoramico, foto e luoghi da vedere.
- **Percorsi da qui**: tocchi un punto sulla mappa e vedi quali sentieri ci passano.
- **Pianifica** un percorso tuo seguendo i sentieri, oppure carica il tuo GPX.

Parchi coperti oggi: Abruzzo, Lazio e Molise · Foreste Casentinesi · Appennino Lucano · Pollino ·
Gallipoli Cognato e Piccole Dolomiti Lucane.

## Privacy

Nessun account e nessun server: preferenze, avvistamenti, foto e giri fatti restano solo sul tuo
dispositivo (con backup su file quando vuoi). Ai servizi esterni vanno solo coordinate di sentieri e mappe.

## Da sapere

- Resta sempre sui sentieri e verifica regole, chiusure e numeri chiusi sul sito del parco.
- Le osservazioni di fauna dicono dove gli animali sono stati visti, non garantiscono un incontro.
  Per le specie protette la posizione è volutamente approssimata.
- Meteo e tracce possono essere sbagliati o non aggiornati: controlla prima di partire.

## Fonti e licenze

Dati © OpenStreetMap (ODbL) · osservazioni GBIF e iNaturalist (licenze CC indicate su ogni
osservazione) · meteo Open-Meteo (CC BY 4.0) · mappe OpenFreeMap, Waymarked Trails, OpenTopoMap,
Esri · distribuzione delle specie EEA (CC BY 4.0) · foto Wikimedia Commons (autore e licenza su
ogni foto, elenco in Altro → Crediti delle foto) · testi Wikipedia (CC BY-SA).

## Sviluppo

```bash
npm install
npm run dev     # avvia l'app in locale su http://localhost:5173/orme/
npm test        # esegue i test
npm run build   # crea la versione da pubblicare in dist/
```

Ogni push su `main` viene pubblicato automaticamente su GitHub Pages
(`.github/workflows/pubblica.yml`).

## Archivio automatico dei percorsi

`public/dati/archivio.json` è l'archivio pubblico dei percorsi: l'app lo scarica e lo
unisce ai dati del telefono senza toccare note, stato e GPX personali.
Ogni giorno `.github/workflows/archivio.yml` esegue `scripts/importa-archivio.mjs`, che legge:

- **Ecotur** (escursioni di un giorno nel PNALM), rispettando il `Crawl-delay` di robots.txt;
- **calendario Wolf Howling** del Parco Nazionale delle Foreste Casentinesi (PDF);
- **itinerari MTB** segnati su OpenStreetMap dentro ciascun parco (ODbL);
- **sentieri escursionistici** segnati su OpenStreetMap (CAI, Sentiero Italia), per ora solo nel Pollino.

Le uscite delle associazioni diventano percorsi "solo con guida", senza traccia
(nessuna traccia inventata). Non vengono salvati nomi di guide, email o telefoni.
Se una fonte non risponde l'archivio resta com'è; se risponde e un percorso è sparito,
viene segnato "non più verificabile". Per provarlo in locale:

```bash
node scripts/importa-archivio.mjs              # tutte le fonti
node scripts/importa-archivio.mjs ecotur       # una sola: ecotur, wolf-howling, osm-mtb, osm-sentieri
```

## Arricchimento giornaliero (scripts/calcola-panorama.mjs)

Dopo l'importazione, per ogni percorso con traccia:
- **animali da GBIF** (la heatmap sulla mappa resta quella di iNaturalist, leggibile a ogni scala;
  conteggi, icone ed elenchi usano tutte le fonti insieme, ognuna una volta: iNaturalist, eBird, Observation.org,
  atlanti, collezioni; `src/lib/gbif.js`): osservazioni "lungo il percorso" (entro 500 m, posizione
  precisa entro 1 km) o "nella zona" (posizioni sfumate o approssimate), solo conteggi e un codice
  anonimo per contare le persone, mai i nomi. `--solo-fauna` ricalcola subito solo la fauna;
- **indice panoramico** (analisi di visibilità sul terreno);
- **terreno** (tag OSM delle vie), al massimo 20 minuti per giro: si completa nei giorni successivi.

**Da vedere** (`scripts/calcola-da-vedere.mjs`, file a parte `public/dati/da-vedere.json`, scaricato
solo quando si apre la scheda di un sentiero): voci di Wikipedia entro 1 km
dalla traccia e foto di Wikimedia Commons entro 300 m (solo licenze libere senza NC/ND, con
autore), al massimo 15 minuti per giro; si rinnova ogni 60 giorni o quando cambia la traccia.

I confini dei parchi sono in `public/dati/confini.json` (`node scripts/scarica-confini.mjs`).

Rifugi, bivacchi, ricoveri, sorgenti e fontanelle dei parchi (OpenStreetMap, ODbL) sono in
`public/dati/punti.json`: li scarica `node scripts/scarica-punti.mjs` durante l'aggiornamento
automatico, al massimo una volta a settimana per parco (`--forza` per rifarli subito). Si salvano
solo dati del luogo (tipo, nome, quota, potabilità, stagionalità), mai telefoni o email.
Sulla mappa sono due livelli separati, "Rifugi e bivacchi" e "Acqua", visibili da zoom 12;
nella scheda del sentiero quelli entro 300 m dalla traccia.

## Dove vado domani?

La pagina `#/domani` ordina i percorsi per oggi o domani con le previsioni orarie di
[Open-Meteo](https://open-meteo.com/) (gratuito, senza chiavi, CC BY 4.0), chieste alla quota di
partenza e a quella del punto più alto. I calcoli sono in `src/lib/condizioni.js`: pioggia e
temporali nelle ore di cammino, freddo percepito in quota, caldo (meno se c'è bosco), raffiche
(più severe sui percorsi esposti), neve e ghiaccio, fango (pioggia dei 3 giorni prima sul terreno
di terra), ore di luce e orario di partenza consigliato. A Open-Meteo vanno solo coordinate e
quote dei sentieri, raggruppate in celle di 0,1°; preferenze e scelte restano sul dispositivo.

Il profilo delle quote di ogni traccia (partenza, punto più alto, dislivello) lo calcola il robot
con il modello del terreno (`src/lib/profiloQuote.js`, campo `quote` dell'archivio);
`node scripts/calcola-panorama.mjs --solo-quote` lo ricalcola senza gli altri passi.

## Distribuzione ufficiale delle specie

`public/dati/distribuzione.json` contiene le celle di 10 km della Direttiva Habitat
(Art. 17, rapporto 2013-2018) per orso, lupo, camoscio, lontra e gatto selvatico:
fonte EEA, licenza CC BY 4.0. Il rapporto cambia ogni sei anni; per riscaricarlo:

```bash
node scripts/scarica-distribuzione.mjs
```

Icone: `scripts/icona.svg` → `npm install --no-save sharp && node scripts/genera-icone.mjs`.

## Struttura

```
src/
  main.js            navigazione tra le schermate (#/...)
  db.js              archivio IndexedDB, backup
  datiIniziali.js    sentieri di partenza
  viste/             lista, scheda, modifica, mappa, gps, backup
  lib/               filtri, modulo, Overpass, GPX, calcoli geografici
test/                test automatici (vitest)
```
