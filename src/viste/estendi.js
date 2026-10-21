// "Estendi": la mappa col sentiero (o percorso) evidenziato e, in arancio, i sentieri collegati. Un tocco su un
// collegato lo aggiunge nel punto di contatto (con la scelta del lato se serve) e mostra subito il nuovo totale;
// «Annulla l'ultimo» torna indietro; «Salva» crea un percorso nuovo in I miei percorsi, senza toccare l'originale.
import L from 'leaflet';
import { leggiPercorso, salvaPercorso } from '../db.js';
import { nuovoIdPercorso } from '../lib/percorso.js';
import { misureSentiero } from '../lib/riassunto.js';
import { misureDeiPezzi } from '../lib/lungoIlPercorso.js';
import { versoDi } from '../lib/verso.js';
import {
  pezziNelVerso, trattiDaPezzi, candidatiEstendi, opzioniAggiunta, raggruppaParti, geojsonDaTratti, nomeProposto,
  etichettaSentiero, stimaDislivello, totali, kmDeiTratti,
} from '../lib/estendi.js';
import { ritmoScelto, testoRitmo } from '../lib/ritmo.js';
import { direzioneGradi, distanzaKm } from '../lib/geo.js';
import { frecceLungoPercorso } from '../lib/tracce.js';
import { escapeHtml, durata } from '../lib/formato.js';
import { creaMappa } from './mappa.js';
import { aggiungiGps } from './gps.js';
import { freccia, marcatoreEstremo } from './disegnoTraccia.js';
import { caricaContesto } from './giri.js';
import { numeriPercorso } from './pianifica.js';
import { quoteDeiPezzi, testoFonteQuote } from './quote.js';
import { COLORI_TAPPE } from './mappaGiro.js';

const COLORE_CANDIDATI = '#ea580c';
const COLORI_ANTEPRIMA = ['#0ea5e9', '#a21caf', '#65a30d', '#e11d48'];
const NOMI_DIREZIONE = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ovest', 'ovest', 'nord-ovest'];
const direzioneTesto = (g) => NOMI_DIREZIONE[Math.round(g / 45) % 8];
const latlng = ([lon, lat]) => [lat, lon];
const km1 = (x) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');

// verso dove va il ramo allontanandosi dal contatto (primi 300 m)
function direzioneRamo(ramo) {
  const punti = ramo.tratti.flatMap((t) => t.linea);
  const da = punti[0];
  const a = punti.find((p) => distanzaKm(da, p) * 1000 >= 300) ?? punti.at(-1);
  return direzioneTesto(direzioneGradi(da, a));
}

export async function vistaEstendi(app, tipo, idCodificato) {
  const id = decodeURIComponent(idCodificato);
  const contesto = await caricaContesto();

  // il punto di partenza: il sentiero dell'archivio o il percorso mio, nel verso scelto
  let nomeBase;
  let pezziBase;
  let riferimentoBase;
  let indietro;
  const esclusi = new Set();
  if (tipo === 'sentiero') {
    const s = contesto.sentieri.get(id);
    const traccia = contesto.tracce.get(id);
    if (s && traccia?.geojson?.coordinates?.length) {
      const m = misureSentiero(s, traccia);
      nomeBase = { etichetta: etichettaSentiero(s), nome: s.nome };
      pezziBase = pezziNelVerso(traccia.geojson, id, s);
      riferimentoBase = { km: m.km, salita: m.salita, discesa: m.discesa };
      esclusi.add(id);
    }
    indietro = `#/sentiero/${encodeURIComponent(id)}`;
  } else {
    const p = await leggiPercorso(id);
    if (p?.geojson?.coordinates?.length) {
      const n = numeriPercorso(p);
      const inv = versoDi({ id });
      nomeBase = { etichetta: p.nome || 'Percorso', nome: p.nome || 'Percorso' };
      pezziBase = pezziNelVerso(p.geojson, id, null);
      riferimentoBase = { km: n.km, salita: n.disl ? (inv ? n.disl.discesa : n.disl.salita) : null, discesa: n.disl ? (inv ? n.disl.salita : n.disl.discesa) : null };
    }
    indietro = `#/percorso/${encodeURIComponent(id)}`;
  }
  if (!pezziBase?.length) {
    app.innerHTML = `<p class="vuoto">Per estenderlo serve una traccia. <a href="${indietro}">Torna indietro</a></p>`;
    return;
  }

  const etichette = { base: nomeBase.etichetta };
  const nomi = { base: nomeBase.nome };
  const rif = { base: riferimentoBase };
  let tratti = trattiDaPezzi(pezziBase.map((l) => l.map(([lon, lat]) => [lon, lat])), 'base');
  const storia = [];
  let candidati = [];
  let richiesta = 0;

  document.body.classList.add('con-mappa', 'estendi-aperto');
  app.innerHTML = `
    <div class="mappa-barra"><a class="indietro" href="${escapeHtml(indietro)}">‹ ${escapeHtml(nomeBase.etichetta)}</a></div>
    <div id="mappa" class="mappa"></div>
    <section class="pannello estendi">
      <h2 class="estendi-titolo">Estendi</h2>
      <p class="tenue piccolo estendi-aiuto">In blu il tuo percorso, in arancio i sentieri collegati (a meno di 50 m o che lo incrociano). Toccane uno per aggiungerlo.</p>
      <div class="estendi-totali" aria-live="polite"></div>
      <ol class="estendi-parti"></ol>
      <div class="estendi-scelte" hidden></div>
      <div class="estendi-azioni">
        <button type="button" class="bottone" data-azione="annulla" disabled>Annulla l'ultimo</button>
      </div>
      <form class="estendi-salva modulo" hidden>
        <label class="campo"><span>Nome del nuovo percorso</span><input name="nome" autocomplete="off" /></label>
        <button type="submit" class="bottone primario pieno-largo">Salva come nuovo percorso</button>
        <p class="tenue piccolo">Va in I miei percorsi. L'originale non cambia.</p>
      </form>
    </section>`;
  const el = {
    totali: app.querySelector('.estendi-totali'),
    parti: app.querySelector('.estendi-parti'),
    scelte: app.querySelector('.estendi-scelte'),
    aiuto: app.querySelector('.estendi-aiuto'),
    annulla: app.querySelector('[data-azione=annulla]'),
    salva: app.querySelector('.estendi-salva'),
  };

  const mappa = creaMappa(app.querySelector('#mappa'), { livelli: ['gps'] });
  // le linee stanno in un livello sopra i segni della mappa, altrimenti i tocchi non le raggiungono
  mappa.createPane('estendi').style.zIndex = 650;
  const tela = L.canvas({ pane: 'estendi', tolerance: 8 });
  const stile = { renderer: tela, pane: 'estendi' };
  // il percorso sta sotto i marcatori (frecce, partenza e arrivo), i collegati sopra i segni per poterli toccare
  mappa.createPane('estendiPercorso').style.zIndex = 420;
  const stilePercorso = { renderer: L.canvas({ pane: 'estendiPercorso' }), pane: 'estendiPercorso' };
  const lPercorso = L.layerGroup().addTo(mappa);
  const lCandidati = L.layerGroup().addTo(mappa);
  const lAnteprima = L.layerGroup().addTo(mappa);
  mappa.attenuaSentieri?.(true);
  const fermaGps = aggiungiGps(mappa, () => ({ geojson: geojsonDaTratti(tratti) }));

  // ---------- disegno ----------
  const ordineParti = () => [...new Set(tratti.map((t) => t.parte))];
  function disegnaPercorso(inquadra = false) {
    lPercorso.clearLayers();
    const ordine = ordineParti();
    const limiti = L.latLngBounds([]);
    for (const t of tratti) {
      const colore = t.parte === 'base' ? '#2563eb' : COLORI_TAPPE[(ordine.indexOf(t.parte) + 2) % COLORI_TAPPE.length];
      L.polyline(t.linea.map(latlng), { ...stilePercorso, color: '#fff', weight: 10, opacity: 0.9, interactive: false }).addTo(lPercorso);
      const l = L.polyline(t.linea.map(latlng), { ...stilePercorso, color: colore, weight: 5, opacity: 0.95, interactive: false }).addTo(lPercorso);
      limiti.extend(l.getBounds());
      for (const f of frecceLungoPercorso([t.linea], 1)) freccia(f.punto, f.direzione, colore).addTo(lPercorso);
    }
    marcatoreEstremo(tratti[0].linea[0], 'partenza').addTo(lPercorso);
    marcatoreEstremo(tratti.at(-1).linea.at(-1), 'arrivo').addTo(lPercorso);
    if (inquadra && limiti.isValid()) mappa.fitBounds(limiti, { padding: [36, 36] });
  }

  function disegnaCandidati() {
    lCandidati.clearLayers();
    for (const c of candidati) {
      const linee = c.pezzi.map((l) => l.map(latlng));
      const gruppo = L.polyline(linee, { ...stile, color: COLORE_CANDIDATI, weight: 5, opacity: 0.9 }).addTo(lCandidati);
      gruppo.bindTooltip(escapeHtml(etichettaSentiero(c.sentiero)), { sticky: true });
      gruppo.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        scegliContatto(c, e.latlng);
      });
      for (const k of c.contatti) {
        L.circleMarker(latlng(k.punto), { ...stile, radius: 8, color: '#fff', weight: 2, fillColor: COLORE_CANDIDATI, fillOpacity: 1 })
          .on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            apriScelte(c, k);
          })
          .addTo(lCandidati);
      }
    }
  }

  // ---------- totali e parti ----------
  function aggiornaParti() {
    const parti = raggruppaParti(tratti);
    el.parti.innerHTML = parti
      .map(
        (p) => `<li><b>${escapeHtml(etichette[p.parte])}</b> ${etichette[p.parte] !== nomi[p.parte] ? `<span class="tenue">${escapeHtml(nomi[p.parte] ?? '')}</span>` : ''} · ${km1(p.km)} km${p.contro ? ' <span class="chip chip-verifica">percorso al contrario</span>' : ''}</li>`,
      )
      .join('');
    el.annulla.disabled = !storia.length;
    el.salva.hidden = ordineParti().length < 2;
    const campo = el.salva.elements.nome;
    if (!campo.dataset.modificato) campo.value = nomeProposto(parti, etichette);
  }
  el.salva.elements.nome.addEventListener('input', (e) => (e.target.dataset.modificato = '1'));

  const testoRit = () => (ritmoScelto() === 'senza' ? 'metodo CAI' : testoRitmo());
  const htmlTotali = (t, nota) => `<p class="estendi-numeri"><b>${km1(t.km)} km</b>${t.salita != null ? ` · <b>+${t.salita} m</b> −${t.discesa} m` : ''} · <b>${t.durataMin != null ? escapeHtml(durata(t.durataMin)) : '–'}</b></p>
    <p class="tenue piccolo">${escapeHtml(testoRit())}${nota ? ` · ${nota}` : ''}</p>`;

  async function aggiornaTotali() {
    const mia = ++richiesta;
    // subito: i km esatti e il dislivello in proporzione; poi le quote vere del percorso intero
    const stima = stimaDislivello(raggruppaParti(tratti), rif);
    el.totali.innerHTML = htmlTotali(totali(tratti, stima), stima ? 'dislivello stimato, calcolo le quote…' : 'calcolo le quote…');
    try {
      const { pezzi, fonte } = await quoteDeiPezzi(tratti.map((t) => t.linea.map(([lon, lat]) => [lon, lat])));
      if (mia !== richiesta) return;
      const m = misureDeiPezzi(pezzi);
      el.totali.innerHTML = htmlTotali({ km: m.km, salita: m.salita, discesa: m.discesa, durataMin: m.durataMin }, m.conQuote ? `${testoFonteQuote(fonte)}` : 'quote non disponibili');
    } catch {
      if (mia === richiesta) el.totali.innerHTML = htmlTotali(totali(tratti, stima), stima ? 'dislivello stimato (quote non disponibili ora)' : 'quote non disponibili ora');
    }
  }

  // ---------- scelte ----------
  function ricalcola() {
    candidati = candidatiEstendi(tratti, contesto.elenco, contesto.tracce, { esclusi: new Set([...esclusi, ...ordineParti().filter((p) => p !== 'base')]) });
    disegnaCandidati();
    el.aiuto.textContent = candidati.length
      ? 'In blu il tuo percorso, in arancio i sentieri collegati (a meno di 50 m o che lo incrociano). Toccane uno per aggiungerlo.'
      : 'Nessun altro sentiero collegato: per unirli puoi disegnare il raccordo (arriva nella prossima versione).';
  }

  function chiudiScelte() {
    el.scelte.hidden = true;
    el.scelte.innerHTML = '';
    lAnteprima.clearLayers();
  }

  function scegliContatto(c, punto) {
    const vicino = c.contatti.reduce((m, k) => {
      const d = distanzaKm([punto.lng, punto.lat], k.punto);
      return !m || d < m.d ? { k, d } : m;
    }, null);
    apriScelte(c, vicino.k);
  }

  function aggiungi(c, opzione) {
    storia.push({ tratti, etichette: { ...etichette }, nomi: { ...nomi }, rif: { ...rif } });
    const s = c.sentiero;
    etichette[s.id] = etichettaSentiero(s);
    nomi[s.id] = s.nome;
    rif[s.id] = (() => {
      const m = misureSentiero(s, contesto.tracce.get(s.id));
      return { km: m.km, salita: m.salita, discesa: m.discesa };
    })();
    tratti = opzione.tratti;
    chiudiScelte();
    disegnaPercorso(false);
    aggiornaParti();
    ricalcola();
    aggiornaTotali();
  }

  function apriScelte(c, contatto) {
    const opzioni = opzioniAggiunta(tratti, contatto);
    if (!opzioni.length) {
      el.scelte.hidden = false;
      el.scelte.innerHTML = '<p class="tenue">Da qui non si può aggiungere: il tratto in comune è troppo corto.</p>';
      return;
    }
    if (opzioni.length === 1) return aggiungi(c, opzioni[0]);
    lAnteprima.clearLayers();
    const righe = opzioni.map((o, i) => {
      const colore = COLORI_ANTEPRIMA[i % COLORI_ANTEPRIMA.length];
      for (const t of o.ramo.tratti) L.polyline(t.linea.map(latlng), { ...stile, color: colore, weight: 6, opacity: 0.95, dashArray: '2 8', lineCap: 'round', interactive: false }).addTo(lAnteprima);
      const parti = raggruppaParti(o.tratti);
      const contro = parti.some((p) => p.parte === c.sentiero.id && p.contro);
      const taglio = o.tieni === 'inizio'
        ? `Il tuo percorso fino all'incrocio, poi il ramo${o.tagliatiKm >= 0.05 ? ` · taglia gli ultimi ${km1(o.tagliatiKm)} km` : ''}`
        : `Dal ramo all'incrocio, poi il tuo percorso fino in fondo${o.tagliatiKm >= 0.05 ? ` · taglia i primi ${km1(o.tagliatiKm)} km` : ''}`;
      return `<button type="button" class="opzione-estendi" data-opzione="${i}">
          <span class="segno" style="background:${colore}"></span>
          <span><b>Ramo verso ${direzioneRamo(o.ramo)}</b> · +${km1(o.aggiuntiKm)} km · totale ${km1(kmDeiTratti(o.tratti))} km${contro ? ' <span class="chip chip-verifica">percorso al contrario</span>' : ''}<br><span class="tenue piccolo">${escapeHtml(taglio)}</span></span>
        </button>`;
    });
    el.scelte.hidden = false;
    el.scelte.innerHTML = `<h3>${escapeHtml(etichettaSentiero(c.sentiero))}: come lo aggiungo?</h3>${righe.join('')}<button type="button" class="bottone testo" data-azione="chiudi-scelte">Lascia stare</button>`;
    el.scelte.onclick = (e) => {
      const o = e.target.closest('[data-opzione]');
      if (o) return aggiungi(c, opzioni[Number(o.dataset.opzione)]);
      if (e.target.closest('[data-azione=chiudi-scelte]')) chiudiScelte();
    };
  }

  el.annulla.addEventListener('click', () => {
    const prima = storia.pop();
    if (!prima) return;
    ({ tratti } = prima);
    for (const k of Object.keys(etichette)) {
      if (k in prima.etichette) continue;
      delete etichette[k];
      delete nomi[k];
      delete rif[k];
    }
    chiudiScelte();
    disegnaPercorso(false);
    aggiornaParti();
    ricalcola();
    aggiornaTotali();
  });
  mappa.on('click', chiudiScelte);

  el.salva.addEventListener('submit', async (e) => {
    e.preventDefault();
    const parti = raggruppaParti(tratti);
    const idNuovo = nuovoIdPercorso();
    const nome = el.salva.elements.nome.value.trim() || nomeProposto(parti, etichette) || 'Percorso esteso';
    const descrizione = parti.map((p) => `${etichette[p.parte]} (${km1(p.km)} km${p.contro ? ', al contrario' : ''})`).join(' → ');
    await salvaPercorso({
      id: idNuovo,
      nome,
      origine: 'esteso',
      note: `Esteso da: ${descrizione}.`,
      composto: parti.map((p) => ({ id: p.parte === 'base' ? id : p.parte, nome: nomi[p.parte], km: Math.round(p.km * 10) / 10, alContrario: p.contro })),
      geojson: geojsonDaTratti(tratti),
    });
    location.hash = `#/percorso/${encodeURIComponent(idNuovo)}`;
  });

  disegnaPercorso(true);
  aggiornaParti();
  ricalcola();
  aggiornaTotali();
  requestAnimationFrame(() => mappa.invalidateSize());

  return () => {
    richiesta++;
    fermaGps();
    mappa.remove();
    document.body.classList.remove('con-mappa', 'estendi-aperto');
  };
}
