-- Crediti precisi: un decimale, niente minimo artificiale, e ogni addebito
-- porta con sé i token e il costo da cui nasce (misurabile, non a spanne).

alter table velia.crediti_movimenti
  alter column crediti type numeric(12, 1),
  add column token_input bigint,
  add column token_output bigint,
  add column costo_usd numeric(12, 6);

-- La stessa regola di segno, sul nuovo tipo.
alter table velia.crediti_movimenti drop constraint crediti_segno;
alter table velia.crediti_movimenti add constraint crediti_segno check (
  (tipo = 'addebito' and crediti < 0) or (tipo = 'pacchetto' and crediti > 0) or tipo = 'rettifica'
);

drop function velia.saldo_crediti(uuid);
create or replace function velia.saldo_crediti(tid uuid)
returns table (
  inclusi numeric,
  inclusi_usati numeric,
  acquistati numeric,
  acquistati_usati numeric,
  disponibili numeric
)
language sql stable as $$
  with t as (
    select crediti_inclusi::numeric as crediti_inclusi from velia.tenant where id = tid
  ),
  mesi as (
    select date_trunc('month', created_at at time zone 'Europe/Rome') as mese,
           sum(-crediti) as addebiti
    from velia.crediti_movimenti
    where tenant_id = tid and tipo = 'addebito'
    group by 1
  ),
  eccedenze as (
    select mese, addebiti, least(addebiti, (select crediti_inclusi from t)) as usati_inclusi
    from mesi
  ),
  acquisti as (
    select coalesce(sum(crediti), 0) as totale
    from velia.crediti_movimenti
    where tenant_id = tid and tipo in ('pacchetto', 'rettifica')
  ),
  mese_corrente as (
    select coalesce((select usati_inclusi from eccedenze
                     where mese = date_trunc('month', now() at time zone 'Europe/Rome')), 0) as usati
  )
  select
    round((select crediti_inclusi from t), 1) as inclusi,
    round((select usati from mese_corrente), 1) as inclusi_usati,
    round((select totale from acquisti), 1) as acquistati,
    round(coalesce((select sum(addebiti - usati_inclusi) from eccedenze), 0), 1) as acquistati_usati,
    round(
      (select crediti_inclusi from t)
      - (select usati from mese_corrente)
      + (select totale from acquisti)
      - coalesce((select sum(addebiti - usati_inclusi) from eccedenze), 0),
      1
    ) as disponibili;
$$;
