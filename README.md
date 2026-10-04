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
