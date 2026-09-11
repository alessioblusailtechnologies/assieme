/**
 * Test A/B fra due varianti del motore VERO: le stesse domande, la stessa
 * workspace (tenant demo, tutto l'Archivio Pubblico, nessun DNA), misure
 * affiancate (secondi, dollari, token, turni, citazioni valide) e le risposte
 * complete in un Markdown da giudicare a mano.
 *
 *   npx tsx tools/collaudo-ab.ts [varianteA] [varianteB]
 *   (default: zai-org/GLM-5.2 contro claude-sonnet-5)
 *
 * Una variante è `modello` oppure `modello@effort`: senza `@` vale
 * `MOTORE_EFFORT` dell'ambiente (e senza nemmeno quello, il default dell'API,
 * che è `high`). Così lo stesso strumento confronta due modelli fra loro
 * oppure lo stesso modello a due livelli di sforzo:
 *
 *   npx tsx tools/collaudo-ab.ts claude-opus-5@high claude-opus-5@medium
 *
 * Sul confronto di effort il segnale pulito sono i **token di output**: il
 * costo in dollari porta anche il rumore della cache, che a seconda di cosa
 * gira prima può essere calda o fredda.
 *
 * Costa: 2 sessioni agentiche per domanda.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { configurazione } from '../src/config.js';
import { chiudiPool, poolDb } from '../src/db/pool.js';
import { ArchivioStorage } from '../src/worker/ingestion/archivio-file.js';
import { caricaDna, catalogoArchivioPubblico, promptSistema, promptUtente } from '../src/worker/motore/regole.js';
import { MotoreAgentSdk } from '../src/worker/motore/sessione.js';
import { ErroreValidazione, separaBlocco, validaBlocco } from '../src/worker/motore/validazione.js';
import { materializzaWorkspace } from '../src/worker/motore/workspace.js';

const TENANT_DEMO = '11111111-1111-4111-8111-111111111111';

const LIVELLI = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
type Effort = (typeof LIVELLI)[number];

/** `modello` o `modello@effort`. L'etichetta è ciò che finisce nelle tabelle. */
interface Variante {
  etichetta: string;
  modello: string;
  effort?: Effort;
}

function variante(spec: string, effortAmbiente?: Effort): Variante {
  const taglio = spec.lastIndexOf('@');
  if (taglio === -1) {
    return { etichetta: effortAmbiente ? `${spec}@${effortAmbiente}` : spec, modello: spec, ...(effortAmbiente && { effort: effortAmbiente }) };
  }
  const modello = spec.slice(0, taglio);
  const effort = spec.slice(taglio + 1);
  if (!(LIVELLI as readonly string[]).includes(effort)) {
    throw new Error(`Effort «${effort}» non valido in «${spec}»: usa ${LIVELLI.join(', ')}.`);
  }
  return { etichetta: spec, modello, effort: effort as Effort };
}

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
/* Una variante sola è legittima: quando il fondoscala dell'altro modello
   è già stato misurato sulla stessa workspace, rifarlo è solo spesa. */
const specifiche = process.argv.slice(2);
const varianti = (specifiche.length > 0 ? specifiche : ['zai-org/GLM-5.2', 'claude-sonnet-5']).map((s) =>
  variante(s, c.MOTORE_EFFORT),
);
try {
  const utente = await db.query<{ id: string }>(`select id from velia.utenti where tenant_id = $1 order by email limit 1`, [TENANT_DEMO]);
  const ws = await materializzaWorkspace({ db, archivio: new ArchivioStorage(), tenantId: TENANT_DEMO, radice, jobId: 'collaudo-ab', contestoIds: [] });
  console.log(`Workspace: ${ws.directory} — ${ws.perPath.size} documenti`);
  const dna = await caricaDna(db, TENANT_DEMO, utente.rows[0]?.id ?? '', { ramiIds: [], compagnieIds: [] }, ws.perPath);
  const catalogo = catalogoArchivioPubblico(ws.perPath);
  const sistema = promptSistema(dna, { catalogo });
  /* Il catalogo è prefisso in cache, ma è pur sempre contesto: se cresce
     troppo lo si vede da qui prima che lo si veda sul conto. */
  console.log(
    `Catalogo: ${catalogo.length} caratteri (~${Math.round(catalogo.length / 3.6)} token) · prompt di sistema ${sistema.length} caratteri`,
  );

  const misure: Misura[] = [];
  for (const v of varianti) {
    const motore = new MotoreAgentSdk({
      modello: v.modello,
      maxTurni: c.MOTORE_MAX_TURNI,
      budgetUsd: c.MOTORE_BUDGET_USD,
      silenzioMs: c.MOTORE_SILENZIO_MS,
      ...(v.effort && { effort: v.effort }),
      fornitori: { hostyourai: { ...(c.HOSTYOURAI_API_KEY && { chiave: c.HOSTYOURAI_API_KEY }), baseUrl: c.HOSTYOURAI_BASE_URL },
        aki: { ...(c.AKI_API_KEY && { chiave: c.AKI_API_KEY }), baseUrl: c.AKI_BASE_URL },
        deepseek: { ...(c.DEEPSEEK_API_KEY && { chiave: c.DEEPSEEK_API_KEY }), baseUrl: c.DEEPSEEK_BASE_URL },
        mistral: { ...(c.MISTRAL_API_KEY && { chiave: c.MISTRAL_API_KEY }) },
        gemini: { ...(c.GEMINI_API_KEY && { chiave: c.GEMINI_API_KEY }) } },
    });
    for (const domanda of DOMANDE) {
      console.log(`\n[${v.etichetta}] ${domanda}`);
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
        } catch (e) {
          const dettagli = e instanceof ErroreValidazione ? e.dettagli : [];
          validazione = `FALLITA: ${e instanceof Error ? e.message : String(e)}${dettagli.length ? ' — ' + dettagli.join('; ') : ''}`;
        }
      }
      const m: Misura = { modello: v.etichetta, domanda, testo: visibile, secondi, usd: esito.costoUsd, turni: esito.turni, terminato: esito.terminato, token: esito.token, documenti: esito.documentiLetti, citazioni, nonSupportato, validazione };
      misure.push(m);
      console.log(`  → ${esito.terminato} · ${esito.turni} turni · ${secondi.toFixed(1)} s · ${esito.costoUsd.toFixed(4)} USD · cit ${citazioni} · ${validazione}`);
    }
  }

  const righe = [`# Collaudo ${varianti.map((v) => v.etichetta).join(' vs ')}`, '', '## Misure', '', '| # | Variante | Esito | Turni | s | USD | in | out | cache r | cache w | Doc letti | Cit | NS | Validazione |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  DOMANDE.forEach((d, i) => {
    for (const m of misure.filter((x) => x.domanda === d)) {
      righe.push(`| ${i + 1} | ${m.modello} | ${m.terminato} | ${m.turni} | ${m.secondi.toFixed(1)} | ${m.usd.toFixed(4)} | ${m.token.input} | ${m.token.output} | ${m.token.cacheLettura} | ${m.token.cacheScrittura} | ${m.documenti.length} | ${m.citazioni} | ${m.nonSupportato ?? '-'} | ${m.validazione} |`);
    }
  });
  const somma = (mm: Misura[], f: (m: Misura) => number) => mm.reduce((a, x) => a + f(x), 0);
  for (const v of varianti) {
    const mm = misure.filter((x) => x.modello === v.etichetta);
    righe.push(
      `| | **${v.etichetta} totale** | | ${somma(mm, (x) => x.turni)} | ${somma(mm, (x) => x.secondi).toFixed(1)} | ${somma(mm, (x) => x.usd).toFixed(4)} | ${somma(mm, (x) => x.token.input)} | **${somma(mm, (x) => x.token.output)}** | ${somma(mm, (x) => x.token.cacheLettura)} | ${somma(mm, (x) => x.token.cacheScrittura)} | ${somma(mm, (x) => x.documenti.length)} | ${somma(mm, (x) => x.citazioni)} | | |`,
    );
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
