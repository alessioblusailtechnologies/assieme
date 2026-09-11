/**
 * Una pagina web qualsiasi → Markdown (11/09/2026, fase 3 di
 * `PIANO-LINK-E-FORMATI.md`): i titoli, i paragrafi, gli elenchi e le celle
 * delle tabelle, senza script, stili e tutto ciò che non si legge. Serve ai
 * file HTML caricati e al corpo delle email che hanno solo HTML.
 *
 * Non è `markdownDaHtml` di `estrattori.ts`, che conosce solo il dialetto
 * ordinato di mammoth: una pagina vera ha attributi, `div` annidati e
 * commenti, e qui basta non perdere il testo.
 */
export function markdownDaPaginaWeb(html: string): string {
  const testo = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|template|svg|head|iframe|object)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<h([1-6])\b[^>]*>/gi, (_, n: string) => `\n\n${'#'.repeat(Number(n))} `)
    .replace(/<\/h[1-6]\s*>/gi, '\n\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(td|th)\s*>/gi, ' | ')
    .replace(
      /<\/?(p|div|section|article|header|footer|main|aside|nav|ul|ol|table|thead|tbody|tr|blockquote|pre|dl|dt|dd|figure|figcaption|form|fieldset|details|summary|address|hr)\b[^>]*>/gi,
      '\n',
    )
    .replace(/<[^>]+>/g, '');
  return decodificaEntita(testo)
    .split('\n')
    .map((r) => r.replace(/[ \t\u00a0]+/g, ' ').replace(/\s*\|\s*$/, '').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const ENTITA: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", laquo: '«', raquo: '»', euro: '€', copy: '©',
  reg: '®', deg: '°', hellip: '…', ndash: '-', mdash: '-', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  agrave: 'à', egrave: 'è', eacute: 'é', igrave: 'ì', ograve: 'ò', ugrave: 'ù', Agrave: 'À', Egrave: 'È',
  Eacute: 'É', Igrave: 'Ì', Ograve: 'Ò', Ugrave: 'Ù', middot: '·', bull: '•', times: '×', ordm: 'º', ordf: 'ª',
};

/** Le entità HTML: quelle nominate che si incontrano in italiano, e tutte le numeriche. */
export function decodificaEntita(testo: string): string {
  return testo.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (tutta, e: string) => {
    if (e[0] === '#') {
      const codice = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(codice) && codice > 0 && codice < 0x110000 ? String.fromCodePoint(codice) : tutta;
    }
    return ENTITA[e] ?? tutta;
  });
}
