/**
 * Resa del testo delle risposte.
 *
 * Le risposte dell'assistente usano un markdown minimo: paragrafi, grassetto,
 * codice in linea. La resa è fatta a mano invece che con una libreria per due
 * ragioni che qui pesano: il vocabolario è chiuso (il backend genera testo,
 * non documenti arbitrari — non servono tabelle, immagini o HTML passante), e
 * l'output prodotto usa solo `<p>`, `<strong>`, `<code>` e `<br>` — elementi
 * che il sanitizer di Angular lascia passare, quindi il binding a
 * `[innerHTML]` resta sotto la sua protezione senza `bypassSecurityTrust`.
 *
 * Se il vocabolario del backend crescerà, questo file è il punto in cui la
 * scelta si rivede — non il posto dove aggiungere un parser generico.
 */

const SOSTITUZIONI: [RegExp, string][] = [
  [/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'],
  [/`([^`]+)`/g, '<code>$1</code>'],
];

function scappaHtml(testo: string): string {
  return testo.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** Da testo con markdown minimo a HTML per `[innerHTML]`. */
export function htmlRisposta(testo: string): string {
  return testo
    .split(/\n{2,}/)
    .map((paragrafo) => paragrafo.trim())
    .filter(Boolean)
    .map((paragrafo) => {
      let resa = scappaHtml(paragrafo);
      for (const [schema, con] of SOSTITUZIONI) resa = resa.replace(schema, con);
      return `<p>${resa.replaceAll('\n', '<br>')}</p>`;
    })
    .join('');
}
