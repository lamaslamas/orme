// Colori della mappa. Come nelle carte escursionistiche (es. Mapy.com) ogni elemento ha una
// famiglia di colore sua: il verde è solo dei confini delle aree protette, i percorsi sono viola
// (non si confondono né con il verde dei boschi né con il rosso e blu dei sentieri segnati).
export const COLORI = {
  traccia: '#7b2d9b', // sentiero scelto e percorsi da fare: viola intenso
  tracciaFatta: '#b48ccb', // percorsi già fatti: lilla
  sfondo: '#8b8794', // percorsi "di sfondo": grigio neutro
  confine: '#2f8f3a', // confini dei parchi: linea verde sottile...
  confineFascia: '#3fa34d', // ...con una fascia verde trasparente, come nelle carte
  partenza: '#7b2d9b',
  osservazione: '#b9925a', // percorsi di osservazione fauna: ambra tenue
  salto: '#5f6e75',
};
