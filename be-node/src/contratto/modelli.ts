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
  /** Il peso di una risposta in crediti (pricing); assente per i modelli non integrati. */
  creditiPerRisposta?: number;
}

/** Chi serve davvero il modello: Anthropic diretta, o HostYourAI (API Anthropic-compatibili, datacenter UE). */
export type Fornitore = 'anthropic' | 'hostyourai';

/** La voce di catalogo con l'id del modello per l'SDK (non esce dall'API). */
export interface VoceCatalogo extends ModelloAI {
  /** Assente per i provider non ancora integrati. */
  sdk?: string;
  fornitore?: Fornitore;
  /**
   * Per i fornitori terzi l'SDK non sa il prezzo: il costo in  si
   * calcola dai token con questa tariffa (per milione, input e output
   * insieme, come la espone il listino HostYourAI, in euro ≈ dollari).
   */
  tariffaUsdPerMilione?: number;
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
    tariffaUsdPerMilione: 1.73,
    descrizione:
      'Modello open di Zhipu, servito da HostYourAI in datacenter europei: prompt e risposte non lasciano l’UE. Contesto da 1M di token; da validare fonte per fonte sui set informativi italiani.',
    adeguatezzaDocumentale: 'media',
    notaCosti: 'Tariffa HostYourAI: circa 1,7 € per milione di token.',
    disponibile: true,
  },
  {
    id: 'mod-kimi-k3',
    provider: 'HostYourAI (UE)',
    nome: 'Kimi K3',
    sdk: 'moonshotai/Kimi-K3',
    fornitore: 'hostyourai',
    tariffaUsdPerMilione: 3.17,
    descrizione:
      'Modello open di Moonshot, servito da HostYourAI in datacenter europei: prompt e risposte non lasciano l’UE. Contesto da 1M di token; da validare fonte per fonte sui set informativi italiani.',
    adeguatezzaDocumentale: 'media',
    notaCosti: 'Tariffa HostYourAI: circa 3,2 € per milione di token.',
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
    provider: 'Mistral',
    nome: 'Mistral Large 3',
    descrizione:
      'Opzione europea con residenza dei dati nell’UE. In corso di validazione sui documenti assicurativi italiani.',
    adeguatezzaDocumentale: 'media',
    notaCosti: 'In valutazione, condizioni da definire.',
    disponibile: false,
  },
];

/**
 * Il catalogo come sta davvero: una voce HostYourAI è selezionabile solo se
 * la chiave è configurata — il catalogo dice la verità (Fase 6).
 */
export function catalogoModelli(chiaviPresenti: { hostyourai: boolean }): VoceCatalogo[] {
  return CATALOGO_MODELLI.map((m) =>
    m.fornitore === 'hostyourai' && !chiaviPresenti.hostyourai ? { ...m, disponibile: false } : m,
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
  delete pubblico.tariffaUsdPerMilione;
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
