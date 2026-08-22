/**
 * Resa del testo delle risposte.
 *
 * Il motore (Fase 3 BE) scrive Markdown vero: titoli, tabelle di confronto,
 * elenchi, citazioni in blocco, corsivo per le fonti *(Titolo, pag. N)*. La
 * resa resta fatta a mano, per le stesse ragioni di prima: il vocabolario è
 * chiuso — si rendono i costrutti che il motore usa davvero, niente link,
 * immagini o HTML passante — e l'output usa solo elementi che il sanitizer
 * di Angular lascia passare (`p`, `h3`-`h5`, `ul`/`ol`/`li`, `table`,
 * `blockquote`, `hr`, `strong`, `em`, `code`, `br`, `div`), quindi il
 * binding a `[innerHTML]` resta sotto la sua protezione senza
 * `bypassSecurityTrust`. Tutto il testo passa da `scappaHtml` prima di
 * qualunque sostituzione: ciò che arriva dal server esce come testo.
 *
 * Durante lo streaming il testo cresce a pezzi: ogni blocco si rende con
 * quello che c'è (una tabella a metà è una tabella con meno righe).
 */

const RIGA_TITOLO = /^(#{1,6})\s+(.+?)\s*#*$/;
const RIGA_ELENCO = /^\s*(?:[-*•]|\d+[.)])\s+/;
const RIGA_ELENCO_NUMERATO = /^\s*\d+[.)]\s+/;
const RIGA_CITAZIONE = /^\s*>\s?/;
const RIGA_TABELLA = /^\s*\|/;
const RIGA_SEPARATORE_TABELLA = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const RIGA_ORIZZONTALE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;

function scappaHtml(testo: string): string {
  return testo.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** Grassetto, corsivo, codice in linea — sul testo già scappato. */
function inlinea(testo: string): string {
  return scappaHtml(testo)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
    // Corsivo: asterischi aderenti al testo, così «2 * 3 * 4» resta aritmetica.
    .replace(/(^|[^*\w])\*(\S(?:[^*\n]*?\S)?)\*(?!\*)/g, '$1<em>$2</em>');
}

/** Le celle di una riga di tabella, senza i pipe ai bordi. */
function celle(riga: string): string[] {
  const pulita = riga.trim().replace(/^\|/, '').replace(/\|$/, '');
  return pulita.split('|').map((c) => c.trim());
}

function iniziaBlocco(riga: string): boolean {
  return (
    RIGA_TITOLO.test(riga) ||
    RIGA_ELENCO.test(riga) ||
    RIGA_CITAZIONE.test(riga) ||
    RIGA_TABELLA.test(riga) ||
    RIGA_ORIZZONTALE.test(riga)
  );
}

/** Da Markdown a HTML per `[innerHTML]`. */
export function htmlRisposta(testo: string): string {
  const righe = testo.replaceAll('\r\n', '\n').split('\n');
  const uscita: string[] = [];
  let i = 0;

  while (i < righe.length) {
    const riga = righe[i]!;
    if (!riga.trim()) {
      i++;
      continue;
    }

    const titolo = RIGA_TITOLO.exec(riga);
    if (titolo) {
      // Dentro una bolla il titolo di primo livello è già un h3: la gerarchia resta.
      const livello = Math.min(2 + Math.max(titolo[1]!.length, 1), 5);
      uscita.push(`<h${livello}>${inlinea(titolo[2]!)}</h${livello}>`);
      i++;
      continue;
    }

    if (RIGA_ORIZZONTALE.test(riga)) {
      uscita.push('<hr>');
      i++;
      continue;
    }

    if (RIGA_TABELLA.test(riga)) {
      const blocco: string[] = [];
      while (i < righe.length && RIGA_TABELLA.test(righe[i]!)) blocco.push(righe[i++]!);
      const [testa, ...resto] = blocco;
      const corpo = resto.filter((r) => !RIGA_SEPARATORE_TABELLA.test(r));
      const intestazione = `<thead><tr>${celle(testa!).map((c) => `<th>${inlinea(c)}</th>`).join('')}</tr></thead>`;
      const righeCorpo = corpo
        .map((r) => `<tr>${celle(r).map((c) => `<td>${inlinea(c)}</td>`).join('')}</tr>`)
        .join('');
      uscita.push(`<div class="tabella"><table>${intestazione}${righeCorpo ? `<tbody>${righeCorpo}</tbody>` : ''}</table></div>`);
      continue;
    }

    if (RIGA_CITAZIONE.test(riga)) {
      const blocco: string[] = [];
      while (i < righe.length && RIGA_CITAZIONE.test(righe[i]!)) blocco.push(righe[i++]!.replace(RIGA_CITAZIONE, ''));
      uscita.push(`<blockquote><p>${blocco.map(inlinea).join('<br>')}</p></blockquote>`);
      continue;
    }

    if (RIGA_ELENCO.test(riga)) {
      const numerato = RIGA_ELENCO_NUMERATO.test(riga);
      const voci: string[] = [];
      while (i < righe.length && RIGA_ELENCO.test(righe[i]!) && RIGA_ELENCO_NUMERATO.test(righe[i]!) === numerato) {
        let voce = righe[i++]!.replace(RIGA_ELENCO, '');
        // Le righe rientrate che seguono appartengono alla stessa voce.
        while (i < righe.length && righe[i]!.trim() && /^\s{2,}/.test(righe[i]!) && !RIGA_ELENCO.test(righe[i]!)) {
          voce += ` ${righe[i++]!.trim()}`;
        }
        voci.push(`<li>${inlinea(voce)}</li>`);
      }
      uscita.push(`<${numerato ? 'ol' : 'ul'}>${voci.join('')}</${numerato ? 'ol' : 'ul'}>`);
      continue;
    }

    // Paragrafo: fino alla riga vuota o all'inizio di un altro blocco.
    const paragrafo: string[] = [riga];
    i++;
    while (i < righe.length && righe[i]!.trim() && !iniziaBlocco(righe[i]!)) paragrafo.push(righe[i++]!);
    uscita.push(`<p>${paragrafo.map((r) => inlinea(r.trim())).join('<br>')}</p>`);
  }

  return uscita.join('');
}
