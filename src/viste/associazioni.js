// "Associazioni": le uscite di associazioni e guide come fonte di sentieri da fare da soli. Raggruppate
// per animale e periodo dell'anno ("Lupo · nov–gen"), non per data: anche le uscite passate restano,
// perché il sentiero resta valido.
import { tuttiISentieri, tutteLeTracce } from '../db.js';
import { eUscita, normalizza } from '../lib/filtri.js';
import { gruppiPerStagione, temaUscita } from '../lib/stagioni.js';
import { escapeHtml } from '../lib/formato.js';
import { parcoDa } from '../datiParchi.js';
import { schedaInLista, collegaSalvaDaLista } from './lista.js';

const chiDi = (s) => s.escursione?.associazione || s.organizzatori?.[0] || '';
let filtri = { tema: '', parco: '', chi: '', daCollegare: false }; // restano finché l'app è aperta

export async function vistaAssociazioni(app) {
  const [tutti, tracce] = await Promise.all([tuttiISentieri(), tutteLeTracce()]);
  const uscite = tutti.filter(eUscita);
  app.innerHTML = `
    <h1 class="titolo-pagina">Associazioni</h1>
    <p class="tenue">I sentieri usati da associazioni e guide per le uscite sulla fauna, da fare per conto tuo.</p>
    ${uscite.length ? '<div class="filtri-uscite"></div><div id="gruppiUscite"></div>' : '<p class="vuoto">Nessuna uscita in archivio per ora.</p>'}`;
  if (!uscite.length) return;
  collegaSalvaDaLista();

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
  function disegna() {
    const scelte = uscite.filter(
      (s) =>
        (!filtri.tema || temaUscita(s).chiave === filtri.tema) &&
        (!filtri.parco || (s.parchi ?? [s.parco]).includes(filtri.parco)) &&
        (!filtri.chi || normalizza(chiDi(s)) === normalizza(filtri.chi)) &&
        (!filtri.daCollegare || !tracce.get(s.id)),
    );
    const gruppi = gruppiPerStagione(scelte);
    contenitore.innerHTML = gruppi.length
      ? gruppi
          .map(
            (g) => `
        <section class="gruppo-uscite">
          <h2 class="titolo-sezione">${escapeHtml(g.titolo)} <span class="tenue piccolo">${g.uscite.length}</span></h2>
          <ul class="lista">${g.uscite.map((s) => schedaInLista(s, tracce.get(s.id), true, null, '', { uscita: true })).join('')}</ul>
        </section>`,
          )
          .join('')
      : '<p class="vuoto">Nessuna uscita con questi filtri.</p>';
  }
  barra.addEventListener('change', (e) => {
    const f = e.target.dataset.filtro;
    if (!f) return;
    filtri = { ...filtri, [f]: e.target.type === 'checkbox' ? e.target.checked : e.target.value };
    disegna();
  });
  disegna();
}
