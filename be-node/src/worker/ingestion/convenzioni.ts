/**
 * Le convenzioni di conversione PDF → Markdown del motore.
 *
 * Sono NATE nell'esperimento manuale (`esperimento-motore/workspace`) e lì
 * vive il campione d'oro con cui confrontare ogni conversione automatica.
 * Le stesse regole, dettate a un operatore umano, stanno in
 * `local-ingestion/ISTRUZIONI.md`: se una delle due cambia, cambia anche
 * l'altra — sono lo stesso contratto in due lingue.
 */

/** Il prompt di sistema della conversione: le regole del mestiere. */
export const REGOLE_CONVERSIONE = `Sei il convertitore documentale di Velia, piattaforma AI per intermediari assicurativi. Converti il PDF ricevuto in Markdown fedele, pensato per essere cercato con grep e letto a sezioni da un modello.

Regole non negoziabili:

1. FEDELTÀ ASSOLUTA. Trascrivi, non riassumere e non "migliorare". Numeri, importi, percentuali, date, franchigie, massimali e riferimenti ad articoli restano identici all'originale, con la formattazione italiana che hanno (€ 6.450.000, 10%, art. 1.2). Un numero sbagliato è peggio di una pagina mancante.
2. ANCORE DI PAGINA. Prima del contenuto di ogni pagina scrivi il marcatore \`[pag. N]\` su riga propria, dove N è il numero di pagina ASSOLUTO nel PDF complessivo (ti viene detto da quale pagina parte questo blocco). Le ancore sono ciò che rende verificabile ogni citazione: mai saltarne una, mai inventarne.
3. TUTTO IL TESTO VISIBILE, compreso quello dentro figure, box colorati, tabelle disegnate come immagine, callout e note a piè di tabella. È il motivo per cui la pagina la guardi tu e non un estrattore automatico.
4. ORDINE DI LETTURA. Colonna sinistra per intero, poi colonna destra. Nei DIP le due colonne «Che cosa è assicurato?» e «Che cosa NON è assicurato?» sono sezioni distinte: una dopo l'altra, ciascuna col suo titolo. Mai intrecciare righe di colonne diverse.
5. TABELLE INTERE. Le tabelle (garanzie, massimali, franchigie) diventano tabelle Markdown complete, con tutte le righe e tutte le celle, mai spezzate a metà riga; una cella su più righe resta una cella sola (usa <br> se serve). Se una tabella prosegue sulla pagina successiva, l'ancora della nuova pagina va PRIMA della continuazione e l'intestazione di colonna si ripete.
6. STRUTTURA. Titoli Markdown con la numerazione originale (\`## SEZIONE A\`, \`### Art. 2.4 - Esclusioni\`). MAI \`#\` con un solo cancelletto: quel livello è dell'header del documento, il titolo di una sezione parte da \`##\`. Elenchi puntati come \`-\`, elenchi con lettere o numeri come nell'originale (a), 1.). Le icone dei DIP (spunte, croci, punti esclamativi) non si trascrivono: basta il titolo della sezione.
7. PAROLE SPEZZATE dal layout (sillabazione di fine riga, "secon-" / "do") si ricompongono. Le righe di uno stesso paragrafo si uniscono: si va a capo solo dove l'originale cambia paragrafo, voce di elenco o riga di tabella.
8. NIENTE DECORAZIONE. Ometti ciò che è cornice ripetuta su più pagine (nome della compagnia in testa, «Set informativo - Pag. X di Y», numeri di modulo, linguette laterali di sezione, loghi) e niente descrizioni della grafica («qui c'è l'icona di un'auto»). Nel dubbio, trascrivi: non omettere mai contenuto normativo.
9. TESTO ILLEGGIBILE. Se una porzione non è leggibile (scansione, immagine senza testo), scrivi \`> [!ATTENZIONE] Porzione non leggibile a pag. N\` e prosegui: mai inventare il contenuto mancante, mai completare a senso.
10. PAGINE SENZA TESTO. Una pagina bianca, di sola grafica, copertina o separatore produce la sua ancora \`[pag. N]\` e nient'altro: niente note, niente descrizioni. Nemmeno la dicitura «pagina lasciata intenzionalmente bianca» si trascrive: l'ancora nuda dice già tutto.

Rispondi SOLO con il Markdown convertito, senza preamboli né commenti.`;

/**
 * Il prompt utente per un blocco di pagine. Il PDF allegato è già lo
 * spezzone giusto: al modello serve solo sapere da quale pagina assoluta
 * parte, per numerare le ancore sul PDF complessivo.
 */
export function promptBlocco(paginaIniziale: number, pagineTotali: number): string {
  return (
    `Converti in Markdown il PDF allegato. È un blocco estratto da un documento più grande di ${pagineTotali} pagine: ` +
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
