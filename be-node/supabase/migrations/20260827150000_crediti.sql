-- Crediti (pricing): il canone include crediti al mese, i pacchetti si
-- comprano; ogni operazione AI ne addebita un peso che dipende dal modello.
--
-- L'unità è il credito, non il token: 10 crediti = una risposta in chat con
-- Opus, 5 con Sonnet, 2 con un modello open in UE, 1 per convertire un
-- documento caricato. Memoria, titoli e suggerimenti sono inclusi.
--
-- I pesi stanno in tabella e non nel codice: sono listino, non logica.

alter table velia.tenant
  add column crediti_inclusi int not null default 600 check (crediti_inclusi >= 0);

create table velia.crediti_pesi (
  -- La classe del modello: opus, sonnet, haiku, open; 'conversione' è
  -- l'operazione senza modello.
  classe text primary key,
  crediti int not null check (crediti >= 0)
);

insert into velia.crediti_pesi (classe, crediti) values
  ('opus', 10), ('sonnet', 5), ('haiku', 3), ('open', 2), ('conversione', 1);

create table velia.crediti_movimenti (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references velia.tenant (id) on delete cascade,
  -- pacchetto: acquisto; rettifica: mano del gestore (anche negativa);
  -- addebito: il consumo di un job (crediti negativi).
  tipo text not null check (tipo in ('pacchetto', 'rettifica', 'addebito')),
  crediti int not null,
  -- Solo per gli addebiti.
  operazione text check (operazione in ('risposta', 'tabella', 'agente', 'conversione')),
  modello text,
  job_id uuid references velia.jobs (id) on delete set null,
  utente_id uuid references velia.utenti (id) on delete set null,
  descrizione text not null default '',
  created_at timestamptz not null default now(),
  constraint crediti_segno check (
    (tipo = 'addebito' and crediti < 0) or (tipo = 'pacchetto' and crediti > 0) or tipo = 'rettifica'
  )
);

create index crediti_movimenti_tenant on velia.crediti_movimenti (tenant_id, created_at desc);

-- Il saldo come lo vede il cliente: gli inclusi del mese si consumano per
-- primi e scadono a fine mese; i pacchetti si consumano dopo e non scadono.
-- La storia si ricostruisce mese per mese: l'eccedenza di ogni mese oltre
-- gli inclusi è ciò che ha intaccato i pacchetti.
create or replace function velia.saldo_crediti(tid uuid)
returns table (
  inclusi int,
  inclusi_usati int,
  acquistati int,
  acquistati_usati int,
  disponibili int
)
language sql stable as $$
  with t as (
    select crediti_inclusi from velia.tenant where id = tid
  ),
  mesi as (
    select date_trunc('month', created_at at time zone 'Europe/Rome') as mese,
           sum(-crediti)::int as addebiti
    from velia.crediti_movimenti
    where tenant_id = tid and tipo = 'addebito'
    group by 1
  ),
  eccedenze as (
    select mese, addebiti, least(addebiti, (select crediti_inclusi from t)) as usati_inclusi
    from mesi
  ),
  acquisti as (
    select coalesce(sum(crediti), 0)::int as totale
    from velia.crediti_movimenti
    where tenant_id = tid and tipo in ('pacchetto', 'rettifica')
  )
  select
    (select crediti_inclusi from t) as inclusi,
    coalesce((select usati_inclusi from eccedenze
              where mese = date_trunc('month', now() at time zone 'Europe/Rome')), 0)::int as inclusi_usati,
    (select totale from acquisti) as acquistati,
    coalesce((select sum(addebiti - usati_inclusi) from eccedenze), 0)::int as acquistati_usati,
    (
      (select crediti_inclusi from t)
      - coalesce((select usati_inclusi from eccedenze
                  where mese = date_trunc('month', now() at time zone 'Europe/Rome')), 0)
      + (select totale from acquisti)
      - coalesce((select sum(addebiti - usati_inclusi) from eccedenze), 0)
    )::int as disponibili;
$$;

-- RLS: il tenant legge il proprio registro; scrive solo il sistema.
alter table velia.crediti_pesi enable row level security;
alter table velia.crediti_movimenti enable row level security;

create policy crediti_pesi_lettura on velia.crediti_pesi
  for select to authenticated using (true);

create policy crediti_movimenti_lettura on velia.crediti_movimenti
  for select to authenticated using (tenant_id = velia.tenant_corrente());

alter table velia.crediti_pesi owner to velia_app;
alter table velia.crediti_movimenti owner to velia_app;
