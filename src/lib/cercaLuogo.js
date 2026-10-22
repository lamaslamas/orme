// Ricerca sulla mappa: prima i parchi (nome o nome breve), poi i luoghi d'Italia su Nominatim
// (OpenStreetMap). Nominatim si interroga solo quando si preme Cerca, mai lettera per lettera
// come chiede la sua policy, e solo in Italia.
import { normalizza } from './filtri.js';

export const URL_NOMINATIM = 'https://nominatim.openstreetmap.org/search';

// Parchi il cui nome contiene tutte le parole cercate
export function parchiCercati(testo, parchi) {
  const parole = normalizza(testo).split(/\s+/).filter(Boolean);
  if (!parole.length) return [];
  return parchi.filter((p) => {
    const nome = normalizza(`${p.nome} ${p.nomeBreve} ${p.id.replace(/-/g, ' ')}`);
    return parole.every((w) => nome.includes(w));
  });
}

export function urlLuoghi(testo, limite = 5) {
  const u = new URL(URL_NOMINATIM);
  for (const [k, v] of Object.entries({ q: testo.trim(), format: 'jsonv2', countrycodes: 'it', limit: String(limite), 'accept-language': 'it' })) u.searchParams.set(k, v);
  return u.href;
}

// Risposta di Nominatim → [{ nome, dettaglio, lat, lon, riquadro: [sud, ovest, nord, est] | null }]
export function luoghiDallaRisposta(json) {
  return (Array.isArray(json) ? json : [])
    .map((r) => {
      const lat = Number(r.lat);
      const lon = Number(r.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const [nome, ...resto] = String(r.display_name ?? r.name ?? '').split(',').map((x) => x.trim());
      const bb = (r.boundingbox ?? []).map(Number);
      return {
        nome: r.name || nome,
        dettaglio: resto.filter((x) => x && x !== 'Italia').slice(0, 2).join(', '),
        lat,
        lon,
        riquadro: bb.length === 4 && bb.every(Number.isFinite) ? [bb[0], bb[2], bb[1], bb[3]] : null,
      };
    })
    .filter(Boolean)
    // lo stesso luogo come punto e come confine: una volta sola (si tiene il primo)
    .filter((l, i, tutti) => tutti.findIndex((x) => x.nome === l.nome && x.dettaglio === l.dettaglio) === i);
}

// Ordine dei risultati: un luogo che si chiama esattamente come il testo cercato (es. "Gallipoli")
// viene prima dei parchi che lo contengono nel nome ("Gallipoli Cognato"); poi i parchi, poi gli
// altri luoghi. Ogni voce ha il tipo: 'parco' o 'luogo'.
export function risultatiOrdinati(testo, parchi, luoghi) {
  const t = normalizza(testo);
  const p = parchi.map((x) => ({ tipo: 'parco', parco: x, nome: x.nomeBreve, dettaglio: x.nome }));
  const l = luoghi.map((x) => ({ tipo: 'luogo', ...x }));
  const esatti = l.filter((x) => normalizza(x.nome) === t);
  const altri = l.filter((x) => normalizza(x.nome) !== t);
  return [...esatti, ...p, ...altri];
}

// Il paese più vicino a un punto (Nominatim, ricerca inversa a livello di paese): una richiesta per zona, mai di continuo
export function urlLuogoVicino(lon, lat) {
  const u = new URL('https://nominatim.openstreetmap.org/reverse');
  for (const [k, v] of Object.entries({ lat: lat.toFixed(4), lon: lon.toFixed(4), format: 'jsonv2', zoom: '10', 'accept-language': 'it' })) u.searchParams.set(k, v);
  return u.href;
}
// Risposta → nome del paese (o null)
export function luogoVicinoDallaRisposta(json) {
  const a = json?.address ?? {};
  return a.city || a.town || a.village || a.municipality || a.hamlet || json?.name || null;
}
