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
import { risolviProposta, type OperazioneChiesta } from '../../archivio/proposta.js';
import type { PropostaArchivio } from '../../contratto/conversazioni.js';
import type { ArchivioFile } from '../ingestion/archivio-file.js';

/**
 * Gli strumenti che la chat dà al motore oltre alla lettura: il tool
 * `esporta_subito` (deterministico, istantaneo) ed `esportazione_elaborata`
 * (sandbox documentale), con cui l'utente ottiene un file sul template
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
export const NOME_TOOL_ESPORTA_SUBITO = `mcp__${NOME_SERVER}__esporta_subito`;
export const NOME_TOOL_ELABORATA = `mcp__${NOME_SERVER}__esportazione_elaborata`;
export const NOME_TOOL_PROPONI_RIORDINO = `mcp__${NOME_SERVER}__proponi_riordino`;
/** @deprecated nome storico */
export const NOME_TOOL_DOCUMENTO = NOME_TOOL_ESPORTA_SUBITO;

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
  /**
   * Chiamato quando il modello propone un riordino dell'archivio: deposita
   * la proposta e la racconta al FE. Assente = il tool non c'è, e
   * l'assistente resta in sola lettura come è sempre stato.
   */
  suProposta?: (proposta: Omit<PropostaArchivio, 'id' | 'stato'>) => Promise<PropostaArchivio>;
  /**
   * L'Esportazione elaborata richiamata a parole in chat: il gestore la
   * esegue (sandbox documentale) e ritorna il messaggio finale del motore
   * documentale. Assente = la sandbox non è configurata e il tool non c'è.
   */
  elaborata?: (richiesta: {
    formato: FormatoGenerazione;
    template?: string | undefined;
    istruzioni: string;
    contenuto?: string | undefined;
    titolo?: string | undefined;
  }) => Promise<{ testo: string; documenti: DocumentoGenerato[] }>;
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

  const esportaSubito = tool(
    'esporta_subito',
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

  const esportazioneElaborata = tool(
    'esportazione_elaborata',
    [
      'Fa preparare un documento di qualità professionale (PDF, DOCX o XLSX) al motore documentale, che lavora in una',
      'sandbox con Python, Node, LibreOffice e Chromium: apre il template o il documento di esempio, lo copia e lo adatta',
      'conservando impaginazione e stili, controlla il risultato pagina per pagina e lo allega alla risposta.',
      'Costa di più e ci mette uno o due minuti: usalo quando l’utente chiede un documento «fatto bene», «come quello»,',
      '«da consegnare», una proposta o un report impaginato, o chiede un documento «da template». Per un semplice',
      '«esportamelo in pdf» usa invece `esporta_subito`. Mai di tua iniziativa.',
      'Passa in `istruzioni` tutto ciò che il motore documentale deve sapere (cosa produrre, per chi, con quali dati e',
      'da quali documenti della workspace) e in `contenuto` il testo di partenza già scritto, se c’è.',
      'Dopo l’esito, chiudi con UNA riga: il documento è pronto sotto la risposta.',
    ].join(' '),
    {
      formato: z.enum(FORMATI_GENERAZIONE).describe('Il formato del file: pdf, docx o xlsx.'),
      template: z.string().optional().describe('Il nome del template o del documento di esempio da usare, come lo ha detto l’utente.'),
      istruzioni: z.string().min(1).max(4000).describe('Le istruzioni per il motore documentale.'),
      contenuto: z.string().optional().describe('Il testo di partenza in Markdown, se già scritto.'),
      titolo: z.string().max(160).optional(),
    },
    async (args) => {
      if (!contesto.elaborata) {
        return { content: [{ type: 'text', text: 'La generazione di documenti da template non è disponibile in questo ambiente.' }], isError: true };
      }
      const template = args.template?.trim() ? await risolviNomeTemplate(contesto, args.template) : undefined;
      if (template === null) {
        return {
          content: [{ type: 'text', text: `Nessun template chiamato «${args.template}»: chiedi all’utente quale usare o procedi senza.` }],
          isError: true,
        };
      }
      let esito;
      try {
        esito = await contesto.elaborata({
          formato: args.formato,
          template,
          istruzioni: args.istruzioni,
          contenuto: args.contenuto,
          titolo: args.titolo,
        });
      } catch (errore) {
        /* Il motivo arriva al modello, così lo dice all'utente invece di «problema tecnico». */
        const motivo = errore instanceof Error ? errore.message : String(errore);
        return {
          content: [{ type: 'text', text: `Il motore documentale non è partito: ${motivo.slice(0, 300)}. Non riprovare da solo: dillo all’utente.` }],
          isError: true,
        };
      }
      const consegnati = esito.documenti.map((d) => `«${d.nome}» (${d.formato.toUpperCase()})`).join(', ');
      return {
        content: [
          {
            type: 'text',
            text: consegnati
              ? `Documento da template pronto: ${consegnati}, già sotto la risposta. Nota del motore documentale: ${esito.testo}`
              : `Il motore documentale non ha consegnato file. Nota: ${esito.testo}`,
          },
        ],
        ...(!consegnati && { isError: true }),
      };
    },
  );

  /**
   * L'unico tool che riguarda l'archivio, e non lo tocca: **propone**.
   *
   * Il motore continua a non avere strumenti di scrittura e non ne guadagna
   * uno qui. Deposita un riordino, l'utente lo vede sotto la risposta con
   * due pulsanti, e la scrittura la fa l'API con l'identità di chi approva.
   * Se nessuno approva, non succede niente.
   */
  const proponiRiordino = tool(
    'proponi_riordino',
    [
      'Propone all’utente di riordinare l’Archivio Privato: creare cartelle e spostarci dentro dei documenti.',
      'Non esegue niente: l’utente vede la proposta sotto la risposta e decide se approvarla.',
      'Usalo quando l’utente chiede di spostare un documento, di creare una cartella o di mettere ordine.',
      'Mai di tua iniziativa: l’archivio è suo.',
      'I percorsi delle cartelle si scrivono come li vede l’utente («Clienti», «Clienti/Rossi Mario»), non come path della workspace.',
      'Il documento si indica col suo file nella workspace, lo stesso che useresti per citarlo.',
      'Se una cartella che ti serve non esiste ancora, mettila come prima operazione e poi spostaci dentro: le operazioni si applicano in ordine.',
      'Dopo l’esito, di’ in UNA riga cosa hai proposto e che lo trova lì sotto da approvare.',
    ].join(' '),
    {
      operazioni: z
        .array(
          z.object({
            azione: z.enum(['crea-cartella', 'sposta-documento']),
            nome: z.string().max(120).optional().describe('crea-cartella: il nome della cartella nuova.'),
            dentro: z
              .string()
              .max(400)
              .optional()
              .describe('crea-cartella: la cartella che la conterrà, per percorso; assente = in cima.'),
            documento: z
              .string()
              .max(400)
              .optional()
              .describe('sposta-documento: il file del documento nella workspace.'),
            verso: z
              .string()
              .max(400)
              .optional()
              .describe('sposta-documento: la cartella di destinazione, per percorso.'),
          }),
        )
        .min(1)
        .max(20)
        .describe('Le operazioni, nell’ordine in cui vanno applicate.'),
      motivo: z.string().max(300).optional().describe('Perché, in una riga, come lo diresti all’utente.'),
    },
    async (args) => {
      if (!contesto.suProposta) {
        return {
          content: [
            {
              type: 'text',
              text: 'Non posso proporre modifiche all’archivio in questo ambiente: dillo all’utente e fermati.',
            },
          ],
          isError: true,
        };
      }
      const client = await contesto.db.connect();
      let esito;
      try {
        esito = await risolviProposta(client, contesto.tenantId, args.operazioni as OperazioneChiesta[]);
      } finally {
        client.release();
      }
      /* Il motivo del rifiuto torna al modello, non all'utente: così si
         corregge dentro la stessa risposta invece di proporre un riordino
         che poi non si applica. */
      if (!esito.operazioni.length) {
        return {
          content: [
            {
              type: 'text',
              text: `Non ho potuto preparare il riordino: ${esito.rifiutate.join('; ')}. Chiedi all’utente come procedere.`,
            },
          ],
          isError: true,
        };
      }
      const proposta = await contesto.suProposta({
        operazioni: esito.operazioni,
        ...(args.motivo && { motivo: args.motivo }),
      });
      const scartate = esito.rifiutate.length
        ? ` Non ho incluso: ${esito.rifiutate.join('; ')}.`
        : '';
      return {
        content: [
          {
            type: 'text',
            text: `Riordino proposto (${proposta.operazioni.length} operazioni). L’utente lo trova sotto la risposta e decide se approvarlo: finché non lo fa, l’archivio non cambia.${scartate}`,
          },
        ],
      };
    },
  );

  return {
    server: createSdkMcpServer({
      name: NOME_SERVER,
      version: '1.0.0',
      tools: [
        esportaSubito,
        ...(contesto.elaborata ? [esportazioneElaborata] : []),
        ...(contesto.suProposta ? [proponiRiordino] : []),
      ],
    }),
    nomi: [
      NOME_TOOL_ESPORTA_SUBITO,
      ...(contesto.elaborata ? [NOME_TOOL_ELABORATA] : []),
      ...(contesto.suProposta ? [NOME_TOOL_PROPONI_RIORDINO] : []),
    ],
    generati,
    percorsi,
  };
}

/** Il nome detto dall'utente → l'id del template (null se non c'è nulla di simile). */
async function risolviNomeTemplate(contesto: ContestoStrumenti, nome: string): Promise<string | null> {
  const client = await contesto.db.connect();
  try {
    const scelta = scegliTemplate(await templateDelTenant(client, contesto.tenantId), { template: nome });
    return scelta.esito === 'ok' && scelta.template.id ? scelta.template.id : null;
  } finally {
    client.release();
  }
}
