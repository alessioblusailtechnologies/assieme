-- Una chat per cliente (13/09/2026).
--
-- Decisione del committente: un cliente ha un canale solo. Due link per la
-- stessa persona sono due porte da tenere d'occhio, con istruzioni e tetti
-- che divergono, e il cliente non sa quale dei due usare. Quando serve
-- ricominciare si rigenera il link della chat che c'è, o la si elimina.
--
-- Il limite sta nel database e non solo nell'API: due clic ravvicinati su
-- «Attiva» passerebbero entrambi un controllo fatto prima dell'inserimento.
-- Al 13/09 nessun cliente ne aveva più di una, quindi l'indice nasce senza
-- dover sistemare dati.
--
-- L'indice non unico sulle stesse colonne (migrazione 20260912120000)
-- diventa un doppione di questo, e se ne va.

create unique index if not exists chat_clienti_una_per_cliente
  on velia.chat_clienti (tenant_id, cliente_id);

drop index if exists velia.chat_clienti_cliente_idx;
