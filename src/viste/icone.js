// Icone semplici a linea (stesso stile, colore del testo)
export const svg = (d) => `<svg class="icona" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const ICONE = {
  orologio: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  bandierina: svg('<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>'),
  avviso: svg('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>'),
  ok: svg('<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>'),
  nuvola: svg('<path d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18z"/>'),
  casa: svg('<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>'),
  goccia: svg('<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>'),
  zampa: svg('<circle cx="7" cy="10" r="1.6"/><circle cx="11" cy="6.5" r="1.6"/><circle cx="15.5" cy="7" r="1.6"/><circle cx="18" cy="11" r="1.6"/><path d="M8.5 17c0-2.5 2-4.5 4-4.5s4 2 4 4.5c0 1.5-1.2 2.5-2.6 2.5-1 0-1-.6-1.4-.6s-.5.6-1.5.6c-1.4 0-2.5-1-2.5-2.5z"/>'),
  parco: svg('<path d="M12 3 6 13h4l-3 5h10l-3-5h4z"/><path d="M12 18v3"/>'),
  percorso: svg('<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h6a4 4 0 0 0 0-8h-4a4 4 0 0 1 0-8h6"/>'),
  salita: svg('<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
  segnalibro: svg('<path d="M6 3h12v18l-6-4-6 4z"/>'),
  mappa: svg('<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>'),
  navigazione: svg('<path d="m3 11 18-8-8 18-2-8z"/>'),
  filtri: svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  installa: svg('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>'),
  freccia: svg('<path d="m6 9 6 6 6-6"/>'),
  montagna: svg('<path d="m3 20 6-10 4 6 3-4 5 8z"/>'),
  scudo: svg('<path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z"/><path d="m9 12 2 2 4-4"/>'),
  bici: svg('<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16 10 8h5l3 8M10 8l2 8h-6M14 5h2"/>'),
  binocolo: svg('<circle cx="7" cy="15" r="3.5"/><circle cx="17" cy="15" r="3.5"/><path d="M10.5 15h3M5 12 7 5h3v8M19 12l-2-7h-3v8"/>'),
  sole: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  foto: svg('<rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1.5-2h5L16 6"/>'),
  libro: svg('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>'),
  foglia: svg('<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19 13 11"/>'),
  calendario: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  segnaposto: svg('<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
};

// Icone degli animali: illustrazioni Fluent Emoji (Microsoft, licenza MIT) in public/icone/animali,
// uguali su tutti i dispositivi (le emoji del telefono cambiano da un sistema all'altro)
const CON_ICONA = new Set(['orso', 'lupo', 'camoscio', 'cervo', 'capriolo', 'daino', 'muflone', 'cinghiale', 'volpe', 'lontra', 'gatto_selvatico', 'aquila_reale', 'gufo_reale', 'nibbio_reale', 'cicogna_nera', 'fenicottero', 'falco_grillaio', 'riccio', 'tasso', 'uccello', 'mammifero']);
export function iconaAnimale(animale, classe = '') {
  const k = CON_ICONA.has(animale) ? animale : 'altro';
  return `<img class="icona-animale ${classe}" src="${import.meta.env.BASE_URL}icone/animali/${k}.svg" alt="" aria-hidden="true" decoding="async" />`;
}
