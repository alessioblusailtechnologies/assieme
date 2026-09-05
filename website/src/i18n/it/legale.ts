/**
 * Solo la cornice delle pagine legali: occhiello, briciole, etichetta della
 * data e chiusura.
 *
 * La prosa non sta qui. In una pagina legale il markup è il contenuto (liste,
 * grassetti, tabelle, rimandi), e le due lingue non hanno nemmeno le stesse
 * sezioni: l'autorità di controllo cambia, e cambia quale versione fa fede.
 * Per questo ogni lingua ha il suo file di pagina, e qui resta solo ciò che
 * il layout ripete uguale.
 */

import type { Chiusura } from '~/i18n/tipi';

const chiusura: Chiusura = {
  title: 'Domande su questo documento?',
  cta: 'Scrivici',
  link: { rotta: 'demo' },
};

const legale = {
  eyebrow: 'Note legali',
  briciola: 'Note legali',
  aggiornamento: 'Ultimo aggiornamento:',
  chiusura,
};

export default legale;
