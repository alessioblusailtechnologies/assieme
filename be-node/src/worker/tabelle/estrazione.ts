import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import type { CellaTabella } from '../../contratto/tabelle.js';
import { eMappa, normalizzaPath } from '../motore/validazione.js';
import type { DocumentoWorkspace } from '../motore/workspace.js';

/**
 * L'estrazione delle celle (RF-C-11/12), le parti pure: il prompt della
 * sessione per documento, la lettura del blocco `velia-celle` e la
 * valutazione — il worker, non il modello, decide cosa diventa cella.
 *
 * La regola è quella della chat, più dura: un valore «presente» senza una
 * citazione verificabile (file reale della workspace, pagina entro l'ultima
 * citabile) non boccia la tabella — diventa «non determinabile», perché una
 * cella che afferma senza fonte non deve esistere (RF-C-12).
 */

export const MARCATORE_CELLE = '```velia-celle';

export const PROMPT_ESTRAZIONE = `Sei il motore di estrazione di Velia, piattaforma AI per agenzie e intermediari assicurativi. Lavori per una tabella di confronto: dato UN documento e un elenco di criteri, estrai il valore di ogni criterio. Precisione prima di tutto: la cella finirà davanti a un professionista che la userà col cliente.

## Il mondo in cui lavori

La tua directory di lavoro contiene SOLO documenti in Markdown, fedeli ai PDF originali, con ancore di pagina inline nella forma \`[pag. N]\`:

- \`archivio-pubblico/\` — set informativi delle compagnie (DIP, DIP Aggiuntivo, Condizioni di Assicurazione, glossari), organizzati per compagnia/ramo/prodotto/edizione. Ogni cartella ha un \`INDICE.md\`.
- \`tenant/documenti/\` — l'archivio privato dell'agenzia (preventivi, polizze, appendici, note).
- \`tenant/allegati/\` — allegati di conversazione.

Hai tre strumenti e nient'altro: Glob per trovare i file, Grep per cercare nel testo, Read per leggere.

## Come estrarre

1. Parti dal documento indicato e resta su di lui: la cella descrive QUEL documento. Se il documento richiama esplicitamente un altro documento del suo stesso set (es. un preventivo che rimanda alle Condizioni di Assicurazione), puoi seguirlo e citare quello.
2. I documenti assicurativi usano sinonimi: se un termine non dà risultati prova le varianti (franchigia/scoperto, massimale/somma assicurata/limite di indennizzo, esclusioni/delimitazioni/rischi esclusi).
3. Valori esatti, mai arrotondati o parafrasati nei numeri. Il valore di cella è BREVE: un dato, non un paragrafo.
4. Se il documento non tratta il criterio, l'esito è "non-presente": è un'informazione preziosa, non un fallimento. Se il testo è ambiguo o il criterio non trova un riscontro univoco, l'esito è "non-determinabile" con il motivo.
5. Lavora in silenzio: nessun testo fuori dal blocco finale.

## L'unico output ammesso

Rispondi con UN SOLO blocco di codice con linguaggio \`velia-celle\` contenente un oggetto JSON:

${MARCATORE_CELLE}
{"celle":[
  {"colonna":"<id della colonna>","esito":"presente","valore":"<il dato, breve ed esatto>","citazioni":[{"file":"<path relativo del file letto>","pagina":<numero dell'ancora [pag. N]>,"estratto":"<il passaggio letterale>","articolo":"<se c'è>","sezione":"<se c'è>"}]},
  {"colonna":"<id>","esito":"non-presente","nota":"<perché il dato non c'è, breve>"},
  {"colonna":"<id>","esito":"non-determinabile","motivo":"<perché non si può stabilire>"}
]}
\`\`\`

- Una voce per OGNI colonna richiesta, con l'id esatto che ti viene dato.
- Ogni esito "presente" DEVE avere almeno una citazione a un passaggio che hai davvero letto; \`pagina\` è il numero dell'ancora più vicina. Mai citare un file che non hai letto; gli \`INDICE.md\` sono mappe, non fonti.
- Il blocco lo legge il sistema, non l'utente: niente altro testo.`;

export interface ColonnaDaEstrarre {
  id: string;
  intestazione: string;
  origine: 'predefinita' | 'personalizzata';
  criterio: string | null;
  /** La descrizione del criterio predefinito, se l'intestazione la trova. */
  descrizione?: string;
}

/** Il prompt utente di una riga: il documento e i criteri da estrarre. */
export function promptRigaEstrazione(riga: {
  path: string;
  titolo: string;
  colonne: ColonnaDaEstrarre[];
}): string {
  const parti = [
    `Documento della riga: \`${riga.path}\` — ${riga.titolo}`,
    '',
    'Criteri da estrarre (una voce nel blocco per ciascuno, con questo id):',
  ];
  for (const c of riga.colonne) {
    const guida = c.criterio ?? c.descrizione;
    parti.push(`- [id: ${c.id}] **${c.intestazione}**${guida ? ` — ${guida}` : ''}`);
  }
  return parti.join('\n');
}

const schemaCitazioneCella = z.object({
  file: z.string().min(1),
  pagina: z.coerce.number().int().min(1),
  estratto: z.string().trim().min(1).max(1000),
  articolo: z.string().trim().max(120).nullable().optional(),
  sezione: z.string().trim().max(200).nullable().optional(),
});

export const schemaBloccoCelle = z.object({
  celle: z
    .array(
      z.object({
        colonna: z.string().min(1),
        esito: z.enum(['presente', 'non-presente', 'non-determinabile']),
        valore: z.string().trim().min(1).max(500).optional(),
        nota: z.string().trim().min(1).max(500).optional(),
        motivo: z.string().trim().min(1).max(500).optional(),
        citazioni: z.array(schemaCitazioneCella).default([]),
      }),
    )
    .default([]),
});

export type BloccoCelle = z.infer<typeof schemaBloccoCelle>;
type VoceCella = BloccoCelle['celle'][number];

/** Estrae il blocco `velia-celle` dal testo della sessione. */
export function separaBloccoCelle(testo: string): {
  blocco: BloccoCelle | undefined;
  problemi: string[];
} {
  const indice = testo.lastIndexOf(MARCATORE_CELLE);
  if (indice < 0) return { blocco: undefined, problemi: ['blocco velia-celle mancante'] };
  const dopo = testo.slice(indice + MARCATORE_CELLE.length);
  const chiusura = dopo.indexOf('```');
  const grezzo = (chiusura >= 0 ? dopo.slice(0, chiusura) : dopo).trim();
  try {
    return { blocco: schemaBloccoCelle.parse(JSON.parse(grezzo)), problemi: [] };
  } catch (errore) {
    return {
      blocco: undefined,
      problemi: [`blocco velia-celle non valido: ${errore instanceof Error ? errore.message : String(errore)}`],
    };
  }
}

export const MOTIVO_SENZA_ESITO = 'L’estrazione non ha prodotto un risultato per questo criterio.';
export const MOTIVO_SENZA_FONTE =
  'Il valore estratto non aveva una fonte verificabile ed è stato scartato.';

/**
 * Dal blocco alle celle del contratto, una per colonna richiesta. Ciò che il
 * modello non ha coperto, o ha coperto senza una fonte che regge, diventa
 * «non determinabile» — mai una cella che afferma senza citare.
 */
export function valutaCelle(
  blocco: BloccoCelle,
  colonne: Array<{ id: string }>,
  perPath: Map<string, DocumentoWorkspace>,
): { celle: Map<string, CellaTabella>; avvisi: string[] } {
  const avvisi: string[] = [];
  const celle = new Map<string, CellaTabella>();
  const perColonna = new Map(blocco.celle.map((v) => [v.colonna, v]));

  for (const { id } of colonne) {
    const voce = perColonna.get(id);
    if (!voce) {
      avvisi.push(`colonna ${id} senza esito nel blocco`);
      celle.set(id, { stato: 'pronta', esito: 'non-determinabile', motivo: MOTIVO_SENZA_ESITO });
      continue;
    }
    celle.set(id, valutaVoce(voce, perPath, avvisi));
  }
  return { celle, avvisi };
}

function valutaVoce(
  voce: VoceCella,
  perPath: Map<string, DocumentoWorkspace>,
  avvisi: string[],
): CellaTabella {
  if (voce.esito === 'non-presente') {
    return { stato: 'pronta', esito: 'non-presente', ...(voce.nota && { nota: voce.nota }) };
  }
  if (voce.esito === 'non-determinabile') {
    return { stato: 'pronta', esito: 'non-determinabile', motivo: voce.motivo ?? MOTIVO_SENZA_ESITO };
  }

  if (!voce.valore) {
    avvisi.push(`colonna ${voce.colonna}: esito presente senza valore`);
    return { stato: 'pronta', esito: 'non-determinabile', motivo: MOTIVO_SENZA_ESITO };
  }
  const citazioni = [];
  for (const c of voce.citazioni) {
    const path = normalizzaPath(c.file);
    if (eMappa(path)) {
      avvisi.push(`colonna ${voce.colonna}: citazione a una mappa ignorata`);
      continue;
    }
    const doc = perPath.get(path);
    if (!doc) {
      avvisi.push(`colonna ${voce.colonna}: citazione a un file inesistente (${c.file})`);
      continue;
    }
    if (doc.paginaMassima !== null && c.pagina > doc.paginaMassima) {
      avvisi.push(
        `colonna ${voce.colonna}: citazione a pag. ${c.pagina} di «${doc.titolo}», oltre l'ultima citabile (${doc.paginaMassima})`,
      );
      continue;
    }
    citazioni.push({
      id: randomUUID(),
      documentoId: doc.id,
      documentoTitolo: doc.titolo,
      archivio: doc.archivio,
      posizione: {
        pagina: c.pagina,
        ...(c.articolo && { articolo: c.articolo }),
        ...(c.sezione && { sezione: c.sezione }),
      },
      estratto: c.estratto,
    });
  }
  if (!citazioni.length) {
    avvisi.push(`colonna ${voce.colonna}: valore senza citazioni verificabili, scartato`);
    return { stato: 'pronta', esito: 'non-determinabile', motivo: MOTIVO_SENZA_FONTE };
  }
  return { stato: 'pronta', esito: 'presente', valore: voce.valore, citazioni };
}
