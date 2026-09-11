-- Qualsiasi file in ingresso (11/09/2026, fase 3 di `PIANO-LINK-E-FORMATI.md`).
--
-- `documenti.formato` resta la famiglia con cui un documento si legge, non
-- la sua estensione (quella sta in `path_originale` e `nome_file`). Alle
-- sette di prima si aggiungono le famiglie che si leggono convertendo:
--
--   html     una pagina web, in testo
--   office   PowerPoint, Word ed Excel di prima del 2007, OpenOffice, RTF,
--            iWork, SVG: in PDF col LibreOffice della sandbox
--   email    .eml e .msg: intestazioni e corpo; gli allegati a sé
--   audio    trascritto con Voxtral
--   video    l'audio trascritto con Voxtral
--   firmato  .p7m: si sbusta e si legge il file firmato
--   altro    tutto il resto: si conserva, con una scheda che dice cos'è
alter table velia.documenti drop constraint documenti_formato_check;
alter table velia.documenti add constraint documenti_formato_check check (
  formato in (
    'pdf', 'markdown', 'testo', 'csv', 'docx', 'xlsx', 'immagine',
    'html', 'office', 'email', 'audio', 'video', 'firmato', 'altro'
  )
);

-- I modelli di riferimento di qualsiasi formato: `formato` è l'estensione
-- del file (una pagina HTML, un'immagine di stile, un .dotx…).
alter table velia.template drop constraint template_formato_check;
alter table velia.template add constraint template_formato_check check (formato ~ '^[a-z0-9]{1,10}$');
