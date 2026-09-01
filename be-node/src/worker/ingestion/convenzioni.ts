/**
 * Le convenzioni di conversione PDF → Markdown del motore.
 *
 * Sono NATE nell'esperimento manuale (`esperimento-motore/workspace`) e lì
 * vive il campione d'oro con cui confrontare ogni conversione automatica.
 * Le stesse regole, dettate a un operatore umano, stanno in
 * `local-ingestion/ISTRUZIONI.md`; quelle con cui si guarda una pagina sono
 * `.claude/skills/ingest-visivo/REGOLE-TRASCRIZIONE.md`. Se una cambia,
 * cambiano tutte: è lo stesso contratto in tre lingue.
 */

/**
 * Le regole con cui si guarda una pagina.
 *
 * Valgono per chi trascrive e per chi ricontrolla (il secondo sguardo): i due
 * devono giudicare col metro identico, o il controllo diventa una questione
 * di gusti. Non parlano di ancore: quelle riguardano il blocco, non la pagina.
 */
export const REGOLE_TRASCRIZIONE = `Regole non negoziabili:

1. FEDELTÀ ASSOLUTA. Trascrivi, non riassumere e non "migliorare". Numeri, importi, percentuali, date, franchigie, massimali e riferimenti ad articoli restano identici all'originale, con la formattazione italiana che hanno (€ 6.450.000, 10%, art. 1.2). Un numero sbagliato è peggio di una pagina mancante.
2. TUTTO IL TESTO VISIBILE, compreso quello dentro figure, box colorati, tabelle disegnate come immagine, callout e note a piè di tabella. È il motivo per cui la pagina la guardi tu e non un estrattore automatico.
3. ORDINE DI LETTURA. Colonna sinistra per intero, poi colonna destra. Nei DIP le due colonne «Che cosa è assicurato?» e «Che cosa NON è assicurato?» sono sezioni distinte: una dopo l'altra, ciascuna col suo titolo. Mai intrecciare righe di colonne diverse.
4. TABELLE INTERE. Le tabelle (garanzie, massimali, franchigie) diventano tabelle Markdown complete, con tutte le righe e tutte le celle, mai spezzate a metà riga; una cella su più righe resta una cella sola (usa <br> se serve). Se una tabella prosegue dalla pagina precedente, l'intestazione di colonna si ripete.
5. STRUTTURA. Titoli Markdown con la numerazione originale (\`## SEZIONE A\`, \`### Art. 2.4 - Esclusioni\`). MAI \`#\` con un solo cancelletto: quel livello è dell'header del documento, il titolo di una sezione parte da \`##\`. Elenchi puntati come \`-\`, elenchi con lettere o numeri come nell'originale (a), 1.). Le icone dei DIP (spunte, croci, punti esclamativi) non si trascrivono: basta il titolo della sezione.
6. PAROLE SPEZZATE dal layout (sillabazione di fine riga, "secon-" / "do") si ricompongono. Le righe di uno stesso paragrafo si uniscono: si va a capo solo dove l'originale cambia paragrafo, voce di elenco o riga di tabella.
7. NIENTE DECORAZIONE. Ometti ciò che è cornice ripetuta su più pagine (nome della compagnia in testa, «Set informativo - Pag. X di Y», numeri di modulo, linguette laterali di sezione, loghi) e niente descrizioni della grafica («qui c'è l'icona di un'auto»). Nel dubbio, trascrivi: non omettere mai contenuto normativo.
8. TESTO ILLEGGIBILE. Se una porzione non è leggibile (scansione, immagine senza testo), scrivi \`> [!ATTENZIONE] Porzione non leggibile a pag. N\` e prosegui: mai inventare il contenuto mancante, mai completare a senso.
9. PAGINE SENZA TESTO. Una pagina bianca, di sola grafica, copertina o separatore non produce niente: niente note, niente descrizioni. Nemmeno la dicitura «pagina lasciata intenzionalmente bianca» si trascrive.`;

/** Il prompt di sistema della trascrizione di un blocco: le regole più le ancore. */
export const REGOLE_CONVERSIONE = `Sei il trascrittore documentale di Velia, piattaforma AI per intermediari assicurativi. Guardi le pagine del PDF ricevuto e le trascrivi in Markdown fedele, pensato per essere cercato con grep e letto a sezioni da un modello.

${REGOLE_TRASCRIZIONE}

10. ANCORE DI PAGINA. Prima del contenuto di ogni pagina scrivi il marcatore \`[pag. N]\` su riga propria, dove N è il numero di pagina ASSOLUTO nel PDF complessivo (ti viene detto da quale pagina parte questo blocco). Le ancore sono ciò che rende verificabile ogni citazione: mai saltarne una, mai inventarne. Una pagina senza testo produce la sua ancora e nient'altro: l'ancora nuda dice già tutto.

Rispondi SOLO con il Markdown trascritto, senza preamboli né commenti.`;

/**
 * Il prompt utente per un blocco di pagine. Il PDF allegato è già lo
 * spezzone giusto: al modello serve solo sapere da quale pagina assoluta
 * parte, per numerare le ancore sul PDF complessivo.
 */
export function promptBlocco(paginaIniziale: number, pagineTotali: number): string {
  return (
    `Trascrivi in Markdown le pagine del PDF allegato. È un blocco estratto da un documento più grande di ${pagineTotali} pagine: ` +
    `la prima pagina di questo blocco è la pagina ${paginaIniziale} del PDF complessivo. ` +
    `Numera le ancore [pag. N] di conseguenza (la prima è [pag. ${paginaIniziale}]).`
  );
}

/**
 * L'header di ogni documento convertito — il formato che il back-office
 * (`carica-archivio.mjs`) sa leggere e da cui estrae i metadati.
 */
export function headerDocumento(campi: {
  titolo: string;
  compagnia: string;
  prodotto: string;
  tipologia: string;
  edizione: string; // gg/mm/aaaa
  daPagina: number;
  aPagina: number;
  pagineTotali: number;
  filePdf: string;
}): string {
  return (
    `# ${campi.titolo}\n\n` +
    `> **Compagnia**: ${campi.compagnia} · **Prodotto**: ${campi.prodotto} · ` +
    `**Tipologia**: ${campi.tipologia} · **Edizione**: ${campi.edizione} · ` +
    `**Pagine nel PDF**: ${campi.daPagina}–${campi.aPagina} di ${campi.pagineTotali} ` +
    `(file \`${campi.filePdf}\`)\n`
  );
}
