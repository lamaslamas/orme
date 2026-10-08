// "Le mie foto" nella scheda del sentiero. Le foto restano solo su questo telefono:
// si salvano ridotte e ricodificate in JPEG, così perdono i dati nascosti (EXIF) e la posizione GPS.
import { fotoDelSentiero, salvaFoto, eliminaFoto } from '../db.js';
import { dimensioniRidotte, creaIdFoto, LATO_FOTO, LATO_MINIATURA, QUALITA_JPEG } from '../lib/foto.js';
import { escapeHtml } from '../lib/formato.js';

export function htmlFotoPersonali() {
  return `<section class="riquadro mie-foto" id="mieFoto">
    <h2>Le mie foto</h2>
    <div class="mie-foto-griglia" id="grigliaFoto"></div>
    <button type="button" class="bottone" id="aggiungiFoto">Aggiungi foto</button>
    <input type="file" id="fileFoto" accept="image/*" multiple hidden />
    <p class="tenue piccolo">Restano solo su questo telefono, senza la posizione GPS. Entrano nel backup solo se lo scegli.</p>
    <dialog class="foglio visore-foto" aria-label="Foto">
      <form method="dialog">
        <img alt="" />
        <p class="tenue piccolo visore-data"></p>
        <div class="azioni">
          <button type="button" class="bottone pericolo" data-azione="elimina-foto">Elimina</button>
          <button class="bottone primario" value="chiudi">Chiudi</button>
        </div>
      </form>
    </dialog>
  </section>`;
}

async function riduci(file, lato) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { larghezza, altezza } = dimensioniRidotte(bitmap.width, bitmap.height, lato);
  const tela = document.createElement('canvas');
  tela.width = larghezza;
  tela.height = altezza;
  tela.getContext('2d').drawImage(bitmap, 0, 0, larghezza, altezza);
  bitmap.close?.();
  const blob = await new Promise((ok, no) => tela.toBlob((b) => (b ? ok(b) : no(new Error('Immagine non leggibile'))), 'image/jpeg', QUALITA_JPEG));
  return { dati: await blob.arrayBuffer(), larghezza, altezza };
}

export function collegaFotoPersonali(contenitore, sentieroId) {
  const sezione = contenitore.querySelector('#mieFoto');
  if (!sezione) return () => {};
  const griglia = sezione.querySelector('#grigliaFoto');
  const file = sezione.querySelector('#fileFoto');
  const visore = sezione.querySelector('.visore-foto');
  let indirizzi = [];
  let fotoAperta = null;

  const url = (buffer) => {
    const u = URL.createObjectURL(new Blob([buffer], { type: 'image/jpeg' }));
    indirizzi.push(u);
    return u;
  };
  const libera = () => {
    indirizzi.forEach((u) => URL.revokeObjectURL(u));
    indirizzi = [];
  };

  async function disegna() {
    libera();
    const foto = await fotoDelSentiero(sentieroId);
    griglia.innerHTML = foto.length
      ? foto
          .map((f) => `<button type="button" class="mia-foto" data-id="${escapeHtml(f.id)}" aria-label="Apri la foto"><img src="${url(f.miniatura ?? f.immagine)}" alt="" loading="lazy" /></button>`)
          .join('')
      : '<p class="tenue">Nessuna foto per questo percorso.</p>';
    griglia.foto = foto;
  }

  sezione.querySelector('#aggiungiFoto').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const scelti = [...file.files];
    file.value = '';
    if (!scelti.length) return;
    griglia.insertAdjacentHTML('beforeend', '<p class="tenue piccolo" id="caricoFoto">Preparo le foto…</p>');
    for (const f of scelti) {
      try {
        const grande = await riduci(f, LATO_FOTO);
        const piccola = await riduci(f, LATO_MINIATURA);
        await salvaFoto({
          id: creaIdFoto(),
          sentieroId,
          immagine: grande.dati,
          miniatura: piccola.dati,
          tipo: 'image/jpeg',
          larghezza: grande.larghezza,
          altezza: grande.altezza,
          scattata: f.lastModified ? new Date(f.lastModified).toISOString() : null,
        });
      } catch (e) {
        alert(`Non riesco a leggere "${f.name}": ${e.message}`);
      }
    }
    await disegna();
  });

  griglia.addEventListener('click', (e) => {
    const id = e.target.closest('[data-id]')?.dataset.id;
    fotoAperta = griglia.foto?.find((f) => f.id === id);
    if (!fotoAperta) return;
    visore.querySelector('img').src = url(fotoAperta.immagine);
    const quando = fotoAperta.scattata ?? fotoAperta.aggiunta;
    visore.querySelector('.visore-data').textContent = quando ? `Del ${new Date(quando).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}` : '';
    visore.showModal();
  });
  visore.addEventListener('click', async (e) => {
    if (e.target === visore) visore.close();
    if (e.target.closest('[data-azione="elimina-foto"]') && fotoAperta && confirm('Eliminare questa foto dal telefono?')) {
      await eliminaFoto(fotoAperta.id);
      visore.close();
      await disegna();
    }
  });

  disegna();
  return libera;
}
