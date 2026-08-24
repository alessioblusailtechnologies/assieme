-- Fase 3, coda — i suggerimenti della schermata iniziale.
--
-- A fine risposta il worker genera le domande che avrebbero senso come
-- passo successivo (Haiku, su domanda e risposta) e le conserva qui, per
-- utente: la home le propone al posto delle domande d'esempio. Scrive solo
-- il worker (connessione di sistema); l'utente legge i propri.

create table velia.suggerimenti (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references velia.tenant (id) on delete cascade,
  utente_id uuid not null references velia.utenti (id) on delete cascade,
  testo text not null check (char_length(testo) between 1 and 300),
  conversazione_id uuid references velia.conversazioni (id) on delete set null,
  created_at timestamptz not null default now()
);

create index suggerimenti_per_utente on velia.suggerimenti (utente_id, created_at desc);

alter table velia.suggerimenti enable row level security;

create policy suggerimenti_lettura on velia.suggerimenti
  for select to authenticated
  using (tenant_id = velia.tenant_corrente() and utente_id = (select auth.uid()));

alter table velia.suggerimenti owner to velia_app;
