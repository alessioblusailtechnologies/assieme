/**
 * La cornice delle guide. I testi delle guide stanno in
 * `src/content/guide/<lingua>/`, un Markdown ciascuna: anche lì il contenuto
 * è prosa, non dati.
 */

import type { Chiusura } from '~/i18n/tipi';

const chiusura: Chiusura = {
  title: 'Vuoi vederlo sulla tua casistica?',
  cta: 'Richiedi una demo',
  link: { rotta: 'demo' },
};

const guide = {
  /** Occhiello della testata: si compone con il filone della guida. */
  eyebrow: 'Risorse',
  briciola: 'Risorse',
  aggiornata: 'Aggiornato il',
  altreGuide: 'Altre guide',
  chiusura,
};

export default guide;
