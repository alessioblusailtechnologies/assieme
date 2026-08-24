/**
 * Collaudo dell'estrazione celle VERA (Agent SDK) su una workspace
 * materializzata dal progetto online, senza API né coda: una riga (un
 * documento dell'Archivio Pubblico) e tre criteri auto — si giudicano le
 * celle valutate, le citazioni che reggono, turni, secondi e dollari.
 *
 *   npx tsx tools/collaudo-tabelle.ts [modello]
 *
 * Costa: una sessione agentica (centesimi con Sonnet, di più con Opus).
 * Ogni ritocco a PROMPT_ESTRAZIONE si ricollauda da qui.
 */
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { configurazione } from '../src/config.js';
import { chiudiPool, poolDb } from '../src/db/pool.js';
import { ArchivioStorage } from '../src/worker/ingestion/archivio-file.js';
import { MotoreAgentSdk } from '../src/worker/motore/sessione.js';
import { materializzaWorkspace } from '../src/worker/motore/workspace.js';
import {
  promptRigaEstrazione,
  PROMPT_ESTRAZIONE,
  separaBloccoCelle,
  valutaCelle,
  type ColonnaDaEstrarre,
} from '../src/worker/tabelle/estrazione.js';

const TENANT_DEMO = '11111111-1111-4111-8111-111111111111';
const c = configurazione();
const modello = process.argv[2] ?? c.MODELLO_TABELLE ?? c.MODELLO_MOTORE;

const COLONNE: ColonnaDaEstrarre[] = [
  {
    id: randomUUID(),
    intestazione: 'Massimale RC',
    origine: 'predefinita',
    criterio: null,
    descrizione: 'Massimale per sinistro della responsabilità civile, con il sottolimite per danni a cose.',
  },
  {
    id: randomUUID(),
    intestazione: 'Franchigia furto e incendio',
    origine: 'predefinita',
    criterio: null,
    descrizione: 'Franchigia o scoperto applicati alla garanzia furto e incendio.',
  },
  {
    id: randomUUID(),
    intestazione: 'Diaria da fermo tecnico',
    origine: 'personalizzata',
    criterio: 'importo giornaliero e durata massima della diaria riconosciuta durante il fermo del veicolo',
  },
];

const radice = await mkdtemp(join(tmpdir(), 'velia-collaudo-tabelle-'));
const db = poolDb();
try {
  const ws = await materializzaWorkspace({
    db,
    archivio: new ArchivioStorage(),
    tenantId: TENANT_DEMO,
    radice,
    jobId: 'collaudo-tabelle',
    contestoIds: [],
  });
  const condizioni = [...ws.perPath.entries()].find(([, d]) => d.tipologia === 'condizioni-assicurazione');
  if (!condizioni) throw new Error('nessun documento "condizioni-assicurazione" nella workspace');
  const [path, doc] = condizioni;
  console.log(`Workspace: ${ws.perPath.size} documenti · riga: «${doc.titolo}» (${path})`);

  const motore = new MotoreAgentSdk({
    modello,
    maxTurni: c.MOTORE_MAX_TURNI,
    budgetUsd: c.MOTORE_BUDGET_USD,
    ...(c.MOTORE_EFFORT && { effort: c.MOTORE_EFFORT }),
  });

  const inizio = Date.now();
  const esito = await motore.interroga(
    {
      directory: ws.directory,
      titoloPer: (p) => ws.perPath.get(p)?.titolo,
      promptSistema: PROMPT_ESTRAZIONE,
      promptUtente: promptRigaEstrazione({ path, titolo: doc.titolo, colonne: COLONNE }),
    },
    {
      passo: (p) => {
        if (p.tipo === 'attivita') console.log(`  · ${p.etichetta}`);
        return Promise.resolve();
      },
      annullato: () => Promise.resolve(false),
    },
  );
  const durata = (Date.now() - inizio) / 1000;

  console.log('\n=== CELLE VALUTATE ===');
  const { blocco, problemi } = separaBloccoCelle(esito.testo);
  if (!blocco) {
    console.log('BLOCCO MANCANTE/NON VALIDO:', problemi.join('; '));
    console.log('\n--- testo grezzo ---\n', esito.testo.slice(0, 2000));
  } else {
    const { celle, avvisi } = valutaCelle(blocco, COLONNE, ws.perPath);
    for (const colonna of COLONNE) {
      const cella = celle.get(colonna.id)!;
      console.log(`\n■ ${colonna.intestazione}`);
      if (cella.stato !== 'pronta') continue;
      if (cella.esito === 'presente') {
        console.log(`  = ${cella.valore}`);
        for (const cit of cella.citazioni) {
          console.log(
            `  ✓ ${cit.documentoTitolo} — pag. ${cit.posizione.pagina}${cit.posizione.articolo ? ` (art. ${cit.posizione.articolo})` : ''}: «${cit.estratto.slice(0, 90)}»`,
          );
        }
      } else if (cella.esito === 'non-presente') {
        console.log(`  non presente${cella.nota ? ` — ${cella.nota}` : ''}`);
      } else {
        console.log(`  non determinabile — ${cella.motivo}`);
      }
    }
    console.log(`\navvisi: ${avvisi.join('; ') || 'nessuno'}`);
  }

  console.log('\n=== MISURE ===');
  console.log(`modello ${esito.modello} · esito ${esito.terminato} · turni ${esito.turni} · ${durata.toFixed(1)} s · ${esito.costoUsd.toFixed(4)} USD`);
  console.log(`token: in ${esito.token.input}, out ${esito.token.output}, cache lettura ${esito.token.cacheLettura}, cache scrittura ${esito.token.cacheScrittura}`);
  console.log(`documenti letti: ${esito.documentiLetti.join(', ') || 'nessuno'}`);

  const uscita = resolve('..', 'local-ingestion', 'lavorazione', `collaudo-tabelle-${Date.now()}.md`);
  await writeFile(
    uscita,
    `# Collaudo estrazione celle — ${doc.titolo}\n\n${esito.testo}\n\n---\n${JSON.stringify({ modello, durata, esito: { ...esito, testo: undefined } }, null, 2)}\n`,
    'utf8',
  ).catch(() => undefined);
  console.log(`salvato in ${uscita}`);
  await ws.rimuovi();
} finally {
  await chiudiPool();
  await rm(radice, { recursive: true, force: true });
}
