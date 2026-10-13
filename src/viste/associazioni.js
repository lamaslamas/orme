// "Associazioni": le uscite di associazioni e guide come fonte di sentieri da fare da soli. Raggruppate
// per animale e periodo dell'anno ("Lupo · nov–gen"), non per data: anche le uscite passate restano,
// perché il sentiero resta valido.
import { tuttiISentieri, tutteLeTracce } from '../db.js';
import { eUscita, normalizza } from '../lib/filtri.js';
import { gruppiPerStagione, temaUscita } from '../lib/stagioni.js';
import { escapeHtml } from '../lib/formato.js';
import { parcoDa } from '../datiParchi.js';
import { schedaInLista, collegaSalvaDaLista } from './lista.js';
import { montaDaCollegare } from './daCollegare.js';
import { creaMappa } from './cartografia.js';
import { puntiDiRitrovo } from '../lib/collegamenti.js';
import { raggruppaVicini } from '../lib/raggruppa.js';
import L from 'leaflet';

const chiDi = (s) => s.escursione?.associazione || s.organizzatori?.[0] || '';
let filtri = { tema: '', parco: '', chi: '', daCollegare: false }; // restano finché l'app è aperta
let modo = 'elenco'; // elenco per animale e periodo, oppure mappa dei punti di ritrovo
// una sola mappa aperta (anche quando la sezione si ridisegna dopo una scelta)
let mappa = null;
function togliMappa() {
  mappa?.remove();
  mappa = null;
}

export async function vistaAssociazioni(app) {
  const [tutti, tracce] = await Promise.all([tuttiISentieri(), tutteLeTracce()]);
  const uscite = tutti.filter(eUscita);
  app.innerHTML = `
    <h1 class="titolo-pagina">Associazioni</h1>
    <p class="tenue">I sentieri usati da associazioni e guide per le uscite sulla fauna, da fare per conto tuo.</p>
    <a class="bottone testo aggiungi-uscita" href="#/associazioni/nuova">+ Aggiungi uscita a mano</a>
    ${uscite.length ? `<div id="daCollegare"></div><div class="filtri-uscite"></div>
      <div class="segmenti due modo-uscite" role="tablist" aria-label="Come vedere le uscite">
        <button type="button" role="tab" class="segmento" data-modo="elenco">Elenco</button>
        <button type="button" role="tab" class="segmento" data-modo="mappa">Mappa</button>
      </div>
      <div id="gruppiUscite"></div>` : '<p class="vuoto">Nessuna uscita in archivio per ora.</p>'}`;
  if (!uscite.length) return;
  collegaSalvaDaLista();
  // dopo una scelta si ridisegna tutto restando allo stesso punto della pagina
  const alCambio = async () => {
    const y = window.scrollY;
    await vistaAssociazioni(app);
    window.scrollTo(0, y);
  };
  montaDaCollegare(app.querySelector('#daCollegare'), { uscite, sentieri: tutti, tracce, alCambio });

  const temi = gruppiPerStagione(uscite);
  const opzioni = (valori, scelto) => valori.map(([v, t]) => `<option value="${escapeHtml(v)}" ${v === scelto ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('');
  const parchi = [...new Set(uscite.flatMap((s) => s.parchi ?? [s.parco]))].map((id) => [id, parcoDa(id)?.nomeBreve ?? id]);
  const chi = [...new Set(uscite.map(chiDi).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it')).map((c) => [c, c]);
  const barra = app.querySelector('.filtri-uscite');
  barra.innerHTML = `
    <select data-filtro="tema" aria-label="Animale">${opzioni([['', 'Tutti gli animali'], ...temi.map((g) => [g.chiave, g.nome])], filtri.tema)}</select>
    <select data-filtro="parco" aria-label="Parco">${opzioni([['', 'Tutti i parchi'], ...parchi], filtri.parco)}</select>
    <select data-filtro="chi" aria-label="Chi organizza">${opzioni([['', 'Tutte le associazioni'], ...chi], filtri.chi)}</select>
    <label class="filtro-spunta"><input type="checkbox" data-filtro="daCollegare" ${filtri.daCollegare ? 'checked' : ''} /> Solo da collegare</label>`;

  const contenitore = app.querySelector('#gruppiUscite');
  const cartaUscita = (s) => schedaInLista(s, tracce.get(s.id), true, null, '', { uscita: true });
  togliMappa();
  function disegna() {
    for (const b of app.querySelectorAll('[data-modo]')) {
      b.classList.toggle('attivo', b.dataset.modo === modo);
      b.setAttribute('aria-selected', String(b.dataset.modo === modo));
    }
    const scelte = uscite.filter(
      (s) =>
        (!filtri.tema || temaUscita(s).chiave === filtri.tema) &&
        (!filtri.parco || (s.parchi ?? [s.parco]).includes(filtri.parco)) &&
        (!filtri.chi || normalizza(chiDi(s)) === normalizza(filtri.chi)) &&
        (!filtri.daCollegare || !tracce.get(s.id)),
    );
    togliMappa();
    if (modo === 'mappa') return disegnaMappa(scelte);
    const gruppi = gruppiPerStagione(scelte);
    contenitore.innerHTML = gruppi.length
      ? gruppi
          .map(
            (g) => `
        <section class="gruppo-uscite">
          <h2 class="titolo-sezione">${escapeHtml(g.titolo)} <span class="tenue piccolo">${g.uscite.length}</span></h2>
          <ul class="lista">${g.uscite.map(cartaUscita).join('')}</ul>
        </section>`,
          )
          .join('')
      : '<p class="vuoto">Nessuna uscita con questi filtri.</p>';
  }

  // Mappa dei punti di ritrovo: un numero per paese; toccandolo, sotto le sue uscite
  function disegnaMappa(scelte) {
    const punti = puntiDiRitrovo(scelte, tracce);
    const senza = scelte.length - punti.reduce((n, p) => n + p.uscite.length, 0);
    contenitore.innerHTML = `
      <div class="mappa-ritrovi"><div id="mappaRitrovi"></div></div>
      <p class="tenue piccolo">${punti.length ? 'Tocca un numero per vedere le uscite che partono da lì.' : 'Nessun punto di ritrovo con questi filtri.'}${senza ? ` ${senza} ${senza === 1 ? 'uscita non ha' : 'uscite non hanno'} un luogo sulla mappa.` : ''}</p>
      <div id="usciteDelPunto"></div>`;
    mappa = creaMappa(contenitore.querySelector('#mappaRitrovi'));
    const sotto = contenitore.querySelector('#usciteDelPunto');
    const mostraPunto = (p) => {
      const n = p.uscite.length;
      sotto.innerHTML = `<h2 class="titolo-sezione">${escapeHtml(p.nome || 'Punto di ritrovo')} <span class="tenue piccolo">${n}</span></h2><ul class="lista">${p.uscite.map(cartaUscita).join('')}</ul>`;
      sotto.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    // segni vicini sullo schermo uniti in uno (la somma): toccandolo la mappa si avvicina
    const segni = L.layerGroup().addTo(mappa);
    const disegnaSegni = () => {
      segni.clearLayers();
      const inPixel = (p) => {
        const q = mappa.latLngToLayerPoint([p.lat, p.lon]);
        return [q.x, q.y];
      };
      for (const g of raggruppaVicini(punti, inPixel)) {
        const n = g.punti.reduce((t, p) => t + p.uscite.length, 0);
        const solo = g.punti.length === 1 ? g.punti[0] : null;
        const segno = L.marker(mappa.layerPointToLatLng([g.x, g.y]), {
          icon: L.divIcon({ className: `segno-ritrovo${solo ? '' : ' gruppo'}`, html: `<span>${n}</span>`, iconSize: [30, 30] }),
          title: solo ? `${solo.nome}: ${n} ${n === 1 ? 'uscita' : 'uscite'}` : `${g.punti.length} punti di ritrovo, ${n} uscite`,
          keyboard: true,
        }).addTo(segni);
        segno.on('click', () => {
          if (solo) return mostraPunto(solo);
          mappa.fitBounds(L.latLngBounds(g.punti.map((p) => [p.lat, p.lon])), { padding: [40, 40], maxZoom: 14 });
        });
      }
    };
    mappa.on('zoomend', disegnaSegni);
    const limiti = L.latLngBounds(punti.map((p) => [p.lat, p.lon]));
    if (limiti.isValid()) mappa.fitBounds(limiti, { padding: [30, 30], maxZoom: 12 });
    disegnaSegni();
    requestAnimationFrame(() => {
      mappa?.invalidateSize();
      if (mappa) disegnaSegni();
    });
  }
  app.querySelector('.modo-uscite').addEventListener('click', (e) => {
    const m = e.target.closest('[data-modo]')?.dataset.modo;
    if (!m || m === modo) return;
    modo = m;
    disegna();
  });
  barra.addEventListener('change', (e) => {
    const f = e.target.dataset.filtro;
    if (!f) return;
    filtri = { ...filtri, [f]: e.target.type === 'checkbox' ? e.target.checked : e.target.value };
    disegna();
  });
  disegna();
  return togliMappa;
}
