-- Fase 8 — Memoria (RF-G-01…G-06).
--
-- La tabella `ricordi` esiste dalla Fase 3 (il motore la legge da allora);
-- qui arriva ciò che la riempie e la governa: il job di apprendimento a
-- fine conversazione, accodato da pg_cron quando una conversazione è ferma
-- da un po' e ha risposte non ancora «lette»; la retention (meccanismo ora,
-- politica quando la consulenza legale la fissa, RNF-03); le policy di
-- scrittura per il pannello (RF-G-03: correzione, sospensione,
-- cancellazione effettiva, spostamento personale⇄tenant).
--
-- Niente POST dal client: un ricordo nasce solo imparando (RF-G-01).

-- ---------------------------------------------------------------------------
-- Le categorie del contratto FE: `fatto` diventa `altro`, arrivano `cliente` e `altro`
-- ---------------------------------------------------------------------------

alter table velia.ricordi drop constraint ricordi_categoria_check;
update velia.ricordi set categoria = 'altro' where categoria = 'fatto';
alter table velia.ricordi
  add constraint ricordi_categoria_check
  check (categoria in ('prassi', 'cliente', 'preferenza', 'decisione', 'altro'));

-- Un ricordo di tenant non ha un proprietario: la policy di modifica lo pretende.
update velia.ricordi set utente_id = null where ambito = 'tenant' and utente_id is not null;

-- Un ricordo nasce sempre con un testo che si può confrontare: la forma
-- normalizzata serve a non imparare due volte la stessa cosa.
alter table velia.ricordi add column impronta text;
update velia.ricordi
  set impronta = regexp_replace(lower(trim(testo)), '\s+', ' ', 'g');
alter table velia.ricordi alter column impronta set not null;
create index ricordi_impronta on velia.ricordi (tenant_id, impronta);

-- ---------------------------------------------------------------------------
-- La conversazione ricorda fin dove è stata letta dall'apprendimento
-- ---------------------------------------------------------------------------

alter table velia.conversazioni
  -- Le risposte fino a qui sono già passate dal job; null = mai.
  add column appresa_fino_a timestamptz,
  -- Il tick l'ha accodata e il job non ha ancora chiuso: non si riaccoda.
  add column apprendimento_accodato_il timestamptz;

create index conversazioni_da_apprendere on velia.conversazioni (updated_at)
  where apprendimento_accodato_il is null;

-- ---------------------------------------------------------------------------
-- Il governo per tenant: interruttore, attesa, retention
-- ---------------------------------------------------------------------------

alter table velia.tenant
  add column memoria_attiva boolean not null default true,
  -- Quanti minuti di silenzio fanno «fine conversazione».
  add column memoria_attesa_minuti int not null default 15 check (memoria_attesa_minuti between 1 and 1440),
  -- Null = nessuna scadenza (RNF-03: il numero lo fissa la consulenza legale).
  add column memoria_retention_giorni int check (memoria_retention_giorni is null or memoria_retention_giorni >= 1);

-- ---------------------------------------------------------------------------
-- Il tick: accoda l'apprendimento delle conversazioni concluse, applica la retention
-- ---------------------------------------------------------------------------

-- Una conversazione è «conclusa» quando è ferma da almeno l'attesa del
-- tenant e ha almeno una risposta dell'assistente oltre `appresa_fino_a`.
-- Un accodamento vecchio più di un giorno (job perso o fallito) non blocca
-- per sempre: si riaccoda, e il job rilegge lo stato — idempotente.
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
    where t.memoria_attiva
      and conv.updated_at <= now() - make_interval(mins => t.memoria_attesa_minuti)
      and (conv.apprendimento_accodato_il is null
           or conv.apprendimento_accodato_il < now() - interval '1 day')
      and exists (
        select 1 from velia.messaggi m
        where m.conversazione_id = conv.id
          and m.autore = 'assistente'
          and m.inviato_il > coalesce(conv.appresa_fino_a, '-infinity'::timestamptz)
      )
    for update of conv skip locked
  loop
    insert into velia.jobs (tipo, payload, tenant_id)
    values ('memoria', jsonb_build_object('conversazioneId', c.id), c.tenant_id)
    returning id into nuovo_job_id;
    perform pgmq.send('lavori', jsonb_build_object('jobId', nuovo_job_id));

    update velia.conversazioni set apprendimento_accodato_il = now() where id = c.id;
    accodate := accodate + 1;
  end loop;
  return accodate;
end;
$$;

-- La retention: i ricordi più vecchi della finestra del tenant spariscono
-- davvero (cancellazione effettiva, RF-G-05). `updated_at` e non
-- `created_at`: un ricordo corretto o riattivato di recente è ancora vivo.
create or replace function velia.scada_ricordi() returns int
language plpgsql as $$
declare
  cancellati int;
begin
  delete from velia.ricordi r
  using velia.tenant t
  where t.id = r.tenant_id
    and t.memoria_retention_giorni is not null
    and r.updated_at < now() - make_interval(days => t.memoria_retention_giorni);
  get diagnostics cancellati = row_count;
  return cancellati;
end;
$$;

do $$
begin
  perform cron.unschedule('velia-memoria-tick');
exception when others then
  null; -- non esisteva ancora
end;
$$;

select cron.schedule(
  'velia-memoria-tick',
  '*/5 * * * *',
  $$select velia.accoda_apprendimento(), velia.scada_ricordi()$$
);

-- ---------------------------------------------------------------------------
-- RLS: il pannello scrive ciò che vede — tenant + i propri personali
-- ---------------------------------------------------------------------------

-- Spostare a `personale` significa prenderlo in carico (utente_id = sé);
-- spostare a `tenant` lo condivide (utente_id null). Il `with check`
-- impedisce di intestare un ricordo a un collega.
create policy ricordi_modifica on velia.ricordi
  for update to authenticated
  using (
    tenant_id = velia.tenant_corrente()
    and (ambito = 'tenant' or utente_id = (select auth.uid()))
  )
  with check (
    tenant_id = velia.tenant_corrente()
    and (
      (ambito = 'tenant' and utente_id is null)
      or (ambito = 'personale' and utente_id = (select auth.uid()))
    )
  );

create policy ricordi_rimozione on velia.ricordi
  for delete to authenticated
  using (
    tenant_id = velia.tenant_corrente()
    and (ambito = 'tenant' or utente_id = (select auth.uid()))
  );
