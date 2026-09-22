import { execFile } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import type pg from 'pg';

import type { EsportazioneElaborata } from '../../contratto/conversazioni.js';
import { cartaPerSandbox } from '../../generazione/carta.js';
import { fasceDelTenant, modelliDelTenant } from '../../generazione/catalogo.js';
import { NOME_DOCUMENTO } from '../../generazione/generatore.js';
import { senzaFasce } from '../../generazione/timbra.js';
import type { ArchivioFile } from '../ingestion/archivio-file.js';
import { BLOCCO_FINALE, type DnaAgenzia, type MessaggioStoria } from './regole.js';
import { slug } from './workspace.js';

/**
 * Claude Code così com'è nella chat (22/09/2026, `MOTORE_CHAT=claude-code`).
 *
 * La prova del committente: un worker solo, senza sandbox, con Claude Code
 * completo sulla workspace del tenant e nessun altro vincolo. Il motore è
 * `MotoreAgentSdk` con `completo`; qui c'è quello che gli serve oltre ai
 * documenti (le skill, i modelli e la carta dell'agenzia nella sua
 * cartella) e i due prompt, che dicono fatti: dove sono le cose, che cosa
 * vede l'utente, come gli arriva un file. Nessuna regola di stile né su come
 * cercare.
 *
 * Una regola sola è rientrata, lo stesso giorno, su richiesta del
 * committente: le fonti. Senza il blocco delle citazioni la risposta usciva
 * con «[pag. 46]» e nomi di file in chiaro, niente di cliccabile né di
 * verificato, e senza gli id del DNA d'Agenzia nessuna provenienza. Ora
 * Claude Code chiude col blocco `velia-citazioni` come il motore di sempre
 * (`BLOCCO_FINALE`, una definizione sola), e il gestore lo verifica.
 */

const eseguiFile = promisify(execFile);

/** Le skill di VELIA, accanto al Dockerfile della sandbox che le usava. */
const SKILL_VELIA = fileURLToPath(new URL('../../../sandbox/skills/', import.meta.url));

let skillPronte: Promise<string> | undefined;

/**
 * Le skill che la sandbox aveva nell'immagine: tutte quelle di
 * anthropics/skills più quelle di VELIA, in `<radice>/skill`. Le prime si
 * scaricano una volta sola (con git: il tar che si trova nel PATH di Git
 * Bash legge «C:» come un host remoto); quelle di VELIA si ricopiano a ogni
 * avvio del worker, così una modifica arriva senza pulire niente.
 */
export function skillClaudeCode(radice: string): Promise<string> {
  skillPronte ??= (async () => {
    const cartella = join(radice, 'skill');
    if (!(await esiste(join(cartella, 'docx', 'SKILL.md')))) {
      const clone = await mkdtemp(join(tmpdir(), 'velia-skill-'));
      try {
        await eseguiFile('git', ['clone', '--depth', '1', 'https://github.com/anthropics/skills.git', clone]);
        await mkdir(cartella, { recursive: true });
        await cp(join(clone, 'skills'), cartella, { recursive: true });
      } finally {
        await rm(clone, { recursive: true, force: true });
      }
    }
    await cp(SKILL_VELIA, cartella, { recursive: true, force: true });
    return cartella;
  })();
  /* Un download fallito non resta in memoria: il messaggio dopo riprova. */
  skillPronte.catch(() => {
    skillPronte = undefined;
  });
  return skillPronte;
}

export interface ModelloNellArea {
  id: string;
  nome: string;
  formato: string;
  descrizione: string;
  /** Relativo alla cartella di lavoro. */
  path: string;
  /** Vero se il documento esce col marchio dell'agenzia, falso se tiene quello del modello. */
  intestazioneAgenzia: boolean;
}

export interface AreaClaudeCode {
  modelli: ModelloNellArea[];
  /** Vero se in `carta/` ci sono loghi, testi e colori dell'agenzia. */
  carta: boolean;
}

/**
 * La cartella di lavoro oltre ai documenti: `output/` per i file da
 * consegnare, le skill in `.claude/skills` (un collegamento alla cartella
 * scaricata, che la CLI carica come skill di progetto), i modelli di
 * riferimento dell'agenzia in `modelli/` e la sua carta in `carta/`. Nella
 * sandbox arrivava solo il modello scelto; qui ci sono tutti, perché la
 * scelta la fa il modello mentre risponde.
 */
export async function preparaArea(o: {
  db: pg.Pool;
  archivio: ArchivioFile;
  tenantId: string;
  directory: string;
  skill: string;
}): Promise<AreaClaudeCode> {
  await mkdir(join(o.directory, 'output'), { recursive: true });
  await mkdir(join(o.directory, '.claude'), { recursive: true });
  await symlink(o.skill, join(o.directory, '.claude', 'skills'), 'junction');

  const client = await o.db.connect();
  let righe;
  let fasce;
  try {
    righe = await modelliDelTenant(client, o.tenantId);
    fasce = await fasceDelTenant(client, o.archivio, o.tenantId, NOME_DOCUMENTO);
  } finally {
    client.release();
  }

  const modelli: ModelloNellArea[] = [];
  const usati = new Set<string>();
  for (const m of righe) {
    let nome = slug(m.nome);
    for (let n = 2; usati.has(`${nome}.${m.formato}`); n++) nome = `${slug(m.nome)}-${n}`;
    const path = `modelli/${nome}.${m.formato}`;
    try {
      await scrivi(o.directory, path, await o.archivio.scarica(m.path_file));
    } catch {
      /* Un modello che non si scarica resta fuori, gli altri no. */
      continue;
    }
    usati.add(`${nome}.${m.formato}`);
    modelli.push({
      id: m.id,
      nome: m.nome,
      formato: m.formato,
      descrizione: m.descrizione,
      path,
      intestazioneAgenzia: m.intestazione_agenzia,
    });
  }

  const carta = senzaFasce(fasce) ? [] : cartaPerSandbox(fasce);
  for (const f of carta) await scrivi(o.directory, f.path, f.byte);
  return { modelli, carta: carta.length > 0 };
}

/**
 * Il prompt che va in coda a quello di Claude Code: i fatti del lavoro, il
 * DNA d'Agenzia (è l'agenzia a scriverlo) e il contratto delle fonti. Le
 * altre regole di VELIA (come cercare, il tu, lo stile) no.
 */
export function promptSistemaClaudeCode(c: {
  dna: DnaAgenzia;
  area: AreaClaudeCode;
  /** L'esecuzione di un agente: i destinatari del piano confermato, nell'ordine. */
  emailAgente?: { destinatari: Array<{ nome?: string | undefined; a: string }> } | undefined;
}): string {
  const parti: string[] = [];
  parti.push(`# VELIA

Lavori dentro VELIA, la piattaforma di un'agenzia di assicurazioni italiana: chi ti scrive in chat è un operatore dell'agenzia.

## La cartella di lavoro

- \`archivio-pubblico/\`: i set informativi delle compagnie (DIP, DIP aggiuntivo, condizioni di assicurazione), per compagnia, ramo, prodotto ed edizione, trascritti in Markdown dai PDF con le ancore di pagina \`[pag. N]\`. Ogni cartella ha un \`INDICE.md\`; \`archivio-pubblico/GLOSSARIO.md\` accosta le parole di tutti i giorni a quelle dei contratti.
- \`tenant/clienti/\`: i documenti dell'agenzia, una cartella per cliente. \`tenant/clienti/INDICE.md\` è l'elenco dei clienti; il cliente di cui si parla ha anche una \`SCHEDA.md\`.
- \`tenant/documenti/\`: i documenti dell'agenzia che non sono di un cliente (circolari, modulistica, note tecniche), per tipologia.
- \`tenant/allegati/\`: gli allegati di questa conversazione. Quelli caricati «solo per questa chat» sono i file originali, senza trascrizione.${
    c.area.modelli.length ? "\n- `modelli/`: i modelli di riferimento dell'agenzia (sotto)." : ''
  }${c.area.carta ? "\n- `carta/`: loghi, testi e colori dell'agenzia (`carta.md`), per i documenti che escono a nome suo." : ''}
- \`output/\`: la cartella per i file da consegnare.

## Che cosa arriva all'utente

Vede in chat il tuo testo, in Markdown, e mentre lavori un'etichetta per ogni passo: per Bash è la \`description\` del comando, quindi scrivila in italiano. Un file gli arriva solo se lo consegni con lo strumento \`consegna\` del server \`velia\`: lo trova sotto la risposta, da scaricare.`);

  if (c.area.modelli.length) {
    parti.push("\n## I modelli di riferimento dell'agenzia\n");
    for (const m of c.area.modelli) {
      const quando = m.descrizione.trim() ? ` Quando usarlo, secondo l'agenzia: ${m.descrizione.trim()}` : '';
      const marchio = m.intestazioneAgenzia
        ? c.area.carta
          ? " Il marchio è quello dell'agenzia, in `carta/`, non la carta intestata del modello."
          : ''
        : " Logo, intestazione e piè di pagina sono quelli del modello, anche se nominano un altro ente: l'agenzia l'ha scelto per questo.";
      parti.push(`- \`${m.path}\`: «${m.nome}» (${m.formato.toUpperCase()}).${quando}${marchio}`);
    }
  }

  if (c.emailAgente) {
    parti.push('\n## Email di questo agente\n');
    if (c.emailAgente.destinatari.length) {
      parti.push(
        "Stai eseguendo un agente dell'agenzia con un piano confermato. `invia_email` manda l'email subito, a nome dell'agenzia, e solo a questi destinatari, indicati per numero:",
      );
      c.emailAgente.destinatari.forEach((d, i) => parti.push(`${i + 1}. ${d.nome ? `${d.nome} <${d.a}>` : d.a}`));
    } else {
      parti.push("Stai eseguendo un agente dell'agenzia, e il piano confermato non prevede email.");
    }
  }

  const { istruzioni, riferimenti, ricordi } = c.dna;
  if (istruzioni.length || riferimenti.length || ricordi.length) {
    parti.push("\n## DNA d'Agenzia\n");
    parti.push(
      "Le istruzioni che l'agenzia ha scritto, i suoi documenti di riferimento e i ricordi delle conversazioni passate. Quelli che applichi li dichiari nel blocco finale (`provenienze`) col loro id, senza rimandi nel testo.",
    );
    if (istruzioni.length) {
      parti.push('\n### Istruzioni (tipo "regola")');
      for (const i of istruzioni) parti.push(`- [id: ${i.id}] **${i.titolo}**: ${i.testo}`);
    }
    if (riferimenti.length) {
      parti.push('\n### Documenti di riferimento (tipo "documento-riferimento")');
      for (const r of riferimenti) parti.push(`- [id: ${r.id}] ${r.titolo}: \`${r.path}\``);
    }
    if (ricordi.length) {
      parti.push('\n### Ricordi (tipo "memoria")');
      for (const r of ricordi) parti.push(`- [id: ${r.id}] (${r.categoria}) ${r.testo}`);
    }
  }

  parti.push(`
## Le fonti

Ogni affermazione presa da un documento porta subito dopo un rimando numerato \`[1]\`, \`[2]\`…: il numero è la posizione della fonte nell'elenco \`citazioni\` del blocco finale. La stessa fonte ha sempre lo stesso numero, e ogni voce del blocco va richiamata almeno una volta nel testo. Titolo, pagina e nome del file non si scrivono nel testo: l'app mostra ogni rimando con titolo, pagina ed estratto, e da lì apre il documento.

${BLOCCO_FINALE}`);
  return parti.join('\n');
}

/** Quanti caratteri di storia portare quando la sessione non si riprende. */
const MAX_CARATTERI_STORIA = 24_000;

/**
 * Il prompt utente: il messaggio, e intorno solo ciò che Claude Code non
 * può sapere da sé (gli allegati, il cliente, la storia quando la sessione
 * non si riprende).
 */
export function promptUtenteClaudeCode(c: {
  documenti: Array<{ path: string; titolo: string }>;
  mancanti: Array<{ titolo: string; motivo: string }>;
  cliente?: { nome: string; scheda: string } | undefined;
  /** Assente quando la sessione si riprende: la conversazione è già nel contesto. */
  storia?: MessaggioStoria[] | undefined;
  domanda: string;
}): string {
  const parti: string[] = [];
  if (c.documenti.length) {
    parti.push('Documenti allegati alla conversazione:');
    for (const d of c.documenti) parti.push(`- \`${d.path}\` - ${d.titolo}`);
  }
  if (c.cliente) {
    parti.push(`${parti.length ? '\n' : ''}La conversazione riguarda il cliente ${c.cliente.nome} (scheda: \`${c.cliente.scheda}\`).`);
  }
  if (c.mancanti.length) {
    parti.push(`${parti.length ? '\n' : ''}Documenti della conversazione non disponibili:`);
    for (const m of c.mancanti) parti.push(`- ${m.titolo}: ${m.motivo}`);
  }
  if (c.storia?.length) {
    let budget = MAX_CARATTERI_STORIA;
    const righe: string[] = [];
    for (const m of [...c.storia].reverse()) {
      const riga = `${m.autore === 'utente' ? 'Utente' : 'Tu'}: ${m.testo}`;
      if (riga.length > budget) {
        righe.push('[…messaggi precedenti omessi…]');
        break;
      }
      righe.push(riga);
      budget -= riga.length;
    }
    parti.push(`${parti.length ? '\n' : ''}La conversazione finora:\n\n${righe.reverse().join('\n\n')}`);
  }
  if (!parti.length) return c.domanda;
  parti.push(`\nMessaggio dell'utente:\n${c.domanda}`);
  return parti.join('\n');
}

/**
 * «Genera da modello» dal pulsante, detto a Claude Code come un messaggio:
 * lavora nella stessa sessione della conversazione, e la risposta o il filo
 * da impaginare li ha già davanti (per la risposta, il testo va comunque
 * con la richiesta: il pulsante dice quale).
 */
export function domandaEsportazione(
  e: EsportazioneElaborata,
  modello: ModelloNellArea | undefined,
  testoRisposta: string | undefined,
): string {
  const formato = (e.formato ?? modello?.formato ?? 'pdf').toUpperCase();
  const su = e.ambito === 'conversazione' ? 'su tutta la conversazione' : 'sulla tua risposta';
  const parti = [
    `Dal pulsante «Genera da modello», ${su}: un file ${formato}${modello ? ` sul modello «${modello.nome}» (\`${modello.path}\`)` : ''}.`,
  ];
  if (e.istruzioni?.trim()) parti.push(`\nIndicazioni: ${e.istruzioni.trim()}`);
  if (testoRisposta?.trim()) parti.push(`\nLa risposta:\n\n${testoRisposta.trim()}`);
  return parti.join('\n');
}

async function scrivi(directory: string, relativo: string, contenuto: Buffer | string): Promise<void> {
  const file = join(directory, ...relativo.split('/'));
  await mkdir(join(file, '..'), { recursive: true });
  await writeFile(file, contenuto);
}

async function esiste(percorso: string): Promise<boolean> {
  try {
    await access(percorso, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}
