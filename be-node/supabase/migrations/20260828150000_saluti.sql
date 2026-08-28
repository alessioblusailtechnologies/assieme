-- I saluti della schermata iniziale, generati dal modello (28/08/2026).
--
-- Fino a oggi il saluto della home era una rosa fissa di frasi nel FE
-- (`saluto.ts`). Ora l'API chiede a un modello economico un lotto di frasi
-- per fascia oraria con il segnaposto `{nome}` e lo conserva qui: un lotto
-- vale per tutti (il modello non vede i nomi degli utenti), si rigenera
-- quando è più vecchio di `SALUTI_ORE_VALIDITA`. Le frasi fisse restano nel
-- FE come rete di sicurezza: fascia vuota o lotto assente, si usano quelle.
--
-- Scrive solo l'API con la connessione di sistema; chi è autenticato legge.

create table velia.saluti (
  id uuid primary key default gen_random_uuid(),
  generato_il timestamptz not null default now(),
  modello text not null,
  frasi jsonb not null
);

create index saluti_per_data on velia.saluti (generato_il desc);

alter table velia.saluti enable row level security;

create policy saluti_lettura on velia.saluti
  for select to authenticated
  using (true);

alter table velia.saluti owner to velia_app;
