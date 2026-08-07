import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { configurazione } from '../config.js';

let istanza: SupabaseClient | undefined;

/**
 * Il client Supabase di servizio: Storage e Admin API. Scavalca la RLS —
 * lo usano solo l'API server (per servire file già autorizzati dal
 * catalogo) e gli strumenti di sistema, mai codice che agisce per conto
 * dell'utente senza prima essere passato dal catalogo.
 */
export function clientServizio(): SupabaseClient {
  if (!istanza) {
    const config = configurazione();
    istanza = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return istanza;
}

/** Il bucket dell'archivio documentale: PDF originali e Markdown del motore. */
export const BUCKET_ARCHIVIO = 'archivio';
