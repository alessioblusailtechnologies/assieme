/**
 * Configurazione di produzione.
 *
 * `apiBase` arriva da `public/config.js` (`window.veliaApiBase`), che si
 * cambia senza ricompilare: su Cloudflare Pages punta all'API su Railway. Se
 * manca, resta il percorso relativo `/api`, cioè app e API dietro lo stesso
 * host. Il codice applicativo non sa quale dei due sta rispondendo, ed è il
 * punto.
 */
export const environment = {
  production: true,
  apiBase: (globalThis as { veliaApiBase?: string }).veliaApiBase ?? '/api',
  /** Il pannello di sviluppo non deve mai comparire in produzione. */
  devTools: false,
  /**
   * Senza sessione si va a `/accesso` prima di entrare (guard). La demo senza
   * autenticazione lo spegne con `window.veliaSenzaAccesso = true` in config.js.
   */
  accessoObbligatorio: (globalThis as { veliaSenzaAccesso?: boolean }).veliaSenzaAccesso !== true,
};
