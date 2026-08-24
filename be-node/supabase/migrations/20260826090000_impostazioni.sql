-- Fase 6 — Impostazioni complete (RF-D-01…D-04, D-06/07, D-14/16).
--
-- Tre cose nascono qui:
--  1. la scelta del modello per tenant (RF-D-02): una colonna su `tenant`,
--     null = default di piattaforma (MODELLO_MOTORE). La scrive SOLO il
--     server con la connessione di sistema dopo la guardia da
--     amministratore: la riga di tenant porta i limiti di piano, e una
--     policy di update gliela consegnerebbe via PostgREST;
--  2. il governo dei documenti di riferimento (RF-D-14/15): una voce per
--     documento — promosso dall'Archivio Privato o caricato apposta (che
--     È comunque una riga di `documenti`, archivio 'privato': un archivio
--     solo, un visualizzatore solo, citazioni che restano nel contratto);
--  3. il peso del Markdown (RF-D-16): il contesto permanente si paga in
--     testo convertito, non in byte di PDF — l'ingestion lo misura.
-- Le scritture sulle istruzioni (rimandate in Fase 3) aprono qui.

alter table velia.tenant add column modello_motore text;

alter table velia.documenti add column dimensione_md_byte bigint
  check (dimensione_md_byte >= 0);

-- ---------------------------------------------------------------------------
-- Governo dei documenti di riferimento (RF-D-14/15)
-- ---------------------------------------------------------------------------

create table velia.riferimenti (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references velia.tenant (id) on delete cascade,
  -- Il documento che porta il ruolo: sparito il documento, sparisce il ruolo.
  documento_id text not null unique references velia.documenti (id) on delete cascade,
  -- 'promosso' dall'Archivio Privato (RF-B-09) o 'caricato' dalle Impostazioni.
  origine text not null check (origine in ('promosso', 'caricato')),
  ambito_tipo text not null default 'generale'
    check (ambito_tipo in ('generale', 'ramo', 'compagnia')),
  ambito_ramo_id text references velia.rami (id),
  ambito_compagnia_id text references velia.compagnie (id),
  attivo boolean not null default true,
  caricato_da uuid references velia.utenti (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint riferimenti_ambito_coerente check (
    (ambito_tipo = 'generale' and ambito_ramo_id is null and ambito_compagnia_id is null)
    or (ambito_tipo = 'ramo' and ambito_ramo_id is not null and ambito_compagnia_id is null)
    or (ambito_tipo = 'compagnia' and ambito_compagnia_id is not null and ambito_ramo_id is null)
  )
);

create index riferimenti_tenant on velia.riferimenti (tenant_id) where attivo;

create trigger riferimenti_updated_at
  before update on velia.riferimenti
  for each row execute function velia.tocca_updated_at();

-- I promossi di ieri (solo flag, Fase 2) ricevono la loro voce di governo.
insert into velia.riferimenti (tenant_id, documento_id, origine, caricato_da)
select tenant_id, id, 'promosso', caricato_da
from velia.documenti
where archivio = 'privato' and documento_di_riferimento
on conflict (documento_id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table velia.riferimenti enable row level security;

create policy riferimenti_lettura on velia.riferimenti
  for select to authenticated
  using (tenant_id = velia.tenant_corrente());

create policy riferimenti_inserimento on velia.riferimenti
  for insert to authenticated
  with check (tenant_id = velia.tenant_corrente());

create policy riferimenti_modifica on velia.riferimenti
  for update to authenticated
  using (tenant_id = velia.tenant_corrente())
  with check (tenant_id = velia.tenant_corrente());

create policy riferimenti_rimozione on velia.riferimenti
  for delete to authenticated
  using (tenant_id = velia.tenant_corrente());

-- Le scritture sulle istruzioni, promesse in Fase 3 e aperte qui: la
-- guardia da amministratore è del codice, l'isolamento della RLS.
create policy istruzioni_inserimento on velia.istruzioni
  for insert to authenticated
  with check (tenant_id = velia.tenant_corrente());

create policy istruzioni_modifica on velia.istruzioni
  for update to authenticated
  using (tenant_id = velia.tenant_corrente())
  with check (tenant_id = velia.tenant_corrente());

create policy istruzioni_rimozione on velia.istruzioni
  for delete to authenticated
  using (tenant_id = velia.tenant_corrente());

alter table velia.riferimenti owner to velia_app;
