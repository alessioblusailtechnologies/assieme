-- Il ruolo dell'applicazione, creato dalle migrazioni se non esiste.
--
-- Sul progetto vero è nato a mano (SQL editor del committente, con la sua
-- password); negli ambienti effimeri — la CI — nessuno lo creava, e la
-- migrazione dei documenti falliva sull'`alter table … owner`. Qui la
-- password è un segnaposto: vale solo dove il database muore col job.
do $$
begin
  if not exists (select from pg_roles where rolname = 'assieme_app') then
    create role assieme_app login password 'solo-ambienti-effimeri';
    grant authenticated to assieme_app;
  end if;
  -- Chi applica le migrazioni deve poter assegnare tabelle al ruolo.
  grant assieme_app to postgres;
  grant usage, create on schema assieme to assieme_app;
  grant usage on schema pgmq to assieme_app;
  grant execute on all functions in schema pgmq to assieme_app;
  grant select, insert, update, delete on all tables in schema pgmq to assieme_app;
  grant usage, select on all sequences in schema pgmq to assieme_app;
  alter table assieme.tenant owner to assieme_app;
  alter table assieme.utenti owner to assieme_app;
  alter table assieme.compagnie owner to assieme_app;
  alter table assieme.rami owner to assieme_app;
  alter table assieme.jobs owner to assieme_app;
  alter table assieme.eventi_job owner to assieme_app;
end $$;
