-- Fase 7 — Agenti (RF-E-01…E-13).
--
-- La definizione (fonti in forma nuda, jsonb: l'idratazione è dell'API) e
-- lo storico delle esecuzioni. L'esecuzione è lo stesso job d'interrogazione
-- con un ingresso diverso (tipo 'agente', già nel constraint dalla Fase 5);
-- la pianificazione è pg_cron che ogni minuto accoda ciò che è scaduto —
-- il worker resta uno, la coda resta una.
--
-- I limiti (RF-E-09) stanno sul tenant come quelli dello spazio: i numeri
-- sono decisione commerciale (punto aperto §6.9), il meccanismo è qui.

alter table velia.tenant
  add column limite_agenti_attivi int not null default 5,
  add column limite_esecuzioni_concorrenti int not null default 2,
  add column frequenza_minima_agenti text not null default 'giornaliera'
    check (frequenza_minima_agenti in ('giornaliera', 'settimanale', 'mensile'));

-- ---------------------------------------------------------------------------
-- Agenti ed esecuzioni
-- ---------------------------------------------------------------------------

create table velia.agenti (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references velia.tenant (id) on delete cascade,
  nome text not null,
  descrizione text not null default '',
  istruzioni text not null,
  -- NuovaFonteAgente[] così come il client le manda; insiemi vivi, risolti
  -- a ogni esecuzione (RF-E-10: è il punto del monitoraggio nuove edizioni).
  fonti jsonb not null default '[]'::jsonb,
  formato_output text not null default 'testo'
    check (formato_output in ('testo', 'tabella', 'documento')),
  template_output_id text references velia.template (id) on delete set null,
  parametri jsonb not null default '[]'::jsonb,
  -- Pianificazione (RF-E-04) su colonne: il tick le interroga.
  pian_frequenza text check (pian_frequenza in ('giornaliera', 'settimanale', 'mensile')),
  pian_orario text,
  pian_giorno_settimana int check (pian_giorno_settimana between 1 and 7),
  pian_giorno_mese int check (pian_giorno_mese between 1 and 28),
  pian_sospesa boolean not null default false,
  -- Calcolata dal server a ogni scrittura; null = niente da accodare.
  prossima_esecuzione timestamptz,
  attivo boolean not null default true,
  creato_da uuid references velia.utenti (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index agenti_tenant on velia.agenti (tenant_id);
create index agenti_da_accodare on velia.agenti (prossima_esecuzione)
  where prossima_esecuzione is not null;

create trigger agenti_updated_at
  before update on velia.agenti
  for each row execute function velia.tocca_updated_at();

create table velia.agenti_esecuzioni (
  id uuid primary key default gen_random_uuid(),
  agente_id uuid not null references velia.agenti (id) on delete cascade,
  tenant_id uuid not null references velia.tenant (id) on delete cascade,
  avviata_il timestamptz not null default now(),
  conclusa_il timestamptz,
  modalita text not null check (modalita in ('manuale', 'pianificata')),
  stato text not null default 'in-coda'
    check (stato in ('in-coda', 'in-corso', 'completata', 'fallita')),
  parametri jsonb,
  tentativi int not null default 0,
  output text,
  citazioni jsonb not null default '[]'::jsonb,
  -- Il template con cui l'esito diventa documento (RF-E-13): si fotografa
  -- alla conclusione, perché l'agente può cambiare template dopo.
  template_output_id text references velia.template (id) on delete set null,
  log jsonb not null default '[]'::jsonb,
  errore text,
  job_id uuid references velia.jobs (id) on delete set null
);

create index esecuzioni_per_agente on velia.agenti_esecuzioni (agente_id, avviata_il desc);
create index esecuzioni_in_corso on velia.agenti_esecuzioni (tenant_id)
  where stato in ('in-coda', 'in-corso');

-- ---------------------------------------------------------------------------
-- Il tick della pianificazione: pg_cron accoda, il worker lavora
-- ---------------------------------------------------------------------------

-- L'occorrenza successiva (stretta) di una pianificazione, in ora italiana.
create or replace function velia.prossimo_tick(
  frequenza text,
  orario text,
  giorno_settimana int,
  giorno_mese int,
  dopo timestamptz default now()
) returns timestamptz
language plpgsql stable as $$
declare
  locale timestamp := dopo at time zone 'Europe/Rome';
  ora time := coalesce(orario, '08:00')::time;
  candidata timestamp;
begin
  if frequenza = 'giornaliera' then
    candidata := locale::date + ora;
    if candidata <= locale then candidata := candidata + interval '1 day'; end if;
  elsif frequenza = 'settimanale' then
    candidata := locale::date + ora
      + make_interval(days => (coalesce(giorno_settimana, 1) - extract(isodow from locale)::int + 7) % 7);
    if candidata <= locale then candidata := candidata + interval '7 days'; end if;
  elsif frequenza = 'mensile' then
    candidata := date_trunc('month', locale)::date + make_interval(days => coalesce(giorno_mese, 1) - 1) + ora;
    if candidata <= locale then
      candidata := (date_trunc('month', locale) + interval '1 month')::date
        + make_interval(days => coalesce(giorno_mese, 1) - 1) + ora;
    end if;
  else
    return null;
  end if;
  return candidata at time zone 'Europe/Rome';
end;
$$;

-- Il tick: per ogni agente attivo con pianificazione scaduta, un'esecuzione
-- 'in-coda' + il job nella coda unica, e la prossima occorrenza ricalcolata.
-- Un tick perso non perde l'esecuzione: al giro dopo è ancora scaduta.
create or replace function velia.accoda_agenti_pianificati() returns int
language plpgsql as $$
declare
  a record;
  esecuzione_id uuid;
  nuovo_job_id uuid;
  accodate int := 0;
begin
  for a in
    select id, tenant_id, pian_frequenza, pian_orario, pian_giorno_settimana, pian_giorno_mese
    from velia.agenti
    where attivo and not pian_sospesa
      and prossima_esecuzione is not null and prossima_esecuzione <= now()
    for update skip locked
  loop
    insert into velia.agenti_esecuzioni (agente_id, tenant_id, modalita, log)
    values (a.id, a.tenant_id, 'pianificata',
            jsonb_build_array(jsonb_build_object(
              'istante', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'livello', 'info',
              'messaggio', 'Esecuzione pianificata accodata.')))
    returning id into esecuzione_id;

    insert into velia.jobs (tipo, payload, tenant_id)
    values ('agente', jsonb_build_object('esecuzioneId', esecuzione_id), a.tenant_id)
    returning id into nuovo_job_id;
    perform pgmq.send('lavori', jsonb_build_object('jobId', nuovo_job_id));

    update velia.agenti_esecuzioni set job_id = nuovo_job_id where id = esecuzione_id;
    update velia.agenti
    set prossima_esecuzione = velia.prossimo_tick(
          a.pian_frequenza, a.pian_orario, a.pian_giorno_settimana, a.pian_giorno_mese, now())
    where id = a.id;
    accodate := accodate + 1;
  end loop;
  return accodate;
end;
$$;

create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule('velia-agenti-tick');
exception when others then
  null; -- non esisteva ancora
end;
$$;

select cron.schedule('velia-agenti-tick', '* * * * *', $$select velia.accoda_agenti_pianificati()$$);

-- ---------------------------------------------------------------------------
-- RLS: gli agenti sono della flotta del tenant (il permesso `agenti.crea`
-- è dell'operatore), le esecuzioni le scrive l'API (accodamento) e le
-- aggiorna solo il worker (connessione di sistema).
-- ---------------------------------------------------------------------------

alter table velia.agenti enable row level security;
alter table velia.agenti_esecuzioni enable row level security;

create policy agenti_lettura on velia.agenti
  for select to authenticated using (tenant_id = velia.tenant_corrente());
create policy agenti_inserimento on velia.agenti
  for insert to authenticated with check (tenant_id = velia.tenant_corrente());
create policy agenti_modifica on velia.agenti
  for update to authenticated
  using (tenant_id = velia.tenant_corrente())
  with check (tenant_id = velia.tenant_corrente());
create policy agenti_rimozione on velia.agenti
  for delete to authenticated using (tenant_id = velia.tenant_corrente());

create policy esecuzioni_lettura on velia.agenti_esecuzioni
  for select to authenticated using (tenant_id = velia.tenant_corrente());
create policy esecuzioni_inserimento on velia.agenti_esecuzioni
  for insert to authenticated with check (tenant_id = velia.tenant_corrente());

alter table velia.agenti owner to velia_app;
alter table velia.agenti_esecuzioni owner to velia_app;
