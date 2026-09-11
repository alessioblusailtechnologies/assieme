-- Le pagine condivise (11/09/2026, fase 2 di `PIANO-LINK-E-FORMATI.md`): un
-- documento generato in chat che l'agenzia manda al cliente come link, da
-- aprire dal telefono.
--
-- Il link è la credenziale: chi ce l'ha vede il documento finché non scade
-- o l'agenzia non lo revoca (revocare = cancellare la riga; un link nuovo
-- ha un token nuovo). Come per le chat cliente si tiene l'impronta del
-- token per trovarlo e il token in chiaro per rimostrarlo all'agenzia
-- quando riapre il documento.
--
-- Nessun contatore di aperture, per decisione del committente: la pagina
-- si apre e basta.

create table velia.pagine_condivise (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references velia.tenant (id) on delete cascade,
  conversazione_id uuid not null references velia.conversazioni (id) on delete cascade,
  -- L'id del documento generato, che vive nel jsonb `messaggi.documenti`.
  documento_id uuid not null,
  nome text not null,
  formato text not null,
  token_hash text not null unique,
  token text not null,
  -- null = nessuna scadenza.
  scade_il timestamptz,
  creata_da uuid references velia.utenti (id) on delete set null,
  creata_il timestamptz not null default now(),
  -- Un link per documento: condividerlo di nuovo rimostra lo stesso.
  unique (conversazione_id, documento_id)
);

alter table velia.pagine_condivise enable row level security;

-- Il tenant governa i link dei suoi documenti; chi può condividere un
-- documento lo decide la rotta, che prima verifica di vederne la
-- conversazione. La pagina pubblica legge con la connessione di sistema.
create policy pagine_condivise_agenzia on velia.pagine_condivise
  for all to authenticated
  using (tenant_id = velia.tenant_corrente())
  with check (tenant_id = velia.tenant_corrente());

-- L'ospite di una chat cliente non la vede né la tocca (il test
-- «ogni tabella nuova nasce negata all'ospite» lo pretende).
create policy pagine_condivise_ospite_mai on velia.pagine_condivise
  as restrictive for all to authenticated
  using (velia.ospite_corrente() is null)
  with check (velia.ospite_corrente() is null);

-- Di velia_app, o l'app la legge a zero righe in silenzio.
alter table velia.pagine_condivise owner to velia_app;
