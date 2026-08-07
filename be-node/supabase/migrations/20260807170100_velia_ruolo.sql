-- Seconda metà del rinomino: il ruolo applicativo. La password SCRAM
-- sopravvive alla rinomina (è salata a caso, non sul nome).
--
-- Sul progetto vero questa riga la esegue il committente dal SQL editor
-- (le operazioni sui ruoli non passano dall'automazione); negli ambienti
-- effimeri della CI corre come tutte le altre.
alter role assieme_app rename to velia_app;
