-- Generato da tools/genera-seed.mjs — non modificare a mano.

insert into assieme.tenant (id, nome, piano) values
  ('11111111-1111-4111-8111-111111111111', 'Assicurazioni Meridiana S.r.l.', 'agenzia')
on conflict (id) do update set nome = excluded.nome, piano = excluded.piano;

insert into assieme.compagnie (id, nome, ultimo_aggiornamento) values
  ('cmp-generali', 'Generali Italia', '2026-07-28'),
  ('cmp-cattolica', 'Cattolica Assicurazioni', '2026-07-28'),
  ('cmp-unipolsai', 'UnipolSai Assicurazioni', '2026-07-21'),
  ('cmp-allianz', 'Allianz Italia', '2026-07-14'),
  ('cmp-axa', 'AXA Italia', '2026-06-30'),
  ('cmp-zurich', 'Zurich Italia', '2026-06-30'),
  ('cmp-realemutua', 'Reale Mutua Assicurazioni', '2026-05-19'),
  ('cmp-groupama', 'Groupama Assicurazioni', '2026-05-12'),
  ('cmp-vittoria', 'Vittoria Assicurazioni', '2026-04-27'),
  ('cmp-itas', 'ITAS Mutua', '2026-03-16')
on conflict (id) do update set nome = excluded.nome, ultimo_aggiornamento = excluded.ultimo_aggiornamento;

insert into assieme.rami (id, nome, codice) values
  ('ram-auto', 'RC Auto e veicoli', 'rc-auto'),
  ('ram-infortuni', 'Infortuni', 'infortuni'),
  ('ram-casa', 'Casa e patrimonio', 'casa'),
  ('ram-salute', 'Salute', 'salute'),
  ('ram-vita', 'Vita e previdenza', 'vita'),
  ('ram-rc-prof', 'RC Professionale', 'rc-professionale'),
  ('ram-tutela', 'Tutela legale', 'tutela-legale'),
  ('ram-viaggi', 'Viaggi e assistenza', 'viaggi')
on conflict (id) do update set nome = excluded.nome, codice = excluded.codice;

insert into assieme.documenti (id, archivio, titolo, tipologia, numero_pagine, pagina_inizio, compagnia_id, ramo_id, prodotto, edizione_id, edizione_etichetta, edizione_valida_dal, edizione_valida_al, edizione_corrente, path_pdf, path_md) values
  ('doc-unipolsai-km-servizi-autovetture-ed-2019-01-condizioni-di-assicurazione', 'pubblico', 'Condizioni di Assicurazione — UnipolSai Km&Servizi Autovetture', 'condizioni-assicurazione', 154, 30, 'cmp-unipolsai', 'ram-auto', 'Km&Servizi Autovetture', 'edz-km-servizi-autovetture-2019-01', 'ed. 01/2019', '2019-01-01', '2022-10-31', false, 'archivio-pubblico/unipolsai/auto/km-servizi-autovetture/ed-2019-01/originale.pdf', 'archivio-pubblico/unipolsai/auto/km-servizi-autovetture/ed-2019-01/condizioni-di-assicurazione.md'),
  ('doc-unipolsai-km-servizi-autovetture-ed-2019-01-dip-aggiuntivo', 'pubblico', 'DIP Aggiuntivo R.C. Auto — UnipolSai Km&Servizi Autovetture', 'dip-aggiuntivo', 24, 6, 'cmp-unipolsai', 'ram-auto', 'Km&Servizi Autovetture', 'edz-km-servizi-autovetture-2019-01', 'ed. 01/2019', '2019-01-01', '2022-10-31', false, 'archivio-pubblico/unipolsai/auto/km-servizi-autovetture/ed-2019-01/originale.pdf', 'archivio-pubblico/unipolsai/auto/km-servizi-autovetture/ed-2019-01/dip-aggiuntivo.md'),
  ('doc-unipolsai-km-servizi-autovetture-ed-2019-01-dip', 'pubblico', 'DIP Danni — UnipolSai Km&Servizi Autovetture', 'dip', 5, 1, 'cmp-unipolsai', 'ram-auto', 'Km&Servizi Autovetture', 'edz-km-servizi-autovetture-2019-01', 'ed. 01/2019', '2019-01-01', '2022-10-31', false, 'archivio-pubblico/unipolsai/auto/km-servizi-autovetture/ed-2019-01/originale.pdf', 'archivio-pubblico/unipolsai/auto/km-servizi-autovetture/ed-2019-01/dip.md'),
  ('doc-unipolsai-km-servizi-autovetture-ed-2019-01-informativa-privacy', 'pubblico', 'Informativa Privacy — UnipolSai Km&Servizi Autovetture', 'altro', 6, 184, 'cmp-unipolsai', 'ram-auto', 'Km&Servizi Autovetture', 'edz-km-servizi-autovetture-2019-01', 'ed. 01/2019', '2019-01-01', '2022-10-31', false, 'archivio-pubblico/unipolsai/auto/km-servizi-autovetture/ed-2019-01/originale.pdf', 'archivio-pubblico/unipolsai/auto/km-servizi-autovetture/ed-2019-01/informativa-privacy.md'),
  ('doc-unipolsai-km-servizi-autovetture-ed-2019-01-riferimenti-utili', 'pubblico', 'Numeri e Riferimenti Utili — UnipolSai Km&Servizi Autovetture', 'altro', 5, 190, 'cmp-unipolsai', 'ram-auto', 'Km&Servizi Autovetture', 'edz-km-servizi-autovetture-2019-01', 'ed. 01/2019', '2019-01-01', '2022-10-31', false, 'archivio-pubblico/unipolsai/auto/km-servizi-autovetture/ed-2019-01/originale.pdf', 'archivio-pubblico/unipolsai/auto/km-servizi-autovetture/ed-2019-01/riferimenti-utili.md'),
  ('doc-unipolsai-km-servizi-autovetture-ed-2022-11-condizioni-di-assicurazione', 'pubblico', 'Condizioni di Assicurazione — UnipolSai Km&Servizi Autovetture', 'condizioni-assicurazione', 164, 37, 'cmp-unipolsai', 'ram-auto', 'Km&Servizi Autovetture', 'edz-km-servizi-autovetture-2022-11', 'ed. 11/2022', '2022-11-01', null, true, 'archivio-pubblico/unipolsai/auto/km-servizi-autovetture/ed-2022-11/originale.pdf', 'archivio-pubblico/unipolsai/auto/km-servizi-autovetture/ed-2022-11/condizioni-di-assicurazione.md'),
  ('doc-unipolsai-km-servizi-autovetture-ed-2022-11-dip-aggiuntivo', 'pubblico', 'DIP Aggiuntivo R.C. Auto — UnipolSai Km&Servizi Autovetture', 'dip-aggiuntivo', 30, 7, 'cmp-unipolsai', 'ram-auto', 'Km&Servizi Autovetture', 'edz-km-servizi-autovetture-2022-11', 'ed. 11/2022', '2022-11-01', null, true, 'archivio-pubblico/unipolsai/auto/km-servizi-autovetture/ed-2022-11/originale.pdf', 'archivio-pubblico/unipolsai/auto/km-servizi-autovetture/ed-2022-11/dip-aggiuntivo.md'),
  ('doc-unipolsai-km-servizi-autovetture-ed-2022-11-dip', 'pubblico', 'DIP Danni — UnipolSai Km&Servizi Autovetture', 'dip', 6, 1, 'cmp-unipolsai', 'ram-auto', 'Km&Servizi Autovetture', 'edz-km-servizi-autovetture-2022-11', 'ed. 11/2022', '2022-11-01', null, true, 'archivio-pubblico/unipolsai/auto/km-servizi-autovetture/ed-2022-11/originale.pdf', 'archivio-pubblico/unipolsai/auto/km-servizi-autovetture/ed-2022-11/dip.md'),
  ('doc-unipolsai-km-servizi-autovetture-ed-2022-11-informativa-privacy', 'pubblico', 'Informativa Privacy — UnipolSai Km&Servizi Autovetture', 'altro', 8, 205, 'cmp-unipolsai', 'ram-auto', 'Km&Servizi Autovetture', 'edz-km-servizi-autovetture-2022-11', 'ed. 11/2022', '2022-11-01', null, true, 'archivio-pubblico/unipolsai/auto/km-servizi-autovetture/ed-2022-11/originale.pdf', 'archivio-pubblico/unipolsai/auto/km-servizi-autovetture/ed-2022-11/informativa-privacy.md'),
  ('doc-unipolsai-km-servizi-autovetture-ed-2022-11-riferimenti-utili', 'pubblico', 'Numeri e Riferimenti Utili — UnipolSai Km&Servizi Autovetture', 'altro', 4, 201, 'cmp-unipolsai', 'ram-auto', 'Km&Servizi Autovetture', 'edz-km-servizi-autovetture-2022-11', 'ed. 11/2022', '2022-11-01', null, true, 'archivio-pubblico/unipolsai/auto/km-servizi-autovetture/ed-2022-11/originale.pdf', 'archivio-pubblico/unipolsai/auto/km-servizi-autovetture/ed-2022-11/riferimenti-utili.md')
on conflict (id) do update set titolo = excluded.titolo, tipologia = excluded.tipologia, numero_pagine = excluded.numero_pagine, pagina_inizio = excluded.pagina_inizio, compagnia_id = excluded.compagnia_id, ramo_id = excluded.ramo_id, prodotto = excluded.prodotto, edizione_id = excluded.edizione_id, edizione_etichetta = excluded.edizione_etichetta, edizione_valida_dal = excluded.edizione_valida_dal, edizione_valida_al = excluded.edizione_valida_al, edizione_corrente = excluded.edizione_corrente, path_pdf = excluded.path_pdf, path_md = excluded.path_md;
