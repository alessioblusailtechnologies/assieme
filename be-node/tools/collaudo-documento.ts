/**
 * Collaudo del tool `genera_documento` col motore agentico VERO: una domanda
 * che chiede un file, lo strumento MCP in-process, il documento nello
 * Storage e l'evento che il FE riceverebbe. Senza API né coda.
 *
 *   npx tsx tools/collaudo-documento.ts "Riassumi le garanzie furto di Km&Servizi ed esportale in pdf" [modello]
 *
 * Costa: una sessione agentica (decine di centesimi). Usa la workspace del
 * tenant demo e i suoi template; i file generati si cancellano alla fine.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { configurazione } from '../src/config.js';
import { chiudiPool, poolDb } from '../src/db/pool.js';
import { ArchivioStorage } from '../src/worker/ingestion/archivio-file.js';
import { caricaDna, promptSistema, promptUtente, type TemplateNelPrompt } from '../src/worker/motore/regole.js';
import { MotoreAgentSdk } from '../src/worker/motore/sessione.js';
import { creaStrumentiMotore } from '../src/worker/motore/strumenti.js';
import { separaBlocco, validaBlocco } from '../src/worker/motore/validazione.js';
import { materializzaWorkspace } from '../src/worker/motore/workspace.js';

const TENANT_DEMO = '11111111-1111-4111-8111-111111111111';
const domanda = process.argv[2];
if (!domanda) {
  console.error('Uso: npx tsx tools/collaudo-documento.ts "<domanda>" [modello]');
  process.exit(1);
}
const c = configurazione();
const modello = process.argv[3] ?? c.MODELLO_MOTORE;

const radice = await mkdtemp(join(tmpdir(), 'velia-collaudo-doc-'));
const db = poolDb();
const archivio = new ArchivioStorage();
let percorsiGenerati: string[] = [];
try {
  const utente = await db.query<{ id: string }>(`select id from velia.utenti where tenant_id = $1 order by email limit 1`, [TENANT_DEMO]);
  const ws = await materializzaWorkspace({ db, archivio, tenantId: TENANT_DEMO, radice, jobId: 'collaudo-doc', contestoIds: [] });
  console.log(`Workspace: ${ws.directory} — ${ws.perPath.size} documenti`);
  const dna = await caricaDna(db, TENANT_DEMO, utente.rows[0]?.id ?? '', { ramiIds: [], compagnieIds: [] }, ws.perPath);
  const template = await db.query<TemplateNelPrompt>(
    `select nome, formato, predefinito from velia.template where tenant_id = $1 order by created_at, id`,
    [TENANT_DEMO],
  );
  console.log(`Template dell'agenzia: ${template.rows.map((t) => `${t.nome} (${t.formato})`).join(', ') || 'nessuno'}`);

  const strumenti = creaStrumentiMotore({
    db,
    archivio,
    tenantId: TENANT_DEMO,
    conversazioneId: '00000000-0000-4000-8000-00000000c011',
    messaggioId: '00000000-0000-4000-8000-00000000c012',
    suDocumento: (d) => {
      console.log(`  ▣ evento documento: ${JSON.stringify(d)}`);
      return Promise.resolve();
    },
  });
  percorsiGenerati = strumenti.percorsi;

  const motore = new MotoreAgentSdk({
    modello,
    maxTurni: c.MOTORE_MAX_TURNI,
    budgetUsd: c.MOTORE_BUDGET_USD,
    silenzioMs: c.MOTORE_SILENZIO_MS,
    ...(c.MOTORE_EFFORT && { effort: c.MOTORE_EFFORT }),
    fornitori: {
      hostyourai: { ...(c.HOSTYOURAI_API_KEY && { chiave: c.HOSTYOURAI_API_KEY }), baseUrl: c.HOSTYOURAI_BASE_URL },
    },
  });

  const inizio = Date.now();
  const esito = await motore.interroga(
    {
      directory: ws.directory,
      titoloPer: (path) => ws.perPath.get(path)?.titolo,
      promptSistema: promptSistema(dna, template.rows),
      promptUtente: promptUtente({ documenti: [], mancanti: [], storia: [], domanda }),
      strumenti: { server: strumenti.server, nomi: strumenti.nomi },
    },
    {
      passo: (p) => {
        if (p.tipo === 'attivita') console.log(`  · ${p.etichetta}${p.strumento ? ` [${p.strumento}]` : ''}`);
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
      for (const cit of v.citazioni) console.log(`  ✓ ${cit.documentoTitolo} — pag. ${cit.posizione.pagina}: «${cit.estratto.slice(0, 80)}»`);
    } catch (e) {
      console.log('VALIDAZIONE FALLITA:', e instanceof Error ? e.message : e);
    }
  }
  console.log('\n=== DOCUMENTI GENERATI ===');
  for (const d of strumenti.generati) {
    const byte = await archivio.scarica(percorsiGenerati[strumenti.generati.indexOf(d)]!);
    console.log(`  ${d.nome} (${d.formato}${d.template ? `, su «${d.template}»` : ', layout VELIA'}) — ${byte.length} byte — ${d.url}`);
    const uscita = resolve('..', 'local-ingestion', 'lavorazione', `collaudo-documento-${Date.now()}.${d.formato}`);
    await writeFile(uscita, byte).catch(() => undefined);
    console.log(`  salvato in ${uscita}`);
  }
  if (!strumenti.generati.length) console.log('  nessuno: il modello non ha usato lo strumento');
  console.log('\n=== MISURE ===');
  console.log(`modello ${esito.modello} · esito ${esito.terminato} · turni ${esito.turni} · ${durata.toFixed(1)} s · ${esito.costoUsd.toFixed(4)} USD`);
  await ws.rimuovi();
} finally {
  if (percorsiGenerati.length) await archivio.elimina(percorsiGenerati).catch(() => undefined);
  await chiudiPool();
  await rm(radice, { recursive: true, force: true });
}
