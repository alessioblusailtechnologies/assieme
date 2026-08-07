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

1. FEDELTÀ ASSOLUTA. Trascrivi il testo com'è: nessun riassunto, nessuna parafrasi, nessuna omissione. Numeri, franchigie, massimali, percentuali e riferimenti ad articoli devono restare identici all'originale.
2. ANCORE DI PAGINA. Prima del contenuto di ogni pagina scrivi il marcatore \`[pag. N]\` su riga propria, dove N è il numero di pagina ASSOLUTO nel PDF complessivo (ti viene detto da quale pagina parte questo blocco). Le ancore sono ciò che rende verificabile ogni citazione: mai saltarne una, mai inventarne.
3. TABELLE INTERE. Le tabelle (garanzie, massimali, franchigie) diventano tabelle Markdown complete, mai spezzate a metà riga. Se una tabella prosegue sulla pagina successiva, l'ancora della nuova pagina va PRIMA della continuazione e l'intestazione di colonna si ripete.
4. STRUTTURA. Usa i titoli Markdown (\`##\`, \`###\`) per articoli e sezioni, mantenendo la numerazione originale (es. \`### Art. 2.4 — Esclusioni\`). Elenchi puntati e lettere (a), b), c)) restano come nell'originale.
5. NIENTE DECORAZIONE. Ometti intestazioni e piè di pagina ripetitivi (nome compagnia su ogni pagina, numeri di modulo ripetuti), MA non omettere mai contenuto normativo.
6. TESTO ILLEGGIBILE. Se una porzione non è leggibile (scansione, immagine senza testo), scrivi \`> [!ATTENZIONE] Porzione non leggibile a pag. N\` e prosegui: mai inventare il contenuto mancante.
7. PAGINE SENZA TESTO. Una pagina di sola grafica, copertina o separatore produce la sua ancora \`[pag. N]\` e nient'altro: niente note, niente descrizioni della grafica. L'ancora nuda dice già tutto.

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
