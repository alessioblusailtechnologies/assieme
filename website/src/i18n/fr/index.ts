/**
 * Il dizionario francese.
 *
 * Il tipo `Contenuti` è derivato da quello italiano, quindi una chiave che
 * manca qui, o una che avanza, non compila: `astro check` gira dentro
 * `npm run build`.
 *
 * `spazia()` attraversa tutto il dizionario e mette lo spazio unificatore
 * dove la tipografia francese lo vuole. Le stringhe qui sotto si scrivono
 * quindi con spazi normali, e la regola resta in un posto solo.
 */

import azienda from './azienda';
import clienti from './clienti';
import comune from './comune';
import demo from './demo';
import guide from './guide';
import home from './home';
import legale from './legale';
import llms from './llms';
import piattaforma from './piattaforma';
import risorse from './risorse';
import seo from './seo';
import servizio from './servizio';
import sicurezza from './sicurezza';
import soluzioni from './soluzioni';
import { spazia } from './tipografia';

const fr = spazia({
  comune,
  seo,
  llms,
  home,
  piattaforma,
  soluzioni,
  clienti,
  sicurezza,
  risorse,
  azienda,
  demo,
  servizio,
  legale,
  guide,
});

export default fr;
