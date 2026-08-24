import { z } from 'zod';

/**
 * Modello e provider (RF-D-02/03) — il primo pezzo della Fase 6: il
 * catalogo dice la verità sul motore. Oggi chat e tabelle girano su Claude
 * Opus 5 (`MODELLO_MOTORE`, collaudato con citazioni verificate): è l'unico
 * selezionabile. Gli altri sono in catalogo come schede informative
 * (RF-D-03) ma non disponibili: la scelta per agenzia — con l'astrazione
 * del provider e il modello portato dentro al job — arriva col
 * completamento della fase, e a quel punto si alza `disponibile`.
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

/** La voce di catalogo con l'id del modello per l'SDK (non esce dall'API). */
export interface VoceCatalogo extends ModelloAI {
  /** Assente per i provider non ancora integrati. */
  sdk?: string;
}

export const CATALOGO_MODELLI: VoceCatalogo[] = [
  {
    id: 'mod-claude-opus-5',
    provider: 'Anthropic',
    nome: 'Claude Opus 5',
    sdk: 'claude-opus-5',
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
    descrizione:
      'Circa metà dei tempi e dei costi di Claude Opus 5, con qualità leggermente inferiore sulle analisi lunghe. La scelta per agenzia si abilita col completamento delle Impostazioni.',
    adeguatezzaDocumentale: 'alta',
    notaCosti: 'Ridurrebbe il consumo del piano di circa la metà.',
    disponibile: false,
  },
  {
    id: 'mod-claude-haiku-4-5',
    provider: 'Anthropic',
    nome: 'Claude Haiku 4.5',
    sdk: 'claude-haiku-4-5-20251001',
    descrizione:
      'Rapido ed economico, adatto a domande puntuali e automazioni ad alta frequenza. Sui set informativi molto lunghi perde precisione nelle citazioni.',
    adeguatezzaDocumentale: 'media',
    notaCosti: 'Ridurrebbe il consumo del piano di circa due terzi.',
    disponibile: false,
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

/** La forma pubblica: l'id SDK resta un dettaglio del backend. */
export function versoModello(voce: VoceCatalogo): ModelloAI {
  const pubblico = { ...voce };
  delete pubblico.sdk;
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
