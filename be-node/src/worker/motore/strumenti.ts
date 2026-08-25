import { randomUUID } from 'node:crypto';

import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import type pg from 'pg';
import { z } from 'zod';

import {
  percorsoDocumentoGenerato,
  urlDocumentoGenerato,
  type DocumentoGenerato,
} from '../../contratto/conversazioni.js';
import { FORMATI_GENERAZIONE, type FormatoGenerazione } from '../../contratto/template.js';
import {
  identitaDelTenant,
  identitaPerGenerazione,
  layoutPerFormato,
  templateDelTenant,
  versoRisolto,
  type RigaTemplate,
  type TemplateRisolto,
} from '../../generazione/catalogo.js';
import { generaDocumento, MIME } from '../../generazione/generatore.js';
import type { ArchivioFile } from '../ingestion/archivio-file.js';

/**
 * Gli strumenti che la chat dà al motore oltre alla lettura: il tool
 * `genera_documento`, con cui l'utente ottiene un file sul template
 * dell'agenzia senza uscire dalla conversazione («esporta con Proposta
 * breve», «fammelo in Excel»).
 *
 * Il tool gira nel processo del worker (MCP in-process dell'Agent SDK): il
 * modello passa titolo e contenuto, il worker risolve il template, genera il
 * file con la stessa macchina delle esportazioni (identità visiva compresa),
 * lo mette nello Storage e lo racconta al FE come evento `documento`. Il
 * modello riceve solo un esito testuale: non vede mai path né Storage.
 */

export const NOME_SERVER = 'velia';
export const NOME_TOOL_DOCUMENTO = `mcp__${NOME_SERVER}__genera_documento`;

/** Un template come lo vede il prompt: nome, formato, se è il predefinito. */
export interface TemplateNelPrompt {
  nome: string;
  formato: string;
  predefinito: boolean;
}

export interface ContestoStrumenti {
  db: pg.Pool;
  archivio: ArchivioFile;
  tenantId: string;
  conversazioneId: string;
  /** L'id pre-generato della risposta: i documenti nascono già suoi. */
  messaggioId: string;
  /** Chiamato a ogni documento generato: l'evento verso il FE parte da qui. */
  suDocumento: (documento: DocumentoGenerato) => Promise<void>;
}

export interface StrumentiMotore {
  server: McpSdkServerConfigWithInstance;
  nomi: string[];
  /** I documenti generati finora, nell'ordine: il gestore li salva col messaggio. */
  generati: DocumentoGenerato[];
  /** I path nello Storage, per la pulizia se la risposta non passa. */
  percorsi: string[];
}

/**
 * La scelta del template dal testo che il modello passa: un nome (anche
 * approssimato: senza maiuscole, o contenuto nel nome) o un id; con solo il
 * formato vale il predefinito, o il layout di piattaforma. Pura: provata a parte.
 */
export function scegliTemplate(
  template: RigaTemplate[],
  richiesta: { template?: string | undefined; formato?: FormatoGenerazione | undefined },
): { esito: 'ok'; template: TemplateRisolto } | { esito: 'non-trovato'; motivo: string } {
  const generabili = template.filter((t) => t.formato !== 'pptx');
  if (richiesta.template?.trim()) {
    const cercato = richiesta.template.trim().toLowerCase();
    const preciso = generabili.find((t) => t.id === cercato || t.nome.toLowerCase() === cercato);
    const parziale = generabili.filter((t) => t.nome.toLowerCase().includes(cercato));
    const scelto = preciso ?? (parziale.length === 1 ? parziale[0] : undefined);
    if (!scelto) {
      const disponibili = generabili.length
        ? `Template disponibili: ${generabili.map((t) => `«${t.nome}» (${t.formato})`).join(', ')}.`
        : 'L’agenzia non ha template caricati: indica solo il formato.';
      return {
        esito: 'non-trovato',
        motivo:
          parziale.length > 1
            ? `Più template corrispondono a «${richiesta.template}»: ${parziale.map((t) => `«${t.nome}»`).join(', ')}. Chiedi all’utente quale vuole.`
            : `Nessun template chiamato «${richiesta.template}». ${disponibili}`,
      };
    }
    if (richiesta.formato && richiesta.formato !== scelto.formato) {
      return {
        esito: 'non-trovato',
        motivo: `Il template «${scelto.nome}» è ${scelto.formato.toUpperCase()}, non ${richiesta.formato.toUpperCase()}: usa il suo formato o scegli un altro template.`,
      };
    }
    return { esito: 'ok', template: versoRisolto(scelto) };
  }
  return { esito: 'ok', template: layoutPerFormato(generabili, richiesta.formato ?? 'pdf') };
}

export function creaStrumentiMotore(contesto: ContestoStrumenti): StrumentiMotore {
  const generati: DocumentoGenerato[] = [];
  const percorsi: string[] = [];

  const generaDocumentoTool = tool(
    'genera_documento',
    [
      'Genera un documento (PDF, DOCX o XLSX) sul template dell’agenzia e lo allega alla risposta, pronto da scaricare.',
      'Usalo SOLO quando l’utente chiede esplicitamente un file, un documento, un’esportazione, un allegato o un template',
      '(«esporta», «genera un doc», «fammelo in Excel», «usa il template Proposta breve»). Mai di tua iniziativa.',
      'Passa in `contenuto` il testo completo del documento in Markdown leggero (titoli, elenchi, tabelle, grassetti):',
      'è ciò che finirà nel file — scrivilo per il cliente o il collega che lo leggerà, non per te.',
      'Indica `template` (il nome che l’utente ha detto) oppure `formato`; con entrambi assenti esce un PDF.',
      'Dopo l’esito, chiudi la risposta con UNA sola riga che dice che il documento è pronto sotto la risposta (non ripeterla, non ricopiare il contenuto).',
    ].join(' '),
    {
      titolo: z.string().min(1).max(160).describe('Il titolo del documento, es. «Proposta di rinnovo RC Auto Rossi».'),
      contenuto: z.string().min(1).describe('Il testo completo del documento, in Markdown leggero.'),
      template: z
        .string()
        .optional()
        .describe('Il nome (o id) del template dell’agenzia da usare, come lo ha detto l’utente.'),
      formato: z
        .enum(FORMATI_GENERAZIONE)
        .optional()
        .describe('Il formato del file quando non si indica un template: pdf, docx o xlsx.'),
      destinatario: z.string().max(200).optional().describe('Cliente o pratica a cui è destinato, se detto.'),
      fonti: z
        .array(z.string().min(1).max(300))
        .max(40)
        .optional()
        .describe('Le fonti da riportare in coda, nella forma «Titolo documento — art. X, p. N».'),
    },
    async (args) => {
      const client = await contesto.db.connect();
      let template: RigaTemplate[];
      let identita;
      try {
        template = await templateDelTenant(client, contesto.tenantId);
        identita = await identitaDelTenant(client, contesto.tenantId);
      } finally {
        client.release();
      }
      const scelta = scegliTemplate(template, { template: args.template, formato: args.formato });
      if (scelta.esito === 'non-trovato') {
        return { content: [{ type: 'text', text: scelta.motivo }], isError: true };
      }

      const file = await generaDocumento({
        template: scelta.template,
        ...(scelta.template.path_file && {
          fileTemplate: await contesto.archivio.scarica(scelta.template.path_file),
        }),
        titolo: args.titolo,
        testo: args.contenuto,
        fonti: args.fonti ?? [],
        ...(args.destinatario && { destinatario: args.destinatario }),
        identita: await identitaPerGenerazione(contesto.archivio, identita),
      });

      const id = randomUUID();
      const percorso = percorsoDocumentoGenerato(contesto.tenantId, id, scelta.template.formato);
      await contesto.archivio.carica(percorso, file.byte, MIME[scelta.template.formato]);
      percorsi.push(percorso);

      const documento: DocumentoGenerato = {
        id,
        nome: args.titolo,
        formato: scelta.template.formato,
        ...(scelta.template.personalizzato && { template: scelta.template.nome }),
        url: urlDocumentoGenerato(contesto.conversazioneId, id),
      };
      generati.push(documento);
      await contesto.suDocumento(documento);

      const su = scelta.template.personalizzato
        ? `sul template «${scelta.template.nome}»`
        : 'col layout di VELIA e l’identità visiva dell’agenzia';
      return {
        content: [
          {
            type: 'text',
            text: `Documento «${args.titolo}» generato in ${scelta.template.formato.toUpperCase()} ${su}. L’utente lo trova da scaricare sotto la risposta.`,
          },
        ],
      };
    },
  );

  return {
    server: createSdkMcpServer({ name: NOME_SERVER, version: '1.0.0', tools: [generaDocumentoTool] }),
    nomi: [NOME_TOOL_DOCUMENTO],
    generati,
    percorsi,
  };
}
