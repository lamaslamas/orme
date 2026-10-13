// Coda dei lavori di fine movimento di una mappa: partono un po' dopo l'ultimo movimento, uno alla
// volta (con un fotogramma libero tra l'uno e l'altro), in ordine di priorità; si salta chi non è
// visibile e ci si ferma se la mappa riparte. fotogramma(): promessa del prossimo fotogramma libero.
export function creaCoda({ ritardo = 250, fotogramma, timer = setTimeout, ferma = clearTimeout, avvolgi = (nome, fn) => fn, avviso = console.warn } = {}) {
  const compiti = [];
  let attesa = null;
  let giro = 0;
  async function esegui(attiva = () => true) {
    const mio = ++giro;
    for (const c of [...compiti]) {
      if (mio !== giro || !attiva()) return;
      if (c.visibile && !c.visibile()) continue;
      try {
        c.fn();
      } catch (e) {
        avviso(`Lavoro di fine movimento "${c.nome}"`, e);
      }
      await fotogramma();
    }
  }
  return {
    // restituisce la funzione che toglie il lavoro
    aggiungi(nome, fn, { visibile = null, priorita = 5 } = {}) {
      const c = { nome, fn: avvolgi(nome, fn), visibile, priorita };
      compiti.push(c);
      compiti.sort((a, b) => a.priorita - b.priorita);
      return () => {
        const i = compiti.indexOf(c);
        if (i >= 0) compiti.splice(i, 1);
      };
    },
    inizio() {
      ferma(attesa);
      giro++;
    },
    fine(attiva) {
      ferma(attesa);
      attesa = timer(() => esegui(attiva), ritardo);
    },
    esegui,
  };
}
