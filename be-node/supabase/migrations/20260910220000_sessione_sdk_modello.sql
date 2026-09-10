-- Il modello con cui è nata la sessione SDK da riprendere (10/09/2026).
--
-- Da oggi il livello si cambia anche dal composer, un messaggio alla volta:
-- una sessione nata su un fornitore e ripresa da un altro si porta dietro
-- blocchi di ragionamento firmati che quello non riconosce, e la cache non
-- vale comunque. Il worker riprende solo se il modello chiesto adesso è
-- quello di allora; altrimenti riparte pieno, con la storia dal database.
--
-- Null = il default di piattaforma: le sessioni salvate prima di questa
-- colonna sono nate così (o sul modello del tenant, e allora al primo
-- messaggio si riparte pieni una volta).

alter table velia.conversazioni
  add column if not exists sessione_sdk_modello text;
