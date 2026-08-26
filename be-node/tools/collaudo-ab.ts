/**
 * Test A/B fra due modelli sul motore VERO: le stesse domande, la stessa
 * workspace (tenant demo, tutto l'Archivio Pubblico, nessun DNA), misure
 * affiancate (secondi, dollari, token, turni, citazioni valide) e le risposte
 * complete in un Markdown da giudicare a mano.
 *
 *   npx tsx tools/collaudo-ab.ts [modelloA] [modelloB]
 *   (default: zai-org/GLM-5.2 contro claude-sonnet-5)
 *
 * Costa: 2 sessioni agentiche per domanda.
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
const modelli = [process.argv[2] ?? 'zai-org/GLM-5.2', process.argv[3] ?? 'claude-sonnet-5'];

const DOMANDE = [
  'Che franchigie e scoperti prevede la garanzia furto e incendio nel prodotto Cattolica AUTOPIÙ?',
  'Nel prodotto Allianz per l’auto, l’assistenza stradale copre anche il traino all’estero? Con quali limiti?',
  'Confronta le esclusioni della garanzia eventi atmosferici tra AXA e Nobis: quale delle due è più ampia?',
  'Un cliente ha una polizza RC auto Nobis: cosa succede se guida un conducente non indicato in polizza?',
  'Qual è il massimale minimo di legge per la RC auto e come lo trattano i prodotti in archivio?',
  'Che tempi di preavviso prevede la disdetta di una polizza vita Generali?',
];

interface Misura {
  modello: string;
  domanda: string;
  testo: string;
  secondi: number;
  usd: number;
  turni: number;
  terminato: string;
  token: { input: number; output: number; cacheLettura: number; cacheScrittura: number };
  documenti: string[];
  citazioni: number;
  nonSupportato: boolean | null;
  validazione: string;
}

const radice = await mkdtemp(join(tmpdir(), 'velia-ab-'));
const db = poolDb();
const c = configurazione();
try {
  const utente = await db.query<{ id: string }>(`select id from velia.utenti where tenant_id = $1 order by email limit 1`, [TENANT_DEMO]);
  const ws = await materializzaWorkspace({ db, archivio: new ArchivioStorage(), tenantId: TENANT_DEMO, radice, jobId: 'collaudo-ab', contestoIds: [] });
  console.log(`Workspace: ${ws.directory} — ${ws.perPath.size} documenti`);
  const dna = await caricaDna(db, TENANT_DEMO, utente.rows[0]?.id ?? '', { ramiIds: [], compagnieIds: [] }, ws.perPath);
  const sistema = promptSistema(dna);

  const misure: Misura[] = [];
  for (const modello of modelli) {
    const motore = new MotoreAgentSdk({
      modello,
      maxTurni: c.MOTORE_MAX_TURNI,
      budgetUsd: c.MOTORE_BUDGET_USD,
      silenzioMs: c.MOTORE_SILENZIO_MS,
      ...(c.MOTORE_EFFORT && { effort: c.MOTORE_EFFORT }),
      fornitori: { hostyourai: { ...(c.HOSTYOURAI_API_KEY && { chiave: c.HOSTYOURAI_API_KEY }), baseUrl: c.HOSTYOURAI_BASE_URL } },
    });
    for (const domanda of DOMANDE) {
      console.log(`\n[${modello}] ${domanda}`);
      const inizio = Date.now();
      const esito = await motore.interroga(
        { directory: ws.directory, titoloPer: (p) => ws.perPath.get(p)?.titolo, promptSistema: sistema, promptUtente: promptUtente({ documenti: [], mancanti: [], storia: [], domanda }) },
        { passo: (p) => { if (p.tipo === 'attivita') console.log(`  · ${p.etichetta}`); return Promise.resolve(); }, annullato: () => Promise.resolve(false) },
      );
      const secondi = (Date.now() - inizio) / 1000;
      const { visibile, blocco, problemi } = separaBlocco(esito.testo);
      let citazioni = 0, nonSupportato: boolean | null = null, validazione = '';
      if (!blocco) validazione = `blocco mancante: ${problemi.join('; ')}`;
      else {
        try {
          const v = validaBlocco(blocco, ws.perPath, dna);
          citazioni = v.citazioni.length; nonSupportato = v.nonSupportato; validazione = v.avvisi.join('; ') || 'ok';
        } catch (e) { validazione = `FALLITA: ${e instanceof Error ? e.message : String(e)}`; }
      }
      const m: Misura = { modello, domanda, testo: visibile, secondi, usd: esito.costoUsd, turni: esito.turni, terminato: esito.terminato, token: esito.token, documenti: esito.documentiLetti, citazioni, nonSupportato, validazione };
      misure.push(m);
      console.log(`  → ${esito.terminato} · ${esito.turni} turni · ${secondi.toFixed(1)} s · ${esito.costoUsd.toFixed(4)} USD · cit ${citazioni} · ${validazione}`);
    }
  }

  const righe = ['# Test A/B ' + modelli.join(' vs '), '', '## Misure', '', '| # | Modello | Esito | Turni | s | USD | in | out | cache r | cache w | Doc letti | Cit | NS | Validazione |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  DOMANDE.forEach((d, i) => {
    for (const m of misure.filter((x) => x.domanda === d)) {
      righe.push(`| ${i + 1} | ${m.modello} | ${m.terminato} | ${m.turni} | ${m.secondi.toFixed(1)} | ${m.usd.toFixed(4)} | ${m.token.input} | ${m.token.output} | ${m.token.cacheLettura} | ${m.token.cacheScrittura} | ${m.documenti.length} | ${m.citazioni} | ${m.nonSupportato ?? '-'} | ${m.validazione} |`);
    }
  });
  for (const modello of modelli) {
    const mm = misure.filter((x) => x.modello === modello);
    righe.push(`| | **${modello} totale** | | | ${mm.reduce((a, x) => a + x.secondi, 0).toFixed(1)} | ${mm.reduce((a, x) => a + x.usd, 0).toFixed(4)} | | | | | | ${mm.reduce((a, x) => a + x.citazioni, 0)} | | |`);
  }
  righe.push('', '## Risposte', '');
  DOMANDE.forEach((d, i) => {
    righe.push(`### ${i + 1}. ${d}`, '');
    for (const m of misure.filter((x) => x.domanda === d)) {
      righe.push(`#### ${m.modello}`, '', `_documenti: ${m.documenti.join(', ') || 'nessuno'}_`, '', m.testo, '');
    }
  });
  const uscita = resolve('..', 'local-ingestion', 'lavorazione', `collaudo-ab-${Date.now()}.md`);
  await writeFile(uscita, righe.join('\n') + '\n', 'utf8');
  console.log(`\nsalvato in ${uscita}`);
  await ws.rimuovi();
} finally {
  await chiudiPool();
  await rm(radice, { recursive: true, force: true });
}
