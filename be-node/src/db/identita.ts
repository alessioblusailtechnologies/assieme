import type pg from 'pg';

/** L'identità applicativa estratta dal JWT (plugin auth). */
export interface Identita {
  utenteId: string;
  tenantId: string;
  ruolo: 'operatore' | 'amministratore';
}

/**
 * Esegue `fn` dentro una transazione **con l'identità dell'utente**: il ruolo
 * di sessione diventa `authenticated` e i claim JWT vengono messi dove
 * `auth.jwt()` li legge. Da qui in poi ogni query è filtrata dalla RLS: un
 * bug nel codice diventa "nessuna riga", mai "le righe di un altro tenant".
 *
 * È lo stesso meccanismo con cui PostgREST applica la RLS; `set local` muore
 * con la transazione, quindi la connessione torna pulita al pool.
 *
 * Il worker NON passa da qui: usa la connessione di sistema (proprietaria
 * delle tabelle) su job già autorizzati — «il worker è l'unico scrivano».
 */
export async function conIdentita<T>(
  pool: pg.Pool,
  identita: Identita,
  fn: (client: pg.ClientBase) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const claims = JSON.stringify({
      sub: identita.utenteId,
      role: 'authenticated',
      app_metadata: { tenant_id: identita.tenantId, ruolo: identita.ruolo },
    });
    await client.query("select set_config('request.jwt.claims', $1, true)", [claims]);
    await client.query('set local role authenticated');
    const risultato = await fn(client);
    await client.query('commit');
    return risultato;
  } catch (errore) {
    await client.query('rollback').catch(() => undefined);
    throw errore;
  } finally {
    client.release();
  }
}
