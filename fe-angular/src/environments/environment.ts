/**
 * Configurazione di produzione.
 *
 * `apiBase` è relativo: in produzione front-end e API stanno dietro lo stesso
 * host, quindi non c'è nulla da configurare. In sviluppo lo stesso percorso
 * viene dirottato su Mockoon dal proxy del dev server (`proxy.conf.json`): il
 * codice applicativo non sa quale dei due sta rispondendo, ed è il punto.
 */
export const environment = {
  production: true,
  apiBase: '/api',
  /** Il pannello di sviluppo non deve mai comparire in produzione. */
  devTools: false,
};
