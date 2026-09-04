-- L'assistente propone un riordino dell'archivio; l'utente approva (04/09/2026).
--
-- Il motore continua a non poter scrivere: lavora su una copia in sola
-- lettura, con Read, Grep e Glob e nient'altro (piano §4.3). Quello che
-- guadagna qui non è uno strumento di scrittura, è la possibilità di
-- **chiedere**: deposita una proposta, il front-end la mostra sotto la
-- risposta, e la scrittura vera la fa l'API con l'identità di chi approva,
-- sotto la sua RLS. Se nessuno approva, non succede niente.
--
-- È lo stesso principio già fissato per i canali (RF-H): nessun contenuto
-- generato dall'AI esce, o in questo caso tocca l'archivio, senza che una
-- persona lo abbia detto.

create table velia.proposte_archivio (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references velia.tenant (id) on delete cascade,
  conversazione_id uuid not null references velia.conversazioni (id) on delete cascade,
  -- La risposta che l'ha proposta: la proposta vive con lei e si ritrova
  -- ricaricando la pagina, come i documenti generati.
  messaggio_id uuid not null,
  -- Le operazioni nell'ordine in cui vanno applicate: una cartella creata
  -- dalla prima può essere la destinazione della seconda.
  operazioni jsonb not null,
  motivo text,
  stato text not null default 'proposta'
    check (stato in ('proposta', 'applicata', 'annullata')),
  -- Chi ha deciso e quando: una scrittura sull'archivio ha sempre un nome.
  deciso_da uuid references velia.utenti (id) on delete set null,
  deciso_il timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index proposte_archivio_messaggio on velia.proposte_archivio (messaggio_id);
create index proposte_archivio_conversazione
  on velia.proposte_archivio (conversazione_id, created_at desc);

create trigger proposte_archivio_updated_at
  before update on velia.proposte_archivio
  for each row execute function velia.tocca_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: la propria agenzia, e nient'altro
-- ---------------------------------------------------------------------------
-- La lettura e l'approvazione sono di chi è nel tenant; l'inserimento lo fa
-- il worker con la connessione di sistema, che non passa di qui.

alter table velia.proposte_archivio enable row level security;

create policy proposte_lettura on velia.proposte_archivio
  for select to authenticated using (tenant_id = velia.tenant_corrente());
create policy proposte_decisione on velia.proposte_archivio
  for update to authenticated
  using (tenant_id = velia.tenant_corrente())
  with check (tenant_id = velia.tenant_corrente());

alter table velia.proposte_archivio owner to velia_app;
