-- Fase 1 — RF-A-08: segnalazioni sull'Archivio Pubblico.
--
-- Chi usa l'archivio tutti i giorni è il primo ad accorgersi di un set
-- mancante, di un'edizione superata o di un errore: la segnalazione è la
-- riga con cui lo dice al gestore della piattaforma. La leggerà il
-- back-office con la connessione di sistema; l'utente scrive la propria
-- (la RLS lo pretende) e vede quelle della sua agenzia.

create table velia.segnalazioni (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references velia.tenant (id) on delete cascade,
  utente_id uuid not null references velia.utenti (id) on delete cascade,
  -- Nullo per «manca un documento»: non c'è la riga da indicare. Se il
  -- documento segnalato viene poi ritirato, la segnalazione resta.
  documento_id text references velia.documenti (id) on delete set null,
  tipo text not null check (tipo in ('mancante', 'obsoleto', 'errato')),
  messaggio text not null check (char_length(messaggio) between 1 and 2000),
  creata_il timestamptz not null default now()
);

create index segnalazioni_tenant on velia.segnalazioni (tenant_id);

alter table velia.segnalazioni enable row level security;

create policy segnalazioni_scrittura on velia.segnalazioni
  for insert to authenticated
  with check (
    tenant_id = velia.tenant_corrente()
    and utente_id = (select auth.uid())
  );

create policy segnalazioni_lettura on velia.segnalazioni
  for select to authenticated
  using (tenant_id = velia.tenant_corrente());

-- Il proprietario delle tabelle Velia è il ruolo dell'applicazione
-- (decisione di Fase 0: ogni migrazione che crea tabelle chiude così).
alter table velia.segnalazioni owner to velia_app;
