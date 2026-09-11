import { randomUUID } from 'node:crypto';

import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import type pg from 'pg';
import { z } from 'zod';

import {
  percorsoDocumentoGenerato,
  urlDocumentoGenerato,
  type DocumentoGenerato,
} from '../../contratto/conversazioni.js';
import { consegnabile } from '../../contratto/formati.js';
import { FORMATI_GENERAZIONE } from '../../contratto/template.js';
import { fasceDelTenant, modelliDelTenant, modelloChiesto, scegliModello } from '../../generazione/catalogo.js';
import { generaDocumento, MIME } from '../../generazione/generatore.js';
import { risolviProposta, type OperazioneChiesta } from '../../archivio/proposta.js';
import type { PropostaArchivio } from '../../contratto/conversazioni.js';
import { condividiDocumento } from '../../pagine/condivise.js';
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
export const NOME_TOOL_CONDIVIDI_LINK = `mcp__${NOME_SERVER}__condividi_link`;
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
    /** L'estensione: qualsiasi formato tranne gli eseguibili. */
    formato?: string | undefined;
    /** L'id del modello, già risolto dal nome detto in chat. */
    modelloId?: string | undefined;
    istruzioni: string;
    contenuto?: string | undefined;
    titolo?: string | undefined;
  }) => Promise<{ testo: string; documenti: DocumentoGenerato[] }>;
  /**
   * Dove un modello può essere stato chiesto: i messaggi dell'utente in
   * questa conversazione e il DNA d'Agenzia (`modelloChiesto`). Un modello
   * senza «quando usarlo» che non compare qui non si usa. Assente = ci si
   * fida della scelta del motore.
   */
  richieste?: { utente: string[]; agenzia: string[] };
  /**
   * Le pagine condivise (fase 2 di `PIANO-LINK-E-FORMATI.md`): la radice dei
   * link e chi li crea. Assente = lo strumento `condividi_link` non c'è.
   */
  pagine?: { baseLink: string; utenteId: string };
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
      'Fa preparare un file di qualità professionale al motore documentale, che lavora in una sandbox con Python, Node,',
      'LibreOffice e Chromium: lo impagina con cura, controlla il risultato e lo allega alla risposta. Qualsiasi formato,',
      'tranne i programmi eseguibili: PDF, Word, Excel, PowerPoint, una pagina web interattiva (HTML: indice, sezioni che',
      'si aprono, pensata per il telefono), un’immagine (PNG, JPG), CSV, ZIP… Con un `modello` apre il modello di',
      'riferimento dell’agenzia e ne conserva struttura e stili; senza, impagina da zero col marchio dell’agenzia.',
      'Costa di più e ci mette uno o due minuti: usalo quando l’utente chiede un documento «fatto bene», «come quello»,',
      '«da consegnare», una proposta, un report impaginato, una presentazione, una pagina interattiva o un’immagine, o nomina',
      'un modello («sul modello X», «da modello»). Per un semplice «esportamelo in pdf» usa invece `esporta_subito`. Mai di',
      'tua iniziativa.',
      'Passa `modello` solo quando è chiaro che lo si vuole: l’utente lo nomina o chiede «il modello», una regola del DNA',
      'd’Agenzia lo prescrive, o la sua riga «quando usarlo» descrive proprio il documento chiesto. Mai solo perché c’è:',
      'nel dubbio omettilo.',
      'Passa in `istruzioni` tutto ciò che il motore documentale deve sapere (cosa produrre, per chi, con quali dati e',
      'da quali documenti della workspace) e in `contenuto` il testo di partenza già scritto, se c’è.',
      'Dopo l’esito, chiudi con UNA riga: il documento è pronto sotto la risposta.',
    ].join(' '),
    {
      modello: z
        .string()
        .optional()
        .describe('Il nome del modello di riferimento, fra quelli dell’agenzia: solo quando è chiaro che lo si vuole.'),
      formato: z
        .string()
        .max(12)
        .optional()
        .describe(
          'Il formato del file, come estensione: pdf, docx, xlsx, pptx, html (pagina web interattiva), png, jpg, csv, zip… Senza, quello del modello (o PDF).',
        ),
      istruzioni: z.string().min(1).max(4000).describe('Le istruzioni per il motore documentale.'),
      contenuto: z.string().optional().describe('Il testo di partenza in Markdown, se già scritto.'),
      titolo: z.string().max(160).optional(),
    },
    async (args) => {
      if (!contesto.elaborata) {
        return { content: [{ type: 'text', text: 'La generazione di documenti da modello non è disponibile in questo ambiente.' }], isError: true };
      }
      const formato = args.formato?.trim().toLowerCase().replace(/^\./, '') || undefined;
      if (formato && !consegnabile(formato)) {
        return {
          content: [{ type: 'text', text: `Il formato «${formato}» non si può produrre: i programmi eseguibili sono esclusi. Dillo all’utente.` }],
          isError: true,
        };
      }
      let modelloId: string | undefined;
      let scartato = '';
      if (args.modello?.trim()) {
        const scelta = await risolviNomeModello(contesto, args.modello);
        if (scelta.esito !== 'ok') return { content: [{ type: 'text', text: scelta.motivo }], isError: true };
        /* Senza «quando usarlo» il motore non ha niente con cui abbinarlo al
           documento chiesto: se nessuno l'ha chiesto, l'ha preso perché c'era. */
        const { modello } = scelta;
        if (modello.descrizione.trim() || !contesto.richieste || modelloChiesto(modello.nome, contesto.richieste)) {
          modelloId = modello.id;
        } else {
          console.log(`[elaborata] modello «${modello.nome}» scartato: senza «quando usarlo» e non chiesto`);
          scartato = ` Il modello «${modello.nome}» NON è stato usato: non ha la riga «quando usarlo» e nessuno l’ha chiesto, quindi il documento è impaginato dal motore documentale con l’intestazione dell’agenzia. Non dire che è sul modello.`;
        }
      }
      let esito;
      try {
        esito = await contesto.elaborata({
          formato,
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
              ? `Documento pronto: ${consegnati}, già sotto la risposta.${scartato} Nota del motore documentale: ${esito.testo}`
              : `Il motore documentale non ha consegnato file. Nota: ${esito.testo}`,
          },
        ],
        ...(!consegnati && { isError: true }),
      };
    },
  );

  /**
   * Il link di un documento generato, da mandare al cliente (fase 2 di
   * `PIANO-LINK-E-FORMATI.md`): la stessa funzione del pulsante «Condividi
   * link», 30 giorni salvo diverso avviso. Il documento può essere di questa
   * risposta (ancora solo in memoria) o di una precedente.
   */
  const condividiLink = tool(
    'condividi_link',
    [
      'Crea il link di un documento generato in questa conversazione, da mandare al cliente: si apre dal telefono',
      '(una pagina web, un PDF, un’immagine) o porta a scaricare il file. Usalo quando l’utente chiede una pagina, una',
      'presentazione o un documento da mandare o girare al cliente, o chiede il link: dopo averlo generato, o per uno',
      'generato prima. Senza `documento` vale l’ultimo generato. Il link vale 30 giorni salvo `giorni` (null = nessuna',
      'scadenza) e l’agenzia lo revoca dal documento. Chi ha il link vede il documento: non crearlo per documenti interni.',
      'Dopo l’esito scrivi il link in chiaro nella risposta, in una riga, con la scadenza.',
    ].join(' '),
    {
      documento: z.string().max(200).optional().describe('Il nome del documento generato, o parte di esso; assente = l’ultimo.'),
      giorni: z.number().int().min(1).max(365).nullable().optional().describe('Per quanti giorni vale; null = nessuna scadenza.'),
    },
    async (args) => {
      if (!contesto.pagine) {
        return { content: [{ type: 'text', text: 'I link non sono disponibili in questo ambiente: dillo all’utente.' }], isError: true };
      }
      const client = await contesto.db.connect();
      try {
        const precedenti = await client.query<{ documento: DocumentoGenerato }>(
          `select d as documento
             from velia.messaggi m, jsonb_array_elements(m.documenti) d
            where m.conversazione_id = $1
            order by m.inviato_il`,
          [contesto.conversazioneId],
        );
        const tutti = [...precedenti.rows.map((r) => r.documento), ...generati];
        const cercato = args.documento?.trim().toLowerCase();
        const candidati = cercato ? tutti.filter((d) => d.nome.toLowerCase().includes(cercato)) : tutti;
        const documento = candidati.at(-1);
        if (!documento) {
          const elenco = tutti.map((d) => `«${d.nome}»`).join(', ');
          return {
            content: [
              {
                type: 'text',
                text: elenco
                  ? `Nessun documento generato si chiama «${args.documento ?? ''}». Ci sono: ${elenco}.`
                  : 'In questa conversazione non c’è ancora nessun documento generato: prima generalo, poi crea il link.',
              },
            ],
            isError: true,
          };
        }
        const link = await condividiDocumento(
          client,
          contesto.pagine.baseLink,
          {
            tenantId: contesto.tenantId,
            conversazioneId: contesto.conversazioneId,
            documento: { id: documento.id, nome: documento.nome, formato: documento.formato },
            utenteId: contesto.pagine.utenteId,
          },
          args.giorni,
        );
        const scadenza = link.scadeIl
          ? `vale fino al ${new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(link.scadeIl))}`
          : 'non scade';
        return {
          content: [
            {
              type: 'text',
              text: `Link di «${documento.nome}»: ${link.url} (${scadenza}; l’agenzia lo revoca dal documento). Scrivilo in chiaro nella risposta.`,
            },
          ],
        };
      } finally {
        client.release();
      }
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
        ...(contesto.pagine ? [condividiLink] : []),
        ...(contesto.suProposta ? [proponiRiordino] : []),
      ],
    }),
    nomi: [
      NOME_TOOL_ESPORTA_SUBITO,
      ...(contesto.elaborata ? [NOME_TOOL_ELABORATA] : []),
      ...(contesto.pagine ? [NOME_TOOL_CONDIVIDI_LINK] : []),
      ...(contesto.suProposta ? [NOME_TOOL_PROPONI_RIORDINO] : []),
    ],
    generati,
    percorsi,
  };
}

/** Il nome detto in chat → il modello, o il motivo per cui non c'è (che torna al motore). */
async function risolviNomeModello(
  contesto: ContestoStrumenti,
  nome: string,
): Promise<ReturnType<typeof scegliModello>> {
  const client = await contesto.db.connect();
  try {
    return scegliModello(await modelliDelTenant(client, contesto.tenantId), nome);
  } finally {
    client.release();
  }
}
