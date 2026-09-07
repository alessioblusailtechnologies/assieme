-- Chat per i clienti dell'agenzia: il ruolo ospite e il cono di lettura
-- (07/09/2026 — VELIA-piano-chat-clienti.md, Fase 1).
--
-- L'agenzia crea una chat per un suo cliente, ne sceglie a mano il cono di
-- lettura (cartelle dell'Archivio Privato e documenti pubblici) e le
-- istruzioni; ne esce un link. Chi apre il link entra come **ospite**.
--
-- Il punto delicato è uno solo, e questa migrazione esiste per quello: un
-- ospite ha un `tenant_id`, e tutte le policy scritte finora dicono
-- «questo tenant». Senza contromisure l'ospite erediterebbe l'agenzia
-- intera: i clienti, le istruzioni, gli utenti, l'archivio. Sedici tabelle
-- hanno esattamente quella forma.
--
-- Perciò qui non si aggiungono permessi all'ospite: **glieli si tolgono
-- tutti** con policy RESTRICTIVE (che si sommano in AND alle esistenti, non
-- in OR), e poi se ne riaprono cinque, per la sola lettura e solo dentro il
-- cono. Un errore in questo file non è «una riga di troppo»: è la polizza
-- di un cliente letta da un altro.

-- 1. Il ruolo ----------------------------------------------------------

alter table velia.utenti drop constraint utenti_ruolo_check;
alter table velia.utenti add constraint utenti_ruolo_check
  check (ruolo = any (array['operatore', 'amministratore', 'ospite']));

-- Le chat dei clienti consumano come tutto il resto, ma vanno contate a
-- parte: «quanto mi costano i clienti» è una domanda diversa da «quanto mi
-- costa l'agenzia».
alter table velia.consumi drop constraint consumi_origine_check;
alter table velia.consumi add constraint consumi_origine_check
  check (origine = any (array['app', 'mcp', 'agente', 'ingestion', 'chat-cliente']));

-- 2. Le tabelle --------------------------------------------------------

create table velia.chat_clienti (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references velia.tenant(id) on delete cascade,
  -- L'anagrafica, quando c'è: una chat può anche essere per un prospect.
  cliente_id uuid references velia.clienti(id) on delete set null,
  -- L'utenza ospite: un utente vero, con la sua riga in auth.users.
  ospite_id uuid not null references velia.utenti(id) on delete cascade,
  titolo text not null,
  -- Le istruzioni di questa chat. Quelle generali dell'agenzia NON entrano:
  -- sono scritte per il lavoro interno e possono contenere criteri
  -- commerciali che al cliente non vanno detti (piano §6).
  istruzioni text,
  -- Del segreto nel link si tiene solo lo sha256: il link si vede una volta
  -- sola, alla creazione, e poi si rigenera — non si rilegge.
  token_hash text not null unique,
  stato text not null default 'attiva'
    check (stato = any (array['attiva', 'sospesa', 'scaduta'])),
  scade_il timestamptz,
  -- Ogni domanda costa fra 0,43 e 0,99 USD: un link senza tetto è un
  -- portafoglio aperto. Null = nessun tetto, da usare con cognizione.
  tetto_domande int check (tetto_domande is null or tetto_domande > 0),
  domande_fatte int not null default 0,
  creata_da uuid not null references velia.utenti(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index chat_clienti_tenant_idx on velia.chat_clienti (tenant_id);
create index chat_clienti_ospite_idx on velia.chat_clienti (ospite_id);

create trigger chat_clienti_updated_at before update on velia.chat_clienti
  for each row execute function velia.tocca_updated_at();

-- Il cono privato: cartelle scelte a mano, una per una (decisione del
-- 07/09). Vale per la cartella **e tutto il suo sottoalbero**.
create table velia.chat_clienti_cartelle (
  chat_id uuid not null references velia.chat_clienti(id) on delete cascade,
  cartella_id uuid not null references velia.cartelle(id) on delete cascade,
  primary key (chat_id, cartella_id)
);

-- Il cono pubblico: documenti scelti a mano. Non «tutto l'Archivio
-- Pubblico»: al cliente si mostrano i prodotti che lo riguardano.
create table velia.chat_clienti_documenti (
  chat_id uuid not null references velia.chat_clienti(id) on delete cascade,
  documento_id text not null references velia.documenti(id) on delete cascade,
  primary key (chat_id, documento_id)
);

-- La conversazione di una chat cliente è una conversazione come le altre:
-- stesso job, stessi messaggi, stesso flusso SSE. Cambia solo da dove
-- viene. `autore_id` resta l'ospite, che è un utente vero: così la policy
-- «vedo le mie conversazioni» funziona già senza scriverne una nuova.
alter table velia.conversazioni
  add column chat_cliente_id uuid references velia.chat_clienti(id) on delete cascade;

create index conversazioni_chat_cliente_idx on velia.conversazioni (chat_cliente_id)
  where chat_cliente_id is not null;

-- 3. Chi è l'ospite corrente -------------------------------------------

-- Null per gli utenti dell'agenzia: è il perno di tutte le policy che
-- seguono, ed è scritto così perché una policy che dice «se non sei un
-- ospite passa» si legge in una riga.
create or replace function velia.ospite_corrente() returns uuid
  language sql stable
  as $$
    select case
      when auth.jwt() -> 'app_metadata' ->> 'ruolo' = 'ospite'
      then nullif(auth.jwt() ->> 'sub', '')::uuid
    end;
  $$;

-- 4. Il cono ------------------------------------------------------------

-- Le cartelle del cono, sottoalbero compreso.
--
-- Senza parametri di proposito: il cono è sempre quello di chi sta
-- chiedendo. Una funzione che accetta l'id di un ospite qualsiasi sarebbe
-- un modo per farsi dire il cono di un altro.
create or replace function velia.cartelle_nel_cono() returns table (cartella_id uuid)
  language sql stable security definer set search_path = velia, public
  as $$
    with recursive scelte as (
      select cc.cartella_id as id
      from velia.chat_clienti_cartelle cc
      join velia.chat_clienti c on c.id = cc.chat_id
      where c.ospite_id = velia.ospite_corrente()
        and c.stato = 'attiva'
        and (c.scade_il is null or c.scade_il > now())
    ),
    albero as (
      select id from scelte
      union
      select f.id from velia.cartelle f join albero a on f.parent_id = a.id
    )
    select id from albero;
  $$;

-- I documenti del cono: i pubblici scelti a mano, più i privati che stanno
-- nel sottoalbero delle cartelle scelte.
--
-- Un documento privato senza cartella (`cartella_id is null`, la radice
-- dell'archivio) non è in nessun cono: è il default giusto — ciò che non è
-- stato messo da nessuna parte non è stato dato a nessuno.
create or replace function velia.documenti_nel_cono() returns table (documento_id text)
  language sql stable security definer set search_path = velia, public
  as $$
    select cd.documento_id
    from velia.chat_clienti_documenti cd
    join velia.chat_clienti c on c.id = cd.chat_id
    where c.ospite_id = velia.ospite_corrente()
      and c.stato = 'attiva'
      and (c.scade_il is null or c.scade_il > now())
    union
    select d.id
    from velia.documenti d
    where d.archivio = 'privato'
      and d.cartella_id in (select cn.cartella_id from velia.cartelle_nel_cono() cn);
  $$;

-- 5. Negare tutto all'ospite -------------------------------------------

-- Una policy RESTRICTIVE si somma in AND a quelle esistenti: è l'unico modo
-- di togliere senza riscrivere le sedici policy già scritte.
--
-- L'elenco si calcola invece di scriverlo a mano, così questa migrazione
-- copre tutte le tabelle di oggi. Le tabelle di **domani** non le copre:
-- quello lo garantisce il test `ospite-negato-per-default`, che confronta
-- l'elenco delle tabelle con quello dei permessi e diventa rosso quando
-- qualcuno ne aggiunge una senza decidere che cosa ne vede un ospite.
do $$
declare
  concesse text[] := array[
    'documenti', 'cartelle', 'conversazioni', 'messaggi', 'tenant', 'compagnie', 'rami'
  ];
  t text;
begin
  for t in
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'velia' and c.relkind = 'r' and not (c.relname = any (concesse))
  loop
    execute format(
      'create policy %I on velia.%I as restrictive for all to authenticated '
      || 'using (velia.ospite_corrente() is null) '
      || 'with check (velia.ospite_corrente() is null)',
      t || '_ospite_mai', t
    );
  end loop;
end
$$;

-- 6. Riaprire il minimo -------------------------------------------------

-- Documenti: solo il cono, e in sola lettura. `with check (… is null)` vuol
-- dire che un ospite non scrive documenti in nessun caso.
create policy documenti_ospite_solo_cono on velia.documenti
  as restrictive for all to authenticated
  using (
    velia.ospite_corrente() is null
    or id in (select dc.documento_id from velia.documenti_nel_cono() dc)
  )
  with check (velia.ospite_corrente() is null);

-- Cartelle: idem. Servono perché il cliente veda i titoli dei percorsi
-- nelle citazioni, non per navigare l'archivio.
create policy cartelle_ospite_solo_cono on velia.cartelle
  as restrictive for all to authenticated
  using (
    velia.ospite_corrente() is null
    or id in (select cn.cartella_id from velia.cartelle_nel_cono() cn)
  )
  with check (velia.ospite_corrente() is null);

-- Conversazioni: solo le proprie, e solo quelle nate da una chat cliente.
--
-- Questa policy serve soprattutto a **spegnere `condivisa`**: la policy
-- esistente dice «le mie oppure quelle condivise», e senza questa riga un
-- ospite leggerebbe tutte le conversazioni che l'agenzia ha condiviso al
-- proprio interno.
create policy conversazioni_ospite_solo_sue on velia.conversazioni
  as restrictive for all to authenticated
  using (
    velia.ospite_corrente() is null
    or (autore_id = velia.ospite_corrente() and chat_cliente_id is not null)
  )
  with check (
    velia.ospite_corrente() is null
    or (autore_id = velia.ospite_corrente() and chat_cliente_id is not null)
  );

-- Messaggi: quelli delle proprie conversazioni. Stessa ragione di sopra —
-- la policy esistente passa anche per `condivisa`.
create policy messaggi_ospite_solo_suoi on velia.messaggi
  as restrictive for all to authenticated
  using (
    velia.ospite_corrente() is null
    or exists (
      select 1 from velia.conversazioni c
      where c.id = messaggi.conversazione_id
        and c.autore_id = velia.ospite_corrente()
        and c.chat_cliente_id is not null
    )
  )
  with check (
    velia.ospite_corrente() is null
    or exists (
      select 1 from velia.conversazioni c
      where c.id = messaggi.conversazione_id
        and c.autore_id = velia.ospite_corrente()
        and c.chat_cliente_id is not null
    )
  );

-- Tenant: la sola riga della propria agenzia, per scriverne il nome in
-- testa alla pagina. In sola lettura.
create policy tenant_ospite_sola_lettura on velia.tenant
  as restrictive for all to authenticated
  using (velia.ospite_corrente() is null or id = velia.tenant_corrente())
  with check (velia.ospite_corrente() is null);

-- Compagnie e rami sono anagrafiche di settore, uguali per tutti e non
-- riferibili a nessuna agenzia: l'ospite le legge, non le tocca.
create policy compagnie_ospite_sola_lettura on velia.compagnie
  as restrictive for all to authenticated
  using (true) with check (velia.ospite_corrente() is null);

create policy rami_ospite_sola_lettura on velia.rami
  as restrictive for all to authenticated
  using (true) with check (velia.ospite_corrente() is null);

comment on table velia.chat_clienti is
  'Chat destinate ai clienti dell''agenzia: cono di lettura, istruzioni e link. Chi entra dal link è un utente con ruolo ospite, e vede solo il cono (velia.documenti_nel_cono).';
