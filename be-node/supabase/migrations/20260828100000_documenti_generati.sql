-- Documenti generati in chat (revisione template del 25/08/2026).
--
-- Il motore, su richiesta dell'utente («esporta con Proposta breve»), genera
-- un documento sul template durante la risposta. I file stanno nello Storage
-- (`tenant/<tid>/generati/<id>.<fmt>`); la risposta li porta con sé come
-- elenco jsonb nella forma del contratto FE (`DocumentoGenerato`), scritto
-- dal worker insieme al messaggio.

alter table velia.messaggi
  add column if not exists documenti jsonb not null default '[]'::jsonb;
