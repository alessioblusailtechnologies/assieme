-- Il lavoro del motore resta scritto accanto alla risposta (07/09/2026).
--
-- I passi ci sono già: il worker li emette uno per uno sul flusso SSE
-- («Consulto l'indice dell'archivio», «Cerco «grandine» in «Nuova 4R»»,
-- «Leggo …»), e servono a non lasciare l'utente davanti a uno spinner per
-- due minuti. Ma vivono solo finché dura lo stream: ogni evento sovrascrive
-- il precedente nel front-end, e chi riapre la conversazione domani trova
-- la risposta senza più traccia di come ci si è arrivati.
--
-- Il punto non è l'effetto scenico. Su una risposta che cita una polizza,
-- «quali documenti ha davvero aperto» è la domanda che un agente si fa
-- quando la risposta gli sembra strana, ed è la stessa a cui deve poter
-- rispondere se qualcuno gliela contesta sei mesi dopo. Le citazioni dicono
-- da dove viene ogni frase; i passi dicono dove ha guardato prima di
-- sceglierle, comprese le strade che non hanno portato a niente.
--
-- Sta sul messaggio e non in una tabella a parte perché non si legge mai
-- separatamente: si carica con la conversazione, e con lei se ne va.

alter table velia.messaggi
  -- L'elenco ordinato dei passi, come sono avvenuti. Ogni voce:
  --   etichetta  la frase in italiano già mostrata nello stream
  --   strumento  chi l'ha prodotta (`Read`, `Grep`, `Glob`, `mcp__velia__…`),
  --              per l'icona: assente sui passi che il motore racconta a parole
  --   istante    quando è cominciato, ISO 8601
  --   durataMs   quanto è durato: lo chiude il passo dopo, o la fine della
  --              risposta; assente solo se la risposta si è interrotta prima
  -- Vuoto, e non null, per i messaggi dell'utente e per tutto ciò che è
  -- passato di qui prima d'oggi: il front-end non deve distinguere «non ne
  -- ha fatti» da «non lo sappiamo».
  add column passi jsonb not null default '[]'::jsonb;

comment on column velia.messaggi.passi is
  'I passi di lavoro del motore in ordine cronologico ({etichetta, strumento, istante, durataMs}): gli stessi mostrati dal vivo sul flusso SSE, tenuti perché la risposta resti verificabile anche dopo.';
