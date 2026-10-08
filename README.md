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
- **itinerari MTB** segnati su OpenStreetMap dentro ciascun parco (ODbL).

Le uscite delle associazioni diventano percorsi "solo con guida", senza traccia
(nessuna traccia inventata). Non vengono salvati nomi di guide, email o telefoni.
Se una fonte non risponde l'archivio resta com'è; se risponde e un percorso è sparito,
viene segnato "non più verificabile". Per provarlo in locale:

```bash
node scripts/importa-archivio.mjs              # tutte le fonti
node scripts/importa-archivio.mjs ecotur       # una sola: ecotur, wolf-howling, osm-mtb
```

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
