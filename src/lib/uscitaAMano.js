// "Aggiungi uscita a mano": per le uscite che il robot non può leggere (programmi pubblicati come
// immagini, Pollino…). Diventa un'uscita come quelle importate, solo sul telefono, e passa dagli stessi
// Sentieri probabili: per questo conviene incollare il testo del programma (i nomi dei luoghi).
import { nuovoRecord, togliDatiPersonali } from './importazione.js';
import { normalizza } from './filtri.js';

export const MAX_TESTO = 2000;

// campi: { titolo, associazione, animale, periodo, parco, ritrovo, link, testo } → { errori, sentiero }
export function uscitaAMano(campi, { oggi = new Date().toISOString().slice(0, 10), caso = Math.random } = {}) {
  const t = (k) => String(campi[k] ?? '').trim();
  const errori = [];
  if (!t('titolo')) errori.push('Scrivi il titolo dell\'uscita.');
  if (!t('associazione')) errori.push('Scrivi chi organizza l\'uscita.');
  if (!t('parco')) errori.push('Scegli il parco.');
  const link = t('link');
  if (link && !/^https?:\/\/\S+$/i.test(link)) errori.push('Il link deve iniziare con http:// o https://.');
  if (errori.length) return { errori, sentiero: null };
  // niente email, telefoni o nomi delle guide nel testo incollato
  const testo = togliDatiPersonali(t('testo')).slice(0, MAX_TESTO);
  const slug = normalizza(t('titolo')).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const id = `mano-${slug || 'uscita'}-${Math.floor(caso() * 1e6).toString(36)}`;
  const c = {
    id,
    tipo: 'uscita_guidata',
    parco: t('parco'),
    nome: t('titolo'),
    organizzatore: t('associazione'),
    periodo: t('periodo'),
    url: link || null,
    paese: t('ritrovo'),
    partenza: t('ritrovo'),
    zona: t('ritrovo'),
    descrizione: testo,
    animali: t('animale') ? [t('animale')] : [],
    titoloFonte: 'Inserita a mano',
  };
  const r = nuovoRecord(c, oggi);
  return {
    errori: [],
    sentiero: { ...r, fonti: link ? r.fonti : [], escursione: { ...r.escursione, fonte: 'Inserita a mano' }, manuale: { data: oggi } },
  };
}

// Nominatim per un nome di luogo, solo dentro il riquadro del parco (per evitare omonimi)
export function urlLuogoNelParco(nome, [s, o, n, e]) {
  const u = new URL('https://nominatim.openstreetmap.org/search');
  for (const [k, v] of Object.entries({ q: nome, format: 'jsonv2', limit: '1', bounded: '1', viewbox: `${o},${n},${e},${s}`, countrycodes: 'it', 'accept-language': 'it' })) u.searchParams.set(k, v);
  return u.href;
}
