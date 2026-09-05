/**
 * La cornice delle guide francesi. I testi stanno in
 * `src/content/guide/fr/`, un Markdown ciascuna.
 */

import type { Chiusura } from '~/i18n/tipi';

const chiusura: Chiusura = {
  title: 'Envie de le voir sur vos propres dossiers ?',
  cta: 'Demander une démo',
  link: { rotta: 'demo' },
};

const guide = {
  eyebrow: 'Ressources',
  briciola: 'Ressources',
  aggiornata: 'Mis à jour le',
  altreGuide: 'Autres guides',
  chiusura,
};

export default guide;
