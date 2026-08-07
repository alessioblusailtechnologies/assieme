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
