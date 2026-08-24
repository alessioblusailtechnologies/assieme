-- Crediti proporzionali al lavoro fatto (decisione del committente, 25/08).
--
-- Un «ciao, chi sei?» non può costare quanto un confronto fra due set
-- informativi: l'addebito segue i token letti e scritti dalla sessione,
-- cioè il suo costo, con un cambio unico: 1 credito ogni 4 centesimi di
-- calcolo (25 crediti per dollaro), minimo 1. Una risposta tipica con Opus
-- (~0,40 $) fa 10 crediti, con Sonnet 5, con un modello open 1-2.
--
-- I pesi per classe restano come «tipico» indicativo nel catalogo e come
-- riserva quando una sessione non riporta il costo. La conversione resta
-- fissa: 1 credito.

insert into velia.crediti_pesi (classe, crediti) values ('per_usd', 25)
on conflict (classe) do update set crediti = excluded.crediti;
