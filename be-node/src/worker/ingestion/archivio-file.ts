import { BUCKET_ARCHIVIO, clientServizio } from '../../db/supabase.js';

/**
 * I file dell'archivio, visti dal worker: scaricare l'originale, caricare
 * il convertito. Interfaccia minima perché nei test sia una mappa in
 * memoria — la pipeline si prova senza Storage e senza rete.
 */
export interface ArchivioFile {
  scarica(percorso: string): Promise<Buffer>;
  carica(percorso: string, contenuto: Buffer, contentType: string): Promise<void>;
  /**
   * RNF-03: la cancellazione è effettiva. Rimuove i percorsi indicati;
   * un percorso che non esiste non è un errore (idempotente).
   */
  elimina(percorsi: string[]): Promise<void>;
}

export class ArchivioStorage implements ArchivioFile {
  async scarica(percorso: string): Promise<Buffer> {
    const { data, error } = await clientServizio().storage.from(BUCKET_ARCHIVIO).download(percorso);
    if (error || !data) throw new Error(`scaricamento fallito (${percorso}): ${error?.message}`);
    return Buffer.from(await data.arrayBuffer());
  }

  async carica(percorso: string, contenuto: Buffer, contentType: string): Promise<void> {
    const { error } = await clientServizio()
      .storage.from(BUCKET_ARCHIVIO)
      .upload(percorso, contenuto, { contentType, upsert: true });
    if (error) throw new Error(`caricamento fallito (${percorso}): ${error.message}`);
  }

  async elimina(percorsi: string[]): Promise<void> {
    if (!percorsi.length) return;
    const { error } = await clientServizio().storage.from(BUCKET_ARCHIVIO).remove(percorsi);
    if (error) throw new Error(`rimozione fallita (${percorsi.join(', ')}): ${error.message}`);
  }
}
