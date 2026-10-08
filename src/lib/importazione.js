// Importazione automatica nell'archivio pubblico: funzioni pure (niente rete),
// usate da scripts/importa-archivio.mjs. Regole:
// - niente dati personali (nomi delle guide, email, telefoni);
// - niente tracce inventate: la geometria arriva solo da OpenStreetMap o da un GPX con licenza;
// - le uscite guidate restano "solo con guida", mai percorsi autonomi;
// - una fonte non raggiunta oggi non cambia nulla: si segna "non più verificabile"
//   solo quando la fonte risponde e il percorso non c'è più.
import { completaSentiero } from './sentiero.js';

// ---------- testo ----------

const ENTITA = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', euro: '€', egrave: 'è', eacute: 'é', agrave: 'à', ograve: 'ò', ugrave: 'ù', igrave: 'ì', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', copy: '©' };

export function decodificaEntita(s) {
  return String(s ?? '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (tutto, e) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : tutto;
    }
    return ENTITA[e.toLowerCase()] ?? tutto;
  });
}

// Righe di testo leggibili di una pagina HTML (script e stili esclusi)
export function righeDaHtml(html) {
  return decodificaEntita(
    String(html ?? '')
      .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr|td|th|section|article|dd|dt)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .split('\n')
    .map((r) => r.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

// Toglie email, telefoni e "Guida: Nome Cognome": nell'archivio non vanno dati personali
export function togliDatiPersonali(testo) {
  return String(testo ?? '')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '')
    .replace(/(\+39[\s.]?)?\b(3\d{2}|0\d{1,3})[\s./-]?\d{3,4}[\s./-]?\d{3,4}\b/g, '')
    .replace(/\b(cel|cell|tel|telefono|email|e-mail|mail)\b\.?\s*:?/gi, '')
    .replace(/\b[Gg](?:uida|UIDA)\s*:\s*[A-ZÀ-Ý][\p{L}']+(\s+[A-ZÀ-Ý][\p{L}']+){0,2}/gu, '')
    .replace(/\s+([.,;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Riassunto breve: le prime frasi fino a circa "max" caratteri
export function riassunto(testo, max = 280) {
  const t = String(testo ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const taglio = t.slice(0, max);
  const fine = Math.max(taglio.lastIndexOf('. '), taglio.lastIndexOf('! '), taglio.lastIndexOf('? '));
  return fine > max * 0.4 ? taglio.slice(0, fine + 1) : `${taglio.slice(0, taglio.lastIndexOf(' '))}…`;
}

export function slug(testo, max = 60) {
  const s = String(testo ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length <= max) return s;
  // se va accorciato si taglia tra due parole
  const fine = s.slice(0, max + 1).lastIndexOf('-');
  return (fine > 0 ? s.slice(0, fine) : s.slice(0, max)).replace(/-+$/, '');
}

// ---------- animali ----------

// Parole chiave in italiano e inglese per ogni animale
const PAROLE_ANIMALI = {
  orso: /\b(orsi|orso|orsa|orse|bears?|bearwatching|ursus)\b/i,
  lupo: /\b(lupo|lupi|lupa|lupacchiott\w*|wol(f|ves)|howling|canis lupus)\b|ululat|ululi/i,
  camoscio: /camosc|\bchamois\b|rupicapra/i,
  cervo: /\b(cervo|cervi|cerva|stags?|cervus)\b|bramit|red deer|(?<!roe |fallow )\bdeer\b/i,
  capriolo: /caprio(lo|li|la)\b|roe deer|capreolus/i,
  daino: /\b(daino|daini)\b|fallow deer/i,
  muflone: /muflon|mouflon/i,
  cinghiale: /cinghial|wild boar/i,
  volpe: /\b(volpe|volpi|fox|foxes)\b/i,
  lontra: /\b(lontra|lontre|otters?)\b/i,
  gatto_selvatico: /gatto selvatico|gatti selvatici|wild ?cats?\b/i,
  aquila_reale: /aquila reale|aquile reali|golden eagles?/i,
  gufo_reale: /gufo reale|eagle[- ]owls?/i,
  nibbio_reale: /nibbio reale|red kites?/i,
  cicogna_nera: /cicogna nera|black storks?/i,
};

export function animaliNelTesto(testo) {
  const t = String(testo ?? '');
  return Object.entries(PAROLE_ANIMALI)
    .filter(([, re]) => re.test(t))
    .map(([k]) => k);
}

// ---------- misure ----------

const numero = (s) => Number(String(s).replace(',', '.'));

export function misureDalTesto(testo) {
  const t = String(testo ?? '').replace(/\s+/g, ' ');
  let lunghezzaKm = null;
  const km =
    t.match(/(?:lunghezza|distanza(?: massima)?|distance|length|percorso di|anello di|trekking di|escursione di)\s*:?\s*(?:about|circa|ca\.?|di)?\s*(\d+(?:[.,]\d+)?)\s*km\b/i) ??
    t.match(/\b(\d+(?:[.,]\d+)?)\s*km\b/i);
  if (km) lunghezzaKm = numero(km[1]);

  let dislivelloM = null;
  const d = t.match(/(?:dislivello(?: positivo)?|uphill(?: and downhill)?|elevation gain|d\+)\s*:?\s*(?:about|circa|di)?\s*(?:d\+)?\s*(\d{2,4})\s*m\b/i);
  if (d) dislivelloM = Number(d[1]);

  let durataMin = null;
  const ore = t.match(
    /(?:durata|walking time|journey time|duration|tempo di percorrenza)\s*:?\s*(?:about|circa|di)?\s*(\d+(?:[.,]\d+)?)\s*(?:ore|ora|hours?|h)\b(?:\s*(?:and|e)\s*(\d+)\s*(?:minutes|minuti|min)\b)?/i,
  );
  if (ore) durataMin = Math.round(numero(ore[1]) * 60) + (ore[2] ? Number(ore[2]) : 0);

  // valori impossibili: meglio nessun dato
  if (lunghezzaKm !== null && !(lunghezzaKm > 0 && lunghezzaKm < 100)) lunghezzaKm = null;
  if (dislivelloM !== null && !(dislivelloM > 0 && dislivelloM < 3000)) dislivelloM = null;
  if (durataMin !== null && !(durataMin > 0 && durataMin <= 24 * 60)) durataMin = null;
  return { lunghezzaKm, dislivelloM, durataMin };
}

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const MESI_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

// Mesi citati (in italiano o inglese), in ordine dell'anno: "Settembre, Ottobre"
export function periodoDalTesto(testo) {
  const t = String(testo ?? '').toLowerCase();
  const trovati = MESI.filter((m, i) => new RegExp(`\\b(${m}|${MESI_EN[i]})\\b`).test(t));
  return trovati.map((m) => m[0].toUpperCase() + m.slice(1)).join(', ');
}

// ---------- unione nell'archivio ----------

const decodifica = (u) => {
  try {
    return decodeURI(String(u ?? '')).toLowerCase().replace(/\/+$/, '');
  } catch {
    return String(u ?? '').toLowerCase();
  }
};

// Chiave che lega un percorso dell'archivio a un candidato importato
function corrisponde(record, c) {
  if (record.importazione?.fonte === c.fonte && record.importazione?.chiave === c.chiave) return true;
  if (record.id === c.id) return true;
  if (!c.url || c.fonte === 'wolf-howling') return false; // più uscite nello stesso PDF
  const u = decodifica(c.url);
  return decodifica(record.escursione?.url) === u || (record.fonti ?? []).some((f) => decodifica(f.url) === u);
}

// Uscite di un calendario (stesso PDF per tutte): si riconoscono dal nome dell'uscita,
// uguale o accorciato, e dal luogo quando più percorsi hanno lo stesso nome
function perNomeUscita(percorsi, c) {
  const nome = slug(c.nome, 200);
  const stessoParco = percorsi.map((p, i) => [p, i]).filter(([p]) => p.parco === c.parco && p.escursione?.nomeUscita);
  const esatti = stessoParco.filter(([p]) => slug(p.escursione.nomeUscita, 200) === nome);
  const simili = esatti.length
    ? esatti
    : stessoParco.filter(([p]) => {
        const n = slug(p.escursione.nomeUscita, 200);
        return Math.min(n.length, nome.length) >= 10 && (n.startsWith(nome) || nome.startsWith(n));
      });
  if (simili.length === 1) return simili[0][1];
  const luogo = slug(c.zona);
  const nelLuogo = luogo ? simili.filter(([p]) => slug(`${p.id} ${p.nome} ${p.zona}`, 400).includes(luogo)) : [];
  return nelLuogo.length === 1 ? nelLuogo[0][1] : -1;
}

function trova(percorsi, c, visti) {
  const i = percorsi.findIndex((p) => !visti.has(p.id) && corrisponde(p, c));
  if (i >= 0 || c.fonte !== 'wolf-howling') return i;
  // la stessa uscita in più luoghi o date può confluire nello stesso percorso scritto a mano
  return perNomeUscita(percorsi, c);
}

function attivitaUscitaGuidata(c) {
  return {
    trekking: { stato: 'con_limitazioni', motivi: [`Uscita guidata (${c.organizzatore}): in autonomia il percorso va verificato`] },
    mtb: { stato: 'non_percorribile', motivi: ['Uscita guidata a piedi'] },
    emtb: { stato: 'non_percorribile', motivi: ['Uscita guidata a piedi'] },
  };
}

// Record completo per un candidato nuovo
export function nuovoRecord(c, oggi) {
  const guidata = c.tipo === 'uscita_guidata';
  const r = completaSentiero({
    id: c.id,
    parco: c.parco,
    parchi: [c.parco],
    codici: c.codici ?? [],
    nome: c.nome,
    zona: c.zona ?? '',
    descrizione: c.descrizione ?? '',
    animali: c.animali ?? [],
    escursione: guidata
      ? { associazione: c.organizzatore, nomeUscita: c.nome, periodo: c.periodo ?? '', fonte: c.organizzatore, url: c.url, date: c.date ?? [] }
      : null,
    lunghezzaKm: c.lunghezzaKm ?? null,
    dislivelloM: c.dislivelloM ?? null,
    durataMin: c.durataMin ?? null,
    partenza: { paese: c.paese ?? '', descrizione: c.partenza ?? '', lat: null, lon: null },
    accesso: guidata
      ? { tipo: 'guida', nota: 'Uscita con guida: il percorso non è indicato come autonomo', link: c.url }
      : { tipo: 'nessuno', nota: '', link: c.url },
    daVerificare: true,
    difficolta: null,
  });
  return {
    ...r,
    attivita: c.attivita ?? (guidata ? attivitaUscitaGuidata(c) : undefined),
    // uscita_guidata | itinerario_mtb
    tipoPercorso: c.tipo,
    osservazione: (c.animali ?? []).length > 0,
    organizzatori: c.organizzatore ? [c.organizzatore] : [],
    fonti: [{ url: c.url, titolo: c.titoloFonte ?? c.organizzatore ?? 'Fonte', visto: oggi }],
    verifica: { stato: 'da_verificare', ultimoControllo: oggi },
    attivo: true,
    importazione: { fonte: c.fonte, chiave: c.chiave, creato: true },
    ...(c.traccia ? { traccia: c.traccia } : {}),
  };
}

// Le date di controllo si rinfrescano al massimo una volta a settimana:
// così l'archivio cambia (e si ripubblica) solo quando cambia davvero qualcosa
const GIORNI_RINFRESCO = 7;
export function rinfresca(data, oggi) {
  if (!data) return oggi;
  return (new Date(oggi) - new Date(data)) / 86_400_000 >= GIORNI_RINFRESCO ? oggi : data;
}

function aggiornaFonti(fonti, c, oggi) {
  const u = decodifica(c.url);
  const esiste = (fonti ?? []).some((f) => decodifica(f.url) === u);
  // la fonte ritrovata torna raggiungibile
  const aggiornate = (fonti ?? []).map(({ nonRaggiungibile, ...f }) =>
    decodifica(f.url) === u ? { ...f, visto: rinfresca(f.visto, oggi) } : nonRaggiungibile ? { ...f, nonRaggiungibile } : f,
  );
  return esiste ? aggiornate : [...aggiornate, { url: c.url, titolo: c.titoloFonte ?? c.organizzatore ?? 'Fonte', visto: oggi }];
}

const unione = (a = [], b = []) => [...new Set([...a, ...b])];

// La fonte riporta questo percorso (come fonte principale o come fonte in più)
const appartiene = (p, fonte) => p.importazione?.fonte === fonte || (p.importazione?.altreFonti ?? []).includes(fonte);

// Aggiorna un record esistente. Quelli creati dall'importazione si aggiornano tutti;
// quelli scritti a mano (sentieri iniziali) solo nei campi vuoti, più fonti e controllo.
export function aggiornaRecord(record, c, oggi) {
  const creato = record.importazione?.creato;
  const imp = record.importazione;
  // un percorso può comparire in più fonti (es. un itinerario MTB a cavallo di due parchi):
  // la prima resta la principale e decide i contenuti, le altre si annotano soltanto
  const primaria = !imp?.fonte || imp.fonte === c.fonte;
  const r = { ...record, fonti: aggiornaFonti(record.fonti, c, oggi) };
  r.importazione = primaria
    ? { ...(imp ?? {}), fonte: c.fonte, chiave: c.chiave, creato: Boolean(creato) }
    : { ...imp, altreFonti: unione(imp.altreFonti, [c.fonte]) };
  if (c.parco) r.parchi = unione(record.parchi ?? [record.parco].filter(Boolean), [c.parco]);
  const stato = record.verifica?.stato === 'verificato' ? 'verificato' : 'da_verificare';
  const ultimoControllo = stato === record.verifica?.stato ? rinfresca(record.verifica?.ultimoControllo, oggi) : oggi;
  r.verifica = { ...(record.verifica ?? {}), stato, ultimoControllo };
  r.attivo = true;
  // sui sentieri scritti a mano gli animali restano quelli scelti (si riempiono solo se mancano)
  r.animali = creato ? c.animali ?? [] : record.animali?.length ? record.animali : c.animali ?? [];
  r.osservazione = r.animali.length > 0;
  if (c.organizzatore) r.organizzatori = unione(record.organizzatori, [c.organizzatore]);
  for (const k of ['lunghezzaKm', 'dislivelloM', 'durataMin']) {
    if (c[k] != null && ((creato && primaria) || record[k] == null)) r[k] = c[k];
  }
  if (record.escursione || c.tipo === 'uscita_guidata') {
    const e = { ...(record.escursione ?? {}) };
    if (c.periodo && (creato || !e.periodo)) e.periodo = c.periodo;
    if (c.date?.length) e.date = [...new Set([...(e.date ?? []), ...c.date])].sort();
    if (creato && primaria) Object.assign(e, { url: c.url, nomeUscita: c.nome });
    r.escursione = e;
  }
  if (creato && primaria) {
    Object.assign(r, { nome: c.nome, descrizione: c.descrizione ?? r.descrizione, tipoPercorso: c.tipo });
    if (c.partenza) r.partenza = { ...r.partenza, descrizione: c.partenza };
    if (c.attivita) r.attivita = c.attivita;
    if (c.traccia) r.traccia = c.traccia;
    if (c.codici) r.codici = c.codici;
  }
  return r;
}

// Unisce i risultati delle fonti nell'archivio.
// risultati: [{ fonte, ok, candidati, completo }] — ok=false se la fonte oggi non ha risposto;
// completo=false se ha risposto solo in parte (si aggiorna, ma non si segna nulla come sparito).
export function unisciImportazione(archivio, risultati, oggi) {
  const percorsi = (archivio?.percorsi ?? []).map((p) => ({ ...p }));
  const resoconto = { nuovi: [], aggiornati: [], nonPiuVerificabili: [], fontiNonRaggiunte: [], fontiSospette: [] };
  for (const { fonte, ok, candidati = [], completo = true } of risultati) {
    if (!ok) {
      resoconto.fontiNonRaggiunte.push(fonte);
      continue;
    }
    // freno di sicurezza: se una fonte perde di colpo più di metà dei suoi percorsi
    // è più probabile un errore della fonte che una vera sparizione
    const giaPresenti = percorsi.filter((p) => appartiene(p, fonte) && p.attivo !== false).length;
    const sospetta = giaPresenti >= 4 && candidati.length < giaPresenti / 2;
    if (sospetta) resoconto.fontiSospette.push(fonte);
    const visti = new Set();
    for (const c of candidati) {
      const i = trova(percorsi, c, visti);
      if (i >= 0) {
        percorsi[i] = aggiornaRecord(percorsi[i], c, oggi);
        visti.add(percorsi[i].id);
        resoconto.aggiornati.push(percorsi[i].id);
      } else {
        let id = c.id;
        for (let n = 2; percorsi.some((p) => p.id === id); n++) id = `${c.id}-${n}`;
        const r = nuovoRecord({ ...c, id }, oggi);
        percorsi.push(r);
        visti.add(id);
        resoconto.nuovi.push(id);
      }
    }
    // la fonte ha risposto per intero ma alcuni percorsi non ci sono più
    if (!completo || sospetta) continue;
    for (let i = 0; i < percorsi.length; i++) {
      const p = percorsi[i];
      if (!appartiene(p, fonte) || visti.has(p.id)) continue;
      const altre = [p.importazione.fonte, ...(p.importazione.altreFonti ?? [])].filter((f) => f !== fonte);
      if (altre.length) {
        // un'altra fonte lo riporta ancora: si toglie solo questa
        const [principale, ...resto] = altre;
        percorsi[i] = {
          ...p,
          importazione: { ...p.importazione, fonte: principale, ...(principale !== p.importazione.fonte ? { chiave: null } : {}), altreFonti: resto },
        };
        continue;
      }
      if (p.importazione.creato) {
        if (p.verifica?.stato === 'non_piu_verificabile') continue;
        percorsi[i] = { ...p, attivo: false, verifica: { ...p.verifica, stato: 'non_piu_verificabile', ultimoControllo: oggi } };
      } else {
        // sentiero scritto a mano: resta valido, solo il link della fonte non è più raggiungibile
        const url = decodifica(p.escursione?.url);
        percorsi[i] = { ...p, fonti: (p.fonti ?? []).map((f) => (decodifica(f.url) === url ? { ...f, nonRaggiungibile: true } : f)) };
      }
      resoconto.nonPiuVerificabili.push(p.id);
    }
  }
  return { archivio: { ...archivio, percorsi }, resoconto };
}
