/**
 * Misura della ripresa di sessione nel multi-turno: la stessa conversazione
 * (domanda + follow-up) fatta in due modi sulla stessa workspace.
 *
 *   A. come oggi: il follow-up è un job nuovo, con la storia ricopiata nel prompt;
 *   B. con ripresa: il follow-up riprende la sessione SDK della prima domanda
 *      (documenti già letti nel contesto, in cache), prompt = sola domanda nuova.
 *
 *   npx tsx tools/collaudo-ripresa.ts [modello]
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { configurazione } from '../src/config.js';
import { chiudiPool, poolDb } from '../src/db/pool.js';
import { ArchivioStorage } from '../src/worker/ingestion/archivio-file.js';
import { caricaDna, promptSistema, promptUtente } from '../src/worker/motore/regole.js';
import { MotoreAgentSdk, type EsitoSessione } from '../src/worker/motore/sessione.js';
import { separaBlocco } from '../src/worker/motore/validazione.js';
import { materializzaWorkspace } from '../src/worker/motore/workspace.js';

const TENANT_DEMO = '11111111-1111-4111-8111-111111111111';
const c = configurazione();
const modello = process.argv[2] ?? 'claude-sonnet-5';

const D1 = 'Nel prodotto Allianz per l’auto, l’assistenza stradale copre anche il traino all’estero? Con quali limiti?';
const D2 = 'E se il veicolo resta fermo all’estero per più giorni: cosa passa la compagnia per le persone a bordo (albergo, rientro)?';
const D3 = 'Riassumimi in tre righe i limiti che un cliente deve sapere prima di partire per la Svizzera.';

const radice = await mkdtemp(join(tmpdir(), 'velia-ripresa-'));
const db = poolDb();
const righe: string[] = [];
const misure: Array<{ scenario: string; passo: string; e: EsitoSessione; secondi: number }> = [];
try {
  const utente = await db.query<{ id: string }>(`select id from velia.utenti where tenant_id = $1 order by email limit 1`, [TENANT_DEMO]);
  const ws = await materializzaWorkspace({ db, archivio: new ArchivioStorage(), tenantId: TENANT_DEMO, radice, jobId: 'ripresa', contestoIds: [] });
  const dna = await caricaDna(db, TENANT_DEMO, utente.rows[0]?.id ?? '', { ramiIds: [], compagnieIds: [] }, ws.perPath);
  const sistema = promptSistema(dna);
  const motore = new MotoreAgentSdk({
    modello, maxTurni: c.MOTORE_MAX_TURNI, budgetUsd: c.MOTORE_BUDGET_USD, silenzioMs: c.MOTORE_SILENZIO_MS,
    ...(c.MOTORE_EFFORT && { effort: c.MOTORE_EFFORT }),
  });
  const chiedi = async (scenario: string, passo: string, promptUtente: string, sessione?: { persisti: boolean; riprendi?: string }) => {
    console.log(`\n[${scenario} · ${passo}] ${promptUtente.slice(-90).replace(/\n/g, ' ')}`);
    const inizio = Date.now();
    const e = await motore.interroga(
      { directory: ws.directory, titoloPer: (p) => ws.perPath.get(p)?.titolo, promptSistema: sistema, promptUtente, ...(sessione && { sessione }) },
      { passo: (p) => { if (p.tipo === 'attivita') console.log(`  · ${p.etichetta}`); return Promise.resolve(); }, annullato: () => Promise.resolve(false) },
    );
    const secondi = (Date.now() - inizio) / 1000;
    console.log(`  → ${e.terminato} · ${e.turni} turni · ${secondi.toFixed(1)} s · ${e.costoUsd.toFixed(4)} USD · in ${e.token.input} out ${e.token.output} cr ${e.token.cacheLettura} cw ${e.token.cacheScrittura} · doc ${e.documentiLetti.length} · sess ${e.sessioneId ?? '-'}`);
    misure.push({ scenario, passo, e, secondi });
    righe.push(`### ${scenario} · ${passo}\n\n_${promptUtente.split('\n').at(-1)}_\n\n${separaBlocco(e.testo).visibile}\n`);
    return e;
  };

  /* A: come oggi. */
  const a1 = await chiedi('A-oggi', '1', promptUtente({ documenti: [], mancanti: [], storia: [], domanda: D1 }));
  const storiaA = [{ autore: 'utente' as const, testo: D1 }, { autore: 'assistente' as const, testo: separaBlocco(a1.testo).visibile }];
  const a2 = await chiedi('A-oggi', '2', promptUtente({ documenti: [], mancanti: [], storia: storiaA, domanda: D2 }));
  storiaA.push({ autore: 'utente', testo: D2 }, { autore: 'assistente', testo: separaBlocco(a2.testo).visibile });
  await chiedi('A-oggi', '3', promptUtente({ documenti: [], mancanti: [], storia: storiaA, domanda: D3 }));

  /* B: con ripresa. */
  const b1 = await chiedi('B-ripresa', '1', promptUtente({ documenti: [], mancanti: [], storia: [], domanda: D1 }), { persisti: true });
  if (!b1.sessioneId) throw new Error('nessun sessioneId dalla prima sessione');
  const b2 = await chiedi('B-ripresa', '2', `Domanda dell’utente:\n${D2}`, { persisti: true, riprendi: b1.sessioneId });
  await chiedi('B-ripresa', '3', `Domanda dell’utente:\n${D3}`, { persisti: true, riprendi: b2.sessioneId ?? b1.sessioneId });

  const tab = ['| Scenario | Passo | Turni | s | USD | in | out | cache r | cache w | Doc |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const m of misure) tab.push(`| ${m.scenario} | ${m.passo} | ${m.e.turni} | ${m.secondi.toFixed(1)} | ${m.e.costoUsd.toFixed(4)} | ${m.e.token.input} | ${m.e.token.output} | ${m.e.token.cacheLettura} | ${m.e.token.cacheScrittura} | ${m.e.documentiLetti.length} |`);
  for (const s of ['A-oggi', 'B-ripresa']) {
    const mm = misure.filter((m) => m.scenario === s);
    tab.push(`| **${s} totale** | | ${mm.reduce((a, m) => a + m.e.turni, 0)} | ${mm.reduce((a, m) => a + m.secondi, 0).toFixed(1)} | ${mm.reduce((a, m) => a + m.e.costoUsd, 0).toFixed(4)} | | ${mm.reduce((a, m) => a + m.e.token.output, 0)} | | | |`);
    const fu = mm.filter((m) => m.passo !== '1');
    tab.push(`| **${s} solo follow-up** | | ${fu.reduce((a, m) => a + m.e.turni, 0)} | ${fu.reduce((a, m) => a + m.secondi, 0).toFixed(1)} | ${fu.reduce((a, m) => a + m.e.costoUsd, 0).toFixed(4)} | | ${fu.reduce((a, m) => a + m.e.token.output, 0)} | | | |`);
  }
  console.log('\n' + tab.join('\n'));
  const uscita = resolve('..', 'local-ingestion', 'lavorazione', `collaudo-ripresa-${Date.now()}.md`);
  await writeFile(uscita, `# Ripresa di sessione · ${modello}\n\n${tab.join('\n')}\n\n## Risposte\n\n${righe.join('\n')}`, 'utf8');
  console.log(`salvato in ${uscita}`);
  await ws.rimuovi();
} finally {
  await chiudiPool();
  await rm(radice, { recursive: true, force: true });
}
