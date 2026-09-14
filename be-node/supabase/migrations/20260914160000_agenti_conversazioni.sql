-- Agenti, fase 4: ogni esecuzione è una conversazione (14/09/2026).
--
-- L'agente non ha più un motore suo: a ogni esecuzione il worker apre una
-- conversazione dell'agente, ci scrive la richiesta col piano confermato e
-- la fa lavorare dallo stesso turno della chat, con file, sandbox, clienti
-- ed email (solo verso i destinatari del piano). La conversazione non sta
-- nello storico della chat; si apre dall'esecuzione e si prosegue da lì.

alter table velia.conversazioni
  add column agente_id uuid references velia.agenti (id) on delete cascade;

create index conversazioni_agente on velia.conversazioni (agente_id)
  where agente_id is not null;

alter table velia.agenti_esecuzioni
  add column conversazione_id uuid references velia.conversazioni (id) on delete set null;

-- Il registro delle email sa da quale esecuzione è partita un'email: serve a
-- non rimandarla quando un tentativo fallito si ripete.
alter table velia.email_inviate
  add column esecuzione_id uuid references velia.agenti_esecuzioni (id) on delete set null;

create index email_inviate_esecuzione on velia.email_inviate (esecuzione_id)
  where esecuzione_id is not null;
