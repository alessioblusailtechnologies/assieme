-- Intestazione e piè di pagina dell'agenzia (11/09/2026), al posto
-- dell'identità visiva (`PIANO-INTESTAZIONE-MODELLI.md`, fase 1).
--
-- Una riga per tenant: le due fasce sono il JSON dell'editor, in uno schema
-- vincolato che il backend valida prima di scrivere (`contratto/intestazione.ts`).
-- Le immagini stanno nello Storage sotto `tenant/<tid>/intestazione/` e il
-- JSON le cita per id. Senza una riga vale l'intestazione di partenza:
-- niente in testa, il numero di pagina in calce.

create table velia.intestazione (
  tenant_id uuid primary key references velia.tenant (id) on delete cascade,
  intestazione jsonb not null,
  piede jsonb not null,
  aggiornata_il timestamptz not null default now(),
  aggiornata_da uuid references velia.utenti (id) on delete set null
);

alter table velia.intestazione enable row level security;

-- Come per l'identità visiva: il tenant legge e scrive la sua riga; che a
-- scrivere sia un amministratore lo impone la rotta.
create policy intestazione_lettura on velia.intestazione
  for select to authenticated
  using (tenant_id = velia.tenant_corrente());

create policy intestazione_inserimento on velia.intestazione
  for insert to authenticated
  with check (tenant_id = velia.tenant_corrente());

create policy intestazione_modifica on velia.intestazione
  for update to authenticated
  using (tenant_id = velia.tenant_corrente())
  with check (tenant_id = velia.tenant_corrente());

-- L'ospite di una chat cliente non la vede né la tocca (il test
-- «ogni tabella nuova nasce negata all'ospite» lo pretende).
create policy intestazione_ospite_mai on velia.intestazione
  as restrictive for all to authenticated
  using (velia.ospite_corrente() is null)
  with check (velia.ospite_corrente() is null);

-- Di velia_app, o l'app la legge a zero righe in silenzio.
alter table velia.intestazione owner to velia_app;

-- L'identità visiva se ne va del tutto: si parte da zero, nessuna
-- migrazione dei suoi dati. I loghi rimasti nello Storage sotto
-- `tenant/<tid>/identita/` non li legge più nessuno.
drop table velia.identita_visiva;
