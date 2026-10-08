import L from 'leaflet';
import {
  tuttiGliAvvistamenti,
  leggiAvvistamento,
  salvaAvvistamento,
  eliminaAvvistamento,
  tuttiISentieri,
  tutteLeTracce,
  tuttiIConfini,
} from '../db.js';
import { ANIMALI } from '../lib/costanti.js';
import { PARCHI, parcoDa } from '../datiParchi.js';
import { avvistamentoDaModulo, sentieriVicini, parcoProposto, filtraAvvistamenti, completaAvvistamento } from '../lib/avvistamenti.js';
import { escapeHtml, codici } from '../lib/formato.js';
import { creaMappa } from './mappa.js';
import { impostaBanner } from './banner.js';

// Punto scelto sulla mappa per un nuovo avvistamento: resta in memoria, non nell'indirizzo
let bozzaPunto = null;
export function nuovoAvvistamentoDa(punto) {
  bozzaPunto = punto;
  location.hash = '#/avvistamento/nuovo';
}

export const COLORI_ANIMALI = {
  orso: '#7c4a1e',
  lupo: '#475569',
  camoscio: '#b45309',
  cervo: '#9a3412',
  capriolo: '#c2410c',
  daino: '#a16207',
  muflone: '#78350f',
  cinghiale: '#3f3f46',
};
export const coloreAnimale = (a) => COLORI_ANIMALI[a] ?? '#7c3aed';

function oraLocale(d = new Date()) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function testoDataOra(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export async function vistaElencoAvvistamenti(app) {
  const [avvistamenti, sentieri] = await Promise.all([tuttiGliAvvistamenti(), tuttiISentieri()]);
  const nomi = new Map(sentieri.map((s) => [s.id, s]));
  app.innerHTML = `
    <a class="indietro" href="#/altro">‹ Altro</a>
    <h1 class="titolo-pagina">I miei avvistamenti</h1>
    <p class="tenue">Restano solo su questo telefono. Per aggiungerne uno usa il pulsante con l'occhio in una mappa.</p>
    <div class="due">
      <select id="filtroParco" aria-label="Parco"><option value="">Tutti i parchi</option>${PARCHI.map((p) => `<option value="${p.id}">${escapeHtml(p.nomeBreve)}</option>`).join('')}</select>
      <select id="filtroAnimale" aria-label="Animale"><option value="">Tutti gli animali</option>${Object.entries(ANIMALI)
        .map(([k, et]) => `<option value="${k}">${et}</option>`)
        .join('')}</select>
    </div>
    <ul class="lista" id="elencoAvv" style="margin-top:12px"></ul>
  `;
  const elenco = app.querySelector('#elencoAvv');
  const fp = app.querySelector('#filtroParco');
  const fa = app.querySelector('#filtroAnimale');
  function disegna() {
    const scelti = filtraAvvistamenti(avvistamenti, { parco: fp.value, animale: fa.value });
    elenco.innerHTML = scelti.length
      ? scelti
          .map((a) => {
            const s = nomi.get(a.sentieroId);
            return `<li><a class="carta" href="#/avvistamento/${encodeURIComponent(a.id)}">
              <div class="carta-titolo"><span class="pallino" style="background:${coloreAnimale(a.animale)}"></span>
                <span class="nome">${ANIMALI[a.animale] ?? 'Altro'}${a.individui ? ` × ${a.individui}` : ''}</span></div>
              <div class="carta-dati">${escapeHtml(testoDataOra(a.dataOra))}${a.parco ? ` · ${escapeHtml(parcoDa(a.parco)?.nomeBreve ?? '')}` : ''}</div>
              ${s ? `<div class="carta-dati">vicino a ${escapeHtml(s.codici?.length ? `${codici(s)} ` : '')}${escapeHtml(s.nome)}</div>` : ''}
              ${a.note ? `<div class="carta-dati">${escapeHtml(a.note)}</div>` : ''}
            </a></li>`;
          })
          .join('')
      : '<li class="vuoto">Nessun avvistamento.</li>';
  }
  fp.addEventListener('change', disegna);
  fa.addEventListener('change', disegna);
  disegna();
}

export async function vistaModificaAvvistamento(app, id) {
  const nuovo = id === 'nuovo';
  const esistente = nuovo ? null : await leggiAvvistamento(id);
  if (!nuovo && !esistente) {
    app.innerHTML = '<p class="vuoto">Avvistamento non trovato. <a href="#/avvistamenti">Torna all\'elenco</a></p>';
    return;
  }
  if (nuovo && !bozzaPunto) {
    app.innerHTML = '<p class="vuoto">Per aggiungere un avvistamento apri una mappa e tocca il pulsante con l\'occhio.</p>';
    return;
  }
  const [sentieri, tracce, confini] = await Promise.all([tuttiISentieri(), tutteLeTracce(), tuttiIConfini()]);
  const a = completaAvvistamento(esistente ?? { punto: bozzaPunto, dataOra: oraLocale() });
  bozzaPunto = null;
  const vicini = sentieriVicini(a.punto, sentieri, tracce);
  const sentieroProposto = a.sentieroId ?? (nuovo ? vicini[0]?.sentiero.id ?? null : null);
  const parco = a.parco ?? (nuovo ? parcoProposto(a.punto, confini, vicini[0]?.sentiero) : null);
  impostaBanner(parco);
  const animaliParco = parcoDa(parco)?.animali ?? [];
  const voci = [...Object.entries(ANIMALI)].sort(
    ([x], [y]) => Number(animaliParco.includes(y)) - Number(animaliParco.includes(x)),
  );
  const altriSentieri = sentieri.filter((s) => !vicini.some((v) => v.sentiero.id === s.id) && (!parco || s.parco === parco));

  app.innerHTML = `
    <a class="indietro" href="${nuovo ? 'javascript:history.back()' : '#/avvistamenti'}">‹ Annulla</a>
    <h1 class="titolo-pagina">${nuovo ? 'Nuovo avvistamento' : 'Avvistamento'}</h1>
    <div class="anteprima-mappa"><div id="mappaAvv"></div></div>
    <form class="modulo" novalidate>
      <fieldset>
        <label class="campo"><span>Animale *</span><select name="animale">${voci
          .map(([k, et]) => `<option value="${k}" ${a.animale === k ? 'selected' : ''}>${et}</option>`)
          .join('')}</select></label>
        <div class="due">
          <label class="campo"><span>Data e ora *</span><input type="datetime-local" name="dataOra" value="${escapeHtml(a.dataOra ?? '')}" /></label>
          <label class="campo"><span>Individui</span><input name="individui" inputmode="numeric" value="${escapeHtml(a.individui ?? '')}" placeholder="es. 2" /></label>
        </div>
        <label class="campo"><span>Note</span><textarea name="note" rows="3">${escapeHtml(a.note)}</textarea></label>
      </fieldset>
      <fieldset>
        <legend>Dove</legend>
        <label class="campo"><span>Sentiero vicino</span><select name="sentieroId">
          <option value="">Nessuno</option>
          ${vicini
            .map((v) => `<option value="${v.sentiero.id}" ${sentieroProposto === v.sentiero.id ? 'selected' : ''}>${escapeHtml(v.sentiero.nome)} (${Math.round(v.distanzaM)} m)</option>`)
            .join('')}
          ${altriSentieri
            .map((s) => `<option value="${s.id}" ${sentieroProposto === s.id ? 'selected' : ''}>${escapeHtml(s.nome)}</option>`)
            .join('')}
        </select><small>Proposto il sentiero con traccia più vicino (entro 300 m).</small></label>
        <label class="campo"><span>Parco</span><select name="parco"><option value="">Fuori dai parchi</option>${PARCHI.map(
          (p) => `<option value="${p.id}" ${parco === p.id ? 'selected' : ''}>${escapeHtml(p.nomeBreve)}</option>`,
        ).join('')}</select></label>
        <div class="due">
          <label class="campo"><span>Latitudine</span><input name="lat" value="${a.punto.lat?.toFixed(5) ?? ''}" readonly /></label>
          <label class="campo"><span>Longitudine</span><input name="lon" value="${a.punto.lon?.toFixed(5) ?? ''}" readonly /></label>
        </div>
        <small class="aiuto">${a.punto.origine === 'gps' ? `Dal GPS${a.punto.precisioneM ? `, precisione ± ${a.punto.precisioneM} m` : ''}` : 'Scelto toccando la mappa'}. Trascina il segno sulla mappa per correggerlo.</small>
        <input type="hidden" name="precisioneM" value="${a.punto.precisioneM ?? ''}" />
        <input type="hidden" name="origine" value="${a.punto.origine}" />
      </fieldset>
      <p class="errore" id="erroreModulo" role="alert" hidden></p>
      <div class="azioni">
        <button type="submit" class="bottone primario">Salva</button>
      </div>
      ${nuovo ? '' : '<button type="button" class="bottone pericolo pieno" id="elimina">Elimina avvistamento</button>'}
    </form>
  `;

  const form = app.querySelector('.modulo');
  const mappa = creaMappa(app.querySelector('#mappaAvv'));
  const segno = L.marker([a.punto.lat, a.punto.lon], { draggable: true, icon: L.divIcon({ className: 'segno-avv', html: '<span></span>', iconSize: [22, 22] }) }).addTo(mappa);
  segno.on('dragend', () => {
    const { lat, lng } = segno.getLatLng();
    form.elements.lat.value = lat.toFixed(5);
    form.elements.lon.value = lng.toFixed(5);
    form.elements.origine.value = 'mappa';
    form.elements.precisioneM.value = '';
  });
  mappa.setView([a.punto.lat, a.punto.lon], 15);
  requestAnimationFrame(() => mappa.invalidateSize());

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    let dati;
    try {
      dati = avvistamentoDaModulo(Object.fromEntries(new FormData(form)), esistente ?? {});
    } catch (err) {
      const box = app.querySelector('#erroreModulo');
      box.textContent = err.message;
      box.hidden = false;
      return;
    }
    if (!dati.id) dati.id = `avv-${Date.now().toString(36)}`;
    await salvaAvvistamento(dati);
    location.hash = '#/avvistamenti';
  });

  app.querySelector('#elimina')?.addEventListener('click', async () => {
    if (!confirm('Eliminare questo avvistamento?')) return;
    await eliminaAvvistamento(esistente.id);
    location.hash = '#/avvistamenti';
  });

  return () => mappa.remove();
}
