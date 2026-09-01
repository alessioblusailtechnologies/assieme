-- Oltre il PDF (01/09/2026): l'archivio accetta anche Word, Excel, testo,
-- Markdown, CSV e immagini. Ciò che cambia a database è poco, perché la
-- pipeline resta quella: ogni documento, qualunque sia arrivato, viene
-- impaginato in un PDF che è quello che si apre nel visualizzatore e su cui
-- puntano le citazioni. L'originale però non si butta.
--
--   formato        com'è entrato, per decidere come leggerlo
--   path_originale il file caricato, così com'era; per i PDF coincide con path_pdf
alter table velia.documenti
  add column formato text not null default 'pdf'
    check (formato in ('pdf', 'markdown', 'testo', 'csv', 'docx', 'xlsx', 'immagine')),
  add column path_originale text;

-- Il pregresso è tutto PDF: l'originale è il PDF stesso.
update velia.documenti set path_originale = path_pdf where path_originale is null;
