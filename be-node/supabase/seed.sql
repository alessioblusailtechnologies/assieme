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

insert into assieme.documenti (id, archivio, titolo, tipologia, numero_pagine, compagnia_id, ramo_id, prodotto, edizione_id, edizione_etichetta, edizione_valida_dal, edizione_valida_al, edizione_corrente) values
  ('doc-pub-001', 'pubblico', 'DIP — Active Veicoli AUTOPIÙ con Telematica', 'dip', 4, 'cmp-generali', 'ram-auto', 'Active Veicoli AUTOPIÙ con Telematica', 'edz-001-b', 'ed. 04/2026', '2026-04-01', null, true),
  ('doc-pub-002', 'pubblico', 'DIP Aggiuntivo — Active Veicoli AUTOPIÙ con Telematica', 'dip-aggiuntivo', 18, 'cmp-generali', 'ram-auto', 'Active Veicoli AUTOPIÙ con Telematica', 'edz-001-b', 'ed. 04/2026', '2026-04-01', null, true),
  ('doc-pub-003', 'pubblico', 'Condizioni di Assicurazione — Active Veicoli AUTOPIÙ con Telematica', 'condizioni-assicurazione', 96, 'cmp-generali', 'ram-auto', 'Active Veicoli AUTOPIÙ con Telematica', 'edz-001-b', 'ed. 04/2026', '2026-04-01', null, true),
  ('doc-pub-004', 'pubblico', 'Glossario — Active Veicoli AUTOPIÙ con Telematica', 'glossario', 6, 'cmp-generali', 'ram-auto', 'Active Veicoli AUTOPIÙ con Telematica', 'edz-001-b', 'ed. 04/2026', '2026-04-01', null, true),
  ('doc-pub-005', 'pubblico', 'Condizioni di Assicurazione — Active Veicoli AUTOPIÙ con Telematica', 'condizioni-assicurazione', 94, 'cmp-generali', 'ram-auto', 'Active Veicoli AUTOPIÙ con Telematica', 'edz-001-a', 'ed. 09/2025', '2025-09-01', '2026-03-31', false),
  ('doc-pub-006', 'pubblico', 'DIP Aggiuntivo — Active Veicoli AUTOPIÙ con Telematica', 'dip-aggiuntivo', 17, 'cmp-generali', 'ram-auto', 'Active Veicoli AUTOPIÙ con Telematica', 'edz-001-a', 'ed. 09/2025', '2025-09-01', '2026-03-31', false),
  ('doc-pub-007', 'pubblico', 'DIP — KM Sicuri Auto', 'dip', 4, 'cmp-unipolsai', 'ram-auto', 'KM Sicuri Auto', 'edz-007-a', 'ed. 06/2026', '2026-06-01', null, true),
  ('doc-pub-008', 'pubblico', 'DIP Aggiuntivo — KM Sicuri Auto', 'dip-aggiuntivo', 22, 'cmp-unipolsai', 'ram-auto', 'KM Sicuri Auto', 'edz-007-a', 'ed. 06/2026', '2026-06-01', null, true),
  ('doc-pub-009', 'pubblico', 'Condizioni di Assicurazione — KM Sicuri Auto', 'condizioni-assicurazione', 88, 'cmp-unipolsai', 'ram-auto', 'KM Sicuri Auto', 'edz-007-a', 'ed. 06/2026', '2026-06-01', null, true),
  ('doc-pub-010', 'pubblico', 'Glossario — KM Sicuri Auto', 'glossario', 5, 'cmp-unipolsai', 'ram-auto', 'KM Sicuri Auto', 'edz-007-a', 'ed. 06/2026', '2026-06-01', null, true),
  ('doc-pub-011', 'pubblico', 'DIP — Cattolica&Auto', 'dip', 4, 'cmp-cattolica', 'ram-auto', 'Cattolica&Auto', 'edz-011-a', 'ed. 01/2026', '2026-01-01', null, true),
  ('doc-pub-012', 'pubblico', 'DIP Aggiuntivo — Cattolica&Auto', 'dip-aggiuntivo', 20, 'cmp-cattolica', 'ram-auto', 'Cattolica&Auto', 'edz-011-a', 'ed. 01/2026', '2026-01-01', null, true),
  ('doc-pub-013', 'pubblico', 'Condizioni di Assicurazione — Cattolica&Auto', 'condizioni-assicurazione', 76, 'cmp-cattolica', 'ram-auto', 'Cattolica&Auto', 'edz-011-a', 'ed. 01/2026', '2026-01-01', null, true),
  ('doc-pub-014', 'pubblico', 'DIP — Allianz Ultra Auto', 'dip', 4, 'cmp-allianz', 'ram-auto', 'Allianz Ultra Auto', 'edz-014-a', 'ed. 03/2026', '2026-03-01', null, true),
  ('doc-pub-015', 'pubblico', 'DIP Aggiuntivo — Allianz Ultra Auto', 'dip-aggiuntivo', 24, 'cmp-allianz', 'ram-auto', 'Allianz Ultra Auto', 'edz-014-a', 'ed. 03/2026', '2026-03-01', null, true),
  ('doc-pub-016', 'pubblico', 'DIP — AXA Auto Protetta', 'dip', 4, 'cmp-axa', 'ram-auto', 'AXA Auto Protetta', 'edz-016-a', 'ed. 02/2026', '2026-02-01', null, true),
  ('doc-pub-017', 'pubblico', 'Condizioni di Assicurazione — AXA Auto Protetta', 'condizioni-assicurazione', 82, 'cmp-axa', 'ram-auto', 'AXA Auto Protetta', 'edz-016-a', 'ed. 02/2026', '2026-02-01', null, true),
  ('doc-pub-018', 'pubblico', 'DIP — Vittoria Strada Sicura', 'dip', 4, 'cmp-vittoria', 'ram-auto', 'Vittoria Strada Sicura', 'edz-018-a', 'ed. 04/2026', '2026-04-01', null, true),
  ('doc-pub-019', 'pubblico', 'DIP — Allianz1 Business Infortuni', 'dip', 4, 'cmp-allianz', 'ram-infortuni', 'Allianz1 Business Infortuni', 'edz-019-a', 'ed. 03/2026', '2026-03-01', null, true),
  ('doc-pub-020', 'pubblico', 'DIP Aggiuntivo — Allianz1 Business Infortuni', 'dip-aggiuntivo', 21, 'cmp-allianz', 'ram-infortuni', 'Allianz1 Business Infortuni', 'edz-019-a', 'ed. 03/2026', '2026-03-01', null, true),
  ('doc-pub-021', 'pubblico', 'Condizioni di Assicurazione — Allianz1 Business Infortuni', 'condizioni-assicurazione', 52, 'cmp-allianz', 'ram-infortuni', 'Allianz1 Business Infortuni', 'edz-019-a', 'ed. 03/2026', '2026-03-01', null, true),
  ('doc-pub-022', 'pubblico', 'DIP — Generali Infortuni Persona', 'dip', 4, 'cmp-generali', 'ram-infortuni', 'Generali Infortuni Persona', 'edz-022-a', 'ed. 05/2026', '2026-05-01', null, true),
  ('doc-pub-023', 'pubblico', 'DIP Aggiuntivo — Generali Infortuni Persona', 'dip-aggiuntivo', 19, 'cmp-generali', 'ram-infortuni', 'Generali Infortuni Persona', 'edz-022-a', 'ed. 05/2026', '2026-05-01', null, true),
  ('doc-pub-024', 'pubblico', 'DIP — Reale Infortuni Più', 'dip', 4, 'cmp-realemutua', 'ram-infortuni', 'Reale Infortuni Più', 'edz-024-a', 'ed. 05/2026', '2026-05-01', null, true),
  ('doc-pub-025', 'pubblico', 'DIP — Protezione Casa Reale', 'dip', 4, 'cmp-realemutua', 'ram-casa', 'Protezione Casa Reale', 'edz-025-a', 'ed. 05/2026', '2026-05-01', null, true),
  ('doc-pub-026', 'pubblico', 'DIP Aggiuntivo — Protezione Casa Reale', 'dip-aggiuntivo', 26, 'cmp-realemutua', 'ram-casa', 'Protezione Casa Reale', 'edz-025-a', 'ed. 05/2026', '2026-05-01', null, true),
  ('doc-pub-027', 'pubblico', 'Condizioni di Assicurazione — Protezione Casa Reale', 'condizioni-assicurazione', 68, 'cmp-realemutua', 'ram-casa', 'Protezione Casa Reale', 'edz-025-a', 'ed. 05/2026', '2026-05-01', null, true),
  ('doc-pub-028', 'pubblico', 'DIP — UnipolSai Casa&Servizi', 'dip', 4, 'cmp-unipolsai', 'ram-casa', 'UnipolSai Casa&Servizi', 'edz-028-b', 'ed. 07/2026', '2026-07-01', null, true),
  ('doc-pub-029', 'pubblico', 'DIP — UnipolSai Casa&Servizi', 'dip', 4, 'cmp-unipolsai', 'ram-casa', 'UnipolSai Casa&Servizi', 'edz-028-a', 'ed. 11/2025', '2025-11-01', '2026-06-30', false),
  ('doc-pub-030', 'pubblico', 'DIP Aggiuntivo — UnipolSai Casa&Servizi', 'dip-aggiuntivo', 30, 'cmp-unipolsai', 'ram-casa', 'UnipolSai Casa&Servizi', 'edz-028-b', 'ed. 07/2026', '2026-07-01', null, true),
  ('doc-pub-031', 'pubblico', 'DIP — Groupama Casa Serena', 'dip', 4, 'cmp-groupama', 'ram-casa', 'Groupama Casa Serena', 'edz-031-a', 'ed. 05/2026', '2026-05-01', null, true),
  ('doc-pub-032', 'pubblico', 'DIP — Zurich Salute Più', 'dip', 4, 'cmp-zurich', 'ram-salute', 'Zurich Salute Più', 'edz-032-a', 'ed. 06/2026', '2026-06-01', null, true),
  ('doc-pub-033', 'pubblico', 'DIP Aggiuntivo — Zurich Salute Più', 'dip-aggiuntivo', 24, 'cmp-zurich', 'ram-salute', 'Zurich Salute Più', 'edz-032-a', 'ed. 06/2026', '2026-06-01', null, true),
  ('doc-pub-034', 'pubblico', 'Condizioni di Assicurazione — Zurich Salute Più', 'condizioni-assicurazione', 58, 'cmp-zurich', 'ram-salute', 'Zurich Salute Più', 'edz-032-a', 'ed. 06/2026', '2026-06-01', null, true),
  ('doc-pub-035', 'pubblico', 'DIP — ITAS Salute Serena', 'dip', 4, 'cmp-itas', 'ram-salute', 'ITAS Salute Serena', 'edz-035-a', 'ed. 03/2026', '2026-03-01', null, true),
  ('doc-pub-036', 'pubblico', 'DIP — AXA Protezione Professionisti', 'dip', 4, 'cmp-axa', 'ram-rc-prof', 'AXA Protezione Professionisti', 'edz-036-a', 'ed. 02/2026', '2026-02-01', null, true),
  ('doc-pub-037', 'pubblico', 'DIP Aggiuntivo — AXA Protezione Professionisti', 'dip-aggiuntivo', 23, 'cmp-axa', 'ram-rc-prof', 'AXA Protezione Professionisti', 'edz-036-a', 'ed. 02/2026', '2026-02-01', null, true),
  ('doc-pub-038', 'pubblico', 'Condizioni di Assicurazione — AXA Protezione Professionisti', 'condizioni-assicurazione', 64, 'cmp-axa', 'ram-rc-prof', 'AXA Protezione Professionisti', 'edz-036-a', 'ed. 02/2026', '2026-02-01', null, true),
  ('doc-pub-039', 'pubblico', 'DIP — Generali RC Professionale Sanitaria', 'dip', 4, 'cmp-generali', 'ram-rc-prof', 'Generali RC Professionale Sanitaria', 'edz-039-a', 'ed. 07/2026', '2026-07-01', null, true),
  ('doc-pub-040', 'pubblico', 'DIP — Groupama Tutela Legale Famiglia', 'dip', 4, 'cmp-groupama', 'ram-tutela', 'Groupama Tutela Legale Famiglia', 'edz-040-a', 'ed. 05/2026', '2026-05-01', null, true),
  ('doc-pub-041', 'pubblico', 'DIP Aggiuntivo — Groupama Tutela Legale Famiglia', 'dip-aggiuntivo', 16, 'cmp-groupama', 'ram-tutela', 'Groupama Tutela Legale Famiglia', 'edz-040-a', 'ed. 05/2026', '2026-05-01', null, true),
  ('doc-pub-042', 'pubblico', 'DIP — Vittoria Viaggi Sicuri', 'dip', 4, 'cmp-vittoria', 'ram-viaggi', 'Vittoria Viaggi Sicuri', 'edz-042-a', 'ed. 04/2026', '2026-04-01', null, true),
  ('doc-pub-043', 'pubblico', 'Condizioni di Assicurazione — Vittoria Viaggi Sicuri', 'condizioni-assicurazione', 44, 'cmp-vittoria', 'ram-viaggi', 'Vittoria Viaggi Sicuri', 'edz-042-a', 'ed. 04/2026', '2026-04-01', null, true),
  ('doc-pub-044', 'pubblico', 'DIP — ITAS Viaggio Protetto', 'dip', 4, 'cmp-itas', 'ram-viaggi', 'ITAS Viaggio Protetto', 'edz-044-a', 'ed. 03/2026', '2026-03-01', null, true),
  ('doc-pub-045', 'pubblico', 'DIP — Generali Valore Futuro', 'dip', 4, 'cmp-generali', 'ram-vita', 'Generali Valore Futuro', 'edz-045-a', 'ed. 06/2026', '2026-06-01', null, true),
  ('doc-pub-046', 'pubblico', 'DIP Aggiuntivo — Generali Valore Futuro', 'dip-aggiuntivo', 28, 'cmp-generali', 'ram-vita', 'Generali Valore Futuro', 'edz-045-a', 'ed. 06/2026', '2026-06-01', null, true),
  ('doc-pub-047', 'pubblico', 'DIP — Cattolica Risparmio Sicuro', 'dip', 4, 'cmp-cattolica', 'ram-vita', 'Cattolica Risparmio Sicuro', 'edz-047-a', 'ed. 01/2026', '2026-01-01', null, true),
  ('doc-pub-048', 'pubblico', 'Glossario — Cattolica Risparmio Sicuro', 'glossario', 7, 'cmp-cattolica', 'ram-vita', 'Cattolica Risparmio Sicuro', 'edz-047-a', 'ed. 01/2026', '2026-01-01', null, true)
on conflict (id) do update set titolo = excluded.titolo, tipologia = excluded.tipologia, numero_pagine = excluded.numero_pagine, compagnia_id = excluded.compagnia_id, ramo_id = excluded.ramo_id, prodotto = excluded.prodotto, edizione_id = excluded.edizione_id, edizione_etichetta = excluded.edizione_etichetta, edizione_valida_dal = excluded.edizione_valida_dal, edizione_valida_al = excluded.edizione_valida_al, edizione_corrente = excluded.edizione_corrente;
