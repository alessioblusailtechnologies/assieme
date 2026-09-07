-- Il link di una chat cliente si può rileggere (07/09/2026).
--
-- Nella prima versione si conservava solo lo `sha256` del token: il link si
-- vedeva una volta sola, alla creazione, e per riaverlo bisognava
-- rigenerarlo — spegnendo quello che il cliente aveva già in tasca.
--
-- Era una cautela che qui non cautela niente. Il token dà accesso al **cono**
-- di una chat: un pugno di documenti che chi legge questa tabella può già
-- leggere in `velia.documenti`, insieme a quelli di tutti gli altri clienti.
-- L'impronta avrebbe senso se il segreto valesse più del database che lo
-- contiene; qui vale molto meno.
--
-- In cambio costava il gesto più naturale che un'agenzia possa fare: ridare
-- al cliente il link che ha perso, senza rompere quello già mandato.
--
-- `token_hash` resta ed è ancora la chiave di ricerca: `risolviOspite` non
-- cambia, e l'indice unico continua a fare il suo lavoro.

alter table velia.chat_clienti
  -- Null sulle chat create prima d'oggi: di quelle il link non è
  -- recuperabile, e l'interfaccia lo dice invece di far finta.
  add column token text;

comment on column velia.chat_clienti.token is
  'Il segreto del link, in chiaro, per poterlo rimostrare all''agenzia. La ricerca resta su token_hash. Null sulle chat anteriori al 07/09/2026: per quelle si può solo rigenerare.';
