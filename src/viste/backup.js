import { esporta, importa, controllaBackup, tuttiISentieri, sentieriConTraccia, tuttiIGiri, tuttiGliAvvistamenti } from '../db.js';
import { escapeHtml, data } from '../lib/formato.js';

function nomeFile() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `orme-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

async function statoArchivio() {
  if (!navigator.storage?.persisted) return 'non verificabile su questo browser';
  return (await navigator.storage.persisted()) ? 'protetto' : 'non protetto';
}

export async function vistaBackup(app) {
  const [sentieri, tracce, giri, avvistamenti, archivio] = await Promise.all([tuttiISentieri(), sentieriConTraccia(), tuttiIGiri(), tuttiGliAvvistamenti(), statoArchivio()]);

  app.innerHTML = `
    <a class="indietro" href="#/">‹ Tutti i sentieri</a>
    <h1 class="titolo-pagina">Backup</h1>

    <section class="riquadro">
      <h2>Dati sul dispositivo</h2>
      <p>${sentieri.length} sentieri, ${tracce.size} tracce, ${giri.length} giri, ${avvistamenti.length} avvistamenti.</p>
      <p>Archivio: <b id="statoArchivio">${archivio}</b>
        ${archivio === 'non protetto' ? '<button type="button" class="link" id="proteggi">Proteggi</button>' : ''}</p>
      <p class="tenue">Un archivio non protetto può essere svuotato dal browser se il telefono ha poco spazio. Installare Orme come app aiuta. In ogni caso, fai spesso un backup.</p>
    </section>

    <section class="riquadro">
      <h2>Esporta</h2>
      <p>Salva un file JSON con sentieri, note, tracce e giri.</p>
      <label class="backup-opzione"><input type="checkbox" id="escludiAvv" checked />
        <span><b>Escludi avvistamenti</b><br><span class="tenue">Lascialo spuntato se condividi il file. Toglilo per il tuo backup completo.</span></span></label>
      <div class="azioni-mappa">
        <button type="button" class="bottone primario" id="esporta">Scarica backup</button>
        <button type="button" class="bottone" id="condividi" hidden>Condividi…</button>
      </div>
    </section>

    <section class="riquadro">
      <h2>Importa</h2>
      <p>Carica un file di backup di Orme.</p>
      <button type="button" class="bottone" id="scegli">Scegli file…</button>
      <input type="file" id="fileBackup" accept=".json,application/json" hidden />
      <div id="anteprimaImport"></div>
    </section>
    <p class="messaggio" id="esito" role="status"></p>
  `;

  const esito = app.querySelector('#esito');
  const anteprima = app.querySelector('#anteprimaImport');
  const fileBackup = app.querySelector('#fileBackup');
  const condividi = app.querySelector('#condividi');

  const mostraEsito = (html, errore = false) => {
    esito.innerHTML = errore ? `<span class="errore">${html}</span>` : html;
  };

  async function creaFile() {
    const json = JSON.stringify(await esporta({ escludiAvvistamenti: app.querySelector('#escludiAvv').checked }), null, 1);
    return new File([json], nomeFile(), { type: 'application/json' });
  }

  app.querySelector('#esporta').addEventListener('click', async () => {
    const file = await creaFile();
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    mostraEsito(`Backup scaricato: ${escapeHtml(file.name)}`);
  });

  // Su Android permette di mandare il file a Drive, email, ecc.
  const fileProva = new File(['{}'], 'prova.json', { type: 'application/json' });
  if (navigator.canShare?.({ files: [fileProva] })) {
    condividi.hidden = false;
    condividi.addEventListener('click', async () => {
      try {
        const file = await creaFile();
        await navigator.share({ files: [file], title: 'Backup di Orme' });
      } catch (e) {
        if (e.name !== 'AbortError') mostraEsito(escapeHtml(e.message), true);
      }
    });
  }

  app.querySelector('#proteggi')?.addEventListener('click', async () => {
    const ok = await navigator.storage.persist?.();
    app.querySelector('#statoArchivio').textContent = ok ? 'protetto' : 'non protetto';
    mostraEsito(ok ? 'Archivio protetto.' : 'Il browser non ha concesso la protezione: installa Orme come app e riprova.', !ok);
  });

  app.querySelector('#scegli').addEventListener('click', () => fileBackup.click());

  fileBackup.addEventListener('change', async () => {
    const file = fileBackup.files?.[0];
    fileBackup.value = '';
    anteprima.innerHTML = '';
    mostraEsito('');
    if (!file) return;
    let dati;
    try {
      dati = JSON.parse(await file.text());
      controllaBackup(dati);
    } catch (e) {
      mostraEsito(e instanceof SyntaxError ? 'Il file non è un JSON valido.' : escapeHtml(e.message), true);
      return;
    }
    anteprima.innerHTML = `
      <p style="margin-top:12px"><b>${escapeHtml(file.name)}</b><br />
        ${dati.sentieri.length} sentieri, ${dati.tracce.length} tracce, ${dati.giri?.length ?? 0} giri, ${dati.avvistamenti ? `${dati.avvistamenti.length} avvistamenti` : 'avvistamenti esclusi'}${dati.esportato ? ` · creato il ${data(dati.esportato)}` : ''}</p>
      <div class="azioni-mappa">
        <button type="button" class="bottone primario" data-modo="unisci">Unisci ai miei dati</button>
        <button type="button" class="bottone pericolo" data-modo="sostituisci">Sostituisci tutto</button>
      </div>
      <p class="tenue">"Unisci" aggiunge i sentieri del backup e aggiorna quelli già presenti. "Sostituisci tutto" cancella i dati attuali.</p>
    `;
    anteprima.onclick = async (evento) => {
      const modo = evento.target.closest('[data-modo]')?.dataset.modo;
      if (!modo) return;
      if (modo === 'sostituisci' && !confirm('Cancellare tutti i dati attuali e sostituirli con il backup?')) return;
      try {
        const n = await importa(dati, modo);
        anteprima.innerHTML = '';
        mostraEsito(`Importati ${n.sentieri} sentieri, ${n.tracce} tracce, ${n.giri} giri e ${n.avvistamenti} avvistamenti. <a href="#/">Vai a Esplora</a>`);
      } catch (e) {
        mostraEsito(escapeHtml(e.message), true);
      }
    };
  });
}
