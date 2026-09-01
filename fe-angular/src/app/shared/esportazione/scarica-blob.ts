/**
 * Consegna al browser un file che è arrivato come blob.
 *
 * Perché non un semplice `<a href download>`: i file dell'applicazione stanno
 * dietro l'autenticazione, e un tag `<a>` il Bearer non lo manda. Vanno
 * chiesti con `HttpClient` — che attraversa gli interceptor — e consegnati
 * da qui. In produzione c'è anche il secondo motivo: l'app sta su un host e
 * l'API su un altro, e `download` su un indirizzo di un'altra origine il
 * browser lo ignora.
 */
export function scaricaBlob(blob: Blob, nomeFile: string): void {
  const url = URL.createObjectURL(blob);
  const collegamento = document.createElement('a');
  collegamento.href = url;
  collegamento.download = nomeFile;
  collegamento.click();
  URL.revokeObjectURL(url);
}

/** Le estensioni dei formati che il server genera. */
const ESTENSIONI: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
  'text/markdown': 'md',
};

/**
 * L'estensione del file dal tipo del blob: il formato lo sceglie il server
 * (il template dice se è un DOCX o un PDF), e il tipo è l'unica cosa che il
 * browser ci lascia leggere anche da un'altra origine — `Content-Disposition`
 * senza `Access-Control-Expose-Headers` non arriva.
 */
export function estensioneDelBlob(blob: Blob, predefinita = 'pdf'): string {
  return ESTENSIONI[blob.type.split(';')[0]!.trim()] ?? predefinita;
}
