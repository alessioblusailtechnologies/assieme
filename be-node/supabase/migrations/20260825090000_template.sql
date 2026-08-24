-- Fase 4 — Generazione documenti su template (RF-D-10…D-13, RF-C-10).
--
-- La libreria dei template è una: le righe di piattaforma (tenant_id null,
-- «precaricate», layout nel codice di `src/generazione/`) e quelle del
-- tenant (file nello Storage sotto `tenant/<tid>/template/`). Il predefinito
-- per tipologia (RF-D-13) è stato del tenant anche quando indica un template
-- di piattaforma: per questo vive in una tabella sua e non su `template`.
-- L'identità visiva (RF-D-12) è una riga per tenant; lo storico delle
-- impostazioni (RF-D-07) nasce qui perché le prime mutazioni da registrare
-- sono queste — la rotta di lettura arriva in Fase 6.

-- ---------------------------------------------------------------------------
-- Catalogo dei template
-- ---------------------------------------------------------------------------

create table velia.template (
  -- Id testuale opaco come nel contratto (`tpl-…`).
  id text primary key,
  -- Null = template di piattaforma, visibile a tutti i tenant in sola lettura.
  tenant_id uuid references velia.tenant (id) on delete cascade,
  nome text not null,
  formato text not null check (formato in ('pdf', 'docx', 'xlsx', 'pptx')),
  descrizione text not null default '',
  -- Solo per le righe di piattaforma: la tipologia di cui sono il predefinito
  -- di partenza, finché il tenant non decide altrimenti (template_predefiniti).
  tipologia_libreria text check (
    tipologia_libreria in ('confronto', 'riepilogo-garanzie', 'proposta-rinnovo', 'report-interno')
  ),
  -- Solo per i template del tenant: il file caricato, nello Storage.
  path_file text,
  creato_da uuid references velia.utenti (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint template_tenant_con_file check (tenant_id is null or path_file is not null),
  constraint template_libreria_senza_file check (tenant_id is not null or path_file is null),
  constraint template_libreria_con_tipologia check (tenant_id is null or tipologia_libreria is null)
);

create index template_per_tenant on velia.template (tenant_id);

-- RF-D-13: il predefinito per tipologia, per tenant. Una riga per tipologia:
-- assegnare una tipologia la toglie a chi la portava prima (chiave primaria).
-- `template_id` null = il tenant ha tolto il predefinito anche a quello di
-- piattaforma; nessuna riga = vale il default di libreria (tipologia_libreria).
create table velia.template_predefiniti (
  tenant_id uuid not null references velia.tenant (id) on delete cascade,
  tipologia text not null check (
    tipologia in ('confronto', 'riepilogo-garanzie', 'proposta-rinnovo', 'report-interno')
  ),
  template_id text references velia.template (id) on delete cascade,
  primary key (tenant_id, tipologia)
);

-- ---------------------------------------------------------------------------
-- Identità visiva (RF-D-12): applicata dai template alla generazione
-- ---------------------------------------------------------------------------

create table velia.identita_visiva (
  tenant_id uuid primary key references velia.tenant (id) on delete cascade,
  colore_primario text not null default '#2f4b7c',
  recapiti text not null default '',
  firma text not null default '',
  -- Il logo sta nello Storage (`tenant/<tid>/identita/logo`), qui il tipo.
  logo_path text,
  logo_tipo text,
  updated_at timestamptz not null default now()
);

create trigger identita_visiva_updated_at
  before update on velia.identita_visiva
  for each row execute function velia.tocca_updated_at();

-- ---------------------------------------------------------------------------
-- Storico delle impostazioni (RF-D-07): chi, cosa, quando
-- ---------------------------------------------------------------------------

create table velia.impostazioni_storico (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references velia.tenant (id) on delete cascade,
  istante timestamptz not null default now(),
  utente_id uuid references velia.utenti (id) on delete set null,
  azione text not null check (
    azione in ('creazione', 'modifica', 'attivazione', 'disattivazione', 'eliminazione')
  ),
  oggetto text not null check (
    oggetto in ('regola', 'documento-riferimento', 'modello', 'template')
  ),
  descrizione text not null
);

create index impostazioni_storico_tenant on velia.impostazioni_storico (tenant_id, istante desc);

-- ---------------------------------------------------------------------------
-- La libreria precaricata: le quattro tipologie dell'analisi (§6.11).
-- Stessi id e testi della fixture del mock: il FE li conosce già.
-- ---------------------------------------------------------------------------

insert into velia.template (id, nome, formato, descrizione, tipologia_libreria) values
  ('tpl-001', 'Confronto di garanzie', 'pdf',
   'Tabella comparativa delle garanzie con citazioni a piè di pagina, pronta da consegnare al cliente.',
   'confronto'),
  ('tpl-002', 'Riepilogo garanzie cliente', 'docx',
   'Sintesi discorsiva delle coperture di una posizione, modificabile prima dell''invio.',
   'riepilogo-garanzie'),
  ('tpl-003', 'Proposta di rinnovo', 'docx',
   'Lettera di rinnovo con confronto fra condizioni in scadenza e nuova offerta.',
   'proposta-rinnovo'),
  ('tpl-004', 'Report interno', 'xlsx',
   'Dati estratti in forma tabellare per elaborazioni successive in agenzia.',
   'report-interno')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table velia.template enable row level security;
alter table velia.template_predefiniti enable row level security;
alter table velia.identita_visiva enable row level security;
alter table velia.impostazioni_storico enable row level security;

-- La libreria la leggono tutti, i template propri solo il tenant. Le
-- scritture da amministratore le impone il codice (come per il mock: il 403
-- parte dalla rotta); qui l'isolamento.
create policy template_lettura on velia.template
  for select to authenticated
  using (tenant_id is null or tenant_id = velia.tenant_corrente());

create policy template_inserimento on velia.template
  for insert to authenticated
  with check (tenant_id = velia.tenant_corrente() and creato_da = (select auth.uid()));

create policy template_rimozione on velia.template
  for delete to authenticated
  using (tenant_id = velia.tenant_corrente());

create policy predefiniti_lettura on velia.template_predefiniti
  for select to authenticated
  using (tenant_id = velia.tenant_corrente());

create policy predefiniti_inserimento on velia.template_predefiniti
  for insert to authenticated
  with check (tenant_id = velia.tenant_corrente());

create policy predefiniti_modifica on velia.template_predefiniti
  for update to authenticated
  using (tenant_id = velia.tenant_corrente())
  with check (tenant_id = velia.tenant_corrente());

create policy predefiniti_rimozione on velia.template_predefiniti
  for delete to authenticated
  using (tenant_id = velia.tenant_corrente());

create policy identita_lettura on velia.identita_visiva
  for select to authenticated
  using (tenant_id = velia.tenant_corrente());

create policy identita_inserimento on velia.identita_visiva
  for insert to authenticated
  with check (tenant_id = velia.tenant_corrente());

create policy identita_modifica on velia.identita_visiva
  for update to authenticated
  using (tenant_id = velia.tenant_corrente())
  with check (tenant_id = velia.tenant_corrente());

-- Lo storico si scrive dalle rotte con l'identità dell'utente; la lettura
-- (Fase 6) sarà del tenant.
create policy storico_lettura on velia.impostazioni_storico
  for select to authenticated
  using (tenant_id = velia.tenant_corrente());

create policy storico_inserimento on velia.impostazioni_storico
  for insert to authenticated
  with check (tenant_id = velia.tenant_corrente() and utente_id = (select auth.uid()));

alter table velia.template owner to velia_app;
alter table velia.template_predefiniti owner to velia_app;
alter table velia.identita_visiva owner to velia_app;
alter table velia.impostazioni_storico owner to velia_app;
