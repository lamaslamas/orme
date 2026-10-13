// "Aggiungi uscita a mano" (sezione Associazioni): titolo, chi organizza, animale, periodo, parco,
// luogo di ritrovo, link e il testo del programma. Dopo il salvataggio i nomi dei luoghi si cercano
// sulla mappa (Nominatim, nel riquadro del parco, uno al secondo) per i Sentieri probabili.
import { salvaSentiero, aggiornaCalcolati } from '../db.js';
import { uscitaAMano, urlLuogoNelParco } from '../lib/uscitaAMano.js';
import { luoghiNelTesto, testoDellUscita } from '../lib/sentieriProbabili.js';
import { ANIMALI } from '../lib/costanti.js';
import { PARCHI } from '../datiParchi.js';
import { escapeHtml } from '../lib/formato.js';

const MAX_LUOGHI = 6;
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));
const campo = (etichetta, html, aiuto = '') => `<label class="campo"><span>${etichetta}</span>${html}${aiuto ? `<small>${aiuto}</small>` : ''}</label>`;

export async function vistaUscitaAMano(app) {
  const parchi = PARCHI.filter((p) => !p.zona);
  app.innerHTML = `
    <a class="indietro" href="#/associazioni">‹ Associazioni</a>
    <h1 class="titolo-pagina">Aggiungi uscita a mano</h1>
    <p class="tenue">Per le uscite che Orme non legge da sola (programmi in immagine, volantini). Resta sul telefono e passa dai Sentieri probabili.</p>
    <form class="modulo" novalidate>
      ${campo('Titolo dell\'uscita', '<input name="titolo" required placeholder="Bramito al Piano Ruggio" />')}
      ${campo('Associazione o guida', '<input name="associazione" required placeholder="Nome dell\'associazione" />', 'Solo il nome dell\'associazione: niente nomi di persone, telefoni o email.')}
      <div class="due">
        ${campo('Animale', `<select name="animale"><option value="">Nessuno in particolare</option>${Object.entries(ANIMALI)
          .filter(([k]) => k !== 'altro')
          .map(([k, n]) => `<option value="${k}">${escapeHtml(n)}</option>`)
          .join('')}</select>`)}
        ${campo('Periodo', '<input name="periodo" placeholder="settembre – ottobre" />')}
      </div>
      ${campo('Parco', `<select name="parco" required><option value="">Scegli…</option>${parchi.map((p) => `<option value="${p.id}">${escapeHtml(p.nome)}</option>`).join('')}</select>`)}
      ${campo('Luogo di ritrovo', '<input name="ritrovo" placeholder="Colle Impiso" />')}
      ${campo('Link al programma', '<input name="link" type="url" inputmode="url" placeholder="https://…" />')}
      ${campo('Testo del programma', `<textarea name="testo" rows="6" placeholder="Incolla qui la descrizione dell'uscita"></textarea>`, 'I nomi dei luoghi (valli, rifugi, sentieri come "sentiero 920") aiutano a trovare il sentiero.')}
      <div class="errori-modulo" role="alert"></div>
      <button type="submit" class="bottone primario">Salva l'uscita</button>
      <p class="tenue piccolo stato-mano" role="status"></p>
    </form>`;
  const form = app.querySelector('form');
  const stato = app.querySelector('.stato-mano');
  let chiusa = false;
  form.addEventListener('input', () => (app.querySelector('.errori-modulo').innerHTML = ''));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { errori, sentiero } = uscitaAMano(Object.fromEntries(new FormData(form)));
    if (errori.length) {
      app.querySelector('.errori-modulo').innerHTML = errori.map((x) => `<p class="errore">${escapeHtml(x)}</p>`).join('');
      return;
    }
    form.querySelector('[type="submit"]').disabled = true;
    await salvaSentiero(sentiero);
    // luoghi sulla mappa: prima il ritrovo, poi i nomi nel testo
    const bbox = PARCHI.find((p) => p.id === sentiero.parco)?.bbox;
    const nomi = [...new Set([sentiero.partenza.paese, ...luoghiNelTesto(testoDellUscita(sentiero))].filter(Boolean))].slice(0, MAX_LUOGHI);
    const punti = [];
    for (const [i, nome] of nomi.entries()) {
      if (chiusa || !bbox) break;
      stato.textContent = `Cerco i luoghi sulla mappa… ${i + 1} di ${nomi.length}`;
      try {
        if (i) await attendi(1100); // una richiesta al secondo, come chiede Nominatim
        const [p] = await (await fetch(urlLuogoNelParco(nome, bbox))).json();
        if (p) punti.push({ nome, lat: Math.round(Number(p.lat) * 1e5) / 1e5, lon: Math.round(Number(p.lon) * 1e5) / 1e5 });
      } catch {
        break; // senza i luoghi restano i nomi nel testo
      }
    }
    if (punti.length) await aggiornaCalcolati(sentiero.id, { luoghi: { punti } });
    if (!chiusa) location.hash = '#/associazioni';
  });
  return () => (chiusa = true);
}
