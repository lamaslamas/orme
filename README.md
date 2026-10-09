# Orme

Web app personale (PWA) per raccogliere e percorrere i sentieri faunistici del
Parco Nazionale d'Abruzzo, Lazio e Molise (orso, lupo, camoscio, cervo).

**Apri:** https://lamaslamas.github.io/orme/

- Lista filtrabile per animale, stato, tipo di accesso e paese di partenza
- Scheda di ogni sentiero, con accesso, escursione d'origine e diario
- Traccia da OpenStreetMap (per codice PNALM) o da file GPX
- Posizione GPS sulla mappa, con distanza dalla traccia
- Backup in JSON (esporta / importa)

I dati restano solo sul dispositivo (IndexedDB): nessun account, nessun server.
I sentieri iniziali sono marcati "da verificare". Non vengono salvati punti di
avvistamento o appostamento: solo sentieri ufficiali e zone.

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
- **animali da GBIF** (tutte le fonti insieme, ognuna una volta: iNaturalist, eBird, Observation.org,
  atlanti, collezioni; `src/lib/gbif.js`): osservazioni "lungo il percorso" (entro 500 m, posizione
  precisa entro 1 km) o "nella zona" (posizioni sfumate o approssimate), solo conteggi e un codice
  anonimo per contare le persone, mai i nomi. `--solo-fauna` ricalcola subito solo la fauna;
- **indice panoramico** (analisi di visibilità sul terreno);
- **terreno** (tag OSM delle vie), al massimo 20 minuti per giro: si completa nei giorni successivi.

**Da vedere** (`scripts/calcola-da-vedere.mjs`, campo `daVedere`): voci di Wikipedia entro 1 km
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
