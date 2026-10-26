// Avviso, una volta, per chi ha ancora sul telefono giri o avvistamenti personali di prima: i giri sono già diventati
// percorsi miei; gli avvistamenti (dati personali, mai fuori dal telefono) si scaricano in un file di backup e solo dopo si
// possono eliminare. Se non c'è niente da fare, non compare.
import { giriVecchi, avvistamentiVecchi, convertiGiriInPercorsi, eliminaDatiVecchi, esporta } from '../db.js';
import { nomeFileBackupCompleto } from '../lib/migrazione.js';

export async function avviaMigrazione() {
  let convertiti = 0;
  try {
    convertiti = await convertiGiriInPercorsi();
  } catch (e) {
    console.warn('Giri non convertiti', e);
  }
  const [giri, avvistamenti] = await Promise.all([giriVecchi(), avvistamentiVecchi()]);
  if (!giri.length && !avvistamenti.length) return;

  const avviso = document.createElement('section');
  avviso.className = 'avviso-migrazione';
  avviso.setAttribute('role', 'status');
  avviso.innerHTML = `
    <b>Aggiornamento: giri e avvistamenti</b>
    ${giri.length ? `<p>I tuoi ${giri.length} giri non ci sono più come sezione: ${convertiti ? `${convertiti} sono diventati percorsi in «I miei percorsi»` : 'i percorsi che si potevano ricostruire sono già in «I miei percorsi»'}.</p>` : ''}
    ${avvistamenti.length ? `<p>I tuoi ${avvistamenti.length} avvistamenti personali non ci sono più nell'app, ma sono ancora su questo telefono.</p>` : ''}
    <p>Scarica il backup completo (con ${[giri.length ? 'i giri' : '', avvistamenti.length ? 'gli avvistamenti' : ''].filter(Boolean).join(' e ')}): solo dopo puoi eliminarli dal telefono.</p>
    <div class="azioni-migrazione">
      <button type="button" class="bottone primario" data-m="scarica">Scarica il backup</button>
      <button type="button" class="bottone pericolo" data-m="elimina" disabled>Elimina dal telefono</button>
      <button type="button" class="bottone testo" data-m="dopo">Più tardi</button>
    </div>
    <p class="tenue piccolo" data-esito></p>`;
  document.body.appendChild(avviso);
  const esito = avviso.querySelector('[data-esito]');
  let scaricato = false;
  avviso.addEventListener('click', async (e) => {
    const azione = e.target.closest('[data-m]')?.dataset.m;
    if (azione === 'dopo') return avviso.remove();
    if (azione === 'scarica') {
      try {
        const json = JSON.stringify(await esporta({ conDatiVecchi: true }), null, 1);
        const file = new File([json], nomeFileBackupCompleto(), { type: 'application/json' });
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        scaricato = true;
        avviso.querySelector('[data-m=elimina]').disabled = false;
        esito.textContent = `Backup scaricato: ${file.name}. Controlla che sia nei file del telefono, poi puoi eliminare.`;
      } catch (err) {
        esito.textContent = `Non sono riuscito a creare il backup: ${err.message}`;
      }
    }
    if (azione === 'elimina' && scaricato && confirm('Eliminare dal telefono i giri e gli avvistamenti? Il backup che hai scaricato resta tuo.')) {
      await eliminaDatiVecchi();
      avviso.remove();
    }
  });
}
