import { z } from 'zod';

/**
 * Modello e provider (RF-D-02/03): il catalogo dice la verità sul motore.
 * La scelta vale per tutto il tenant (`velia.tenant.modello_motore`, null =
 * default di piattaforma, oggi Claude Opus 5) e viaggia fino al job: chat e
 * tabelle la leggono a ogni sessione. I provider terzi restano schede
 * informative non disponibili finché l'integrazione multi-provider non
 * esiste davvero.
 */

export interface ModelloAI {
  id: string;
  provider: string;
  nome: string;
  descrizione: string;
  adeguatezzaDocumentale: 'alta' | 'media' | 'bassa';
  notaCosti?: string;
  disponibile: boolean;
}

/**
 * Chi serve davvero il modello: Anthropic diretta; HostYourAI e AKI.IO
 * (API già Anthropic-compatibili, datacenter UE); Mistral, che parla un
 * altro formato e passa dall'adattatore in-process del worker.
 */
export type Fornitore = 'anthropic' | 'hostyourai' | 'aki' | 'mistral' | 'gemini';

/**
 * Il listino di un fornitore terzo, in € (≈ $) per milione di token. Letti e
 * scritti hanno prezzi diversi e distanti — su Mistral Medium 3.5 l'output
 * costa cinque volte l'input, su Kimi K3 cinque volte — quindi una tariffa
 * sola direbbe il falso proprio dove serve la verità: il confronto dei costi.
 */
export interface Tariffa {
  /** Token letti dal modello: prompt, cache compresa (questi gateway non la fanno pagare a parte). */
  input: number;
  /** Token scritti dal modello. */
  output: number;
  /**
   * Input che il fornitore serve dalla sua cache, quando ce l'ha: Mistral lo
   * fa pagare un decimo. Senza, l'input in cache vale come quello nuovo.
   */
  cache?: number;
}

/** La voce di catalogo con l'id del modello per l'SDK (non esce dall'API). */
export interface VoceCatalogo extends ModelloAI {
  /** Assente per i provider non ancora integrati. */
  sdk?: string;
  fornitore?: Fornitore;
  /**
   * Per i fornitori terzi l'SDK non sa il prezzo: il costo si calcola dai
   * token con il listino del fornitore (HostYourAI lo espone su
   * `/v1/models`, in euro ≈ dollari).
   */
  tariffa?: Tariffa;
}

export const CATALOGO_MODELLI: VoceCatalogo[] = [
  {
    id: 'mod-claude-opus-5',
    provider: 'Anthropic',
    nome: 'Claude Opus 5',
    sdk: 'claude-opus-5',
    fornitore: 'anthropic',
    descrizione:
      'Il modello di riferimento della piattaforma: lettura accurata dei set informativi lunghi e citazioni affidabili. È il modello con cui chat e tabelle di analisi sono state collaudate, fonte per fonte.',
    adeguatezzaDocumentale: 'alta',
    notaCosti: 'Incluso nel canone del piano Agenzia.',
    disponibile: true,
  },
  {
    id: 'mod-claude-sonnet-5',
    provider: 'Anthropic',
    nome: 'Claude Sonnet 5',
    sdk: 'claude-sonnet-5',
    fornitore: 'anthropic',
    descrizione:
      'Circa metà dei tempi e dei costi di Claude Opus 5, con qualità leggermente inferiore sulle analisi lunghe. Buon equilibrio fra qualità e tempi di risposta.',
    adeguatezzaDocumentale: 'alta',
    notaCosti: 'Riduce il consumo del piano di circa la metà.',
    disponibile: true,
  },
  {
    id: 'mod-claude-haiku-4-5',
    provider: 'Anthropic',
    nome: 'Claude Haiku 4.5',
    sdk: 'claude-haiku-4-5-20251001',
    fornitore: 'anthropic',
    descrizione:
      'Rapido ed economico, adatto a domande puntuali e automazioni ad alta frequenza. Sui set informativi molto lunghi perde precisione nelle citazioni.',
    adeguatezzaDocumentale: 'media',
    notaCosti: 'Riduce il consumo del piano di circa due terzi.',
    disponibile: true,
  },
  {
    id: 'mod-glm-5-2',
    provider: 'HostYourAI (UE)',
    nome: 'GLM 5.2',
    sdk: 'zai-org/GLM-5.2',
    fornitore: 'hostyourai',
    tariffa: { input: 1.73, output: 5.18 },
    descrizione:
      'Modello open di Zhipu, servito da HostYourAI in datacenter europei: prompt e risposte non lasciano l’UE. Contesto da 1M di token; da validare fonte per fonte sui set informativi italiani.',
    adeguatezzaDocumentale: 'media',
    notaCosti: 'Tariffa HostYourAI: circa 1,7 € per milione di token letti e 5,2 € per milione scritti.',
    disponibile: true,
  },
  {
    id: 'mod-kimi-k3',
    provider: 'HostYourAI (UE)',
    nome: 'Kimi K3',
    sdk: 'moonshotai/Kimi-K3',
    fornitore: 'hostyourai',
    tariffa: { input: 3.45, output: 17.25 },
    descrizione:
      'Modello open di Moonshot, servito da HostYourAI in datacenter europei: prompt e risposte non lasciano l’UE. Contesto da 1M di token; da validare fonte per fonte sui set informativi italiani.',
    adeguatezzaDocumentale: 'media',
    notaCosti: 'Tariffa HostYourAI: circa 3,5 € per milione di token letti e 17,3 € per milione scritti.',
    disponibile: true,
  },
  {
    id: 'mod-mistral-medium-3-5',
    provider: 'HostYourAI (UE)',
    nome: 'Mistral Medium 3.5',
    sdk: 'mistral-medium-3.5-128b',
    fornitore: 'hostyourai',
    tariffa: { input: 1.73, output: 8.63 },
    descrizione:
      'Il modello del francese Mistral, servito da HostYourAI in datacenter europei: prompt e risposte non lasciano l’UE. Contesto da 128k token, il più corto del catalogo. Nel confronto sull’Archivio Pubblico risponde nel merito e cita fonti vere, ma apre meno documenti e porta un terzo delle citazioni di Claude Opus 5.',
    adeguatezzaDocumentale: 'media',
    notaCosti:
      'Tariffa HostYourAI: circa 1,7 € per milione di token letti e 8,6 € per milione scritti. Il gateway non riusa il contesto fra un passo e l’altro: sulle analisi lunghe la spesa arriva vicina a quella di Claude Opus 5.',
    disponibile: true,
  },
  {
    id: 'mod-glm-5-3',
    provider: 'AKI.IO (DE)',
    nome: 'GLM 5.3',
    sdk: 'glm5.3-754b',
    fornitore: 'aki',
    tariffa: { input: 1.0, output: 3.5, cache: 0.25 },
    descrizione:
      'Il modello open di Z.ai servito da AKI.IO su GPU in datacenter tedeschi certificati, senza hyperscaler: prompt e risposte stanno in memoria volatile, non vengono registrati né usati per addestrare. Contesto da 512k token, e a differenza degli altri gateway UE riusa il contesto fra un passo e l’altro - che su questo motore è la voce che decide il conto.',
    adeguatezzaDocumentale: 'media',
    notaCosti: 'Tariffa AKI.IO: 1,00 € per milione di token letti (0,25 € se già in cache) e 3,50 € per milione scritti.',
    disponibile: true,
  },
  {
    id: 'mod-deepseek-v4-flash',
    provider: 'AKI.IO (DE)',
    nome: 'Deepseek V4 Flash',
    sdk: 'deepseek-v4-flash-0731-284b',
    fornitore: 'aki',
    tariffa: { input: 0.2, output: 0.5, cache: 0.1 },
    descrizione:
      'Servito da AKI.IO sulle stesse GPU tedesche di GLM 5.3, con lo stesso riuso del contesto fra un passo e l’altro: prompt e risposte stanno in memoria volatile, non vengono registrati né usati per addestrare. Contesto da 1M di token, il più ampio del catalogo, e listino un quinto in lettura e un settimo in scrittura rispetto a GLM 5.3; da validare fonte per fonte sui set informativi italiani.',
    adeguatezzaDocumentale: 'media',
    notaCosti: 'Tariffa AKI.IO: 0,20 € per milione di token letti (0,10 € se già in cache) e 0,50 € per milione scritti.',
    disponibile: true,
  },
  {
    id: 'mod-gemini-3-5-flash',
    provider: 'Google',
    nome: 'Gemini 3.5 Flash',
    sdk: 'gemini-3.5-flash',
    fornitore: 'gemini',
    tariffa: { input: 1.5, output: 9.0, cache: 0.15 },
    descrizione:
      'Il modello di Google della fascia rapida. È il più recente dei Gemini per cui esiste la residenza dei dati in Europa - ma solo passando da Vertex in una region europea, che oggi non è collegata: questo collegamento usa l’endpoint globale, quindi i documenti escono dall’UE. Le versioni più nuove (3.6, 3.7, 3.8) sono più economiche ma esistono solo in globale.',
    adeguatezzaDocumentale: 'media',
    notaCosti: 'Tariffa Google: 1,50 $ per milione di token letti (0,15 $ se già in cache) e 9,00 $ per milione scritti, ragionamento compreso.',
    disponibile: true,
  },
  {
    id: 'mod-gpt-5-2',
    provider: 'OpenAI',
    nome: 'GPT-5.2',
    descrizione:
      'Alternativa di pari livello per l’analisi documentale, con uno stile di risposta più sintetico. In valutazione per l’integrazione multi-provider.',
    adeguatezzaDocumentale: 'alta',
    notaCosti: 'In valutazione, condizioni da definire.',
    disponibile: false,
  },
  {
    id: 'mod-mistral-large-3',
    provider: 'Mistral (UE)',
    nome: 'Mistral Large 3',
    sdk: 'mistral-large-2512',
    fornitore: 'mistral',
    tariffa: { input: 0.5, output: 1.5, cache: 0.05 },
    descrizione:
      'Il modello di punta di Mistral, chiamato direttamente sull’API francese: dati trattati nell’UE, contesto da 262k token e listino una frazione degli altri. Nel confronto sull’Archivio Pubblico è il più veloce e il più economico di molto, ma apre pochi documenti e su due domande su sei si è fermato a chiedere invece di rispondere: va scelto da chi mette costo e residenza davanti alla completezza.',
    adeguatezzaDocumentale: 'bassa',
    notaCosti: 'Tariffa Mistral: 0,50 $ per milione di token letti (0,05 $ se già in cache) e 1,50 $ per milione scritti.',
    disponibile: true,
  },
];

/**
 * Il catalogo come sta davvero: una voce HostYourAI è selezionabile solo se
 * la chiave è configurata — il catalogo dice la verità (Fase 6).
 */
export function catalogoModelli(chiaviPresenti: { hostyourai: boolean; aki: boolean; mistral: boolean; gemini: boolean }): VoceCatalogo[] {
  return CATALOGO_MODELLI.map((m) =>
    m.fornitore && m.fornitore !== 'anthropic' && !chiaviPresenti[m.fornitore] ? { ...m, disponibile: false } : m,
  );
}

/** La voce di catalogo per un id SDK (anche fuori catalogo: allora undefined). */
export function vocePerSdk(sdk: string): VoceCatalogo | undefined {
  return CATALOGO_MODELLI.find((m) => m.sdk === sdk);
}

/** La forma pubblica: l'id SDK, il fornitore e la tariffa restano dettagli del backend. */
export function versoModello(voce: VoceCatalogo): ModelloAI {
  const pubblico: VoceCatalogo = { ...voce };
  delete pubblico.sdk;
  delete pubblico.fornitore;
  delete pubblico.tariffa;
  return pubblico;
}

/**
 * Il modello attivo È quello che il motore usa (`MODELLO_MOTORE`): la
 * scheda non può mentire. Un id fuori catalogo (esperimenti via .env) si
 * presenta comunque con la voce più vicina disponibile.
 */
export function modelloAttivo(sdkConfigurato: string): VoceCatalogo {
  return (
    CATALOGO_MODELLI.find((m) => m.sdk === sdkConfigurato) ??
    CATALOGO_MODELLI.find((m) => m.disponibile) ??
    CATALOGO_MODELLI[0]!
  );
}

/** Corpo di `PUT /api/modelli/attivo` (RF-D-02). */
export const schemaSceltaModello = z.object({ modelloId: z.string().min(1) });
