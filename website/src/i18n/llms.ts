/**
 * Il generatore di llms.txt, uno per tutte le lingue.
 *
 * I testi stanno nel dizionario, i percorsi nella tabella delle rotte: qui
 * resta solo il montaggio del Markdown.
 */

import { contenuti } from './index';
import type { Lingua } from './lingue';
import { percorso } from './rotte';

type Anagrafica = {
  name: string;
  legalName: string;
  email: string;
  social: { linkedin: string };
};

export function generaLlms(
  lingua: Lingua,
  origin: string,
  site: Anagrafica,
): string {
  const t = contenuti(lingua).llms;

  return [
    `# ${site.name}`,
    '',
    `> ${t.sommario.replace('{azienda}', site.legalName)}`,
    '',
    t.daSapere,
    '',
    `## ${t.titoloPagine}`,
    '',
    ...t.pagine.map(
      (p) => `- [${p.label}](${origin}${percorso(p.rotta, lingua)}): ${p.nota}`,
    ),
    '',
    `## ${t.titoloContatti}`,
    '',
    `- ${t.etichettaEmail}: ${site.email}`,
    `- LinkedIn: ${site.social.linkedin}`,
    '',
  ].join('\n');
}
