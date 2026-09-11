import { z } from 'zod';

/**
 * Modello e provider (RF-D-02/03). Dal 10/09/2026 il tenant non sceglie un
 * modello ma un **livello** (Medio, Avanzato, Boost): che modello ci sia
 * dietro lo decide la piattaforma, e il suo nome non esce dall'API. La
 * scelta vale per tutto il tenant (`velia.tenant.modello_motore`, che
 * conserva l'id SDK del livello; null = default di piattaforma, oggi Boost)
 * e viaggia fino al job: chat e tabelle la leggono a ogni sessione. In chat
 * si può passare a un altro livello per un messaggio (`livello` del
 * messaggio), senza toccare quella del tenant.
 */

/** La scheda pubblica di un livello. */
export interface ModelloAI {
  id: string;
  nome: string;
  descrizione: string;
  adeguatezzaDocumentale: 'alta' | 'media' | 'bassa';
  notaCosti?: string;
  disponibile: boolean;
}

/**
 * Chi serve davvero il modello: Anthropic diretta; HostYourAI e AKI.IO
 * (API già Anthropic-compatibili, datacenter UE) e DeepSeek diretta (API
 * Anthropic-compatibile, server in Cina); Mistral e Gemini, che parlano un
 * altro formato e passano dall'adattatore in-process del worker.
 */
export type Fornitore = 'anthropic' | 'hostyourai' | 'aki' | 'deepseek' | 'mistral' | 'gemini';

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

/** Un modello di un fornitore terzo che il motore sa servire. */
export interface ModelloServito {
  sdk: string;
  /** Il nome vero, per i messaggi d'errore e i collaudi: al tenant non arriva. */
  nome: string;
  fornitore: Exclude<Fornitore, 'anthropic'>;
  /**
   * L'SDK non sa il prezzo dei fornitori terzi: il costo si calcola dai
   * token con il loro listino (HostYourAI e AKI lo espongono su
   * `/v1/models`, in euro ≈ dollari).
   */
  tariffa: Tariffa;
}

/**
 * Il banco dei fornitori terzi: dove si chiama ciascun modello e a che
 * prezzo. Il tenant ne vede solo quelli che stanno dietro a un livello; gli
 * altri restano per i collaudi (`tools/collaudo-ab.ts`) e gli esperimenti
 * via .env, ed è da qui che si misura il candidato per un livello nuovo. Un
 * id che non sta qui (tutti i Claude) si serve da Anthropic.
 *
 * Le misure sulle sei domande dell'Archivio Pubblico stanno nei messaggi
 * dei commit che hanno portato ciascuna voce.
 */
export const MODELLI_SERVITI: ModelloServito[] = [
  /* HostYourAI non riusa il contesto fra un passo e l'altro: un modello da
     1,7 €/M finisce a costare quanto Claude Opus 5 sulle analisi lunghe. */
  { sdk: 'zai-org/GLM-5.2', nome: 'GLM 5.2', fornitore: 'hostyourai', tariffa: { input: 1.73, output: 5.18 } },
  { sdk: 'moonshotai/Kimi-K3', nome: 'Kimi K3', fornitore: 'hostyourai', tariffa: { input: 3.45, output: 17.25 } },
  {
    sdk: 'mistral-medium-3.5-128b',
    nome: 'Mistral Medium 3.5',
    fornitore: 'hostyourai',
    tariffa: { input: 1.73, output: 8.63 },
  },
  /* AKI.IO: GPU in datacenter tedeschi, e la cache c'è. */
  { sdk: 'glm5.3-754b', nome: 'GLM 5.3', fornitore: 'aki', tariffa: { input: 1.0, output: 3.5, cache: 0.25 } },
  {
    sdk: 'deepseek-v4-flash-0731-284b',
    nome: 'Deepseek V4 Flash',
    fornitore: 'aki',
    tariffa: { input: 0.2, output: 0.5, cache: 0.1 },
  },
  /* DeepSeek diretta (11/09/2026), finché AKI.IO non approva l'account: la
     cache c'è ed è automatica, ma i server sono in Cina, quindi i documenti
     escono dall'UE. `deepseek-flash` è il Flash corrente (V4.1). Listino
     della fascia di punta, che sono le mattine italiane dei giorni feriali:
     fuori punta costa la metà. */
  { sdk: 'deepseek-flash', nome: 'Deepseek V4.1 Flash', fornitore: 'deepseek', tariffa: { input: 0.3, output: 1.2, cache: 0.006 } },
  /* Endpoint globale: i documenti escono dall'UE. */
  { sdk: 'gemini-3.5-flash', nome: 'Gemini 3.5 Flash', fornitore: 'gemini', tariffa: { input: 1.5, output: 9.0, cache: 0.15 } },
  { sdk: 'mistral-large-2512', nome: 'Mistral Large 3', fornitore: 'mistral', tariffa: { input: 0.5, output: 1.5, cache: 0.05 } },
];

/** Il livello come lo conosce il backend: la scheda più il modello che la serve (non esce dall'API). */
export interface Livello extends ModelloAI {
  sdk: string;
}

/**
 * I livelli nell'ordine dei loro nomi, che è quello in cui li mostrano la
 * pagina e il composer: Boost resta in fondo, ed è il più potente.
 */
export const LIVELLI: Livello[] = [
  {
    id: 'livello-medio',
    nome: 'Medio',
    sdk: 'claude-sonnet-5',
    descrizione:
      'Circa metà dei tempi e dei costi di Boost, con qualità leggermente inferiore sulle analisi lunghe. Buon equilibrio fra qualità e tempi di risposta.',
    adeguatezzaDocumentale: 'alta',
    disponibile: true,
  },
  {
    id: 'livello-avanzato',
    nome: 'Avanzato',
    /* Da DeepSeek diretta finché AKI.IO non approva l'account; poi si torna
       a `deepseek-v4-flash-0731-284b`, che resta nel banco. */
    sdk: 'deepseek-flash',
    descrizione:
      'Circa un decimo dei costi di Boost, con risposte più sintetiche e meno citazioni. Adatto alle domande puntuali, meno alle analisi lunghe.',
    adeguatezzaDocumentale: 'media',
    disponibile: true,
  },
  {
    id: 'livello-boost',
    nome: 'Boost',
    sdk: 'claude-opus-5',
    descrizione:
      'La qualità più alta: letture più accurate sui documenti lunghi e citazioni più complete. Il riferimento per analisi e confronti fra più documenti.',
    adeguatezzaDocumentale: 'alta',
    disponibile: true,
  },
];

/** Il fornitore di un modello: quello del banco, o Anthropic. */
function fornitoreDi(sdk: string): Fornitore {
  return vocePerSdk(sdk)?.fornitore ?? 'anthropic';
}

/**
 * I livelli come stanno davvero: uno servito da un fornitore terzo è
 * selezionabile solo se la sua chiave è configurata. Il catalogo dice la
 * verità (Fase 6).
 */
export function catalogoLivelli(chiaviPresenti: Record<Exclude<Fornitore, 'anthropic'>, boolean>): Livello[] {
  return LIVELLI.map((l) => {
    const fornitore = fornitoreDi(l.sdk);
    return fornitore !== 'anthropic' && !chiaviPresenti[fornitore] ? { ...l, disponibile: false } : l;
  });
}

/** La voce del banco per un id SDK (undefined per i Claude e per gli esperimenti fuori banco). */
export function vocePerSdk(sdk: string): ModelloServito | undefined {
  return MODELLI_SERVITI.find((m) => m.sdk === sdk);
}

/**
 * La forma pubblica, campo per campo: l'id SDK resta un dettaglio del
 * backend, e un campo aggiunto domani al livello non esce da solo.
 */
export function versoPubblico(l: Livello): ModelloAI {
  return {
    id: l.id,
    nome: l.nome,
    descrizione: l.descrizione,
    adeguatezzaDocumentale: l.adeguatezzaDocumentale,
    ...(l.notaCosti !== undefined && { notaCosti: l.notaCosti }),
    disponibile: l.disponibile,
  };
}

/**
 * Il livello attivo È quello che il motore usa: la scheda non può mentire.
 * Un id che nessun livello serve (esperimenti via .env) si presenta col
 * livello più potente disponibile, che è quello di riferimento.
 */
export function livelloAttivo(sdkConfigurato: string, catalogo: Livello[] = LIVELLI): Livello {
  return (
    catalogo.find((l) => l.sdk === sdkConfigurato) ?? catalogo.findLast((l) => l.disponibile) ?? catalogo.at(-1)!
  );
}

/**
 * Il modello scelto dal tenant, se c'è ancora un livello che lo serve;
 * altrimenti undefined, e vale il default di piattaforma. Una scelta rimasta
 * su un modello tolto dal catalogo (quando sono nati i livelli, il 10/09/2026,
 * se ne sono andati sette) non deve continuare a girare in silenzio mentre la
 * scheda mostra un altro livello.
 */
export function modelloDelTenant(scelta: string | null | undefined): string | undefined {
  return scelta && LIVELLI.some((l) => l.sdk === scelta) ? scelta : undefined;
}

/** Il modello dietro un livello scelto in chat per un messaggio; undefined se il livello non c'è. */
export function modelloDelLivello(livelloId: string | undefined): string | undefined {
  return livelloId ? LIVELLI.find((l) => l.id === livelloId)?.sdk : undefined;
}

/**
 * Vero per i modelli che si chiamano da Anthropic. La sandbox documentale
 * gira con la sola chiave Anthropic, dietro al suo proxy: un modello di un
 * fornitore terzo lì dentro non parte.
 */
export function servitoDaAnthropic(sdk: string): boolean {
  return fornitoreDi(sdk) === 'anthropic';
}

/** Corpo di `PUT /api/modelli/attivo` (RF-D-02). */
export const schemaSceltaModello = z.object({ modelloId: z.string().min(1) });
