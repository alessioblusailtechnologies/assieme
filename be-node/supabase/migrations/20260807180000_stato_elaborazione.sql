-- RF-B-05: lo stato di elaborazione sul documento. Il catalogo esistente è
-- tutto `pronto` (i .md sono già in archivio); la pipeline di ingestion
-- porta i documenti nuovi attraverso in-coda → in-elaborazione → pronto,
-- o li lascia in `errore` con un motivo leggibile (RF-B-06).
alter table velia.documenti
  add column stato text not null default 'pronto'
    check (stato in ('in-coda', 'in-elaborazione', 'pronto', 'errore')),
  add column errore_elaborazione text;
