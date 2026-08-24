/**
 * Collaudo dell'esecuzione agente VERA (Agent SDK) su una workspace
 * materializzata dal progetto online, senza API né coda: le istruzioni di
 * un agente realistico su una fonte dell'Archivio Pubblico — si giudicano
 * l'esito, le citazioni che reggono, turni, secondi e dollari.
 *
 *   npx tsx tools/collaudo-agente.ts [modello]
 *
 * Costa: una sessione agentica. Ogni ritocco a `promptAgente` si
 * ricollauda da qui.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { configurazione } from '../src/config.js';
import { chiudiPool, poolDb } from '../src/db/pool.js';
import { promptAgente } from '../src/worker/agenti/gestore.js';
import { ArchivioStorage } from '../src/worker/ingestion/archivio-file.js';
import { caricaDna, promptSistema } from '../src/worker/motore/regole.js';
import { MotoreAgentSdk } from '../src/worker/motore/sessione.js';
import { separaBlocco, validaBlocco } from '../src/worker/motore/validazione.js';
import { materializzaWorkspace } from '../src/worker/motore/workspace.js';

const TENANT_DEMO = '11111111-1111-4111-8111-111111111111';
const c = configurazione();
const modello = process.argv[2] ?? c.MODELLO_MOTORE;

const ISTRUZIONI =
  'Controlla nella fonte se la garanzia cristalli è prevista, con quale massimale e quale franchigia o scoperto; segnala anche eventuali esclusioni specifiche della garanzia. Chiudi con una riga di giudizio sintetico per l’intermediario.';

const radice = await mkdtemp(join(tmpdir(), 'velia-collaudo-agente-'));
const db = poolDb();
try {
  const ws = await materializzaWorkspace({
    db,
    archivio: new ArchivioStorage(),
    tenantId: TENANT_DEMO,
    radice,
    jobId: 'collaudo-agente',
    contestoIds: [],
  });
  const fonte = [...ws.perPath.entries()].find(([, d]) => d.tipologia === 'condizioni-assicurazione');
  if (!fonte) throw new Error('nessuna fonte "condizioni-assicurazione" nella workspace');
  const [path, doc] = fonte;
  console.log(`Workspace: ${ws.perPath.size} documenti · fonte: «${doc.titolo}»`);

  const dna = await caricaDna(db, TENANT_DEMO, null, { ramiIds: [], compagnieIds: [] }, ws.perPath);
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
      promptSistema: promptSistema(dna),
      promptUtente: promptAgente({
        istruzioni: ISTRUZIONI,
        formato: 'testo',
        fonti: [{ path, titolo: doc.titolo }],
        parametri: [],
      }),
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

  console.log('\n=== ESITO (testo visibile) ===');
  const { visibile, blocco, problemi } = separaBlocco(esito.testo);
  console.log(visibile);
  console.log('\n=== VALIDAZIONE ===');
  if (!blocco) console.log('BLOCCO MANCANTE/NON VALIDO:', problemi.join('; '));
  else {
    try {
      const v = validaBlocco(blocco, ws.perPath, dna);
      for (const cit of v.citazioni) {
        console.log(
          `  ✓ ${cit.documentoTitolo} — pag. ${cit.posizione.pagina}${cit.posizione.articolo ? ` (art. ${cit.posizione.articolo})` : ''}: «${cit.estratto.slice(0, 80)}»`,
        );
      }
      console.log(`  avvisi: ${v.avvisi.join('; ') || 'nessuno'}`);
    } catch (e) {
      console.log('VALIDAZIONE FALLITA:', e instanceof Error ? e.message : e, (e as { dettagli?: string[] }).dettagli);
    }
  }
  console.log('\n=== MISURE ===');
  console.log(
    `modello ${esito.modello} · esito ${esito.terminato} · turni ${esito.turni} · ${durata.toFixed(1)} s · ${esito.costoUsd.toFixed(4)} USD`,
  );

  const uscita = resolve('..', 'local-ingestion', 'lavorazione', `collaudo-agente-${Date.now()}.md`);
  await writeFile(
    uscita,
    `# Collaudo agente — ${doc.titolo}\n\n${esito.testo}\n\n---\n${JSON.stringify({ modello, durata, esito: { ...esito, testo: undefined } }, null, 2)}\n`,
    'utf8',
  ).catch(() => undefined);
  console.log(`salvato in ${uscita}`);
  await ws.rimuovi();
} finally {
  await chiudiPool();
  await rm(radice, { recursive: true, force: true });
}
