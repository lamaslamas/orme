// Uscite delle associazioni per animale e periodo dell'anno ("Lupo · nov–gen", "Bramito del cervo ·
// set–ott"): servono a trovare i sentieri, non a partecipare, quindi l'anno non conta e le uscite
// passate restano.
import { ANIMALI } from './costanti.js';
import { animaliNelTesto } from './importazione.js';

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const MESI_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

// mesi (1–12) da un testo: "Novembre – gennaio" e "da settembre a ottobre" sono intervalli,
// "Settembre, Ottobre" un elenco
export function mesiDalTesto(testo) {
  const t = String(testo ?? '').toLowerCase();
  const trovati = [];
  const re = new RegExp(`\\b(${[...MESI, ...MESI_EN].join('|')})\\b`, 'g');
  for (const m of t.matchAll(re)) trovati.push({ mese: (MESI.indexOf(m[1]) + 1 || MESI_EN.indexOf(m[1]) + 1), fine: m.index + m[0].length, inizio: m.index });
  const mesi = new Set(trovati.map((x) => x.mese));
  for (let i = 1; i < trovati.length; i++) {
    const tra = t.slice(trovati[i - 1].fine, trovati[i].inizio);
    if (!/^\s*([-–—]|a|al|fino a)\s*$/.test(tra)) continue;
    // intervallo, anche a cavallo dell'anno (novembre – gennaio)
    for (let m = trovati[i - 1].mese; m !== trovati[i].mese; m = (m % 12) + 1) mesi.add(m);
  }
  return [...mesi].sort((a, b) => a - b);
}

// mesi di un'uscita: dalle date (qualsiasi anno) e dal periodo scritto
export function mesiUscita(s) {
  const e = s?.escursione ?? {};
  const mesi = new Set(mesiDalTesto(e.periodo));
  for (const d of e.date ?? []) {
    const m = Number(String(d).slice(5, 7));
    if (m >= 1 && m <= 12) mesi.add(m);
  }
  return [...mesi].sort((a, b) => a - b);
}

// "nov–gen", "set", "lug, set–ott": mesi consecutivi uniti, anche a cavallo dell'anno
export function testoMesi(mesi) {
  const c = new Set(mesi);
  if (!c.size) return '';
  if (c.size === 12) return 'tutto l\'anno';
  // si parte da un mese il cui precedente manca, così "nov–gen" resta un pezzo solo
  const inizi = [...c].filter((m) => !c.has(((m + 10) % 12) + 1)).sort((a, b) => a - b);
  return inizi
    .map((da) => {
      let a = da;
      while (c.has((a % 12) + 1)) a = (a % 12) + 1;
      return da === a ? BREVI[da - 1] : `${BREVI[da - 1]}–${BREVI[a - 1]}`;
    })
    .join(', ');
}

// tema dell'uscita: il primo animale; il cervo in autunno è il bramito; senza animali "Natura"
export function temaUscita(s) {
  // prima l'animale nominato nel titolo ("Il bramito dei cervi" nomina anche il camoscio nel testo)
  const nelTitolo = animaliNelTesto(`${s?.escursione?.nomeUscita ?? ''} ${s?.nome ?? ''}`);
  const validi = (s?.animali ?? []).filter((a) => ANIMALI[a] && a !== 'altro');
  const animale = validi.find((a) => nelTitolo.includes(a)) ?? validi[0];
  if (!animale) return { chiave: 'natura', nome: 'Natura' };
  const mesi = mesiUscita(s);
  const titolo = `${s?.escursione?.nomeUscita ?? ''} ${s?.nome ?? ''}`;
  if (animale === 'cervo' && (/bramit/i.test(titolo) || (mesi.length && mesi.every((m) => m >= 8 && m <= 10)))) return { chiave: 'bramito', nome: 'Bramito del cervo', animale };
  return { chiave: animale, nome: ANIMALI[animale], animale };
}

// Gruppi per tema, ciascuno con il periodo di tutte le sue uscite. Prima il periodo che arriva
// per primo da questo mese in avanti (quello in corso compreso); "Natura" e quelli senza mesi in fondo.
export function gruppiPerStagione(uscite, meseAttuale = new Date().getMonth() + 1) {
  const gruppi = new Map();
  for (const s of uscite) {
    const t = temaUscita(s);
    const g = gruppi.get(t.chiave) ?? { ...t, mesi: new Set(), uscite: [] };
    mesiUscita(s).forEach((m) => g.mesi.add(m));
    g.uscite.push(s);
    gruppi.set(t.chiave, g);
  }
  const distanza = (g) => {
    if (g.chiave === 'natura' || !g.mesi.length) return 99;
    return Math.min(...g.mesi.map((m) => (m - meseAttuale + 12) % 12));
  };
  return [...gruppi.values()]
    .map((g) => ({ ...g, mesi: [...g.mesi].sort((a, b) => a - b), periodo: testoMesi(g.mesi), titolo: [g.nome, testoMesi(g.mesi)].filter(Boolean).join(' · ') }))
    .sort((a, b) => distanza(a) - distanza(b) || b.uscite.length - a.uscite.length || a.nome.localeCompare(b.nome, 'it'));
}
