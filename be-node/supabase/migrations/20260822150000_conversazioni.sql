-- Fase 3 — Motore agentico e chat (RF-C-01…C-09, RF-D-05/08/15, RF-G-04).
--
-- Le conversazioni e i loro messaggi, gli allegati di conversazione (righe
-- di `documenti` con archivio = 'conversazione', fuori dagli archivi), il
-- DNA d'Agenzia che il motore legge (istruzioni scritte e ricordi — le
-- tabelle nascono qui con la forma del mock, i pannelli di gestione arrivano
-- in Fase 6 e 8), e i due registri che ogni risposta alimenta dal primo
-- giorno: `audit_risposte` (RNF-07) e `consumi` (RF-B-08/E-09, il router
-- futuro).

-- ---------------------------------------------------------------------------
-- Conversazioni e messaggi
-- ---------------------------------------------------------------------------

create table velia.conversazioni (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references velia.tenant (id) on delete cascade,
  autore_id uuid not null references velia.utenti (id) on delete cascade,
  titolo text not null default 'Nuova conversazione',
  -- RF-C-15: condivisa con i colleghi del tenant.
  condivisa boolean not null default false,
  -- RF-C-03: il contesto documentale sono id di `documenti` (pubblici,
  -- privati, allegati). Idratato dall'API a ogni lettura: costa zero.
  documenti_in_contesto text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversazioni_tenant_recenti on velia.conversazioni (tenant_id, updated_at desc);

create trigger conversazioni_updated_at
  before update on velia.conversazioni
  for each row execute function velia.tocca_updated_at();

create table velia.messaggi (
  id uuid primary key default gen_random_uuid(),
  conversazione_id uuid not null references velia.conversazioni (id) on delete cascade,
  tenant_id uuid not null references velia.tenant (id) on delete cascade,
  autore text not null check (autore in ('utente', 'assistente')),
  -- Chi ha scritto (per l'utente) o per chi si è risposto (per l'assistente).
  utente_id uuid references velia.utenti (id) on delete set null,
  testo text not null,
  inviato_il timestamptz not null default now(),
  documenti_referenziati text[] not null default '{}',
  -- Citazioni e provenienze nella forma del contratto FE (jsonb validato
  -- dal worker prima della scrittura: il modello non scrive mai qui).
  citazioni jsonb not null default '[]'::jsonb,
  provenienze jsonb not null default '[]'::jsonb,
  non_supportato boolean not null default false,
  -- Il job che ha prodotto la risposta (solo per l'assistente).
  job_id uuid references velia.jobs (id) on delete set null
);

create index messaggi_per_conversazione on velia.messaggi (conversazione_id, inviato_il);

-- ---------------------------------------------------------------------------
-- Allegati di conversazione: righe di `documenti` con archivio = 'conversazione'
-- ---------------------------------------------------------------------------
-- Nascono prima della conversazione (il FE li carica e li mette nel contesto
-- corrente): per questo vivono sotto `tenant/<tid>/allegati/<id>.pdf`, fuori
-- dagli archivi, e non portano un id di conversazione. Spariscono con
-- l'ultima conversazione che li referenzia.

-- ---------------------------------------------------------------------------
-- DNA d'Agenzia: istruzioni scritte e ricordi (forma del mock)
-- ---------------------------------------------------------------------------

create table velia.istruzioni (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references velia.tenant (id) on delete cascade,
  titolo text not null,
  testo text not null,
  -- RF-D-06: ambito di validità — generale, un ramo o una compagnia.
  ambito_tipo text not null default 'generale'
    check (ambito_tipo in ('generale', 'ramo', 'compagnia')),
  ambito_ramo_id text references velia.rami (id),
  ambito_compagnia_id text references velia.compagnie (id),
  attiva boolean not null default true,
  creata_da uuid references velia.utenti (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint istruzioni_ambito_coerente check (
    (ambito_tipo = 'generale' and ambito_ramo_id is null and ambito_compagnia_id is null)
    or (ambito_tipo = 'ramo' and ambito_ramo_id is not null and ambito_compagnia_id is null)
    or (ambito_tipo = 'compagnia' and ambito_compagnia_id is not null and ambito_ramo_id is null)
  )
);

create index istruzioni_tenant on velia.istruzioni (tenant_id) where attiva;

create trigger istruzioni_updated_at
  before update on velia.istruzioni
  for each row execute function velia.tocca_updated_at();

create table velia.ricordi (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references velia.tenant (id) on delete cascade,
  testo text not null,
  -- RF-G-02: del tenant o personale (allora `utente_id` è chi lo possiede).
  ambito text not null default 'tenant' check (ambito in ('tenant', 'personale')),
  utente_id uuid references velia.utenti (id) on delete cascade,
  categoria text not null default 'prassi'
    check (categoria in ('prassi', 'decisione', 'preferenza', 'fatto')),
  origine_conversazione_id uuid references velia.conversazioni (id) on delete set null,
  -- RF-G-05: sospensione reversibile; la cancellazione è effettiva (delete).
  attivo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ricordi_personale_con_utente check (ambito = 'tenant' or utente_id is not null)
);

create index ricordi_tenant on velia.ricordi (tenant_id) where attivo;

create trigger ricordi_updated_at
  before update on velia.ricordi
  for each row execute function velia.tocca_updated_at();

-- ---------------------------------------------------------------------------
-- Audit e consumi: ogni risposta lascia traccia
-- ---------------------------------------------------------------------------

create table velia.audit_risposte (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references velia.tenant (id) on delete cascade,
  conversazione_id uuid references velia.conversazioni (id) on delete set null,
  messaggio_id uuid references velia.messaggi (id) on delete set null,
  job_id uuid references velia.jobs (id) on delete set null,
  utente_id uuid references velia.utenti (id) on delete set null,
  domanda text not null,
  risposta text not null,
  -- I path letti dal modello nella workspace: cosa ha davvero guardato.
  documenti_letti text[] not null default '{}',
  citazioni jsonb not null default '[]'::jsonb,
  non_supportato boolean not null default false,
  modello text not null,
  turni int not null default 0,
  durata_ms int not null default 0,
  token_input bigint not null default 0,
  token_output bigint not null default 0,
  token_cache_lettura bigint not null default 0,
  token_cache_scrittura bigint not null default 0,
  costo_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default now()
);

create index audit_risposte_tenant on velia.audit_risposte (tenant_id, created_at desc);

create table velia.consumi (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references velia.tenant (id) on delete cascade,
  job_id uuid references velia.jobs (id) on delete set null,
  -- RF-F-03: da dove arriva il consumo.
  origine text not null default 'app' check (origine in ('app', 'mcp', 'agente', 'ingestion')),
  modello text not null,
  token_input bigint not null default 0,
  token_output bigint not null default 0,
  token_cache_lettura bigint not null default 0,
  token_cache_scrittura bigint not null default 0,
  costo_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default now()
);

create index consumi_tenant on velia.consumi (tenant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table velia.conversazioni enable row level security;
alter table velia.messaggi enable row level security;
alter table velia.istruzioni enable row level security;
alter table velia.ricordi enable row level security;
alter table velia.audit_risposte enable row level security;
alter table velia.consumi enable row level security;

-- Una conversazione la vede chi l'ha aperta e, se condivisa, i colleghi del
-- tenant (RF-C-15). La scrive solo l'autore.
create policy conversazioni_lettura on velia.conversazioni
  for select to authenticated
  using (
    tenant_id = velia.tenant_corrente()
    and (autore_id = (select auth.uid()) or condivisa)
  );

create policy conversazioni_inserimento on velia.conversazioni
  for insert to authenticated
  with check (tenant_id = velia.tenant_corrente() and autore_id = (select auth.uid()));

create policy conversazioni_modifica on velia.conversazioni
  for update to authenticated
  using (tenant_id = velia.tenant_corrente() and autore_id = (select auth.uid()))
  with check (tenant_id = velia.tenant_corrente() and autore_id = (select auth.uid()));

create policy conversazioni_rimozione on velia.conversazioni
  for delete to authenticated
  using (tenant_id = velia.tenant_corrente() and autore_id = (select auth.uid()));

-- I messaggi seguono la visibilità della conversazione. L'utente scrive i
-- propri; quelli dell'assistente li scrive il worker (connessione di sistema).
create policy messaggi_lettura on velia.messaggi
  for select to authenticated
  using (
    tenant_id = velia.tenant_corrente()
    and exists (
      select 1 from velia.conversazioni c
      where c.id = messaggi.conversazione_id
        and (c.autore_id = (select auth.uid()) or c.condivisa)
    )
  );

create policy messaggi_inserimento on velia.messaggi
  for insert to authenticated
  with check (
    tenant_id = velia.tenant_corrente()
    and autore = 'utente'
    and utente_id = (select auth.uid())
    and exists (
      select 1 from velia.conversazioni c
      where c.id = messaggi.conversazione_id and c.autore_id = (select auth.uid())
    )
  );

-- Istruzioni: lettura nel tenant; le scritture arrivano con la Fase 6.
create policy istruzioni_lettura on velia.istruzioni
  for select to authenticated
  using (tenant_id = velia.tenant_corrente());

-- RF-G-02: la separazione degli ambiti la fa il server — tenant + personali
-- dell'utente corrente, mai quelli dei colleghi.
create policy ricordi_lettura on velia.ricordi
  for select to authenticated
  using (
    tenant_id = velia.tenant_corrente()
    and (ambito = 'tenant' or utente_id = (select auth.uid()))
  );

-- Audit e consumi: li legge il back-office e, domani, l'amministratore del
-- tenant (Fase 6). Nessuna policy per ora: RLS attiva senza policy = negato.

-- Gli allegati di conversazione sono documenti del tenant come i privati.
drop policy documenti_lettura on velia.documenti;
create policy documenti_lettura on velia.documenti
  for select to authenticated
  using (
    archivio = 'pubblico'
    or (archivio in ('privato', 'conversazione') and tenant_id = velia.tenant_corrente())
  );

create policy documenti_allegati_inserimento on velia.documenti
  for insert to authenticated
  with check (
    archivio = 'conversazione'
    and tenant_id = velia.tenant_corrente()
    and caricato_da = (select auth.uid())
  );

create policy documenti_allegati_rimozione on velia.documenti
  for delete to authenticated
  using (archivio = 'conversazione' and tenant_id = velia.tenant_corrente());

alter table velia.conversazioni owner to velia_app;
alter table velia.messaggi owner to velia_app;
alter table velia.istruzioni owner to velia_app;
alter table velia.ricordi owner to velia_app;
alter table velia.audit_risposte owner to velia_app;
alter table velia.consumi owner to velia_app;
