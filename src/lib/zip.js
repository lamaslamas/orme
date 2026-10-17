// Apre un file zip (o kmz) nel browser, senza librerie: legge l'elenco dei file e decomprime con
// DecompressionStream (deflate). Niente zip protetti da password né ZIP64.
export const MAX_FILE_ZIP = 50 * 1024 * 1024; // un file dentro lo zip, decompresso

const leggi16 = (v, i) => v.getUint16(i, true);
const leggi32 = (v, i) => v.getUint32(i, true);

async function decomprimi(compresso) {
  const flusso = new Blob([compresso]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(flusso).arrayBuffer());
}

// buffer: ArrayBuffer | Uint8Array → { file: [{ nome, dati: Uint8Array }], saltati: [{ nome, motivo }] }
export async function leggiZip(buffer) {
  const dati = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const v = new DataView(dati.buffer, dati.byteOffset, dati.byteLength);
  // fine dell'elenco centrale: nell'ultimo pezzo del file (c'è un commento di al più 64 KB)
  let eocd = -1;
  for (let i = dati.length - 22; i >= Math.max(0, dati.length - 22 - 65_535); i--) {
    if (leggi32(v, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Non è un file zip valido.');
  const quanti = leggi16(v, eocd + 10);
  let p = leggi32(v, eocd + 16);
  if (quanti === 0xffff || p === 0xffffffff) throw new Error('Zip troppo grande (ZIP64): non si può aprire.');
  const decoder = new TextDecoder('utf-8');
  const file = [];
  const saltati = [];
  for (let k = 0; k < quanti; k++) {
    if (p + 46 > dati.length || leggi32(v, p) !== 0x02014b50) throw new Error('Lo zip è danneggiato.');
    const flag = leggi16(v, p + 8);
    const metodo = leggi16(v, p + 10);
    const dimComp = leggi32(v, p + 20);
    const dimPiena = leggi32(v, p + 24);
    const lenNome = leggi16(v, p + 28);
    const lenExtra = leggi16(v, p + 30);
    const lenCommento = leggi16(v, p + 32);
    const locale = leggi32(v, p + 42);
    const nome = decoder.decode(dati.subarray(p + 46, p + 46 + lenNome));
    p += 46 + lenNome + lenExtra + lenCommento;
    if (nome.endsWith('/')) continue; // cartella
    if (flag & 1) {
      saltati.push({ nome, motivo: 'protetto da password' });
      continue;
    }
    if (dimPiena > MAX_FILE_ZIP) {
      saltati.push({ nome, motivo: 'troppo grande' });
      continue;
    }
    if (leggi32(v, locale) !== 0x04034b50) {
      saltati.push({ nome, motivo: 'danneggiato' });
      continue;
    }
    const inizio = locale + 30 + leggi16(v, locale + 26) + leggi16(v, locale + 28);
    const compresso = dati.subarray(inizio, inizio + dimComp);
    try {
      if (metodo === 0) file.push({ nome, dati: compresso.slice() });
      else if (metodo === 8) file.push({ nome, dati: await decomprimi(compresso) });
      else saltati.push({ nome, motivo: `compressione non supportata (${metodo})` });
    } catch {
      saltati.push({ nome, motivo: 'non si riesce a decomprimere' });
    }
  }
  return { file, saltati };
}
