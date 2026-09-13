-- Agenti, fase 3, seconda metà: via i campi che la richiesta ha sostituito (14/09/2026).
--
-- Da applicare quando il codice della fase 3 è in esercizio: fino ad allora
-- quello di prima li leggeva ancora (vedi `20260914130000_agenti_richiesta.sql`,
-- che ha già scritto la richiesta di ogni agente a partire da questi campi).

alter table velia.agenti
  drop column istruzioni,
  drop column descrizione,
  drop column fonti,
  drop column formato_output,
  drop column parametri;

alter table velia.agenti_esecuzioni drop column parametri;
