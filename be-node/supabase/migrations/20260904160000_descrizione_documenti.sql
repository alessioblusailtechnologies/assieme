-- Ogni documento privato dice che cosa contiene, non solo come si chiama
-- (04/09/2026).
--
-- Gli `INDICE.md` dell'archivio privato sono generati dai metadati: file,
-- titolo, tipologia, compagnia, ramo, cliente, pagine, etichette. Sono
-- tutte risposte alla domanda «che cos'è», nessuna alla domanda «che cosa
-- c'è dentro». Su una polizza di quaranta pagine il motore legge il titolo
-- e poi apre alla cieca, o peggio non la apre.
--
-- Sul pubblico questo problema non c'è: l'ingestion visiva scrive indici
-- che raccontano il set documento per documento. Qui la descrizione la
-- scrive il classificatore, nella stessa chiamata in cui propone tipologia
-- e cliente: non costa un modello in più, e arriva dallo stesso estratto.
--
-- `coalesce` in scrittura, come per gli altri campi proposti: se qualcuno
-- l'ha già scritta, la proposta non la sovrascrive.

alter table velia.documenti
  -- Una riga sola, in italiano, su che cosa contiene il documento: le
  -- garanzie o l'oggetto, il veicolo o il bene, gli importi che lo
  -- identificano. Null per tutto ciò che è entrato prima di oggi e per i
  -- documenti pubblici, che hanno già i loro INDICE.
  add column descrizione text;

comment on column velia.documenti.descrizione is
  'Che cosa contiene il documento, in una riga: la scrive il classificatore in ingestion e finisce negli INDICE.md della workspace.';
