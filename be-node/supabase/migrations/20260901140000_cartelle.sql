-- Fase 10 — Archivio Privato a cartelle (RF-B-03/B-04).
--
-- L'albero è libero: l'utente crea, rinomina, sposta e annida come vuole, e
-- non gli si chiede di configurare nessuno schema. Un'agenzia non arriva mai
-- senza documenti — arriva con la sua cartellazione, fatta in anni di
-- lavoro — quindi la convenzione si OSSERVA dall'archivio importato, non si
-- domanda. Quello che il sistema ha capito lo passa poi al modello quando
-- deve collocare un documento nuovo e quando deve cercare: è il CLAUDE.md
-- dell'archivio (doc motore §3.3).
--
--   clienti              l'anagrafica che mancava: `riferimento_cliente` era
--                        testo libero e non regge la risoluzione
--   cartelle             l'albero, unica verità sul dove sta un documento
--   convenzione_archivio come è organizzato questo archivio, osservato
--   documenti.*          cartella, cliente, e la memoria della proposta
--
-- Lo Storage non si tocca: resta piatto per id (Fase 2). Spostare una
-- cartella è una `update` di `parent_id`, non un trasloco di byte.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- La normalizzazione dei nomi: una funzione sola, usata ovunque
-- ---------------------------------------------------------------------------
-- «Rossi Mario», «ROSSI  MARIO», «Mario Rossi» e «Rossi Mario S.r.l.» non
-- sono lo stesso cliente per un'uguaglianza di stringhe, e lo sono per
-- chiunque lavori in agenzia. Qui si toglie ciò che non distingue (accenti,
-- maiuscole, punteggiatura, forme sociali e titoli) e si ordinano i token:
-- l'ordine di nome e cognome non è un'informazione.
--
-- I punti si cancellano prima della punteggiatura, non insieme: così
-- «S.r.l.» diventa il token `srl` e cade nella lista, mentre «Rossi M.»
-- resta `rossi m` e NON collassa su «Rossi» — due clienti diversi non si
-- fondono mai per colpa della normalizzazione.
--
-- È `stable` e non `immutable` perché `extensions.unaccent()` lo è: per
-- questo il valore si materializza in colonna con un trigger invece di
-- vivere in una `generated` o in un indice funzionale.

create or replace function velia.normalizza_nome(testo text)
returns text
language sql
stable
as $$
  select coalesce(string_agg(parola, ' ' order by parola), '')
  from unnest(
    string_to_array(
      regexp_replace(
        replace(lower(extensions.unaccent(coalesce(testo, ''))), '.', ''),
        '[^a-z0-9]+', ' ', 'g'
      ),
      ' '
    )
  ) as parola
  where parola <> ''
    and not (parola = any (array[
      'srl', 'srls', 'spa', 'sapa', 'snc', 'sas', 'scarl', 'scrl', 'soc', 'societa',
      'sig', 'sigra', 'sigg', 'dott', 'dottssa', 'prof', 'avv', 'ing', 'geom', 'rag',
      'spett', 'spettle', 'ditta', 'impresa', 'di'
    ]));
$$;

-- ---------------------------------------------------------------------------
-- I clienti: l'entità su cui la collocazione automatica sta in piedi
-- ---------------------------------------------------------------------------

create table velia.clienti (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references velia.tenant (id) on delete cascade,
  nome text not null check (length(btrim(nome)) > 0),
  -- Materializzato dal trigger qui sotto, mai scritto dall'applicazione.
  nome_normalizzato text not null,
  tipo text not null default 'persona' check (tipo in ('persona', 'azienda')),
  codice_fiscale text,
  partita_iva text,
  -- Le forme con cui il cliente compare nei documenti («ROSSI M.», il nome
  -- dell'insegna): il match esatto le guarda insieme al nome.
  alias text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index clienti_nome_unico on velia.clienti (tenant_id, nome_normalizzato);
create index clienti_tenant on velia.clienti (tenant_id);
-- La ricerca dei candidati per somiglianza, quando il match esatto non basta.
create index clienti_somiglianza
  on velia.clienti using gin (nome_normalizzato extensions.gin_trgm_ops);
create index clienti_alias on velia.clienti using gin (alias);

create or replace function velia.clienti_normalizza()
returns trigger
language plpgsql
as $$
begin
  new.nome := btrim(new.nome);
  new.nome_normalizzato := velia.normalizza_nome(new.nome);
  -- Un nome fatto solo di forme sociali («S.r.l.») non deve normalizzare a
  -- vuoto e collidere con ogni altro caso limite.
  if new.nome_normalizzato = '' then
    new.nome_normalizzato := lower(new.nome);
  end if;
  return new;
end;
$$;

create trigger clienti_normalizza
  before insert or update of nome on velia.clienti
  for each row execute function velia.clienti_normalizza();

create trigger clienti_updated_at
  before update on velia.clienti
  for each row execute function velia.tocca_updated_at();

-- ---------------------------------------------------------------------------
-- Le cartelle: l'albero libero, e l'unica verità sul dove
-- ---------------------------------------------------------------------------

create table velia.cartelle (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references velia.tenant (id) on delete cascade,
  -- Null = cartella di radice. `cascade`: eliminare una cartella elimina il
  -- suo sottoalbero; che fine fanno i documenti lo decide la rotta.
  parent_id uuid references velia.cartelle (id) on delete cascade,
  nome text not null check (length(btrim(nome)) > 0),
  slug text not null,
  -- La riga che l'AI legge quando deve collocare, e che diventa l'INDICE.md
  -- della cartella per il motore: un artefatto, due usi. «Utils» non si
  -- spiega dal nome, si spiega da cosa contiene.
  descrizione text,
  -- Scritta da un umano: il ricalcolo non la tocca più. Stessa regola di
  -- `classificazione_da_confermare` in Fase 2 — la mano vince.
  descrizione_da_utente boolean not null default false,
  -- Che cosa sono i FIGLI di questa cartella, per come li ha visti
  -- l'osservazione. È l'unico posto in cui l'AI può creare una cartella da
  -- sola: dove il livello ammette istanze nuove (un cliente nuovo, un anno
  -- nuovo). Null = cartella libera, e lì l'AI non crea mai niente.
  ruolo_figli text check (ruolo_figli in (
    'clienti', 'anni', 'compagnie', 'rami', 'tipologie', 'prodotti'
  )),
  -- Questa cartella È la cartella di quel cliente. L'aggancio è l'id, così
  -- rinominarla in «Rossi Mario (bar Da Mario)» non rompe niente.
  cliente_id uuid references velia.clienti (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Due indici e non uno: in un unique index i NULL non collidono fra loro, e
-- senza il parziale sulla radice si potrebbero creare due «Clienti» in cima.
create unique index cartelle_slug_radice
  on velia.cartelle (tenant_id, slug) where parent_id is null;
create unique index cartelle_slug
  on velia.cartelle (tenant_id, parent_id, slug) where parent_id is not null;
create index cartelle_padre on velia.cartelle (tenant_id, parent_id);
create unique index cartelle_cliente
  on velia.cartelle (tenant_id, cliente_id) where cliente_id is not null;

create trigger cartelle_updated_at
  before update on velia.cartelle
  for each row execute function velia.tocca_updated_at();

-- ---------------------------------------------------------------------------
-- La convenzione: come è organizzato questo archivio, osservato
-- ---------------------------------------------------------------------------
-- Descrive la FORMA dei livelli, mai le istanze: tremila clienti non si
-- elencano qui, si dice «al livello 1 ci sono i clienti» e il modello ci
-- arriva con Glob. È il vincolo che la tiene corta abbastanza da viaggiare
-- in ogni prompt.

create table velia.convenzione_archivio (
  tenant_id uuid primary key references velia.tenant (id) on delete cascade,
  -- Quello che il sistema ha osservato.
  testo text not null default '',
  -- La correzione umana: vince sempre, e il ricalcolo non la sovrascrive.
  testo_utente text,
  -- L'impronta dell'albero da cui `testo` è stato ricavato: se non è
  -- cambiata non c'è niente da rifare.
  impronta text,
  -- Alzato dai cambi di STRUTTURA (creazione, rinomina, spostamento,
  -- eliminazione di una cartella), non dall'aggiunta di un documento: il
  -- duecentesimo preventivo in una cartella di preventivi non cambia nulla.
  da_ricalcolare boolean not null default false,
  calcolata_il timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger convenzione_updated_at
  before update on velia.convenzione_archivio
  for each row execute function velia.tocca_updated_at();

-- ---------------------------------------------------------------------------
-- Il documento: dove sta, di chi è, e cosa si era proposto
-- ---------------------------------------------------------------------------

alter table velia.documenti
  -- Unica verità sul dove. Null = «Da sistemare», che è una condizione
  -- normale e visibile, non un errore: il documento resta `pronto`,
  -- cercabile e referenziabile come tutti gli altri.
  add column cartella_id uuid references velia.cartelle (id) on delete set null,
  add column cliente_id uuid references velia.clienti (id) on delete set null,
  -- Vero finché la collocazione è una proposta del sistema. Uno spostamento
  -- manuale lo spegne, e da lì è definitiva: nessun ricalcolo la rimette in
  -- discussione.
  add column collocazione_da_confermare boolean not null default false,
  -- Il percorso che l'AI aveva proposto: il delta con quello finale è
  -- l'unica misura onesta della qualità del classificatore.
  add column collocazione_proposta text,
  -- Il percorso relativo con cui il documento è arrivato all'importazione.
  -- È da qui che nasce l'albero, e con l'albero la convenzione: un upload
  -- che lo perde butta via l'informazione da cui dipende tutto il resto.
  add column percorso_origine text,
  -- Estratti dal passo 3 insieme alla classificazione: servono al livello
  -- dell'anno (che è la DECORRENZA, non il caricamento) e ai rinnovi.
  add column numero_polizza text,
  add column decorrenza date,
  add column scadenza date;

create index documenti_cartella on velia.documenti (tenant_id, cartella_id)
  where archivio = 'privato';
create index documenti_cliente on velia.documenti (tenant_id, cliente_id)
  where cliente_id is not null;
-- «Da sistemare»: la si apre spesso e deve costare poco.
create index documenti_da_sistemare on velia.documenti (tenant_id, caricato_il desc)
  where archivio = 'privato' and cartella_id is null;

-- ---------------------------------------------------------------------------
-- RLS: il proprio tenant, e nient'altro
-- ---------------------------------------------------------------------------
-- Le cartelle e i clienti sono dati di tenant come gli altri: la garanzia
-- di RF-B-01 resta la RLS, non il codice applicativo. Il worker non passa
-- di qui — colloca con la connessione di sistema su job già autorizzati.

alter table velia.clienti enable row level security;
alter table velia.cartelle enable row level security;
alter table velia.convenzione_archivio enable row level security;

create policy clienti_lettura on velia.clienti
  for select to authenticated using (tenant_id = velia.tenant_corrente());
create policy clienti_inserimento on velia.clienti
  for insert to authenticated with check (tenant_id = velia.tenant_corrente());
create policy clienti_modifica on velia.clienti
  for update to authenticated
  using (tenant_id = velia.tenant_corrente())
  with check (tenant_id = velia.tenant_corrente());
create policy clienti_rimozione on velia.clienti
  for delete to authenticated using (tenant_id = velia.tenant_corrente());

create policy cartelle_lettura on velia.cartelle
  for select to authenticated using (tenant_id = velia.tenant_corrente());
create policy cartelle_inserimento on velia.cartelle
  for insert to authenticated with check (tenant_id = velia.tenant_corrente());
create policy cartelle_modifica on velia.cartelle
  for update to authenticated
  using (tenant_id = velia.tenant_corrente())
  with check (tenant_id = velia.tenant_corrente());
create policy cartelle_rimozione on velia.cartelle
  for delete to authenticated using (tenant_id = velia.tenant_corrente());

-- La convenzione si legge da tutti e si corregge dagli amministratori: la
-- guardia di ruolo sta sulla rotta, qui basta il confine del tenant.
create policy convenzione_lettura on velia.convenzione_archivio
  for select to authenticated using (tenant_id = velia.tenant_corrente());
create policy convenzione_inserimento on velia.convenzione_archivio
  for insert to authenticated with check (tenant_id = velia.tenant_corrente());
create policy convenzione_modifica on velia.convenzione_archivio
  for update to authenticated
  using (tenant_id = velia.tenant_corrente())
  with check (tenant_id = velia.tenant_corrente());

alter table velia.clienti owner to velia_app;
alter table velia.cartelle owner to velia_app;
alter table velia.convenzione_archivio owner to velia_app;
