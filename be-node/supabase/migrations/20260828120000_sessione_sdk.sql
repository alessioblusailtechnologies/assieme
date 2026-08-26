-- Ripresa di sessione nel multi-turno (misura del 26/08/2026: follow-up
-- a -76% di costo e -66% di tempo).
--
-- Ogni messaggio resta un job, ma il motore riprende la sessione SDK del
-- messaggio precedente invece di ripartire da zero con la storia ricopiata
-- nel prompt: i documenti già letti sono nel contesto (in cache), non si
-- rileggono. L'id della sessione vive sulla conversazione; la trascrizione
-- sta sul disco del worker: se non c'è più (altro host, riavvio), il job
-- riparte pieno come prima.

alter table velia.conversazioni
  add column if not exists sessione_sdk text,
  add column if not exists sessione_sdk_al timestamptz;
