-- Fase 2 — Archivio Privato (RF-B-01…B-05, B-07…B-09).
--
-- I documenti privati sono righe di `documenti` con archivio = 'privato':
-- stesso catalogo, stessa pipeline di ingestion, stesso visualizzatore.
-- Cambia chi li vede — il proprio tenant e basta (RF-B-01), e la RLS lo
-- garantisce prima di qualunque codice applicativo — e che cosa portano:
-- chi li ha caricati e quando, quanto pesano, le etichette, il cliente di
-- riferimento, il flag di documento di riferimento, la visibilità.

-- ---------------------------------------------------------------------------
-- Le colonne del privato
-- ---------------------------------------------------------------------------

alter table velia.documenti
  -- RF-B-03: metadati di base acquisiti all'upload.
  add column caricato_da uuid references velia.utenti (id) on delete set null,
  add column caricato_il timestamptz,
  add column dimensione_byte bigint check (dimensione_byte >= 0),
  -- Il nome con cui l'utente l'ha caricato: titolo iniziale e indizio per
  -- la classificazione. Il path nello Storage usa l'id, non questo.
  add column nome_file text,
  -- RF-B-07: prevista dallo schema dal principio, applicata quando il
  -- pilota la chiede (oggi tutto nasce 'tenant', nessuna rotta scrive
  -- 'personale').
  add column visibilita text not null default 'tenant'
    check (visibilita in ('tenant', 'personale')),
  -- RF-B-09: il flag sta qui; il governo (ambito, attivo) nelle Istruzioni.
  add column documento_di_riferimento boolean not null default false,
  -- RF-B-03: cliente/pratica di riferimento, proposto dalla classificazione
  -- e correggibile dall'utente.
  add column riferimento_cliente text,
  -- RF-B-03: true finché la classificazione è una proposta del sistema;
  -- la prima modifica dell'utente ai metadati vale come conferma.
  add column classificazione_da_confermare boolean not null default false,
  -- RF-B-04: etichette libere. Un array, non una tabella ponte: il
  -- contratto FE le vuole come `string[]` sul documento e l'elenco
  -- `/api/etichette` è un conteggio — unnest + GIN bastano e avanzano.
  add column etichette text[] not null default '{}',
  -- Un privato senza data e peso non esiste: sono i dati che RF-B-03 e
  -- RF-B-08 pretendono all'upload.
  add constraint documenti_privato_completo check (
    archivio <> 'privato'
    or (caricato_il is not null and dimensione_byte is not null)
  );

create index documenti_etichette on velia.documenti using gin (etichette);
create index documenti_privati_recenti
  on velia.documenti (tenant_id, caricato_il desc)
  where archivio = 'privato';

-- ---------------------------------------------------------------------------
-- RF-B-08: limiti di piano, per tenant
-- ---------------------------------------------------------------------------
-- I default sono quelli del mock (5 GB di spazio, 20 MB per file): il
-- piano commerciale li cambierà per tenant, mai nel codice.

alter table velia.tenant
  add column limite_spazio_byte bigint not null default 5368709120
    check (limite_spazio_byte > 0),
  add column limite_file_byte bigint not null default 20971520
    check (limite_file_byte > 0);

-- ---------------------------------------------------------------------------
-- RLS: il privato del proprio tenant, e nient'altro
-- ---------------------------------------------------------------------------
-- La lettura si estende come promesso in 20260807130000_documenti.sql.
-- Le scritture sono dell'utente autenticato del tenant: l'inserimento
-- pretende che la riga sia firmata da chi la scrive (caricato_da =
-- auth.uid()), modifica e rimozione restano dentro il tenant. Il worker
-- non passa da qui: aggiorna stato e metadati con la connessione di
-- sistema su job già autorizzati.

drop policy documenti_lettura on velia.documenti;

create policy documenti_lettura on velia.documenti
  for select to authenticated
  using (
    archivio = 'pubblico'
    or (archivio = 'privato' and tenant_id = velia.tenant_corrente())
  );

create policy documenti_privati_inserimento on velia.documenti
  for insert to authenticated
  with check (
    archivio = 'privato'
    and tenant_id = velia.tenant_corrente()
    and caricato_da = (select auth.uid())
  );

create policy documenti_privati_modifica on velia.documenti
  for update to authenticated
  using (archivio = 'privato' and tenant_id = velia.tenant_corrente())
  with check (archivio = 'privato' and tenant_id = velia.tenant_corrente());

create policy documenti_privati_rimozione on velia.documenti
  for delete to authenticated
  using (archivio = 'privato' and tenant_id = velia.tenant_corrente());
