// Foto personali: restano solo sul telefono. Si salvano ridotte e ricodificate,
// così perdono i dati nascosti del file (EXIF), compresa la posizione GPS.
export const LATO_FOTO = 1600;
export const LATO_MINIATURA = 360;
export const QUALITA_JPEG = 0.82;

// Dimensioni ridotte mantenendo le proporzioni (mai ingrandite)
export function dimensioniRidotte(larghezza, altezza, lato) {
  const scala = Math.min(1, lato / Math.max(larghezza, altezza));
  return { larghezza: Math.max(1, Math.round(larghezza * scala)), altezza: Math.max(1, Math.round(altezza * scala)) };
}

export const creaIdFoto = (adesso = Date.now(), caso = Math.random()) => `foto-${adesso.toString(36)}-${Math.floor(caso * 1e6).toString(36)}`;

// Per il backup: i dati binari diventano testo base64 (e ritorno)
export function inBase64(buffer) {
  const byte = new Uint8Array(buffer);
  let s = '';
  for (let i = 0; i < byte.length; i += 0x8000) s += String.fromCharCode(...byte.subarray(i, i + 0x8000));
  return btoa(s);
}

export function daBase64(testo) {
  const s = atob(testo);
  const byte = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) byte[i] = s.charCodeAt(i);
  return byte.buffer;
}

// Una foto del backup è valida se ha id, sentiero e immagine
export function fotoValida(f) {
  return Boolean(f && typeof f.id === 'string' && f.id && typeof f.sentieroId === 'string' && typeof f.immagine === 'string' && f.immagine.length > 0);
}
