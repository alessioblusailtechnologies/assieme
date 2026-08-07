-- Il prodotto si chiama Velia (07/08/2026, decisione del committente;
-- dominio sonovelia.it). Lo schema segue il nome: tabelle, funzioni e
-- policy si spostano in blocco — gli oggetti dentro uno schema rinominato
-- viaggiano con lui, e le policy referenziano le funzioni per OID, quindi
-- nulla si rompe.
--
-- Il ruolo `assieme_app` diventa `velia_app` nella migrazione successiva
-- (è un'operazione sui ruoli: sul progetto vero la esegue il committente).
alter schema assieme rename to velia;
