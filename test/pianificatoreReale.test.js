// Con risposte vere di BRouter (test/fixtures/brouter-copertino-*.json, tre tratti tra quattro tappe vicino a Copertino):
// ogni tappa si disegna sulla linea, il percorso le attraversa tutte nell'ordine dell'elenco e niente è «fuori sentiero» da solo.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { interpretaBrouter } from '../src/lib/brouter.js';
import { unisciTratti } from '../src/lib/disegno.js';
import { tagliaCode, aggancioDelleTappe, nuovaTappa, tappeDaTraccia, DISTANZA_MASSIMA_AGGANCIO_M, proiettaSuTratti } from '../src/lib/pianificatore.js';

const PUNTI = [[18.04, 40.262], [18.052, 40.272], [18.066, 40.268], [18.058, 40.258]];
const leggi = (i) => JSON.parse(readFileSync(new URL(`./fixtures/brouter-copertino-${i}.json`, import.meta.url), 'utf8'));
const grezzi = [1, 2, 3].map((i) => {
  const r = interpretaBrouter(leggi(i));
  return { coordinate: r.coordinate.map(([lon, lat]) => [lon, lat]), terreno: r.terreno, libero: false };
});
const tappe = PUNTI.map((p) => nuovaTappa(p));
const k = (a, b) => Math.hypot((a[0] - b[0]) * Math.cos((a[1] * Math.PI) / 180), a[1] - b[1]) * 111_195;

describe('pianificatore con risposte vere di BRouter (Copertino, 4 tappe)', () => {
  const fatti = tagliaCode(grezzi);
  const linea = unisciTratti(fatti);
  const viste = aggancioDelleTappe(tappe, fatti);

  it('ogni tappa disegnata dista meno di 5 m dalla linea', () => {
    for (const v of viste) {
      expect(v.p).not.toBeNull();
      expect(proiettaSuTratti([linea], v.p).distanzaM).toBeLessThan(5);
    }
  });
  it('le tappe disegnate stanno dove il percorso di BRouter arriva davvero (a meno di 200 m dal punto toccato)', () => {
    viste.forEach((v, i) => {
      expect(v.distanzaM).toBeLessThan(DISTANZA_MASSIMA_AGGANCIO_M);
      expect(Math.abs(k(v.p, tappe[i].p) - v.distanzaM)).toBeLessThan(1);
    });
    // la prima e l'ultima sono l'inizio e la fine della linea
    expect(k(viste[0].p, linea[0])).toBeLessThan(1);
    expect(k(viste.at(-1).p, linea.at(-1))).toBeLessThan(1);
  });
  it('un tratto finisce dove comincia il successivo, senza salti', () => {
    for (let i = 1; i < fatti.length; i++) expect(k(fatti[i - 1].coordinate.at(-1), fatti[i].coordinate[0])).toBeLessThan(1);
  });
  it('il percorso passa da tutte le tappe nell\'ordine dell\'elenco', () => {
    // per ogni tappa, l'indice del vertice della linea più vicino: deve crescere
    const indici = viste.map((v) => linea.reduce((m, c, i) => (k(c, v.p) < k(linea[m], v.p) ? i : m), 0));
    expect(indici).toEqual([...indici].sort((a, b) => a - b));
    expect(new Set(indici).size).toBe(indici.length);
  });
  it('nessun tratto è «fuori sentiero» se non lo si chiede', () => {
    expect(fatti.every((t) => !t.libero)).toBe(true);
  });
});

describe('riaprire un percorso salvato', () => {
  it('i tratti «fuori sentiero» scelti restano tali', () => {
    const pezzo = Array.from({ length: 30 }, (_, i) => [18.04 + i * 0.001, 40.262, 10]);
    const { tappe: t } = tappeDaTraccia([pezzo], [{ p: pezzo[0], libero: false }, { p: pezzo[10], libero: true }, { p: pezzo[29], libero: false }]);
    expect(t.map((x) => x.libero)).toEqual([false, true, false]);
  });
});
