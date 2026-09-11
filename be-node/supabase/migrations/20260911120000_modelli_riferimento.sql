-- Modelli di riferimento (11/09/2026, fase 3 di PIANO-INTESTAZIONE-MODELLI.md).
--
-- `velia.template` diventa la tabella dei modelli di riferimento: documenti
-- dell'agenzia di qualsiasi formato (PDF, Word, Excel, PowerPoint) che si
-- richiamano in chat con «Genera da modello». Non c'è più un predefinito
-- per formato: «Esporta come» esce sempre col layout di VELIA e
-- l'intestazione dell'agenzia, e un modello si sceglie per nome.
--
-- Si parte da zero (decisione del committente): i template caricati finora
-- si cancellano, come i riferimenti degli agenti. I file nello Storage
-- restano orfani, senza danno.

delete from velia.template;

-- Con la colonna se ne va anche l'indice unico parziale «un predefinito per formato».
alter table velia.template drop column if exists predefinito;

alter table velia.template
  -- «Intestazione: dell'agenzia / la sua». Di norma quella dell'agenzia; «la sua»
  -- per i documenti da restituire come sono (il modulo di una compagnia).
  add column intestazione_agenzia boolean not null default true,
  -- L'anteprima in PDF: un PDF si mostra com'è; Word, Excel e PowerPoint si
  -- convertono una volta sul runner della sandbox (job `anteprima-modello`).
  add column anteprima text not null default 'assente'
    check (anteprima in ('assente', 'in-corso', 'pronta', 'errore')),
  add column path_anteprima text;

-- Gli agenti non scelgono più un template: un documento è il layout di
-- VELIA con l'intestazione dell'agenzia.
alter table velia.agenti drop column if exists template_output_id;
alter table velia.agenti_esecuzioni drop column if exists template_output_id;

-- Il nuovo tipo di job del worker: la conversione in PDF dell'anteprima.
alter table velia.jobs drop constraint jobs_tipo_check;
alter table velia.jobs add constraint jobs_tipo_check
  check (tipo in ('prova', 'ingestion', 'interrogazione', 'tabella', 'agente', 'memoria', 'anteprima-modello'));
