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
