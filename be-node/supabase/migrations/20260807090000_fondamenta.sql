-- Fase 0 — Fondamenta: tenant, utenti, tassonomie, RLS.
--
-- Convenzioni (ASSIEME-piano-sviluppo-be.md §5):
--  - nomi italiani per il dominio, inglesi per i tecnicismi;
--  - tutte le tabelle di tenant portano tenant_id + policy RLS;
--  - nessuna policy di scrittura per il client dove scrive solo il sistema:
--    la service role scavalca la RLS per costruzione.

-- Schema di appoggio per le funzioni di piattaforma (non esposto via API).
create schema if not exists assieme;

-- ---------------------------------------------------------------------------
-- updated_at automatico
-- ---------------------------------------------------------------------------

create or replace function assieme.tocca_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Identità dal JWT
-- ---------------------------------------------------------------------------
-- Il tenant e il ruolo viaggiano in app_metadata del JWT di Supabase Auth
-- (mai modificabili dall'utente). Queste due funzioni sono l'unico punto
-- in cui le policy leggono il token.

create or replace function assieme.tenant_corrente()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid;
$$;

create or replace function assieme.ruolo_corrente()
returns text
language sql
stable
as $$
  select auth.jwt() -> 'app_metadata' ->> 'ruolo';
$$;

-- ---------------------------------------------------------------------------
-- Tenant e utenti
-- ---------------------------------------------------------------------------

create table public.tenant (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  piano text not null default 'agenzia',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tenant_updated_at
  before update on public.tenant
  for each row execute function assieme.tocca_updated_at();

-- Profilo applicativo: estende auth.users (contratto Fase 5 FE: l'invito
-- nasce 'invitato' e diventa attivo al primo accesso; mai eliminazione,
-- si sospende).
create table public.utenti (
  id uuid primary key references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  nome text not null,
  cognome text not null,
  email text not null unique,
  ruolo text not null default 'operatore'
    check (ruolo in ('operatore', 'amministratore')),
  stato text not null default 'invitato'
    check (stato in ('invitato', 'attivo', 'sospeso')),
  ultimo_accesso timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index utenti_tenant on public.utenti (tenant_id);

create trigger utenti_updated_at
  before update on public.utenti
  for each row execute function assieme.tocca_updated_at();

-- ---------------------------------------------------------------------------
-- Tassonomie dell'Archivio Pubblico (globali, uguali per tutti i tenant)
-- ---------------------------------------------------------------------------
-- Id testuali stabili ('cmp-generali', 'ram-auto'): sono già il contratto
-- delle fixture e delle URL del FE.

create table public.compagnie (
  id text primary key,
  nome text not null,
  ultimo_aggiornamento date,          -- RF-A-07
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger compagnie_updated_at
  before update on public.compagnie
  for each row execute function assieme.tocca_updated_at();

create table public.rami (
  id text primary key,
  nome text not null,
  codice text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger rami_updated_at
  before update on public.rami
  for each row execute function assieme.tocca_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — RF-B-01 applicato dal database
-- ---------------------------------------------------------------------------

alter table public.tenant enable row level security;
alter table public.utenti enable row level security;
alter table public.compagnie enable row level security;
alter table public.rami enable row level security;

-- Un utente vede solo il proprio tenant…
create policy tenant_lettura on public.tenant
  for select to authenticated
  using (id = assieme.tenant_corrente());

-- …e solo i colleghi del proprio tenant.
create policy utenti_lettura on public.utenti
  for select to authenticated
  using (tenant_id = assieme.tenant_corrente());

-- Le tassonomie sono in sola lettura per tutti gli autenticati (RF-A-05);
-- scrive solo il gestore piattaforma via service role.
create policy compagnie_lettura on public.compagnie
  for select to authenticated
  using (true);

create policy rami_lettura on public.rami
  for select to authenticated
  using (true);

-- Nessuna policy insert/update/delete per authenticated: la gestione di
-- tenant e utenti passa dall'API con privilegi di sistema (Fase 6), e il
-- database rifiuta qualunque scrittura diretta del client.
