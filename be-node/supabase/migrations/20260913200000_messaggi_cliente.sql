-- Il cliente di cui si parlava, su ogni domanda dell'utente (13/09/2026).
--
-- Chi menziona un cliente con «@» lo vede come chip nel campo mentre scrive,
-- e da oggi lo ritrova nella bolla della domanda inviata. Il chip dice con
-- quale cliente è partita *quella* domanda, non con quale cliente è la
-- conversazione adesso: il cliente si può staccare o cambiare a metà filo, e
-- i messaggi di prima non devono cambiare faccia.
--
-- Lo scrive il server all'invio, copiandolo dalla conversazione: è lo stesso
-- dato che il motore legge per sapere di chi si parla, così il chip e la
-- risposta non possono dire due cose diverse. Un cliente eliminato lascia il
-- messaggio senza chip, come un documento eliminato lascia il suo.
--
-- Niente riempimento dei messaggi di prima: non si sa con quale cliente
-- fossero partiti, e copiarci quello di oggi della conversazione sarebbe
-- inventarlo.

alter table velia.messaggi
  add column if not exists cliente_id uuid references velia.clienti (id) on delete set null;

comment on column velia.messaggi.cliente_id is
  'Il cliente agganciato alla conversazione quando la domanda dell''utente è partita: il chip nella bolla. Null sulle risposte e sui messaggi di prima del 13/09/2026.';
