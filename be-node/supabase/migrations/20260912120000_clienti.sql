-- Fase 1 del `PIANO-CLIENTI.md` (12/09/2026) — la tabula rasa.
--
-- Cambia l'asse portante dell'Archivio Privato: il cliente diventa
-- l'entità, l'archivio torna un elenco piatto con le sue faccette, e
-- l'albero libero della Fase 10 se ne va con tutto ciò che lo serviva —
-- convenzione osservata, collocazione automatica, cono a cartelle.
--
-- Si taglia invece di traghettare perché niente è in produzione e
-- l'Archivio Privato si può svuotare (decisione del committente, 12/09).
-- Non c'è nessun travaso da scrivere: i documenti si ricaricano dopo la
-- Fase 3, quando l'ingestion propone cliente ed etichette nella forma
-- nuova, e un archivio ricaricato è un archivio che ha attraversato la
-- catena vera.
--
-- L'ordine qui sotto non è estetico: prima si riscrive il cono (che
-- dipende dalle cartelle), poi si buttano le cartelle, poi si aggiunge.
-- Il contrario non passerebbe.

-- ---------------------------------------------------------------------------
-- 1. Il cono di una chat cliente è il cliente
-- ---------------------------------------------------------------------------
-- Prima erano le cartelle scelte a mano, col loro sottoalbero. Ora sono i
-- documenti di quel cliente, **calcolati ogni volta**: la polizza caricata
-- domani entra da sola, senza che nessuno debba ricordarsi di aggiungerla.
-- Restano gli extra scelti a mano (i prodotti pubblici che lo riguardano,
-- un documento privato di un altro fascicolo) e le esclusioni, che sono la
-- stessa tabella con un flag: una perizia interna sta nel cliente ma al
-- cliente non si mostra.
--
-- Resta senza parametri, e per la ragione di prima: il cono è sempre quello
-- di chi sta chiedendo. Una funzione che accetta l'id di un ospite
-- qualsiasi sarebbe un modo per farsi dire il cono di un altro.

alter table velia.chat_clienti_documenti
  add column escluso boolean not null default false;

comment on column velia.chat_clienti_documenti.escluso is
  'Toglie dal cono un documento che il cliente ha (una perizia interna, una nota). La stessa tabella dice "in più" e "in meno".';

create or replace function velia.documenti_nel_cono() returns table (documento_id text)
  language sql stable security definer set search_path = velia, public
  as $$
    with chat as (
      select c.id, c.tenant_id, c.cliente_id
      from velia.chat_clienti c
      where c.ospite_id = velia.ospite_corrente()
        and c.stato = 'attiva'
        and (c.scade_il is null or c.scade_il > now())
    )
    select d.id
    from velia.documenti d
    join chat k on k.tenant_id = d.tenant_id and k.cliente_id = d.cliente_id
    where d.archivio = 'privato'
      and d.stato = 'pronto'
      and not exists (
        select 1 from velia.chat_clienti_documenti cd
        where cd.chat_id = k.id and cd.documento_id = d.id and cd.escluso
      )
    union
    select cd.documento_id
    from velia.chat_clienti_documenti cd
    join chat k on k.id = cd.chat_id
    where not cd.escluso;
  $$;

-- ---------------------------------------------------------------------------
-- 2. Via l'albero
-- ---------------------------------------------------------------------------
-- Le policy sulle cartelle e gli indici se ne vanno con le tabelle.
-- `cascade` sulle cartelle perché `documenti.cartella_id` le referenzia: la
-- colonna la togliamo comunque qui sotto, ma l'ordine non deve dipendere da
-- questo.
--
-- La tabella **prima** della funzione: `cartelle_ospite_solo_cono` è una
-- policy su `velia.cartelle` che chiama `velia.cartelle_nel_cono()`, quindi
-- finché la tabella c'è la funzione non si può buttare. Morta la tabella,
-- muore la policy, e la funzione resta sola.

drop table if exists velia.chat_clienti_cartelle;
drop table if exists velia.cartelle cascade;
drop function if exists velia.cartelle_nel_cono();
drop table if exists velia.convenzione_archivio;

alter table velia.documenti
  drop column if exists cartella_id,
  drop column if exists collocazione_da_confermare,
  drop column if exists collocazione_proposta;

-- `percorso_origine` resta: è il percorso con cui il file è arrivato
-- all'importazione, cioè un fatto sul caricamento, non un pezzo d'albero.
-- Da lì la Fase 3 ricava etichette invece che cartelle.

-- ---------------------------------------------------------------------------
-- 3. Il cliente diventa una scheda
-- ---------------------------------------------------------------------------
-- Quello che serviva a collocare (nome, alias, identificativi) c'era già.
-- Quello che manca è ciò che un'agenzia si aspetta di trovare aprendo un
-- cliente: come lo si raggiunge, che cosa si è detto, com'è segmentato.
--
-- I contatti stanno qui e **non nella memoria**: il perimetro di RF-G-05
-- scarta email, telefoni, indirizzi e codici fiscali, ed è giusto che
-- continui a farlo. Un dato personale ha una finalità e una tabella; un
-- ricordo è una frase che gira in ogni prompt.

alter table velia.clienti
  add column email text,
  add column telefono text,
  add column indirizzo text,
  add column nato_il date,
  add column note text,
  -- Segmentazione, non collocazione: «in rinnovo», «da richiamare».
  add column etichette text[] not null default '{}',
  add column stato text not null default 'attivo'
    check (stato = any (array['attivo', 'archiviato']));

create index clienti_etichette on velia.clienti using gin (etichette);
create index clienti_stato on velia.clienti (tenant_id, stato);

-- ---------------------------------------------------------------------------
-- 4. Il documento: di chi è, e se ne siamo sicuri
-- ---------------------------------------------------------------------------
-- `cliente_da_confermare` prende il posto di `collocazione_da_confermare`,
-- con la stessa regola di sempre: la proposta del sistema si vede, la mano
-- dell'utente la spegne e da lì non si discute più.

alter table velia.documenti
  add column cliente_da_confermare boolean not null default false;

-- «Senza cliente» è la vista che prima si chiamava «Da sistemare»: si apre
-- spesso e deve costare poco. Non è un errore — circolari, modulistica e
-- note tecniche un cliente non ce l'hanno per natura.
create index documenti_senza_cliente on velia.documenti (tenant_id, caricato_il desc)
  where archivio = 'privato' and cliente_id is null;

-- ---------------------------------------------------------------------------
-- 5. La conversazione sa di chi si parla
-- ---------------------------------------------------------------------------
-- È ciò che rende la scheda di un cliente una linea del tempo invece di un
-- elenco di file. `set null`: la conversazione è un artefatto di lavoro e
-- sopravvive al cliente; a portarsela via, quando serve, è la rotta di
-- eliminazione, che sa anche ripulire lo Storage.

alter table velia.conversazioni
  add column cliente_id uuid references velia.clienti (id) on delete set null;

create index conversazioni_cliente on velia.conversazioni (tenant_id, cliente_id)
  where cliente_id is not null;

-- ---------------------------------------------------------------------------
-- 6. Una chat cliente è per un cliente
-- ---------------------------------------------------------------------------
-- Era facoltativo («una chat può anche essere per un prospect»), e con il
-- cono calcolato dal cliente non può più esserlo: senza cliente il cono
-- sarebbe vuoto, cioè una chat che non sa rispondere a niente. Un prospect
-- si crea come cliente: costa un nome.
--
-- `cascade` e non `set null`, che con un not null sarebbe una
-- contraddizione: eliminare un cliente porta via le sue chat, e con loro le
-- conversazioni che ne sono nate.

delete from velia.chat_clienti where cliente_id is null;

alter table velia.chat_clienti
  drop constraint chat_clienti_cliente_id_fkey,
  add constraint chat_clienti_cliente_id_fkey
    foreign key (cliente_id) references velia.clienti (id) on delete cascade,
  alter column cliente_id set not null;

create index chat_clienti_cliente_idx on velia.chat_clienti (tenant_id, cliente_id);

-- ---------------------------------------------------------------------------
-- 7. Proprietario
-- ---------------------------------------------------------------------------
-- Nessuna tabella nuova qui, quindi niente da riassegnare: le colonne
-- ereditano il proprietario della loro tabella. La funzione del cono è
-- stata **sostituita**, non ricreata, e `create or replace` conserva il
-- proprietario (`velia_app`) e con esso il senso del `security definer`.
-- La riga qui sotto è una cintura, non una bretella.

alter function velia.documenti_nel_cono() owner to velia_app;

comment on function velia.documenti_nel_cono() is
  'I documenti che un ospite può leggere: quelli del suo cliente (calcolati ogni volta), più gli extra scelti a mano, meno gli esclusi.';
