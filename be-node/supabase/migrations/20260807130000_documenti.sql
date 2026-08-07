-- Fase 1 — Archivio documentale: documenti pubblici e preferiti.
--
-- La tabella nasce con il discriminante `archivio` già nel contratto
-- (pubblico/privato/conversazione): la Fase 2 aggiungerà le colonne del
-- privato con una migrazione propria, senza rifare questa. I campi
-- dell'edizione stanno sulla riga: un documento È una edizione di un
-- prodotto (RF-A-04), e le "altre edizioni" sono le righe sorelle per
-- (compagnia, prodotto, tipologia).

-- Nella casa delle estensioni di Supabase: si chiama con extensions.unaccent().
create extension if not exists unaccent with schema extensions;

create table assieme.documenti (
  -- Id testuali: 'doc-pub-001' è già il contratto delle fixture e delle URL.
  id text primary key,
  archivio text not null default 'pubblico'
    check (archivio in ('pubblico', 'privato', 'conversazione')),
  -- Nullo per l'Archivio Pubblico, obbligatorio altrove (RF-B-01):
  -- il vincolo incrociato sta qui sotto.
  tenant_id uuid references assieme.tenant (id) on delete cascade,
  titolo text not null,
  tipologia text not null check (tipologia in (
    'dip', 'dip-aggiuntivo', 'condizioni-assicurazione', 'glossario',
    'preventivo', 'polizza', 'appendice', 'convenzione', 'nota-tecnica', 'altro'
  )),
  numero_pagine int,
  compagnia_id text references assieme.compagnie (id),
  ramo_id text references assieme.rami (id),
  prodotto text,
  edizione_id text,
  edizione_etichetta text,
  edizione_valida_dal date,
  edizione_valida_al date,
  edizione_corrente boolean not null default false,
  -- Dove vivranno PDF e Markdown nello Storage (punto 2 della fase).
  path_pdf text,
  path_md text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint documenti_tenant_coerente check (
    (archivio = 'pubblico' and tenant_id is null)
    or (archivio <> 'pubblico' and tenant_id is not null)
  )
);

create index documenti_archivio on assieme.documenti (archivio);
create index documenti_compagnia on assieme.documenti (compagnia_id);
create index documenti_ramo on assieme.documenti (ramo_id);
create index documenti_prodotto on assieme.documenti (compagnia_id, prodotto, tipologia);
create index documenti_tenant on assieme.documenti (tenant_id) where tenant_id is not null;

create trigger documenti_updated_at
  before update on assieme.documenti
  for each row execute function assieme.tocca_updated_at();

-- RF-A-09: i preferiti sono dell'utente, non del documento. La fixture del
-- mock aveva un booleano globale perché il mock ha un utente solo.
create table assieme.preferiti (
  utente_id uuid not null references assieme.utenti (id) on delete cascade,
  documento_id text not null references assieme.documenti (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (utente_id, documento_id)
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table assieme.documenti enable row level security;
alter table assieme.preferiti enable row level security;

-- L'Archivio Pubblico è leggibile da ogni autenticato (RF-A-01) e in sola
-- lettura per i tenant (RF-A-05): nessuna policy di scrittura, scrive il
-- back-office con la connessione di sistema. La Fase 2 estenderà la policy
-- di lettura al privato del proprio tenant.
create policy documenti_lettura on assieme.documenti
  for select to authenticated
  using (archivio = 'pubblico');

-- I preferiti: ciascuno vede e governa i propri, e basta.
create policy preferiti_lettura on assieme.preferiti
  for select to authenticated
  using (utente_id = (select auth.uid()));

create policy preferiti_scrittura on assieme.preferiti
  for insert to authenticated
  with check (utente_id = (select auth.uid()));

create policy preferiti_rimozione on assieme.preferiti
  for delete to authenticated
  using (utente_id = (select auth.uid()));

-- Il proprietario delle tabelle ASSIEME è il ruolo dell'applicazione
-- (decisione di Fase 0: ogni migrazione che crea tabelle chiude così).
alter table assieme.documenti owner to assieme_app;
alter table assieme.preferiti owner to assieme_app;
