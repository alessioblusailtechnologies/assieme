/**
 * I giri di controllo di un documento, contati e fermati (21/09/2026).
 *
 * Il prompt chiede di guardare il risultato e correggere, «di solito
 * bastano due giri; non superare quattro». Era solo un consiglio: su un
 * volantino denso il modello ha rigenerato e riguardato le pagine una
 * dozzina di volte per farlo stare in due pagine, dieci minuti di lavoro.
 * Qui il limite diventa vero: un giro comincia ogni volta che il documento
 * si rende in immagini (pdftoppm, lo screenshot di Chromium) dopo essere
 * stato toccato. Rendere altre pagine dello stesso file, senza averlo
 * cambiato, è lo stesso giro. Oltre il massimo il render si rifiuta, e il
 * modello consegna quello che ha.
 */

/** I comandi che rendono il documento in immagini da guardare. */
const RENDER = /\bpdftoppm\b|--screenshot\b/;
/** Ciò che, nello stesso comando del render, vuol dire che il documento è stato rifatto. */
const GENERA = /--print-to-pdf|\bsoffice\b|\blibreoffice\b|\bpython3?\b|\bnode\b|\bsed\b|\bperl\b|\bcp\b|\bmv\b/;
/** I comandi che guardano e basta: non cambiano il documento. */
const SOLO_LETTURA = /^\s*(ls|cat|head|tail|wc|file|stat|du|pdfinfo|pdffonts|pdftotext|pdfimages|identify|echo|pwd|find|grep|fc-list)\b/;

/**
 * Un contatore per sessione. `valuta` si chiama prima di ogni strumento:
 * restituisce il motivo del rifiuto, o `undefined` se lo strumento passa.
 * `massimo` è il numero di giri concessi: il primo controllo più le
 * correzioni (cinque = uno più le quattro del prompt).
 */
export function contaGiri(massimo) {
  let giri = 0;
  let toccato = true;
  return {
    valuta(strumento, input) {
      if (strumento === 'Write' || strumento === 'Edit') {
        toccato = true;
        return undefined;
      }
      if (strumento !== 'Bash') return undefined;
      const comando = String(input?.command ?? '');
      if (!RENDER.test(comando)) {
        /* «cd /lavoro && ls» guarda e basta come «ls». */
        if (!SOLO_LETTURA.test(comando.replace(/^\s*cd\s+\S+\s*&&\s*/, ''))) toccato = true;
        return undefined;
      }
      if (GENERA.test(comando)) toccato = true;
      if (!toccato) return undefined;
      if (giri >= massimo) {
        return (
          `Hai già controllato il documento ${massimo} ${massimo === 1 ? 'volta' : 'volte'}: basta così, VELIA non ne concede altre. ` +
          'Consegna il file com’è con `consegna` e, nel messaggio finale, di’ in una riga cosa andrebbe ritoccato a mano.'
        );
      }
      giri += 1;
      toccato = false;
      return undefined;
    },
    get giri() {
      return giri;
    },
  };
}
