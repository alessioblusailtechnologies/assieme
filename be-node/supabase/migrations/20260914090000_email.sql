-- Le email che l'assistente prepara, e il registro di quelle partite (14/09/2026).
--
-- In chat il motore non spedisce: prepara una bozza, il front-end la mostra
-- sotto la risposta con Modifica e Invia, e l'invio lo fa l'API con
-- l'identità di chi clicca. È lo stesso principio del riordino proposto
-- (`proposte_archivio`): nessun contenuto generato dall'AI esce senza che
-- una persona lo abbia detto.
--
-- Il registro invece tiene **ogni** email partita dall'applicazione, da
-- qualunque porta: la bozza approvata, «Invia email» sotto una risposta o
-- sulla conversazione, e domani l'esecuzione di un agente. Chi riceve una
-- mail a nome dell'agenzia deve poter essere ritrovato.

create table velia.email_bozze (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references velia.tenant (id) on delete cascade,
  conversazione_id uuid not null references velia.conversazioni (id) on delete cascade,
  -- La risposta che l'ha preparata: la bozza vive con lei, come i documenti.
  messaggio_id uuid not null,
  -- A chi: un indirizzo scritto, un utente dell'agenzia (anche chi scrive),
  -- o un cliente dell'anagrafica. `a` è l'indirizzo risolto al momento.
  destinatario_tipo text not null check (destinatario_tipo in ('indirizzo', 'utente', 'cliente')),
  destinatario_id uuid,
  destinatario_nome text,
  a text not null,
  oggetto text not null,
  -- Markdown leggero, scritto per chi riceve.
  corpo text not null,
  -- I documenti generati allegati: [{ id, nome, formato }].
  allegati jsonb not null default '[]'::jsonb,
  stato text not null default 'bozza' check (stato in ('bozza', 'inviata', 'annullata')),
  simulata boolean,
  deciso_da uuid references velia.utenti (id) on delete set null,
  deciso_il timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index email_bozze_messaggio on velia.email_bozze (messaggio_id);
create index email_bozze_conversazione on velia.email_bozze (conversazione_id, created_at desc);

create trigger email_bozze_updated_at
  before update on velia.email_bozze
  for each row execute function velia.tocca_updated_at();

create table velia.email_inviate (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references velia.tenant (id) on delete cascade,
  -- Chi l'ha spedita; null quando parte da un agente (la colonna arriva con lui).
  utente_id uuid references velia.utenti (id) on delete set null,
  origine text not null check (origine in ('risposta', 'conversazione', 'bozza', 'agente')),
  conversazione_id uuid references velia.conversazioni (id) on delete set null,
  bozza_id uuid references velia.email_bozze (id) on delete set null,
  a text not null,
  oggetto text not null,
  -- Solo i nomi dei file: il registro dice che cosa è partito, non lo conserva.
  allegati jsonb not null default '[]'::jsonb,
  simulata boolean not null,
  created_at timestamptz not null default now()
);

create index email_inviate_tenant on velia.email_inviate (tenant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS: la propria agenzia; l'ospite di una chat cliente mai
-- ---------------------------------------------------------------------------
-- Le bozze le inserisce il worker con la connessione di sistema; l'utente le
-- legge, le modifica e le decide. Il registro si legge e si scrive, non si
-- corregge.

alter table velia.email_bozze enable row level security;

create policy email_bozze_lettura on velia.email_bozze
  for select to authenticated using (tenant_id = velia.tenant_corrente());
create policy email_bozze_decisione on velia.email_bozze
  for update to authenticated
  using (tenant_id = velia.tenant_corrente())
  with check (tenant_id = velia.tenant_corrente());
create policy email_bozze_ospite_mai on velia.email_bozze
  as restrictive for all to authenticated
  using (velia.ospite_corrente() is null)
  with check (velia.ospite_corrente() is null);

alter table velia.email_inviate enable row level security;

create policy email_inviate_lettura on velia.email_inviate
  for select to authenticated using (tenant_id = velia.tenant_corrente());
create policy email_inviate_registrazione on velia.email_inviate
  for insert to authenticated with check (tenant_id = velia.tenant_corrente());
create policy email_inviate_ospite_mai on velia.email_inviate
  as restrictive for all to authenticated
  using (velia.ospite_corrente() is null)
  with check (velia.ospite_corrente() is null);

-- Di velia_app, o l'app le legge a zero righe in silenzio.
alter table velia.email_bozze owner to velia_app;
alter table velia.email_inviate owner to velia_app;
