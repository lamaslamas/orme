import { tuttiISentieri, tutteLeTracce, salvaSentiero, salvaTraccia } from '../db.js';
import { parcoDa } from '../datiParchi.js';
import {
  interrogaOverpass,
  queryElencoParco,
  queryGeometrie,
  interpretaElenco,
  interpretaRisposta,
  combinaTraccia,
  sentieroDaRelazione,
  nomeRelazione,
} from '../lib/overpass.js';
import { escapeHtml, creaId } from '../lib/formato.js';
import { impostaBanner } from './banner.js';

const BLOCCO = 20; // relazioni per richiesta

export async function vistaImporta(app, id) {
  const parco = parcoDa(id);
  if (!parco) {
    app.innerHTML = '<p class="vuoto">Parco non trovato.</p>';
    return;
  }
  impostaBanner(parco.id);
  const indietro = `#/parco/${encodeURIComponent(parco.id)}`;
  app.innerHTML = `
    <a class="indietro" href="${indietro}">‹ ${escapeHtml(parco.nomeBreve)}</a>
    <h1 class="titolo-pagina">Importa sentieri</h1>
    <p class="tenue">Sentieri escursionistici segnati su OpenStreetMap dentro il confine del parco. Quelli che scegli vengono aggiunti con la traccia e il bollino "da verificare": animali, accesso e bici restano da compilare.</p>
    <div id="contenuto"><p class="messaggio">Chiedo l'elenco a OpenStreetMap…</p></div>
  `;
  const contenuto = app.querySelector('#contenuto');

  let elenco;
  try {
    elenco = interpretaElenco(await interrogaOverpass(queryElencoParco(parco.id), { timeoutMs: 90000 }));
  } catch (e) {
    contenuto.innerHTML = `<p class="errore">${escapeHtml(e.message)}</p>`;
    return;
  }
  if (!elenco.length) {
    contenuto.innerHTML = '<p class="vuoto">Nessun sentiero escursionistico trovato su OpenStreetMap in questo parco.</p>';
    return;
  }

  const [sentieri, tracce] = await Promise.all([tuttiISentieri(), tutteLeTracce()]);
  const giaImportate = new Set([...tracce.values()].flatMap((t) => t.dettagli?.relazioniOsm ?? []));

  contenuto.innerHTML = `
    <label class="ricerca"><input type="search" id="cercaImport" placeholder="Filtra per codice o nome…" aria-label="Filtra" /></label>
    <p class="riga-conteggio"><span id="contaImport"></span></p>
    <ul class="elenco-import" id="elencoImport">
      ${elenco
        .map(
          (r) => `<li data-testo="${escapeHtml(`${r.ref} ${nomeRelazione(r)} ${r.da} ${r.a}`.toLowerCase())}">
            <label class="scelta">
              <input type="checkbox" value="${r.idOsm}" ${giaImportate.has(r.idOsm) ? 'disabled' : ''} />
              <span>${r.ref ? `<span class="codice">${escapeHtml(r.ref)}</span> ` : ''}${escapeHtml(nomeRelazione(r))}${
                r.km ? ` <span class="tenue">· ${String(r.km).replace('.', ',')} km</span>` : ''
              }${giaImportate.has(r.idOsm) ? ' <span class="chip chip-traccia">Già presente</span>' : ''}</span>
            </label>
          </li>`,
        )
        .join('')}
    </ul>
    <div class="barra-azioni">
      <a class="bottone" href="${indietro}">Annulla</a>
      <button type="button" class="bottone primario" id="importa" disabled>Importa</button>
    </div>
  `;

  const presenti = elenco.filter((r) => giaImportate.has(r.idOsm)).length;
  const lista = contenuto.querySelector('#elencoImport');
  const bottone = contenuto.querySelector('#importa');
  const conta = contenuto.querySelector('#contaImport');

  function aggiornaConteggio() {
    const n = lista.querySelectorAll('input:checked').length;
    bottone.disabled = n === 0;
    bottone.textContent = n ? `Importa ${n} ${n === 1 ? 'sentiero' : 'sentieri'}` : 'Importa';
    conta.textContent = `${elenco.length} sentieri su OpenStreetMap${presenti ? `, ${presenti} già presenti` : ''} · ${n} scelti`;
  }
  lista.addEventListener('change', aggiornaConteggio);
  contenuto.querySelector('#cercaImport').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    for (const li of lista.children) li.hidden = q && !li.dataset.testo.includes(q);
  });
  aggiornaConteggio();

  bottone.addEventListener('click', async () => {
    const scelti = [...lista.querySelectorAll('input:checked')].map((i) => Number(i.value));
    const perId = new Map(elenco.map((r) => [r.idOsm, r]));
    const ids = new Set(sentieri.map((s) => s.id));
    bottone.disabled = true;
    let fatti = 0;
    try {
      for (let k = 0; k < scelti.length; k += BLOCCO) {
        const blocco = scelti.slice(k, k + BLOCCO);
        conta.textContent = `Scarico le tracce… ${fatti} di ${scelti.length}`;
        const candidati = interpretaRisposta(await interrogaOverpass(queryGeometrie(blocco), { timeoutMs: 120000 }));
        for (const c of candidati) {
          const sentiero = sentieroDaRelazione(perId.get(c.idOsm), parco.id);
          const base = creaId(sentiero.codici, `${parco.id} ${sentiero.nome}`);
          let nuovo = base;
          for (let n = 2; ids.has(nuovo); n++) nuovo = `${base}-${n}`;
          ids.add(nuovo);
          await salvaSentiero({ ...sentiero, id: nuovo });
          await salvaTraccia({ sentieroId: nuovo, ...combinaTraccia([c]) });
          fatti++;
        }
      }
    } catch (e) {
      conta.innerHTML = `<span class="errore">${escapeHtml(e.message)}</span> Importati finora: ${fatti}.`;
      bottone.disabled = false;
      return;
    }
    location.hash = indietro;
  });
}
