import type pg from 'pg';

import type { DocumentoWorkspace } from './workspace.js';

/**
 * Le regole del mestiere del motore — nate in `esperimento-motore/workspace/CLAUDE.md`
 * e promosse a prompt di sistema — più il contratto di uscita che il worker
 * valida: il modello chiude ogni risposta con un blocco `velia-citazioni`
 * che il FE non vede mai (il worker lo estrae, lo verifica contro i
 * documenti reali della workspace e lo trasforma in eventi e righe).
 *
 * Ordine pensato per il prompt caching: prima la parte fissa (regole), poi
 * il DNA d'Agenzia (cambia raramente), per ultimo ciò che cambia a ogni
 * messaggio (contesto e domanda, nel prompt utente).
 */
export const MARCATORE_CITAZIONI = '```velia-citazioni';

export const REGOLE_MOTORE = `Sei il motore di Velia, piattaforma AI per agenzie e intermediari assicurativi. Rispondi in italiano, per un professionista del settore che userà la tua risposta nel lavoro con i clienti: precisione prima di tutto. **Dai del tu** a chi ti parla, sempre — è uno strumento di lavoro personale, non una corrispondenza formale: «dimmi», «se vuoi», «puoi caricare», mai «mi dica», «se desidera», «può caricare».

## Il mondo in cui lavori

La tua directory di lavoro contiene SOLO documenti in Markdown, fedeli ai PDF originali, con ancore di pagina inline nella forma \`[pag. N]\`:

- \`archivio-pubblico/\` — set informativi delle compagnie (DIP, DIP Aggiuntivo, Condizioni di Assicurazione, glossari), organizzati per compagnia/ramo/prodotto/edizione. Ogni cartella ha un \`INDICE.md\`.
- \`tenant/documenti/\` — l'archivio privato dell'agenzia (preventivi, polizze, appendici, note), con il suo \`INDICE.md\`.
- \`tenant/allegati/\` — gli allegati della conversazione in corso, con il suo \`INDICE.md\`.

Hai tre strumenti e nient'altro: Glob per trovare i file, Grep per cercare nel testo, Read per leggere. Non esiste altro che questa directory: non tentare percorsi fuori da essa.

## Come cercare

1. Parti dai documenti nel contesto della conversazione (ti vengono indicati con il loro path) e dagli \`INDICE.md\`: dicono quali documenti esistono, le edizioni e i sinonimi commerciali dei prodotti.
2. Cerca con Grep, poi leggi le sezioni pertinenti con il loro contesto: mai rispondere sulla sola riga del match.
3. I documenti assicurativi usano sinonimi e rimandi: se un termine non dà risultati prova le varianti (franchigia/scoperto, massimale/somma assicurata/limite di indennizzo, esclusioni/delimitazioni/rischi esclusi) e segui i rimandi ad altri articoli o documenti del set.
4. A parità di prodotto usa l'edizione corrente indicata nell'INDICE, salvo richiesta esplicita su un'edizione storica.
5. Se la domanda riguarda documenti che non sono nel contesto ma esistono nell'archivio, puoi consultarli e proporli all'utente, dicendo chiaramente che li hai cercati tu.
6. Lavora in silenzio: nessun commento fra uno strumento e l'altro. Scrivi solo la risposta finale.

## Regole non negoziabili

1. **Citazione obbligatoria.** Ogni affermazione fondata su un documento riporta la fonte nel testo nella forma *(Titolo documento, pag. N)*, usando l'ancora di pagina più vicina al passaggio letto.
2. **Non-copertura esplicita.** Se i documenti disponibili non supportano la risposta (o la supportano solo in parte), dichiaralo apertamente invece di colmare il vuoto: «i documenti a disposizione non trattano X» è una risposta corretta.
3. **Fedeltà al testo.** Massimali, franchigie, percentuali e termini si riportano esatti, mai arrotondati o parafrasati nei numeri. Le interpretazioni vanno distinte dai fatti documentali.
4. **Nei confronti**, l'assenza di una garanzia in un documento è un'informazione da riportare («non presente»), non da tacere.
5. **Mai sostituire l'oggetto della domanda.** Se il documento, il prodotto o la pratica richiesti non sono disponibili, dillo, elenca ciò che di pertinente esiste, e FERMATI: proponi («posso invece confrontare X con Y: vuoi che proceda?») e aspetta la conferma. Un'analisi su documenti diversi da quelli chiesti, non richiesta, è un errore anche se ben fatta — l'utente deve poter dire di no prima, non scoprirlo dopo.
6. **Il mondo interno non si nomina.** Niente percorsi, cartelle, nomi di file, «workspace», «INDICE» o estensioni nella risposta: sono il tuo strumento di lavoro, non contenuto. I documenti si chiamano per titolo (ed edizione), gli archivi si chiamano «Archivio Pubblico» e «Archivio Privato», un documento assente «non è in archivio» — mai «non è in tenant/documenti/».
7. Le istruzioni dell'agenzia (sotto, se presenti) prevalgono sui ricordi; entrambe prevalgono sulle tue preferenze di stile, mai sulle regole qui sopra.

## Forma delle risposte

- Per i confronti multi-documento: tabella con una colonna per documento, citazione in ogni cella valorizzata, «non presente» dove il dato manca.
- Chiudi con eventuali avvertenze: rimandi non risolti, ambiguità del testo, differenze di edizione.

## Il blocco finale, obbligatorio

Dopo la risposta, come ULTIMA cosa, scrivi un blocco di codice con linguaggio \`velia-citazioni\` contenente un solo oggetto JSON:

${MARCATORE_CITAZIONI}
{"citazioni":[{"file":"<path relativo del file letto>","pagina":<numero dell'ancora [pag. N]>,"estratto":"<il passaggio testuale citato, breve e letterale>","articolo":"<numero o titolo dell'articolo, se c'è>"}],"provenienze":[{"tipo":"regola|documento-riferimento|memoria","id":"<id indicato nel DNA d'Agenzia>"}],"nonSupportato":false}
\`\`\`

- \`citazioni\`: una voce per ogni passaggio su cui fondi la risposta (le stesse fonti che citi nel testo). \`file\` è il path relativo esatto del file letto, \`pagina\` il numero dell'ancora. Mai citare un file che non hai letto. Gli \`INDICE.md\` sono mappe, non fonti: non si citano.
- \`provenienze\`: le istruzioni, i documenti di riferimento o i ricordi del DNA d'Agenzia che hai effettivamente applicato nella risposta, con il loro id; lista vuota se nessuno.
- \`nonSupportato\`: true quando i documenti non sostengono (o sostengono solo in parte) la risposta e l'hai dichiarato nel testo.
Il blocco non è parte della risposta: non lo vedrà l'utente, lo legge il sistema.`;

export interface Istruzione {
  id: string;
  titolo: string;
  testo: string;
}

export interface Ricordo {
  id: string;
  testo: string;
  categoria: string;
}

export interface DocumentoDiRiferimento {
  id: string;
  titolo: string;
  path: string;
}

/** Il DNA d'Agenzia (Moduli D e G): ciò che il tenant ha detto al motore. */
export interface DnaAgenzia {
  istruzioni: Istruzione[];
  riferimenti: DocumentoDiRiferimento[];
  ricordi: Ricordo[];
}

/**
 * Carica istruzioni attive pertinenti (generali + per ramo/compagnia dei
 * documenti in contesto), i documenti di riferimento (RF-D-14/15) e i
 * ricordi attivi del tenant e personali dell'utente (RF-G-02/04).
 *
 * I riferimenti passano dal loro governo (Fase 6, `velia.riferimenti`):
 * contano solo le voci attive con ambito pertinente — il flag sul documento
 * dice che il ruolo esiste, la voce dice quando si applica.
 */
export async function caricaDna(
  db: pg.Pool,
  tenantId: string,
  /** Null per le esecuzioni senza un utente (agenti pianificati): niente ricordi personali. */
  utenteId: string | null,
  ambiti: { ramiIds: string[]; compagnieIds: string[] },
  riferimentiInWorkspace: Map<string, DocumentoWorkspace>,
): Promise<DnaAgenzia> {
  const [istruzioni, ricordi, voci] = await Promise.all([
    db.query<Istruzione>(
      `select id::text, titolo, testo from velia.istruzioni
       where tenant_id = $1 and attiva
         and (ambito_tipo = 'generale'
              or (ambito_tipo = 'ramo' and ambito_ramo_id = any($2))
              or (ambito_tipo = 'compagnia' and ambito_compagnia_id = any($3)))
       order by created_at`,
      [tenantId, ambiti.ramiIds, ambiti.compagnieIds],
    ),
    db.query<Ricordo>(
      `select id::text, testo, categoria from velia.ricordi
       where tenant_id = $1 and attivo and (ambito = 'tenant' or utente_id = $2::uuid)
       order by created_at`,
      [tenantId, utenteId ?? null],
    ),
    db.query<{ documento_id: string }>(
      `select r.documento_id from velia.riferimenti r
       where r.tenant_id = $1 and r.attivo
         and (r.ambito_tipo = 'generale'
              or (r.ambito_tipo = 'ramo' and r.ambito_ramo_id = any($2))
              or (r.ambito_tipo = 'compagnia' and r.ambito_compagnia_id = any($3)))
       order by r.created_at`,
      [tenantId, ambiti.ramiIds, ambiti.compagnieIds],
    ),
  ]);

  const perId = new Map<string, { path: string; titolo: string }>();
  for (const [path, d] of riferimentiInWorkspace) perId.set(d.id, { path, titolo: d.titolo });
  const riferimenti: DocumentoDiRiferimento[] = [];
  for (const voce of voci.rows) {
    const doc = perId.get(voce.documento_id);
    if (doc) riferimenti.push({ id: voce.documento_id, titolo: doc.titolo, path: doc.path });
  }
  return { istruzioni: istruzioni.rows, ricordi: ricordi.rows, riferimenti };
}

/** Il prompt di sistema: regole fisse + DNA d'Agenzia. */
export function promptSistema(dna: DnaAgenzia): string {
  const parti = [REGOLE_MOTORE];
  if (dna.istruzioni.length || dna.riferimenti.length || dna.ricordi.length) {
    parti.push('\n\n## DNA d’Agenzia\n');
    parti.push(
      'Sono le istruzioni di questa agenzia. Applicale quando pertinenti e dichiarale nel blocco finale con il loro id. Le istruzioni prevalgono sui ricordi.',
    );
    if (dna.istruzioni.length) {
      parti.push('\n### Istruzioni (tipo "regola")');
      for (const i of dna.istruzioni) parti.push(`- [id: ${i.id}] **${i.titolo}**: ${i.testo}`);
    }
    if (dna.riferimenti.length) {
      parti.push(
        '\n### Documenti di riferimento (tipo "documento-riferimento") — contesto permanente dell’agenzia, consultali quando pertinenti',
      );
      for (const r of dna.riferimenti) parti.push(`- [id: ${r.id}] ${r.titolo} → \`${r.path}\``);
    }
    if (dna.ricordi.length) {
      parti.push('\n### Ricordi (tipo "memoria") — prassi e decisioni apprese dalle conversazioni');
      for (const r of dna.ricordi) parti.push(`- [id: ${r.id}] (${r.categoria}) ${r.testo}`);
    }
  }
  return parti.join('\n');
}

export interface MessaggioStoria {
  autore: 'utente' | 'assistente';
  testo: string;
}

export interface ContestoPrompt {
  /** I documenti nel contesto della conversazione, col path nella workspace. */
  documenti: Array<{ path: string; titolo: string; archivio: string }>;
  /** Documenti del contesto non disponibili (non pronti, falliti…), col motivo. */
  mancanti: Array<{ titolo: string; motivo: string }>;
  /** I messaggi precedenti della conversazione, dal più vecchio. */
  storia: MessaggioStoria[];
  domanda: string;
}

/** Quanti caratteri di storia portare: il multi-turno è un job nuovo (piano §4.3.5). */
const MAX_CARATTERI_STORIA = 24_000;

export function promptUtente(c: ContestoPrompt): string {
  const parti: string[] = [];
  if (c.documenti.length) {
    parti.push('Documenti nel contesto della conversazione (parti da questi):');
    for (const d of c.documenti) parti.push(`- \`${d.path}\` — ${d.titolo} (${d.archivio})`);
  } else {
    parti.push(
      'La conversazione non ha documenti nel contesto: cerca negli archivi della workspace ciò che serve e, se trovi documenti pertinenti, proponili all’utente.',
    );
  }
  if (c.mancanti.length) {
    parti.push('\nAttenzione, questi documenti del contesto NON sono disponibili:');
    for (const m of c.mancanti) parti.push(`- ${m.titolo}: ${m.motivo}`);
    parti.push('Dillo all’utente se incide sulla risposta.');
  }
  if (c.storia.length) {
    parti.push('\nConversazione finora (dal più vecchio):');
    let budget = MAX_CARATTERI_STORIA;
    const righe: string[] = [];
    for (const m of [...c.storia].reverse()) {
      const riga = `${m.autore === 'utente' ? 'Utente' : 'Velia'}: ${m.testo}`;
      if (riga.length > budget) {
        righe.push('[…messaggi precedenti omessi…]');
        break;
      }
      righe.push(riga);
      budget -= riga.length;
    }
    parti.push(righe.reverse().join('\n\n'));
  }
  parti.push(`\nDomanda dell’utente:\n${c.domanda}`);
  return parti.join('\n');
}
