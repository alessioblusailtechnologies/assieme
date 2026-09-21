/**
 * Ciò che il worker aggiunge al prompt di sistema di Claude Code nella
 * sandbox di «Genera da modello».
 *
 * Dal 21/09/2026 solo i FATTI del lavoro: per chi si lavora, dove sono i
 * file, come si consegna, che cosa ha scelto l'agenzia. Nessuna regola di
 * stile, nessun ciclo di lavoro prescritto, nessun limite: il prompt di
 * prima («impagina in modo sobrio e professionale», «senza perdere dati né
 * fonti», i controlli a 60 dpi) trasformava un volantino in una scheda
 * tecnica di quattro pagine, con Opus come con DeepSeek. Il know-how che
 * serve solo a certi lavori sta nelle skill della sandbox (per esempio
 * `carta-intestata-pdf`), che il modello apre quando gli servono.
 *
 * Il marchio dell'agenzia (stessa data): lo integra la sandbox, coi
 * materiali in `/lavoro/carta/`, su ogni formato. VELIA non timbra più
 * dopo la consegna, e il documento non deve lasciare fasce vuote.
 *
 * I documenti del tenant non ci sono più (stessa notte): il contenuto lo
 * decide la chat e arriva nel prompt utente (`promptRichiesta`).
 */

export interface ContestoIstruzioni {
  /** Il modello di riferimento, se c'è, col suo path nella sandbox. */
  modello?: {
    nome: string;
    formato: string;
    path: string;
    /** «Quando usarlo», come l'ha scritto l'agenzia. */
    descrizione: string;
    intestazione: 'agenzia' | 'sua';
  };
  /** L'estensione del file da produrre: qualsiasi, dall'11/09/2026 (eseguibili esclusi). */
  formato: string;
  /** Loghi, testi e colori dell'agenzia in `/lavoro/carta/`. */
  cartaAgenzia?: boolean;
}

export function promptSandbox(c: ContestoIstruzioni): string {
  const parti: string[] = [];
  const marchioDelModello = c.modello?.intestazione === 'sua';
  parti.push(
    `Lavori per VELIA, la piattaforma di un'agenzia di assicurazioni italiana: un suo operatore ti chiede un file ${c.formato.toUpperCase()}.`,
  );

  parti.push(`
## Il contenuto
Il testo e i dati da mettere nel documento sono nella richiesta qui sotto: li ha presi dai documenti dell'agenzia il motore della chat, e i documenti qui non ci sono.

## I file${
    c.modello ? `\n- \`${c.modello.path}\`: il modello di riferimento scelto dall'agenzia (vedi sotto).` : ''
  }${
    c.cartaAgenzia && !marchioDelModello
      ? "\n- `/lavoro/carta/`: loghi, testi e colori dell'agenzia (`carta.md`). Il documento esce a nome suo."
      : ''
  }
- \`/lavoro/output/\`: dove salvi il file da consegnare.`);

  parti.push(`
## Consegna
Il file arriva all'utente solo se lo consegni col tool \`consegna\` (server velia), da \`/lavoro/output/\`, col nome con cui lo vedrà. Qualsiasi formato va bene, tranne i programmi eseguibili.

Mentre lavori, l'utente vede in chat la \`description\` dei comandi Bash: scrivila in italiano.`);

  if (c.formato === 'html' || c.formato === 'htm') {
    parti.push(
      "Una pagina HTML la apre il cliente dell'agenzia da un link, spesso dal telefono, e VELIA la serve con la rete chiusa: tutto ciò che le serve (CSS, script, immagini, font) deve stare dentro il file.",
    );
  }

  if (c.modello) {
    const quando = c.modello.descrizione.trim() ? ` Quando usarlo, secondo l'agenzia: ${c.modello.descrizione.trim()}` : '';
    const marchio = marchioDelModello
      ? " Logo, intestazione e piè di pagina del modello sono quelli da tenere, anche se nominano un altro ente: l'agenzia l'ha scelto per questo."
      : c.cartaAgenzia
        ? " La sua carta intestata no: il marchio è quello dell'agenzia, in `/lavoro/carta/`."
        : '';
    parti.push(`
## Modello di riferimento
«${c.modello.nome}» (${c.modello.formato.toUpperCase()}), in \`${c.modello.path}\`.${quando}${marchio}`);
  }

  return parti.join('\n');
}

/**
 * Il prompt utente: la richiesta così com'è arrivata, e il materiale di
 * partenza senza istruzioni su come trattarlo (il 21/09/2026 un «senza
 * perdere dati né fonti» qui faceva di ogni volantino una scheda tecnica).
 * Dalla chat arrivano anche le parole dell'utente, tali e quali: la
 * richiesta la scrive il motore della chat, e un passaggio di mano perde
 * l'intenzione.
 */
export function promptRichiesta(r: {
  titolo?: string;
  contenuto?: string;
  istruzioni?: string;
  formato: string;
  paroleUtente?: string;
}): string {
  const parti: string[] = [];
  parti.push(`File da produrre: ${r.formato.toUpperCase()}.`);
  if (r.titolo) parti.push(`Titolo: «${r.titolo}».`);
  if (r.paroleUtente?.trim()) parti.push(`\nL'utente ha scritto in chat: «${r.paroleUtente.trim()}»`);
  if (r.istruzioni?.trim()) parti.push(`\nRichiesta:\n${r.istruzioni.trim()}`);
  if (r.contenuto?.trim()) parti.push(`\nMateriale di partenza:\n\n${r.contenuto.trim()}`);
  return parti.join('\n');
}
