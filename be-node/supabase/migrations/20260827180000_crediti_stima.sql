-- I token di input dei modelli serviti da gateway terzi (HostYourAI) non
-- arrivano nello streaming: si stimano dal contesto che il modello ha
-- ricevuto, e l'addebito lo dichiara. Con Claude sono esatti.
alter table velia.crediti_movimenti
  add column token_stimati boolean not null default false;
