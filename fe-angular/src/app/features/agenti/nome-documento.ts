import { estensioneDelBlob } from '@shared/esportazione/scarica-blob';

/**
 * Il nome col quale si salva il documento generato da un'esecuzione: lo
 * stesso che sceglie il server nel `Content-Disposition` — slug dell'agente,
 * id dell'esecuzione, estensione del formato del template.
 *
 * Il nome si ricompone qui invece di leggerlo dall'intestazione perché in
 * produzione l'API sta su un'altra origine, e `Content-Disposition` senza
 * `Access-Control-Expose-Headers` al browser non arriva. Il tipo del blob
 * invece sì, ed è da quello che viene l'estensione.
 */
export function nomeDocumentoEsecuzione(
  nomeAgente: string | undefined,
  esecuzioneId: string,
  blob: Blob,
): string {
  const slug =
    (nomeAgente ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'agente';
  return `${slug}-${esecuzioneId}.${estensioneDelBlob(blob)}`;
}
