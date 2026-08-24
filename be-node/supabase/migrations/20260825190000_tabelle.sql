-- Fase 5 — Tabelle di analisi (RF-C-11…C-15).
--
-- Righe = documenti, colonne = criteri, celle = valori estratti con la
-- citazione completa o la dichiarazione di assenza (RF-C-12). Le celle
-- stanno in una tabella propria perché il worker le riempie una alla volta
-- e le mutazioni a generazione in corso (documenti e colonne aggiunti o
-- tolti) devono riconciliarsi per chiave, non per riscrittura di un blob.
-- I criteri predefiniti (RF-C-11) sono dato di piattaforma, seminato qui
-- con gli stessi id della fixture del mock.

-- Il nuovo tipo di job del worker.
alter table velia.jobs drop constraint jobs_tipo_check;
alter table velia.jobs add constraint jobs_tipo_check
  check (tipo in ('prova', 'ingestion', 'interrogazione', 'tabella', 'agente', 'memoria'));

-- ---------------------------------------------------------------------------
-- Tabelle, colonne, righe, celle
-- ---------------------------------------------------------------------------

create table velia.tabelle (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references velia.tenant (id) on delete cascade,
  autore_id uuid not null references velia.utenti (id) on delete cascade,
  titolo text not null,
  -- RF-C-15: visibile ai colleghi del tenant in sola lettura.
  condivisa boolean not null default false,
  stato text not null default 'in-generazione'
    check (stato in ('in-generazione', 'completa', 'errore')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tabelle_tenant_recenti on velia.tabelle (tenant_id, updated_at desc);

create trigger tabelle_updated_at
  before update on velia.tabelle
  for each row execute function velia.tocca_updated_at();

create table velia.tabelle_colonne (
  id uuid primary key default gen_random_uuid(),
  tabella_id uuid not null references velia.tabelle (id) on delete cascade,
  tenant_id uuid not null references velia.tenant (id) on delete cascade,
  posizione int not null,
  intestazione text not null,
  origine text not null check (origine in ('predefinita', 'personalizzata')),
  -- Per le personalizzate: il criterio così come l'utente l'ha scritto.
  criterio text
);

create index tabelle_colonne_per_tabella on velia.tabelle_colonne (tabella_id, posizione);

-- Nessun vincolo verso velia.documenti: un documento eliminato dagli archivi
-- non porta via la riga — l'etichetta è denormalizzata e le celle nuove
-- diventano «non determinabile», come da contratto.
create table velia.tabelle_righe (
  tabella_id uuid not null references velia.tabelle (id) on delete cascade,
  tenant_id uuid not null references velia.tenant (id) on delete cascade,
  documento_id text not null,
  archivio text not null check (archivio in ('pubblico', 'privato', 'conversazione')),
  etichetta text not null,
  posizione int not null,
  primary key (tabella_id, documento_id)
);

create table velia.tabelle_celle (
  tabella_id uuid not null,
  tenant_id uuid not null references velia.tenant (id) on delete cascade,
  documento_id text not null,
  colonna_id uuid not null references velia.tabelle_colonne (id) on delete cascade,
  stato text not null default 'in-attesa' check (stato in ('in-attesa', 'pronta')),
  esito text check (esito in ('presente', 'non-presente', 'non-determinabile')),
  valore text,
  nota text,
  motivo text,
  -- Citazioni complete nella forma del contratto (le valida il worker).
  citazioni jsonb not null default '[]'::jsonb,
  primary key (tabella_id, documento_id, colonna_id),
  foreign key (tabella_id, documento_id)
    references velia.tabelle_righe (tabella_id, documento_id) on delete cascade
);

create index tabelle_celle_in_attesa on velia.tabelle_celle (tabella_id) where stato = 'in-attesa';

-- ---------------------------------------------------------------------------
-- Criteri predefiniti (RF-C-11): dato di piattaforma, stessi id del mock
-- ---------------------------------------------------------------------------

create table velia.tabelle_criteri (
  id text primary key,
  intestazione text not null,
  descrizione text not null,
  ramo_id text references velia.rami (id),
  posizione int not null default 0
);

insert into velia.tabelle_criteri (id, intestazione, descrizione, ramo_id, posizione) values
  ('crit-garanzie', 'Garanzie incluse', 'Le garanzie comprese nella formulazione base del prodotto.', null, 1),
  ('crit-massimali', 'Massimali', 'I massimali delle garanzie principali, per sinistro e per periodo.', null, 2),
  ('crit-franchigie', 'Franchigie', 'Le franchigie fisse applicate, garanzia per garanzia.', null, 3),
  ('crit-scoperti', 'Scoperti', 'Gli scoperti percentuali e i relativi minimi.', null, 4),
  ('crit-esclusioni', 'Esclusioni principali', 'Le esclusioni che più spesso generano contestazioni in fase di sinistro.', null, 5),
  ('crit-auto-massimale-rc', 'Massimale RC', 'Massimale per sinistro della responsabilità civile, con il sottolimite per danni a cose.', 'ram-auto', 6),
  ('crit-auto-furto', 'Franchigia furto e incendio', 'Franchigia o scoperto applicati alla garanzia furto e incendio.', 'ram-auto', 7),
  ('crit-auto-cristalli', 'Cristalli', 'Massimale e franchigia della garanzia cristalli.', 'ram-auto', 8),
  ('crit-auto-infortuni', 'Infortuni del conducente', 'Presenza e massimale della garanzia infortuni del conducente.', 'ram-auto', 9),
  ('crit-auto-assistenza', 'Assistenza stradale', 'Prestazioni di assistenza: traino, veicolo sostitutivo, limiti chilometrici.', 'ram-auto', 10),
  ('crit-auto-eventi', 'Eventi atmosferici', 'Copertura di grandine, tempesta e altri eventi naturali.', 'ram-auto', 11),
  ('crit-casa-incendio', 'Incendio fabbricato', 'Forma di copertura e massimale per i danni al fabbricato.', 'ram-casa', 12),
  ('crit-casa-furto', 'Furto contenuto', 'Massimale, franchigie e scoperti per il furto del contenuto.', 'ram-casa', 13),
  ('crit-casa-rc', 'RC della vita privata', 'Massimale della responsabilità civile del nucleo familiare.', 'ram-casa', 14),
  ('crit-casa-assistenza', 'Assistenza abitativa', 'Prestazioni di assistenza: artigiani in urgenza, spese di albergo.', 'ram-casa', 15),
  ('crit-inf-invalidita', 'Invalidità permanente', 'Capitale assicurato e franchigia sull''invalidità permanente.', 'ram-infortuni', 16),
  ('crit-inf-diaria', 'Diaria da ricovero', 'Importo giornaliero e durata massima della diaria.', 'ram-infortuni', 17),
  ('crit-inf-morte', 'Caso morte', 'Capitale liquidato ai beneficiari in caso di morte da infortunio.', 'ram-infortuni', 18)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table velia.tabelle enable row level security;
alter table velia.tabelle_colonne enable row level security;
alter table velia.tabelle_righe enable row level security;
alter table velia.tabelle_celle enable row level security;
alter table velia.tabelle_criteri enable row level security;

-- Come le conversazioni (RF-C-15): la vede l'autore e, se condivisa, i
-- colleghi del tenant; la scrive solo l'autore.
create policy tabelle_lettura on velia.tabelle
  for select to authenticated
  using (
    tenant_id = velia.tenant_corrente()
    and (autore_id = (select auth.uid()) or condivisa)
  );

create policy tabelle_inserimento on velia.tabelle
  for insert to authenticated
  with check (tenant_id = velia.tenant_corrente() and autore_id = (select auth.uid()));

create policy tabelle_modifica on velia.tabelle
  for update to authenticated
  using (tenant_id = velia.tenant_corrente() and autore_id = (select auth.uid()))
  with check (tenant_id = velia.tenant_corrente() and autore_id = (select auth.uid()));

create policy tabelle_rimozione on velia.tabelle
  for delete to authenticated
  using (tenant_id = velia.tenant_corrente() and autore_id = (select auth.uid()));

-- Colonne, righe e celle seguono la visibilità della tabella; le scrive
-- l'autore (le celle pronte le scrive solo il worker, connessione di sistema).
create policy colonne_lettura on velia.tabelle_colonne
  for select to authenticated
  using (
    tenant_id = velia.tenant_corrente()
    and exists (
      select 1 from velia.tabelle t
      where t.id = tabelle_colonne.tabella_id
        and (t.autore_id = (select auth.uid()) or t.condivisa)
    )
  );

create policy colonne_inserimento on velia.tabelle_colonne
  for insert to authenticated
  with check (
    tenant_id = velia.tenant_corrente()
    and exists (
      select 1 from velia.tabelle t
      where t.id = tabelle_colonne.tabella_id and t.autore_id = (select auth.uid())
    )
  );

create policy colonne_rimozione on velia.tabelle_colonne
  for delete to authenticated
  using (
    tenant_id = velia.tenant_corrente()
    and exists (
      select 1 from velia.tabelle t
      where t.id = tabelle_colonne.tabella_id and t.autore_id = (select auth.uid())
    )
  );

create policy righe_lettura on velia.tabelle_righe
  for select to authenticated
  using (
    tenant_id = velia.tenant_corrente()
    and exists (
      select 1 from velia.tabelle t
      where t.id = tabelle_righe.tabella_id
        and (t.autore_id = (select auth.uid()) or t.condivisa)
    )
  );

create policy righe_inserimento on velia.tabelle_righe
  for insert to authenticated
  with check (
    tenant_id = velia.tenant_corrente()
    and exists (
      select 1 from velia.tabelle t
      where t.id = tabelle_righe.tabella_id and t.autore_id = (select auth.uid())
    )
  );

create policy righe_rimozione on velia.tabelle_righe
  for delete to authenticated
  using (
    tenant_id = velia.tenant_corrente()
    and exists (
      select 1 from velia.tabelle t
      where t.id = tabelle_righe.tabella_id and t.autore_id = (select auth.uid())
    )
  );

create policy celle_lettura on velia.tabelle_celle
  for select to authenticated
  using (
    tenant_id = velia.tenant_corrente()
    and exists (
      select 1 from velia.tabelle t
      where t.id = tabelle_celle.tabella_id
        and (t.autore_id = (select auth.uid()) or t.condivisa)
    )
  );

create policy celle_inserimento on velia.tabelle_celle
  for insert to authenticated
  with check (
    tenant_id = velia.tenant_corrente()
    and exists (
      select 1 from velia.tabelle t
      where t.id = tabelle_celle.tabella_id and t.autore_id = (select auth.uid())
    )
  );

create policy celle_rimozione on velia.tabelle_celle
  for delete to authenticated
  using (
    tenant_id = velia.tenant_corrente()
    and exists (
      select 1 from velia.tabelle t
      where t.id = tabelle_celle.tabella_id and t.autore_id = (select auth.uid())
    )
  );

-- I criteri sono di piattaforma: sola lettura per tutti gli autenticati.
create policy criteri_lettura on velia.tabelle_criteri
  for select to authenticated
  using (true);

alter table velia.tabelle owner to velia_app;
alter table velia.tabelle_colonne owner to velia_app;
alter table velia.tabelle_righe owner to velia_app;
alter table velia.tabelle_celle owner to velia_app;
alter table velia.tabelle_criteri owner to velia_app;
