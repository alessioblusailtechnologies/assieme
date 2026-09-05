/**
 * Solo la cornice delle pagine legali. La prosa sta nei file di pagina
 * francesi, come in italiano: in un documento legale il markup è il
 * contenuto, e le due lingue non hanno nemmeno le stesse sezioni.
 */

import type { Chiusura } from '~/i18n/tipi';

const chiusura: Chiusura = {
  title: 'Une question sur ce document ?',
  cta: 'Écrivez-nous',
  link: { rotta: 'demo' },
};

const legale = {
  eyebrow: 'Mentions légales',
  briciola: 'Mentions légales',
  aggiornamento: 'Dernière mise à jour :',
  chiusura,
};

export default legale;
