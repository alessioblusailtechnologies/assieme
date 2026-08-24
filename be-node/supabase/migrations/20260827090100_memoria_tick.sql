-- Fase 8, secondo pezzo: il tick guarda l'ultimo messaggio, e il trigger
-- di `updated_at` rispetta un valore impostato esplicitamente.
--
-- «Ferma da N minuti» è una proprietà dei messaggi, non della riga della
-- conversazione: `updated_at` si muove anche per un rinomino o per la
-- chiusura del job stesso, e non deve contare. E il trigger che riscriveva
-- `updated_at` sempre impediva a chiunque (API, retention, test) di dire
-- «questa riga è vecchia»: ora lo fa solo se nessuno l'ha toccato.

create or replace function velia.tocca_updated_at()
returns trigger
language plpgsql
as $$
begin
  if new.updated_at is not distinct from old.updated_at then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop index if exists velia.conversazioni_da_apprendere;
alter table velia.conversazioni
  drop column appresa_fino_a,
  drop column apprendimento_accodato_il;

-- La contabilità dell'apprendimento sta fuori da `conversazioni`: né il tick
-- né il job toccano la riga della conversazione (il suo `updated_at` ordina
-- lo storico del FE e non deve muoversi per un lavoro di sistema).
create table velia.apprendimenti (
  conversazione_id uuid primary key references velia.conversazioni (id) on delete cascade,
  -- Le risposte fino a qui sono già passate dal job.
  appresa_fino_a timestamptz,
  -- Il tick l'ha accodata e il job non ha ancora chiuso: non si riaccoda.
  accodato_il timestamptz
);
alter table velia.apprendimenti enable row level security;
alter table velia.apprendimenti owner to velia_app;

create or replace function velia.accoda_apprendimento() returns int
language plpgsql as $$
declare
  c record;
  nuovo_job_id uuid;
  accodate int := 0;
begin
  for c in
    select conv.id, conv.tenant_id
    from velia.conversazioni conv
    join velia.tenant t on t.id = conv.tenant_id
    left join velia.apprendimenti ap on ap.conversazione_id = conv.id
    where t.memoria_attiva
      and (ap.accodato_il is null or ap.accodato_il < now() - interval '1 day')
      -- Nessun messaggio da almeno l'attesa del tenant…
      and not exists (
        select 1 from velia.messaggi m
        where m.conversazione_id = conv.id
          and m.inviato_il > now() - make_interval(mins => t.memoria_attesa_minuti)
      )
      -- …e almeno una risposta oltre ciò che è già stato appreso.
      and exists (
        select 1 from velia.messaggi m
        where m.conversazione_id = conv.id
          and m.autore = 'assistente'
          and m.inviato_il > coalesce(ap.appresa_fino_a, '-infinity'::timestamptz)
      )
    for update of conv skip locked
  loop
    insert into velia.jobs (tipo, payload, tenant_id)
    values ('memoria', jsonb_build_object('conversazioneId', c.id), c.tenant_id)
    returning id into nuovo_job_id;
    perform pgmq.send('lavori', jsonb_build_object('jobId', nuovo_job_id));

    insert into velia.apprendimenti (conversazione_id, accodato_il) values (c.id, now())
    on conflict (conversazione_id) do update set accodato_il = now();
    accodate := accodate + 1;
  end loop;
  return accodate;
end;
$$;
