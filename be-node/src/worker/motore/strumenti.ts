import { randomUUID } from 'node:crypto';

import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import type pg from 'pg';
import { z } from 'zod';

import {
  percorsoDocumentoGenerato,
  urlDocumentoGenerato,
  type DocumentoGenerato,
} from '../../contratto/conversazioni.js';
import { FORMATI_GENERAZIONE, FORMATI_MODELLO, type FormatoModello } from '../../contratto/template.js';
import { fasceDelTenant, modelliDelTenant, scegliModello } from '../../generazione/catalogo.js';
import { generaDocumento, MIME } from '../../generazione/generatore.js';
import { risolviProposta, type OperazioneChiesta } from '../../archivio/proposta.js';
import type { PropostaArchivio } from '../../contratto/conversazioni.js';
import type { ArchivioFile } from '../ingestion/archivio-file.js';

/**
 * Gli strumenti che la chat dà al motore oltre alla lettura: il tool
 * `esporta_subito` (deterministico, istantaneo: layout di VELIA e
 * intestazione dell'agenzia) ed `esportazione_elaborata` («Genera da
 * modello»: sandbox documentale su un modello di riferimento dell'agenzia),
 * con cui l'utente ottiene un file senza uscire dalla conversazione
 * («fammelo in Excel», «fammelo sul modello Proposta breve»).
 *
 * Il tool gira nel processo del worker (MCP in-process dell'Agent SDK): il
 * modello passa titolo e contenuto, il worker genera il file con la stessa
 * macchina delle esportazioni, lo mette nello Storage e lo racconta al FE
 * come evento `documento`. Il modello riceve solo un esito testuale: non
 * vede mai path né Storage.
 */

export const NOME_SERVER = 'velia';
export const NOME_TOOL_ESPORTA_SUBITO = `mcp__${NOME_SERVER}__esporta_subito`;
export const NOME_TOOL_ELABORATA = `mcp__${NOME_SERVER}__esportazione_elaborata`;
export const NOME_TOOL_PROPONI_RIORDINO = `mcp__${NOME_SERVER}__proponi_riordino`;
/** @deprecated nome storico */
export const NOME_TOOL_DOCUMENTO = NOME_TOOL_ESPORTA_SUBITO;

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
    formato?: FormatoModello | undefined;
    /** L'id del modello, già risolto dal nome detto in chat. */
    modelloId?: string | undefined;
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

export function creaStrumentiMotore(contesto: ContestoStrumenti): StrumentiMotore {
  const generati: DocumentoGenerato[] = [];
  const percorsi: string[] = [];

  const esportaSubito = tool(
    'esporta_subito',
    [
      'Genera all’istante un documento (PDF, DOCX o XLSX) col layout di VELIA e l’intestazione dell’agenzia, e lo allega alla risposta, pronto da scaricare.',
      'Usalo SOLO quando l’utente chiede esplicitamente un file, un documento, un’esportazione o un allegato',
      '(«esporta», «genera un doc», «fammelo in Excel»). Mai di tua iniziativa. Se nomina un modello o un documento da imitare, usa invece `esportazione_elaborata`.',
      'Passa in `contenuto` il testo completo del documento in Markdown leggero (titoli, elenchi, tabelle, grassetti):',
      'è ciò che finirà nel file — scrivilo per il cliente o il collega che lo leggerà, non per te.',
      'Senza `formato` esce un PDF.',
      'Dopo l’esito, chiudi la risposta con UNA sola riga che dice che il documento è pronto sotto la risposta (non ripeterla, non ricopiare il contenuto).',
    ].join(' '),
    {
      titolo: z.string().min(1).max(160).describe('Il titolo del documento, es. «Proposta di rinnovo RC Auto Rossi».'),
      contenuto: z.string().min(1).describe('Il testo completo del documento, in Markdown leggero.'),
      formato: z.enum(FORMATI_GENERAZIONE).optional().describe('Il formato del file: pdf, docx o xlsx.'),
      fonti: z
        .array(z.string().min(1).max(300))
        .max(40)
        .optional()
        .describe('Le fonti da riportare in coda, nella forma «Titolo documento — art. X, p. N».'),
    },
    async (args) => {
      const formato = args.formato ?? 'pdf';
      const client = await contesto.db.connect();
      let fasce;
      try {
        fasce = await fasceDelTenant(client, contesto.archivio, contesto.tenantId, args.titolo);
      } finally {
        client.release();
      }

      const file = await generaDocumento({
        formato,
        nome: args.titolo,
        titolo: args.titolo,
        testo: args.contenuto,
        fonti: args.fonti ?? [],
        fasce,
      });

      const id = randomUUID();
      const percorso = percorsoDocumentoGenerato(contesto.tenantId, id, formato);
      await contesto.archivio.carica(percorso, file.byte, MIME[formato]);
      percorsi.push(percorso);

      const documento: DocumentoGenerato = {
        id,
        nome: args.titolo,
        formato,
        url: urlDocumentoGenerato(contesto.conversazioneId, id),
      };
      generati.push(documento);
      await contesto.suDocumento(documento);

      return {
        content: [
          {
            type: 'text',
            text: `Documento «${args.titolo}» generato in ${formato.toUpperCase()} col layout di VELIA e l’intestazione dell’agenzia. L’utente lo trova da scaricare sotto la risposta.`,
          },
        ],
      };
    },
  );

  const esportazioneElaborata = tool(
    'esportazione_elaborata',
    [
      'Fa preparare un documento di qualità professionale (PDF, DOCX, XLSX o PPTX) al motore documentale, che lavora in una',
      'sandbox con Python, Node, LibreOffice e Chromium: apre il modello di riferimento dell’agenzia, lo copia e lo adatta',
      'conservando struttura e stili, controlla il risultato pagina per pagina e lo allega alla risposta.',
      'Costa di più e ci mette uno o due minuti: usalo quando l’utente chiede un documento «fatto bene», «come quello»,',
      '«da consegnare», una proposta o un report impaginato, o nomina un modello («sul modello X», «da modello»). Per un',
      'semplice «esportamelo in pdf» usa invece `esporta_subito`. Mai di tua iniziativa.',
      'Scegli il modello fra quelli dell’agenzia, per nome, leggendo a cosa serve ciascuno; senza un modello adatto, omettilo.',
      'Passa in `istruzioni` tutto ciò che il motore documentale deve sapere (cosa produrre, per chi, con quali dati e',
      'da quali documenti della workspace) e in `contenuto` il testo di partenza già scritto, se c’è.',
      'Dopo l’esito, chiudi con UNA riga: il documento è pronto sotto la risposta.',
    ].join(' '),
    {
      modello: z.string().optional().describe('Il nome del modello di riferimento da usare, fra quelli dell’agenzia.'),
      formato: z
        .enum(FORMATI_MODELLO)
        .optional()
        .describe('Il formato del file: pdf, docx, xlsx o pptx. Senza, quello del modello (o PDF).'),
      istruzioni: z.string().min(1).max(4000).describe('Le istruzioni per il motore documentale.'),
      contenuto: z.string().optional().describe('Il testo di partenza in Markdown, se già scritto.'),
      titolo: z.string().max(160).optional(),
    },
    async (args) => {
      if (!contesto.elaborata) {
        return { content: [{ type: 'text', text: 'La generazione di documenti da modello non è disponibile in questo ambiente.' }], isError: true };
      }
      let modelloId: string | undefined;
      if (args.modello?.trim()) {
        const scelta = await risolviNomeModello(contesto, args.modello);
        if (scelta.esito !== 'ok') return { content: [{ type: 'text', text: scelta.motivo }], isError: true };
        modelloId = scelta.id;
      }
      let esito;
      try {
        esito = await contesto.elaborata({
          formato: args.formato,
          modelloId,
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
              ? `Documento pronto: ${consegnati}, già sotto la risposta. Nota del motore documentale: ${esito.testo}`
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

/** Il nome detto in chat → l'id del modello, o il motivo per cui non c'è (che torna al motore). */
async function risolviNomeModello(
  contesto: ContestoStrumenti,
  nome: string,
): Promise<{ esito: 'ok'; id: string } | { esito: 'non-trovato'; motivo: string }> {
  const client = await contesto.db.connect();
  try {
    const scelta = scegliModello(await modelliDelTenant(client, contesto.tenantId), nome);
    return scelta.esito === 'ok' ? { esito: 'ok', id: scelta.modello.id } : scelta;
  } finally {
    client.release();
  }
}
