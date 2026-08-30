# Regole di trascrizione di una pagina (skill /ingest-visivo)

Stai trascrivendo, una pagina alla volta, un set informativo assicurativo
per l'archivio di VELIA. Il motore citerà queste righe con la pagina
accanto: ciò che scrivi deve essere **quello che c'è sulla pagina, tutto
e solo quello**. Guardi la pagina con `Read` (parametro `pages`) e scrivi
un file per pagina, `pag-NNNN.md` (quattro cifre, numero **assoluto** nel
PDF), subito dopo averla letta, prima di passare alla successiva.

## Cosa scrivere

1. **Fedeltà assoluta.** Trascrivi, non riassumere e non "migliorare".
   Numeri, importi, percentuali, date, riferimenti ad articoli e commi:
   identici all'originale, con la formattazione italiana dell'originale
   (`€ 6.450.000`, `10%`, `art. 1.2`). Un numero sbagliato è peggio di una
   pagina mancante.
2. **Tutto il testo visibile**, incluso quello dentro figure, box
   colorati, tabelle disegnate come immagine, callout, note a piè di
   tabella. È il motivo per cui la pagina la guardi tu e non una macchina.
3. **Ordine di lettura.** Colonna sinistra per intero, poi colonna destra.
   Nei DIP le due colonne «Che cosa è assicurato? / Che cosa NON è
   assicurato?» sono sezioni distinte: una dopo l'altra, ciascuna col suo
   titolo. Mai intrecciare righe di colonne diverse.
4. **Tabelle intere** in Markdown (`| a | b |`), con tutte le righe e tutte
   le celle. Una cella con più righe di testo va in una cella sola
   (usa `<br>` fra le righe se serve). Se la tabella continua dalla pagina
   precedente, ripeti l'intestazione in testa.
5. **Struttura.** Titoli Markdown con la numerazione originale
   (`## SEZIONE A`, `### Art. 2.4 - Esclusioni`); sottotitoli in grassetto
   dell'originale come `####` o `**grassetto**` a seconda del peso.
   **Mai `#` (un solo cancelletto)**: quel livello è riservato all'header
   del documento che l'assemblatore mette in testa; il titolo di una
   pagina, di un documento o di una sezione parte da `##`.
   Elenchi puntati come `-`, elenchi con lettere o numeri come
   nell'originale (`a)`, `1.`). Le icone dei DIP (spunte, croci, punti
   esclamativi) non si trascrivono: basta il titolo della sezione.
6. **Parole spezzate** dal layout (sillabazione di fine riga, `secon-` /
   `do`) si ricompongono. Le righe di un paragrafo si uniscono in un
   paragrafo solo: a capo solo dove l'originale cambia paragrafo, voce di
   elenco o riga di tabella.

## Cosa NON scrivere

7. **Intestazioni e piè di pagina ripetuti**: nome della compagnia in
   testa a ogni pagina, «Set informativo - ... - Pag. X di Y», il numero di
   pagina, le linguette laterali che ripetono il nome della sezione, i
   loghi. Ometti solo ciò che è chiaramente un elemento di cornice che
   torna identico su più pagine; nel dubbio, trascrivi.
8. **Niente ancore `[pag. N]`**, niente commenti, niente descrizioni della
   grafica («qui c'è un'icona di un'auto»), niente note tue. Il file
   contiene solo il testo della pagina.
9. **Pagina senza testo** (bianca, sola grafica, «pagina lasciata
   intenzionalmente bianca»): scrivi un file **vuoto**. La dicitura
   «pagina lasciata intenzionalmente bianca» non si trascrive.
10. **Illeggibile.** Se una porzione non si legge, scrivi sulla riga
    `> [!ATTENZIONE] Porzione non leggibile a pag. N` (con N il numero
    della pagina) e vai avanti. **Mai inventare**, mai completare a senso.

## Come chiudere

Alla fine del tuo blocco riferisci in poche righe: pagine scritte, pagine
vuote, pagine con `[!ATTENZIONE]`, tabelle che continuano oltre l'ultima
pagina del blocco (così chi assembla lo sa). Niente altro.
