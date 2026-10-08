export const FILTRI_VUOTI = { animale: '', stato: '', difficolta: '', accesso: '', paese: '', bici: '', testo: '' };

function normalizza(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

export function filtraSentieri(sentieri, filtri) {
  const testo = normalizza(filtri.testo);
  return sentieri.filter((s) => {
    if (filtri.animale && !(s.animali ?? []).includes(filtri.animale)) return false;
    if (filtri.stato && s.stato !== filtri.stato) return false;
    if (filtri.accesso && (s.accesso?.tipo || 'nessuno') !== filtri.accesso) return false;
    if (filtri.difficolta && (s.difficolta || 'nessuna') !== filtri.difficolta) return false;
    if (filtri.bici && (s.bici?.consentita || 'da_verificare') !== filtri.bici) return false;
    if (filtri.paese && normalizza(s.partenza?.paese) !== normalizza(filtri.paese)) return false;
    if (testo) {
      const dove = normalizza([s.nome, s.zona, ...(s.codici ?? []), s.partenza?.paese].join(' '));
      if (!dove.includes(testo)) return false;
    }
    return true;
  });
}

// Elenco dei paesi di partenza presenti, senza doppioni, in ordine alfabetico
export function paesiDiPartenza(sentieri) {
  const visti = new Map();
  for (const s of sentieri) {
    const p = (s.partenza?.paese ?? '').trim();
    if (p && !visti.has(normalizza(p))) visti.set(normalizza(p), p);
  }
  return [...visti.values()].sort((a, b) => a.localeCompare(b, 'it'));
}

// Ordine: prima i "da fare", poi per primo codice, poi per nome
export function ordinaSentieri(sentieri) {
  return [...sentieri].sort((a, b) => {
    if (a.stato !== b.stato) return a.stato === 'da_fare' ? -1 : 1;
    const ca = a.codici?.[0];
    const cb = b.codici?.[0];
    if (ca && !cb) return -1;
    if (!ca && cb) return 1;
    if (ca && cb && ca !== cb) return ca.localeCompare(cb, 'it', { numeric: true });
    return (a.nome ?? '').localeCompare(b.nome ?? '', 'it');
  });
}

// Per la mappa generale: separa i sentieri filtrati con e senza traccia salvata
export function dividiPerTraccia(sentieri, tracce) {
  const conTraccia = [];
  const senzaTraccia = [];
  for (const s of sentieri) {
    const t = tracce.get(s.id);
    if (t?.geojson?.coordinates?.length) conTraccia.push({ sentiero: s, traccia: t });
    else senzaTraccia.push(s);
  }
  return { conTraccia, senzaTraccia };
}

// Unisce più tracce in un'unica geometria (es. per la distanza GPS dalla più vicina)
export function unisciGeometrie(tracce) {
  return { type: 'MultiLineString', coordinates: tracce.flatMap((t) => t.geojson?.coordinates ?? []) };
}
