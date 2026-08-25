-- Template semplificati (revisione del 25/08/2026).
--
-- Un template è SEMPRE un file caricato dall'agenzia: quanti ne vuole, anche
-- più d'uno nello stesso formato, richiamabili per nome dalla chat e dagli
-- agenti. Il layout di piattaforma non è più una riga di catalogo: è il
-- fallback nel codice quando per un formato non c'è un template. Il
-- predefinito è per FORMATO (al massimo uno per pdf/docx/xlsx) e vive sulla
-- riga stessa: sparisce la tabella dei predefiniti per tipologia.

-- Via i vincoli della doppia natura e le righe di piattaforma.
alter table velia.template
  drop constraint if exists template_tenant_con_file,
  drop constraint if exists template_libreria_senza_file,
  drop constraint if exists template_libreria_con_tipologia;

delete from velia.template where tenant_id is null;

alter table velia.template
  drop column if exists tipologia_libreria,
  alter column tenant_id set not null,
  alter column path_file set not null,
  add column if not exists predefinito boolean not null default false;

-- Al massimo un predefinito per formato, per tenant.
create unique index if not exists template_predefinito_per_formato
  on velia.template (tenant_id, formato) where predefinito;

drop table if exists velia.template_predefiniti;

-- RLS: niente più righe condivise; l'amministratore aggiorna nome e predefinito.
drop policy if exists template_lettura on velia.template;
create policy template_lettura on velia.template
  for select to authenticated
  using (tenant_id = velia.tenant_corrente());

drop policy if exists template_modifica on velia.template;
create policy template_modifica on velia.template
  for update to authenticated
  using (tenant_id = velia.tenant_corrente())
  with check (tenant_id = velia.tenant_corrente());
