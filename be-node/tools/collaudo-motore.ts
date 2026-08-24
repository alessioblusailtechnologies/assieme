/**
 * Collaudo del motore agentico VERO (Agent SDK) su una workspace
 * materializzata dal progetto online, senza passare da API e coda: si
 * misura una domanda e si giudicano risposta, citazioni validate, turni,
 * secondi e dollari — i numeri delle decisioni aperte 1 e 4 del doc motore.
 *
 *   npx tsx tools/collaudo-motore.ts "Che franchigie prevede la garanzia furto?" [modello]
 *
 * Costa: una sessione agentica (da decine di centesimi a qualche dollaro).
 * Usa la workspace del tenant demo, tutto l'Archivio Pubblico, nessun DNA.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { configurazione } from '../src/config.js';
import { chiudiPool, poolDb } from '../src/db/pool.js';
import { ArchivioStorage } from '../src/worker/ingestion/archivio-file.js';
import { caricaDna, promptSistema, promptUtente } from '../src/worker/motore/regole.js';
import { MotoreAgentSdk } from '../src/worker/motore/sessione.js';
import { separaBlocco, validaBlocco } from '../src/worker/motore/validazione.js';
import { materializzaWorkspace } from '../src/worker/motore/workspace.js';

const TENANT_DEMO = '11111111-1111-4111-8111-111111111111';
const domanda = process.argv[2];
if (!domanda) {
  console.error('Uso: npx tsx tools/collaudo-motore.ts "<domanda>" [modello]');
  process.exit(1);
}
const c = configurazione();
const modello = process.argv[3] ?? c.MODELLO_MOTORE;

const radice = await mkdtemp(join(tmpdir(), 'velia-collaudo-'));
const db = poolDb();
try {
  const utente = await db.query<{ id: string }>(`select id from velia.utenti where tenant_id = $1 order by email limit 1`, [TENANT_DEMO]);
  const ws = await materializzaWorkspace({
    db,
    archivio: new ArchivioStorage(),
    tenantId: TENANT_DEMO,
    radice,
    jobId: 'collaudo',
    contestoIds: [],
  });
  console.log(`Workspace: ${ws.directory} — ${ws.perPath.size} documenti`);
  const dna = await caricaDna(db, TENANT_DEMO, utente.rows[0]?.id ?? '', { ramiIds: [], compagnieIds: [] }, ws.perPath);

  const motore = new MotoreAgentSdk({
    modello,
    maxTurni: c.MOTORE_MAX_TURNI,
    budgetUsd: c.MOTORE_BUDGET_USD,
    ...(c.MOTORE_EFFORT && { effort: c.MOTORE_EFFORT }),
    /* RF-D-03: un modello HostYourAI (es. zai-org/GLM-5.2) passa dallo stesso motore con endpoint e chiave del fornitore. */
    fornitori: {
      hostyourai: { ...(c.HOSTYOURAI_API_KEY && { chiave: c.HOSTYOURAI_API_KEY }), baseUrl: c.HOSTYOURAI_BASE_URL },
    },
  });

  let testoStream = '';
  const inizio = Date.now();
  const esito = await motore.interroga(
    {
      directory: ws.directory,
      titoloPer: (path) => ws.perPath.get(path)?.titolo,
      promptSistema: promptSistema(dna),
      promptUtente: promptUtente({ documenti: [], mancanti: [], storia: [], domanda }),
    },
    {
      passo: (p) => {
        if (p.tipo === 'attivita') console.log(`  · ${p.etichetta}`);
        else testoStream += p.delta;
        return Promise.resolve();
      },
      annullato: () => Promise.resolve(false),
    },
  );
  const durata = (Date.now() - inizio) / 1000;

  console.log('\n=== RISPOSTA (testo visibile) ===');
  const { visibile, blocco, problemi } = separaBlocco(esito.testo);
  console.log(visibile);
  console.log('\n=== VALIDAZIONE ===');
  if (!blocco) console.log('BLOCCO MANCANTE/NON VALIDO:', problemi.join('; '));
  else {
    try {
      const v = validaBlocco(blocco, ws.perPath, dna);
      for (const cit of v.citazioni) console.log(`  ✓ ${cit.documentoTitolo} — pag. ${cit.posizione.pagina}${cit.posizione.articolo ? ` (art. ${cit.posizione.articolo})` : ''}: «${cit.estratto.slice(0, 80)}»`);
      console.log(`  nonSupportato: ${v.nonSupportato}; avvisi: ${v.avvisi.join('; ') || 'nessuno'}`);
    } catch (e) {
      console.log('VALIDAZIONE FALLITA:', e instanceof Error ? e.message : e, (e as { dettagli?: string[] }).dettagli);
    }
  }
  console.log('\n=== MISURE ===');
  console.log(`modello ${esito.modello} · esito ${esito.terminato} · turni ${esito.turni} · ${durata.toFixed(1)} s · ${esito.costoUsd.toFixed(4)} USD`);
  console.log(`token: in ${esito.token.input}, out ${esito.token.output}, cache lettura ${esito.token.cacheLettura}, cache scrittura ${esito.token.cacheScrittura}`);
  console.log(`documenti letti: ${esito.documentiLetti.join(', ') || 'nessuno'}`);
  console.log(`testo in streaming: ${testoStream.length} caratteri; testo finale: ${esito.testo.length}`);

  const uscita = resolve('..', 'local-ingestion', 'lavorazione', `collaudo-motore-${Date.now()}.md`);
  await writeFile(uscita, `# ${domanda}\n\n${esito.testo}\n\n---\n${JSON.stringify({ modello, durata, esito: { ...esito, testo: undefined } }, null, 2)}\n`, 'utf8').catch(() => undefined);
  console.log(`salvato in ${uscita}`);
  await ws.rimuovi();
} finally {
  await chiudiPool();
  await rm(radice, { recursive: true, force: true });
}
