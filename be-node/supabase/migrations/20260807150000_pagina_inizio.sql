-- Un documento del set sa dove comincia dentro il PDF condiviso
-- dell'edizione: aprire il DIP deve portare al DIP, non alla copertina
-- delle Condizioni. Le ancore [pag. N] dei Markdown sono già su questa
-- numerazione complessiva: nessuna rimappatura, mai.
alter table assieme.documenti add column pagina_inizio int;
