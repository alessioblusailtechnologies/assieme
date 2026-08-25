/*
 * Configurazione a runtime dell'app (letta da environment.ts).
 *
 * Su Cloudflare Pages l'app e l'API stanno su host diversi: qui si dice
 * dov'è l'API senza ricompilare. In sviluppo il file resta vuoto e il
 * percorso relativo /api passa dal proxy del dev server.
 */
// In produzione questo file lo riscrive il build (VELIA_API_BASE, vedi render.yaml).
window.veliaApiBase = 'https://api.sonovelia.it/api';

/* Senza sessione l'app manda a /accesso. Solo per una demo senza
   autenticazione (mock): window.veliaSenzaAccesso = true; */
