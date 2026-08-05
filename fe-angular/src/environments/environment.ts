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

  /**
   * Chiave di licenza PrimeUI.
   *
   * Da PrimeNG 22 la libreria non è più MIT: senza chiave valida, all'avvio
   * viene iniettato un banner rosso "Invalid PrimeUI License" in basso a
   * destra, dentro uno shadow root chiuso. È previsto dalla licenza e non va
   * aggirato — rimuovere i meccanismi di licenza è espressamente vietato.
   *
   * La chiave sta qui e non in un segreto: la licenza dichiara che «may
   * appear in your application bundle and contains no sensitive data». La
   * verifica è offline, senza telemetria.
   *
   * Community (gratuita, se l'organizzazione è idonea):
   * https://primeui.store/primeui — validità 12 mesi, rinnovo gratuito.
   */
  primeuiLicense:
    'eyJpZCI6IjhmN2NlMTM0LTMzNjItNGRkZS05NGZmLTY1ZjIxMTk4ZmRiZSIsInByb2R1Y3QiOiJwcmltZXVpIiwidGllciI6ImNvbW11bml0eSIsInR5cGUiOiJkZXYiLCJpYXQiOjE3ODU4NDUzMDMsImV4cCI6MTgxNzM4MTMwM30.Df-cNKtB4CcX8G5sun_CJyxiq9ZD747jP1pChPJ1nktIBpVMd_j4VFnRvK7vDZOCoR7NhFU0_RUQrA-9E0CuCQ',
};
