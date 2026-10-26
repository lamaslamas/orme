// Suggerisci a pagina intera (su computer): stesso motore, stesse scelte, stesso ordine e
// stesso messaggio quando non c'è niente (src/viste/suggeriscimi.js in modoPagina). La mappa qui non si vede: ne serve una
// nascosta solo per il centro da cui misurare le distanze (la mia posizione, se la dai, o l'ultima zona guardata).
import L from 'leaflet';
import { tuttiISentieri, tutteLeTracce } from '../db.js';
import { creaSuggeriscimi } from './suggeriscimi.js';

const CENTRO_ITALIA = [42.5, 12.5];

function ultimaVista() {
  try {
    return JSON.parse(sessionStorage.getItem('orme.viste') ?? '{}').mappa ?? null;
  } catch {
    return null;
  }
}

// la mia posizione, se il telefono la dà in fretta (resta solo in memoria)
function posizioneRapida(attesaMs = 4500) {
  return new Promise((risolvi) => {
    if (!navigator.geolocation) return risolvi(null);
    const t = setTimeout(() => risolvi(null), attesaMs);
    navigator.geolocation.getCurrentPosition(
      (p) => (clearTimeout(t), risolvi([p.coords.longitude, p.coords.latitude])),
      () => (clearTimeout(t), risolvi(null)),
      { maximumAge: 120_000, timeout: attesaMs },
    );
  });
}

export async function vistaSuggerisci(app) {
  app.innerHTML = `
    <div class="pagina-suggerisci">
      <h1 class="titolo-pagina">Suggerisci</h1>
      <div class="suggerisci-pagina"></div>
    </div>`;
  const nascosta = document.createElement('div');
  nascosta.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px;height:700px;visibility:hidden';
  document.body.appendChild(nascosta);
  const vista = ultimaVista();
  const mappa = L.map(nascosta, { zoomControl: false, attributionControl: false, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false }).setView(vista?.centro ?? CENTRO_ITALIA, vista?.zoom ?? 8);
  let chiusa = false;
  const [sentieri, tracce, mia] = await Promise.all([tuttiISentieri(), tutteLeTracce(), posizioneRapida()]);
  if (chiusa || !app.isConnected) {
    mappa.remove();
    nascosta.remove();
    return;
  }
  if (mia) mappa.setView([mia[1], mia[0]], mappa.getZoom());
  const sug = creaSuggeriscimi(app.querySelector('.suggerisci-pagina'), mappa, { sentieri, tracce, posizione: () => mia, modoPagina: true });
  sug.apriPagina();
  return () => {
    chiusa = true;
    mappa.remove();
    nascosta.remove();
  };
}
