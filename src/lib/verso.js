// Verso di percorrenza di un sentiero: la traccia dell'archivio può essere registrata al contrario rispetto al
// nome ("Sorgente Copone – Monte Volturino" che parte dalla cima). "Inverti senso" lo cambia solo su questo
// telefono: la traccia salvata resta com'è e si capovolge quello che dipende dal verso (profilo, salita e discesa,
// tratti in km, partenza e arrivo). Nell'archivio non si inverte niente in automatico.
const CHIAVE = 'orme.versoInvertito';

function memoria() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
function leggi() {
  try {
    return JSON.parse(memoria()?.getItem(CHIAVE) ?? '{}') ?? {};
  } catch {
    return {};
  }
}
// Il verso di un sentiero: la scelta personale su questo telefono, se c'è; altrimenti quello dell'archivio
// ("verso": "invertito", deciso per i sentieri registrati al contrario e conservato dal robot)
export const versoDallArchivio = (s) => s?.verso === 'invertito';
export function versoDi(s) {
  const mia = s?.id ? leggi()[s.id] : undefined;
  return typeof mia === 'boolean' ? mia : versoDallArchivio(s);
}
// solo la scelta personale (senza sapere dell'archivio): per le prove e i vecchi richiami
export const versoInvertito = (id) => leggi()[id] === true;
// predefinito: il verso dell'archivio; se la scelta coincide, si torna a quello (niente scelta salvata)
export function impostaVerso(id, invertito, predefinito = false) {
  const v = leggi();
  if (invertito === predefinito) delete v[id];
  else v[id] = invertito;
  try {
    memoria()?.setItem(CHIAVE, JSON.stringify(v));
  } catch {
    // senza memoria vale finché la pagina è aperta
  }
}

// Le quote del robot nel verso opposto: profilo capovolto, salita e discesa scambiate, partenza all'altro capo
export function invertiQuote(q) {
  if (!q) return q;
  const profilo = Array.isArray(q.profilo) ? [...q.profilo].reverse() : q.profilo;
  return {
    ...q,
    salita: q.discesa,
    discesa: q.salita,
    profilo,
    partenza: Array.isArray(q.profilo) ? { ...(q.arrivo ?? {}), quota: q.profilo.at(-1) } : q.arrivo ?? q.partenza,
    arrivo: q.partenza,
    invertito: true,
  };
}

// Un tratto in km dalla partenza (più fauna, più panoramico), visto dall'altro capo
export function specchiaTratto(t, kmTotale) {
  if (!t || !Number.isFinite(kmTotale)) return t;
  const r = (x) => Math.round(Math.max(0, kmTotale - x) * 10) / 10;
  return { ...t, daKm: r(t.aKm), aKm: r(t.daKm) };
}

// "Probabilmente invertito": il nome è "A – B" con B che sa di cima (Monte, Pizzo, Cima, Vetta, Punta, Colle,
// Serra) e la traccia parte dal suo punto più alto per scendere. quote: quelle del robot (o null)
const CIMA = /\b(monte|pizzo|cima|vetta|punta|colle|serra)\b/i;
export function probabilmenteInvertito(nome, quote) {
  const testo = String(nome ?? '').replace(/^[^:]*:\s*/, '');
  let parti = testo.split(/\s+[–—-]\s+/);
  // "Sentiero 00 – da Monte Falco a Passo della Calla": partenza e arrivo sono nel "da … a …"
  const daA = parti.at(-1).match(/^da\s+(.+?)\s+a\s+(.+)$/i);
  if (daA) parti = [daA[1], daA[2]];
  if (parti.length < 2) return null;
  const [a, b] = [parti[0], parti.at(-1)];
  if (!CIMA.test(b) || CIMA.test(a)) return null;
  const p = quote?.profilo;
  const partenza = Array.isArray(p) && p.length ? p[0] : quote?.partenza?.quota;
  const arrivo = Array.isArray(p) && p.length ? p.at(-1) : null;
  if (!Number.isFinite(partenza) || !Number.isFinite(arrivo) || !Number.isFinite(quote?.max)) return null;
  // parte (quasi) dal punto più alto e arriva molto più in basso
  if (partenza < quote.max - 30 || arrivo > partenza - 100) return null;
  return { partenzaQuota: Math.round(partenza), arrivoQuota: Math.round(arrivo), cima: b };
}
