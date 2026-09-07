-- Le tabelle nuove appartengono a `velia_app`, come tutte le altre
-- (07/09/2026).
--
-- `tools/applica-migrazione.mjs` passa dalla Management API di Supabase, che
-- esegue come `postgres`: una tabella creata da una migrazione nasce quindi
-- di proprietà di `postgres`, mentre ogni altra tabella dello schema è di
-- `velia_app` — il ruolo con cui l'applicazione si connette.
--
-- La differenza non si vede finché non si accende la RLS. Un proprietario
-- non è soggetto alle proprie policy (salvo `force row level security`), ed
-- è così che il worker legge l'archivio con la connessione di sistema. Ma
-- su una tabella di `postgres`, `velia_app` è un utente qualsiasi: le
-- policy scritte `to authenticated` non lo riguardano, non ne esiste
-- nessun'altra, e il risultato è zero righe — in silenzio, che è il modo
-- peggiore.
--
-- Si è manifestato come «il link del cliente non vale mai»: `risolviOspite`
-- legge `chat_clienti` con la connessione di sistema, fuori da
-- `conIdentita`, e non trovava nessuna riga.

alter table velia.chat_clienti owner to velia_app;
alter table velia.chat_clienti_cartelle owner to velia_app;
alter table velia.chat_clienti_documenti owner to velia_app;

-- Le funzioni del cono sono `security definer`: girano con i privilegi di
-- chi le possiede. Anche loro a `velia_app`, che è il proprietario delle
-- tabelle che leggono — così scavalcano la RLS esattamente quanto serve a
-- calcolare il cono, e non un millimetro di più.
alter function velia.cartelle_nel_cono() owner to velia_app;
alter function velia.documenti_nel_cono() owner to velia_app;
alter function velia.ospite_corrente() owner to velia_app;
