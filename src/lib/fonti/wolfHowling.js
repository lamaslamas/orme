// Calendario Wolf Howling del Parco Nazionale delle Foreste Casentinesi (PDF con una tabella).
// Si leggono solo data, luogo, titolo e descrizione: le colonne "Guida" e
// "Per info e prenotazioni" (nomi, email, telefoni) non vengono mai lette.
import { animaliNelTesto, misureDalTesto, periodoDalTesto, riassunto, togliDatiPersonali, slug } from '../importazione.js';

export const WOLF_HOWLING = {
  fonte: 'wolf-howling',
  organizzatore: 'Parco Nazionale delle Foreste Casentinesi',
  // la home del Parco elenca le notizie recenti (la pagina /it/news non esiste)
  notizie: 'https://www.parcoforestecasentinesi.it/',
  notiziaNota: 'https://www.parcoforestecasentinesi.it/it/news/wolf-howling-20262027',
  parco: 'foreste-casentinesi',
};

// Notizie sul wolf howling nell'elenco delle news del Parco
export function linkNotizieWolfHowling(html, base = WOLF_HOWLING.notizie) {
  const link = new Set();
  for (const m of String(html ?? '').matchAll(/href="([^"]*\/news\/[^"]*wolf-howling[^"]*)"/gi)) {
    try {
      link.add(new URL(m[1], base).href);
    } catch {
      // indirizzo non valido
    }
  }
  return [...link];
}

// PDF del calendario in una notizia
export function linkPdfWolfHowling(html, base = WOLF_HOWLING.notiziaNota) {
  const link = new Set();
  for (const m of String(html ?? '').matchAll(/href="([^"]+\.pdf)"/gi)) {
    if (!/wh|wolf|ulul|lupo/i.test(decodeURIComponent(m[1]))) continue;
    try {
      link.add(new URL(m[1], base).href);
    } catch {
      // indirizzo non valido
    }
  }
  return [...link];
}

const RE_DATA = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function dataIso(s) {
  const m = s.trim().match(RE_DATA);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

const leggi = (voci) =>
  voci
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .map((v) => v.s.trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

// Paragrafi di una colonna: righe vicine tra loro (lo spazio tra due celle è più ampio)
const SPAZIO_PARAGRAFO = 15;
function paragrafi(voci) {
  const ordinate = [...voci].sort((a, b) => b.y - a.y);
  const gruppi = [];
  for (const v of ordinate) {
    const ultimo = gruppi.at(-1);
    if (ultimo && ultimo.at(-1).y - v.y <= SPAZIO_PARAGRAFO) ultimo.push(v);
    else gruppi.push([v]);
  }
  return gruppi;
}

// Righe della tabella. pagine: [[{ x, y, s }]] (posizione e testo di ogni pezzo, come da pdf.js).
// Le colonne si riconoscono dalle intestazioni; se mancano su una pagina valgono quelle precedenti.
export function righeTabella(pagine) {
  let colonne = null;
  const righe = [];
  for (const voci of pagine) {
    const intest = (re) => voci.find((v) => re.test(v.s.trim()));
    const h = {
      data: intest(/^DATA$/i),
      luogo: intest(/^LUOGO$/i),
      guida: intest(/^GUIDA$/i),
      nome: intest(/^NOME/i),
      descrizione: intest(/^DESCRIZIONE$/i),
      info: intest(/^PER INFO/i),
    };
    if (h.data && h.luogo && h.nome && h.descrizione && h.info) {
      const guida = h.guida?.x ?? (h.luogo.x + h.nome.x) / 2;
      colonne = {
        luogo: [(h.data.x + h.luogo.x) / 2, (h.luogo.x + guida) / 2],
        guida: [(h.luogo.x + guida) / 2, (guida + h.nome.x) / 2],
        nome: [(guida + h.nome.x) / 2, (h.nome.x + h.descrizione.x) / 2],
        descrizione: [(h.nome.x + h.descrizione.x) / 2, h.info.x - 20],
        alto: h.data.y - 5,
      };
    } else if (colonne) {
      colonne = { ...colonne, alto: Infinity };
    }
    if (!colonne) continue;
    const date = voci.filter((v) => v.x < colonne.luogo[0] && RE_DATA.test(v.s.trim())).sort((a, b) => b.y - a.y);
    if (!date.length) continue;
    const pagina = date.map((d) => ({ data: dataIso(d.s), y: d.y, luogo: [], nome: [], descrizione: [] }));
    for (const col of ['luogo', 'nome', 'descrizione']) {
      const nella = voci.filter((v) => v.y < colonne.alto && v.x >= colonne[col][0] && v.x < colonne[col][1]);
      // ogni paragrafo va alla data più vicina: le celle non sono sempre centrate sulla loro riga
      for (const p of paragrafi(nella)) {
        const centro = (p[0].y + p[p.length - 1].y) / 2;
        const riga = pagina.reduce((a, b) => (Math.abs(b.y - centro) < Math.abs(a.y - centro) ? b : a));
        riga[col].push(...p);
      }
    }
    righe.push(...pagina.map((r) => ({ data: r.data, luogo: leggi(r.luogo), nome: leggi(r.nome), descrizione: leggi(r.descrizione) })));
  }
  return righe.filter((r) => r.data && r.nome);
}

// Titoli scritti quasi tutti in maiuscolo: solo la prima lettera maiuscola
function maiuscoleIniziali(s) {
  const lettere = s.match(/\p{L}/gu) ?? [];
  const maiuscole = lettere.filter((l) => l !== l.toLowerCase()).length;
  if (maiuscole < lettere.length * 0.6) return s;
  const minuscolo = s.toLowerCase();
  return minuscolo[0].toUpperCase() + minuscolo.slice(1);
}

// Candidati per l'archivio: le stesse uscite (stesso titolo e luogo) in date diverse diventano una sola
export function candidatiWolfHowling(righe, urlPdf) {
  const gruppi = new Map();
  for (const r of righe) {
    const nome = maiuscoleIniziali(r.nome.replace(/\s*-\s*$/, ''));
    const chiave = `${slug(r.luogo)}|${slug(nome)}`;
    const g = gruppi.get(chiave) ?? { ...r, nome, chiave, date: [] };
    g.date.push(r.data);
    if (r.descrizione.length > g.descrizione.length) g.descrizione = r.descrizione;
    gruppi.set(chiave, g);
  }
  return [...gruppi.values()].map((g) => {
    const descrizione = togliDatiPersonali(g.descrizione);
    const date = [...new Set(g.date)].sort();
    return {
      fonte: WOLF_HOWLING.fonte,
      tipo: 'uscita_guidata',
      chiave: g.chiave,
      id: `wh-${slug(g.luogo, 25)}-${slug(g.nome, 35)}`,
      url: urlPdf,
      nome: g.nome,
      zona: g.luogo,
      organizzatore: WOLF_HOWLING.organizzatore,
      titoloFonte: 'Calendario Wolf Howling del Parco (PDF)',
      parco: WOLF_HOWLING.parco,
      descrizione: riassunto(descrizione),
      animali: [...new Set(['lupo', ...animaliNelTesto(`${g.nome} ${descrizione}`)])],
      partenza: '', // il luogo è la zona dell'uscita, il ritrovo è scritto nella descrizione
      date,
      periodo: periodoDalTesto(date.map((d) => ['', 'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'][Number(d.slice(5, 7))]).join(' ')),
      ...misureDalTesto(descrizione),
    };
  });
}
