-- Fase 8, terzo pezzo: la memoria si aggiorna durante la conversazione.
--
-- Decisione del committente: niente «conversazione ferma da N minuti» e
-- niente tick che accoda — il job di memoria lo accoda il job di chat a
-- ogni risposta, come fa Claude. Il cron resta per la sola retention.

drop function if exists velia.accoda_apprendimento();
alter table velia.tenant drop column memoria_attesa_minuti;
alter table velia.apprendimenti drop column accodato_il;

do $$
begin
  perform cron.unschedule('velia-memoria-tick');
exception when others then
  null;
end;
$$;

select cron.schedule('velia-memoria-tick', '17 3 * * *', $$select velia.scada_ricordi()$$);
