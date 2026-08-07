-- Le tabelle di ASSIEME lasciano `public` per lo schema dedicato `assieme`
-- (lo stesso che già ospita le funzioni di piattaforma).
--
-- Motivo: il progetto Supabase è condiviso con altre applicazioni che
-- vivono in `public` — su indicazione del committente (07/08/2026) ASSIEME
-- tiene le proprie tabelle in casa propria. Nessun rischio di collisione
-- di nomi, confini chiari, e un eventuale trasloco su progetto dedicato
-- diventa un dump dello schema.
--
-- Le policy RLS, i trigger e gli indici viaggiano con le tabelle.

alter table public.tenant set schema assieme;
alter table public.utenti set schema assieme;
alter table public.compagnie set schema assieme;
alter table public.rami set schema assieme;
alter table public.jobs set schema assieme;
alter table public.eventi_job set schema assieme;

-- In `public` i privilegi arrivavano dalle default privileges di Supabase;
-- nello schema nostro vanno dichiarati. La sicurezza resta la RLS: i
-- privilegi dicono "può parlare col tavolo", le policy dicono quali righe.
grant usage on schema assieme to anon, authenticated, service_role;
grant all on all tables in schema assieme to service_role;
grant select, insert, update, delete on all tables in schema assieme to authenticated;
grant usage, select on all sequences in schema assieme to authenticated, service_role;

alter default privileges in schema assieme
  grant all on tables to service_role;
alter default privileges in schema assieme
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema assieme
  grant usage, select on sequences to authenticated, service_role;
