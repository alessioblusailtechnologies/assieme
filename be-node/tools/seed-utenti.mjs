/**
 * Crea gli utenti demo (fixture `mocks/data/utenti.json`) su Supabase Auth
 * e le righe di profilo in `public.utenti`. Idempotente: al secondo giro
 * aggiorna invece di duplicare.
 *
 * Richiede .env compilato (service role). Password demo uguale per tutti,
 * stampata in fondo — SOLO per l'ambiente di sviluppo.
 *
 *   node tools/seed-utenti.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

const QUI = dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(join(QUI, '..', '.env'));
} catch {
  /* variabili già nell'ambiente */
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Servono SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (vedi .env.example).');
  process.exit(1);
}

const TENANT_DEMO = '11111111-1111-4111-8111-111111111111';
const PASSWORD_DEMO = 'assieme-demo-2026!';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const utenti = JSON.parse(
  readFileSync(join(QUI, '..', '..', 'mocks', 'data', 'utenti.json'), 'utf8'),
);

for (const u of utenti) {
  const metadata = { tenant_id: TENANT_DEMO, ruolo: u.ruolo };

  // Cerca per email: la Admin API non ha una get-by-email, ma la lista
  // filtrata basta per una manciata di utenti demo.
  const { data: esistenti, error: erroreLista } = await supabase.auth.admin.listUsers();
  if (erroreLista) throw erroreLista;
  const esistente = esistenti.users.find((x) => x.email === u.email);

  let id;
  if (esistente) {
    id = esistente.id;
    const { error } = await supabase.auth.admin.updateUserById(id, {
      app_metadata: metadata,
      password: PASSWORD_DEMO,
    });
    if (error) throw error;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: PASSWORD_DEMO,
      email_confirm: true,
      app_metadata: metadata,
    });
    if (error) throw error;
    id = data.user.id;
  }

  const { error: erroreProfilo } = await supabase.from('utenti').upsert({
    id,
    tenant_id: TENANT_DEMO,
    nome: u.nome,
    cognome: u.cognome,
    email: u.email,
    ruolo: u.ruolo,
    stato: u.stato ?? 'attivo',
    ultimo_accesso: u.ultimoAccesso ?? null,
  });
  if (erroreProfilo) throw erroreProfilo;

  console.log(`✓ ${u.email} (${u.ruolo})`);
}

console.log(`\nFatto. Password demo per tutti: ${PASSWORD_DEMO}`);
