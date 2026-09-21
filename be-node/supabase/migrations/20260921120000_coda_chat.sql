-- La coda della chat (21/09/2026).
--
-- La coda dei lavori era una sola e il worker la lavorava un job alla
-- volta, nell'ordine d'arrivo: una domanda scritta dopo il caricamento di
-- un set informativo aspettava la fine della sua trascrizione (venti minuti
-- per 130 pagine). Le interrogazioni ora vanno in una coda loro, che il
-- worker pesca con cicli dedicati (`CONCORRENZA_CHAT`).
--
-- Il nome è quello della coda dei lavori col suffisso `_chat`
-- (`worker/coda.ts`). La macchina locale, che ha `CODA_LAVORI=lavori_locale`,
-- vuole `lavori_locale_chat`: si crea a mano come la sua sorella, con le
-- stesse grant, e non qui, perché in produzione non deve esistere.
--
-- Le funzioni dei cron (agenti pianificati, memoria) accodano ancora su
-- `lavori`, ed è giusto così: nessuna di loro produce una domanda della chat.

select pgmq.create('lavori_chat');

grant select, insert, update, delete on pgmq.q_lavori_chat, pgmq.a_lavori_chat to velia_app;
