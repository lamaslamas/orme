// Fauna sulla pagina iniziale (al posto di "Intorno a me"): acceso il pulsante "Fauna", dal basso
// sale un foglio con la heatmap (legenda e filtri), "Ricco di fauna · periodo attuale" per i
// percorsi, i gruppi di animali che interessano e "Cosa vedere qui" per la zona inquadrata.
// Toccando un animale la heatmap mostra solo quello; ritoccandolo si torna ai gruppi.
import L from 'leaflet';
import { GRUPPI_FAUNA, GRUPPI_FAUNA_PREDEFINITI } from '../lib/costanti.js';
import { ricercheSpecieDellaZona, specieDellaZona, zonaInquadrata } from '../lib/intorno.js';
import { escapeHtml } from '../lib/formato.js';
import { stato } from '../stato.js';
import { iconaAnimale, ICONE } from './icone.js';

// gli stessi gruppi scelti in "Intorno a me" (preferenza del telefono)
const CHIAVE_GRUPPI = 'orme.gruppiIntorno';
function leggiGruppi() {
  try {
    const g = JSON.parse(localStorage.getItem(CHIAVE_GRUPPI) ?? 'null');
    return Array.isArray(g) ? g.filter((x) => GRUPPI_FAUNA[x]) : [...GRUPPI_FAUNA_PREDEFINITI];
  } catch {
    return [...GRUPPI_FAUNA_PREDEFINITI];
  }
}
function salvaGruppi(g) {
  try {
    localStorage.setItem(CHIAVE_GRUPPI, JSON.stringify(g));
  } catch {
    // memoria non disponibile: la scelta vale per questa visita
  }
}

const riccoOra = (f) => f.fauna === 'frequenti' && f.stagione === 'adesso';

// contenitore: dove mettere il foglio; restituisce { personalizza, collega(heat), pannello, chiudi }
// allApertura(): quando il foglio si apre (es. per chiudere l'elenco dei percorsi: uno alla volta)
export function creaFaunaHome(contenitore, mappa, { allApertura = () => {}, apriElenco = () => {} } = {}) {
  let gruppi = leggiGruppi();
  let scelta = null; // { inat, nome, scientifico }
  let heat = null;
  let ultimaZona = '';
  let richiesta = 0;

  const foglio = document.createElement('section');
  foglio.className = 'foglio-fauna';
  foglio.hidden = true;
  foglio.setAttribute('aria-label', 'Fauna qui');
  foglio.innerHTML = `
    <button type="button" class="foglio-maniglia-zona" data-azione="riduci-fauna" aria-label="Riduci o apri" aria-expanded="true"><span class="foglio-maniglia"></span></button>
    <div class="fauna-heat"></div>
    <div class="fauna-corpo">
      <div class="fauna-azioni">
        <button type="button" class="chip-scorciatoia" data-azione="ricco">${ICONE.zampa}<span>Ricco di fauna · periodo attuale</span></button>
        <button type="button" class="chip-scorciatoia" data-azione="elenco">${ICONE.percorso}<span>Percorsi qui</span></button>
      </div>
      <h3 class="titolo-sezione">Cosa vedere qui</h3>
      <div class="gruppi-fauna" role="group" aria-label="Animali che ti interessano">${Object.entries(GRUPPI_FAUNA)
        .map(([k, g]) => `<button type="button" class="chip-scorciatoia" data-gruppo="${k}">${escapeHtml(g.nome)}</button>`)
        .join('')}</div>
      <ul class="specie-zona"></ul>
    </div>`;
  contenitore.appendChild(foglio);
  const elenco = foglio.querySelector('.specie-zona');

  function disegnaScelte() {
    for (const b of foglio.querySelectorAll('[data-gruppo]')) {
      const on = gruppi.includes(b.dataset.gruppo);
      b.classList.toggle('attiva', on);
      b.setAttribute('aria-pressed', String(on));
    }
    const ricco = foglio.querySelector('[data-azione="ricco"]');
    const on = riccoOra(stato.leggi().filtri);
    ricco.classList.toggle('attiva', on);
    ricco.setAttribute('aria-pressed', String(on));
  }

  // specie più osservate nella zona inquadrata, nei gruppi scelti
  async function mostraSpecie(forza = false) {
    if (foglio.hidden) return;
    // la zona che si vede davvero: sotto la ricerca e sopra questo foglio
    const { x, y } = mappa.getSize();
    const sotto = Math.max(y * 0.3, y - foglio.offsetHeight);
    const visibile = L.latLngBounds(mappa.containerPointToLatLng([0, Math.min(60, sotto / 2)]), mappa.containerPointToLatLng([x, sotto]));
    const { centro, km } = zonaInquadrata([visibile.getSouth(), visibile.getWest(), visibile.getNorth(), visibile.getEast()]);
    const chiave = JSON.stringify([centro, km, gruppi]);
    if (!forza && chiave === ultimaZona) return;
    ultimaZona = chiave;
    const ricerche = ricercheSpecieDellaZona(centro, km, gruppi);
    if (!ricerche.length) {
      elenco.innerHTML = '<li class="tenue">Scegli almeno un gruppo di animali.</li>';
      return;
    }
    const mia = ++richiesta;
    elenco.innerHTML = '<li class="tenue">Cerco gli animali della zona…</li>';
    let specie;
    try {
      const risposte = await Promise.all(ricerche.map(async (u) => (await fetch(u)).json()));
      specie = specieDellaZona(risposte, undefined, { rare: gruppi.includes('rare') ? [risposte.length - 1] : [] });
    } catch {
      if (mia === richiesta) elenco.innerHTML = '<li class="tenue">Animali non disponibili ora (sei offline?).</li>';
      return;
    }
    if (mia !== richiesta || !foglio.isConnected) return;
    elenco.innerHTML = specie.length
      ? specie
          .map(
            (x) => `<li><button type="button" class="carta-specie-zona ${scelta?.inat === x.inat ? 'scelta' : ''}" data-taxon="${x.inat}" data-nome="${escapeHtml(x.nome)}" data-scientifico="${escapeHtml(x.scientifico)}" aria-pressed="${scelta?.inat === x.inat}" aria-label="${escapeHtml(`${x.nome}, ${x.osservazioni} osservazioni${x.rara ? ', specie rara' : ''}`)}" title="${escapeHtml(x.scientifico)}">
              ${x.foto ? `<img src="${escapeHtml(x.foto.url)}" alt="" loading="lazy" />` : `<span class="specie-icona">${iconaAnimale(x.icona)}</span>`}
              <b>${escapeHtml(x.nome)}</b>${x.rara ? '<span class="specie-rara">rara</span>' : ''}
              <span class="tenue">${x.osservazioni} ${x.osservazioni === 1 ? 'osservazione' : 'osservazioni'}</span>
            </button></li>`,
          )
          .join('')
      : '<li class="tenue">Nessuna osservazione di questi animali nella zona.</li>';
  }

  foglio.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.azione === 'riduci-fauna') {
      const ridotto = !foglio.classList.contains('ridotto');
      foglio.classList.toggle('ridotto', ridotto);
      b.setAttribute('aria-expanded', String(!ridotto));
    } else if (b.dataset.azione === 'elenco') {
      apriElenco();
    } else if (b.dataset.azione === 'ricco') {
      // per i percorsi in elenco: avvistamenti frequenti nel mese corrente e in quelli accanto
      const on = riccoOra(stato.leggi().filtri);
      stato.imposta({ filtri: on ? { fauna: '', stagione: '' } : { fauna: 'frequenti', stagione: 'adesso' } });
    } else if (b.dataset.gruppo) {
      const g = b.dataset.gruppo;
      gruppi = gruppi.includes(g) ? gruppi.filter((x) => x !== g) : [...gruppi, g];
      salvaGruppi(gruppi);
      scelta = null;
      heat?.ricarica();
      disegnaScelte();
      mostraSpecie(true);
    } else if (b.dataset.taxon) {
      const x = { inat: Number(b.dataset.taxon), nome: b.dataset.nome, scientifico: b.dataset.scientifico };
      scelta = scelta?.inat === x.inat ? null : x;
      heat?.ricarica();
      for (const c of elenco.querySelectorAll('[data-taxon]')) {
        const on = Number(c.dataset.taxon) === scelta?.inat;
        c.classList.toggle('scelta', on);
        c.setAttribute('aria-pressed', String(on));
      }
    }
  });

  function mostra(si) {
    foglio.hidden = !si;
    document.body.classList.toggle('fauna-aperta', si);
    if (si) {
      allApertura();
      disegnaScelte();
      mostraSpecie();
    }
  }
  // "Cosa vedere qui" segue la zona inquadrata, solo con il foglio della fauna aperto
  const togliDallaCoda = mappa.dopoIlMovimento('fauna: specie della zona', () => mostraSpecie(), { visibile: () => !foglio.hidden, priorita: 4 });
  const scollega = stato.ascolta((s) => {
    if (s.livelli.heatmap === foglio.hidden) mostra(s.livelli.heatmap);
    else disegnaScelte();
  });

  return {
    // campi in più per la heatmap: i gruppi scelti o l'animale toccato
    personalizza: () => ({ gruppi, ...(scelta ? { taxon: { inat: scelta.inat, scientifico: scelta.scientifico } } : {}) }),
    collega(h) {
      heat = h;
      mostra(Boolean(stato.leggi().livelli.heatmap));
    },
    pannello: foglio.querySelector('.fauna-heat'),
    chiudi() {
      scollega();
      togliDallaCoda();
      document.body.classList.remove('fauna-aperta');
      foglio.remove();
    },
  };
}
