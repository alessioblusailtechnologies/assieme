/**
 * Collaudo di Claude Code completo nella chat (`MOTORE_CHAT=claude-code`,
 * 22/09/2026) su questa macchina, senza API né coda: la workspace del tenant
 * demo com'è in chat (copie, skill, modelli, carta), il prompt che dice solo
 * fatti e il contratto delle fonti, gli strumenti VELIA con `consegna`,
 * nessun tetto. Stampa i passi come li vedrebbe l'utente, la risposta, le
 * fonti verificate come fa il gestore, i file consegnati e le misure; i
 * file finiscono in `local-ingestion/lavorazione/` e si tolgono dallo
 * Storage a fine prova.
 *
 *   npx tsx tools/collaudo-claude-code.ts "Fammi un volantino PDF sulla garanzia furto" [modello]
 *
 * Costa una sessione agentica senza tetti: da qualche decina di centesimi a
 * qualche dollaro, di più se la domanda chiede un documento.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { configurazione } from '../src/config.js';
import { chiudiPool, poolDb } from '../src/db/pool.js';
import { ArchivioStorage } from '../src/worker/ingestion/archivio-file.js';
import { ancoraCitazioni } from '../src/worker/motore/ancoraggio.js';
import { preparaArea, promptSistemaClaudeCode, promptUtenteClaudeCode, skillClaudeCode } from '../src/worker/motore/claude-code.js';
import { caricaDna } from '../src/worker/motore/regole.js';
import { MotoreAgentSdk } from '../src/worker/motore/sessione.js';
import { creaStrumentiMotore } from '../src/worker/motore/strumenti.js';
import { citazioniNellaWorkspace, separaBlocco, validaBlocco } from '../src/worker/motore/validazione.js';
import { materializzaWorkspace } from '../src/worker/motore/workspace.js';

const TENANT_DEMO = '11111111-1111-4111-8111-111111111111';
const domanda = process.argv[2];
if (!domanda) {
  console.error('Uso: npx tsx tools/collaudo-claude-code.ts "<domanda>" [modello]');
  process.exit(1);
}
const c = configurazione();
const modello = process.argv[3] ?? c.MODELLO_MOTORE;
const radice = resolve(c.CLAUDE_CODE_CARTELLA ?? join(homedir(), 'velia-claude-code'));

const db = poolDb();
const archivio = new ArchivioStorage();
try {
  const utente = await db.query<{ id: string }>(`select id from velia.utenti where tenant_id = $1 order by email limit 1`, [TENANT_DEMO]);
  const ws = await materializzaWorkspace({
    db,
    archivio,
    tenantId: TENANT_DEMO,
    radice,
    jobId: 'collaudo',
    cartella: `collaudo-${Date.now()}`,
    contestoIds: [],
    copie: true,
  });
  const area = await preparaArea({ db, archivio, tenantId: TENANT_DEMO, directory: ws.directory, skill: await skillClaudeCode(radice) });
  console.log(`Workspace: ${ws.directory} · ${ws.perPath.size} documenti · ${area.modelli.length} modelli · carta ${area.carta ? 'sì' : 'no'}`);
  const dna = await caricaDna(db, TENANT_DEMO, utente.rows[0]?.id ?? '', { ramiIds: [], compagnieIds: [] }, ws.perPath);

  const motore = new MotoreAgentSdk({
    modello,
    maxTurni: c.MOTORE_MAX_TURNI,
    budgetUsd: c.MOTORE_BUDGET_USD,
    ...(c.MOTORE_EFFORT && { effort: c.MOTORE_EFFORT }),
    fornitori: {
      hostyourai: { ...(c.HOSTYOURAI_API_KEY && { chiave: c.HOSTYOURAI_API_KEY }), baseUrl: c.HOSTYOURAI_BASE_URL },
      aki: { ...(c.AKI_API_KEY && { chiave: c.AKI_API_KEY }), baseUrl: c.AKI_BASE_URL },
      deepseek: { ...(c.DEEPSEEK_API_KEY && { chiave: c.DEEPSEEK_API_KEY }), baseUrl: c.DEEPSEEK_BASE_URL },
      mistral: { ...(c.MISTRAL_API_KEY && { chiave: c.MISTRAL_API_KEY }) },
      gemini: { ...(c.GEMINI_API_KEY && { chiave: c.GEMINI_API_KEY }) },
    },
    completo: { path: c.CLAUDE_CODE_PATH },
  });

  const strumenti = creaStrumentiMotore({
    db,
    archivio,
    tenantId: TENANT_DEMO,
    conversazioneId: randomUUID(),
    messaggioId: randomUUID(),
    suDocumento: (d) => {
      console.log(`  ⇩ documento consegnato: «${d.nome}» (${d.formato})`);
      return Promise.resolve();
    },
    clienti: true,
    consegna: { radice: ws.directory },
  });

  const inizio = Date.now();
  const esito = await motore.interroga(
    {
      directory: ws.directory,
      titoloPer: (path) => ws.perPath.get(path)?.titolo,
      promptSistema: promptSistemaClaudeCode({ dna, area }),
      promptUtente: promptUtenteClaudeCode({ documenti: [], mancanti: [], storia: [], domanda }),
      strumenti: { server: strumenti.server, nomi: strumenti.nomi },
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

  /* Le fonti si verificano come nel gestore: path riportati alla workspace, validazione, ancore. */
  const { visibile, blocco, problemi } = separaBlocco(esito.testo);
  console.log('\n=== RISPOSTA ===');
  console.log(visibile);
  console.log('\n=== FONTI ===');
  if (!blocco) console.log('BLOCCO MANCANTE/NON VALIDO:', problemi.join('; '));
  else {
    const v = validaBlocco(citazioniNellaWorkspace(blocco, ws.directory), ws.perPath, dna);
    const ancorate = await ancoraCitazioni(ws.directory, v.citazioni, ws.perPath);
    for (const cit of ancorate.citazioni) {
      console.log(`  ✓ [${cit.documentoTitolo}] pag. ${cit.posizione.pagina}: «${cit.estratto.slice(0, 80)}»`);
    }
    console.log(`  citazioni ${blocco.citazioni.length} dichiarate, ${ancorate.citazioni.length} valide · provenienze ${v.provenienze.length}`);
    console.log(`  rimandi scartati: ${v.rimandiScartati.join(', ') || 'nessuno'} · avvisi: ${[...v.avvisi, ...ancorate.avvisi].join('; ') || 'nessuno'}`);
  }
  console.log('\n=== MISURE ===');
  console.log(`modello ${esito.modello} · esito ${esito.terminato}${esito.errore ? ` (${esito.errore})` : ''} · turni ${esito.turni} · ${durata.toFixed(1)} s · ${esito.costoUsd.toFixed(4)} USD`);
  console.log(`token: in ${esito.token.input}, out ${esito.token.output}, cache lettura ${esito.token.cacheLettura}, cache scrittura ${esito.token.cacheScrittura}`);
  console.log(`documenti letti: ${esito.documentiLetti.join(', ') || 'nessuno'}`);

  /* I file consegnati: una copia qui per guardarli, poi via dallo Storage. */
  const cartella = resolve('..', 'local-ingestion', 'lavorazione', `collaudo-claude-code-${Date.now()}`);
  await mkdir(cartella, { recursive: true });
  for (const [i, d] of strumenti.generati.entries()) {
    await writeFile(join(cartella, `${d.nome}.${d.formato}`), await archivio.scarica(strumenti.percorsi[i]!));
  }
  await writeFile(join(cartella, 'risposta.md'), `# ${domanda}\n\n${esito.testo}\n\n---\n${JSON.stringify({ modello, durata, esito: { ...esito, testo: undefined } }, null, 2)}\n`, 'utf8');
  await archivio.elimina(strumenti.percorsi).catch(() => undefined);
  console.log(`salvato in ${cartella}`);
  await ws.rimuovi();
} finally {
  await chiudiPool();
}
