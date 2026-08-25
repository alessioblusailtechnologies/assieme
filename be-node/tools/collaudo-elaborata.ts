/**
 * Collaudo dell'Esportazione elaborata col motore VERO e la sandbox vera
 * (Docker in locale o Fly, secondo `SANDBOX_AVVIATORE` in .env): la
 * workspace del tenant demo, il template scelto (o il layout), una richiesta,
 * e si guarda cosa consegna. Senza API né coda.
 *
 *   npx tsx tools/collaudo-elaborata.ts pdf "Prepara una proposta di rinnovo RC Auto per il cliente Rossi …" [nome-template]
 *
 * Costa: una sessione documentale (da mezzo dollaro a un paio). I file
 * consegnati si salvano in local-ingestion/lavorazione e si tolgono dallo
 * Storage alla fine.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { configurazione } from '../src/config.js';
import type { FormatoGenerazione } from '../src/contratto/template.js';
import { chiudiPool, poolDb } from '../src/db/pool.js';
import { templateDelTenant } from '../src/generazione/catalogo.js';
import { ArchivioStorage } from '../src/worker/ingestion/archivio-file.js';
import { scegliTemplate } from '../src/worker/motore/strumenti.js';
import { materializzaWorkspace } from '../src/worker/motore/workspace.js';
import { eseguiEsportazioneElaborata } from '../src/worker/sandbox/esportazione.js';
import { AvviatoreDocker, AvviatoreFly } from '../src/worker/sandbox/sandbox.js';

const TENANT_DEMO = '11111111-1111-4111-8111-111111111111';
const formato = process.argv[2] as FormatoGenerazione | undefined;
const istruzioni = process.argv[3];
const nomeTemplate = process.argv[4];
if (!formato || !['pdf', 'docx', 'xlsx'].includes(formato) || !istruzioni) {
  console.error('Uso: npx tsx tools/collaudo-elaborata.ts <pdf|docx|xlsx> "<istruzioni>" [nome-template]');
  process.exit(1);
}
const c = configurazione();
const chiaveApi = c.ANTHROPIC_API_KEY_SANDBOX ?? c.ANTHROPIC_API_KEY ?? '';
const avviatore =
  c.SANDBOX_AVVIATORE === 'fly' && c.FLY_API_TOKEN
    ? new AvviatoreFly({ token: c.FLY_API_TOKEN, app: c.FLY_APP_SANDBOX, immagine: c.SANDBOX_IMMAGINE, regione: c.FLY_REGIONE, chiaveApi })
    : new AvviatoreDocker(c.SANDBOX_IMMAGINE, chiaveApi);
console.log(`Sandbox: ${avviatore.nome} (${c.SANDBOX_IMMAGINE})`);

const radice = await mkdtemp(join(tmpdir(), 'velia-collaudo-elab-'));
const db = poolDb();
const archivio = new ArchivioStorage();
let percorsi: string[] = [];
try {
  const ws = await materializzaWorkspace({ db, archivio, tenantId: TENANT_DEMO, radice, jobId: 'collaudo-elab', contestoIds: [] });
  console.log(`Workspace: ${ws.perPath.size} documenti`);

  let templateId: string | undefined;
  if (nomeTemplate) {
    const scelta = scegliTemplate(await templateDelTenant(db as never, TENANT_DEMO), { template: nomeTemplate });
    if (scelta.esito !== 'ok' || !scelta.template.id) throw new Error(`template «${nomeTemplate}» non trovato`);
    templateId = scelta.template.id;
    console.log(`Template: ${scelta.template.nome} (${scelta.template.formato})`);
  }

  const inizio = Date.now();
  const e = await eseguiEsportazioneElaborata(
    {
      db,
      archivio,
      avviatore,
      sessione: {
        modello: c.MODELLO_MOTORE,
        maxTurni: c.SANDBOX_MAX_TURNI,
        budgetUsd: c.SANDBOX_BUDGET_USD,
        ...(c.MOTORE_EFFORT && { effort: c.MOTORE_EFFORT }),
      },
      workspace: ws,
      emetti: (evento) => {
        if (evento.tipo === 'attivita') console.log(`  · ${evento.etichetta}`);
        else if (evento.tipo === 'documento') console.log(`  ▣ documento: ${JSON.stringify(evento.documento)}`);
        return Promise.resolve(0);
      },
      annullato: () => Promise.resolve(false),
    },
    { tenantId: TENANT_DEMO, conversazioneId: '00000000-0000-4000-8000-00000000c021', jobId: 'collaudo-elab', formato, templateId, istruzioni },
  );
  percorsi = e.percorsi;
  const durata = (Date.now() - inizio) / 1000;

  console.log('\n=== MESSAGGIO FINALE ===');
  console.log(e.esito.testo);
  console.log('\n=== CONSEGNATI ===');
  for (const [i, d] of e.generati.entries()) {
    const byte = await archivio.scarica(e.percorsi[i]!);
    const uscita = resolve('..', 'local-ingestion', 'lavorazione', `collaudo-elaborata-${Date.now()}-${i}.${d.formato}`);
    await writeFile(uscita, byte);
    console.log(`  ${d.nome} (${d.formato}) — ${Math.round(byte.length / 1024)} KB → ${uscita}`);
  }
  if (!e.generati.length) console.log('  nessuno');
  console.log('\n=== MISURE ===');
  console.log(`modello ${e.esito.modello} · esito ${e.esito.terminato}${e.esito.errore ? ` (${e.esito.errore})` : ''} · turni ${e.esito.turni} · ${durata.toFixed(1)} s · ${e.esito.costoUsd.toFixed(4)} USD`);
  await ws.rimuovi();
} finally {
  if (percorsi.length) await archivio.elimina(percorsi).catch(() => undefined);
  await chiudiPool();
  await rm(radice, { recursive: true, force: true });
}
