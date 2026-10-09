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
  segnaposto: svg('<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
};
