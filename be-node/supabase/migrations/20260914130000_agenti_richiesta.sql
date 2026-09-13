-- Agenti, fase 3: una richiesta al posto dei campi, e un piano da confermare (14/09/2026).
--
-- La definizione di un agente diventa quella di una domanda in chat: un
-- testo, coi riferimenti a documenti, prodotti e clienti al loro posto
-- (`@[tipo:chiave]`). Istruzioni, fonti, formato dell'esito e parametri
-- all'avvio non sono più campi: si scrivono nella richiesta.
--
-- Al salvataggio un modello legge la richiesta e ne ricava il **piano**:
-- l'obiettivo, i passi, che cosa legge, quali file produce, a chi manda
-- email. Il piano si mostra, e l'agente non parte, né a mano né
-- pianificato, finché qualcuno non lo conferma. Una richiesta corretta
-- rimette il piano da leggere e da confermare (PIANO-AGENTI.md).
--
-- Gli agenti che c'erano si convertono: le istruzioni restano il testo, i
-- documenti diventano riferimenti, le porzioni di archivio, il formato e i
-- parametri diventano frasi. Il loro piano va letto e confermato.

alter table velia.agenti
  add column richiesta text not null default '',
  add column piano jsonb,
  add column piano_stato text not null default 'non-letto'
    check (piano_stato in ('non-letto', 'da-confermare', 'confermato')),
  -- Perché il piano non c'è: la lettura non è riuscita, o non è disponibile.
  add column piano_errore text,
  add column piano_confermato_da uuid references velia.utenti (id) on delete set null,
  add column piano_confermato_il timestamptz;

update velia.agenti a
set richiesta = concat_ws(
      E'\n\n',
      nullif(trim(a.istruzioni), ''),
      (select 'Lavora su ' || string_agg('@[documento:' || (f ->> 'documentoId') || ']', ', ') || '.'
         from jsonb_array_elements(a.fonti) f
        where f ->> 'tipo' = 'documento'
       having count(*) > 0),
      (select 'Guarda ' || string_agg(
                case f ->> 'tipo'
                  when 'documenti-riferimento' then 'i documenti di riferimento dell''agenzia'
                  else 'l''Archivio ' || case f ->> 'archivio' when 'pubblico' then 'Pubblico' else 'Privato' end
                    || coalesce(' della compagnia ' || c.nome, '')
                    || coalesce(' nel ramo ' || r.nome, '')
                    || case when coalesce((f ->> 'soloPreferiti')::boolean, false)
                         then ', solo i prodotti preferiti' else '' end
                end, '; ') || '.'
         from jsonb_array_elements(a.fonti) f
         left join velia.compagnie c on c.id = f ->> 'compagniaId'
         left join velia.rami r on r.id = f ->> 'ramoId'
        where f ->> 'tipo' <> 'documento'
       having count(*) > 0),
      case a.formato_output
        when 'tabella' then 'Presenta l''esito in una tabella.'
        when 'documento' then 'Consegna l''esito anche in un PDF con l''intestazione dell''agenzia.'
      end,
      (select 'All''avvio si indicava: ' || string_agg(p ->> 'etichetta', ', ') || '. Scrivilo qui, nella richiesta.'
         from jsonb_array_elements(a.parametri) p
       having count(*) > 0)
    ),
    -- Nessuno parte senza conferma: le occorrenze tornano quando il piano è confermato.
    prossima_esecuzione = null;

-- I campi di prima restano ancora un giro, senza più vincoli: il codice già
-- in esercizio li legge finché quello nuovo non è pubblicato, e toglierli
-- adesso spegnerebbe la sezione Agenti nel frattempo (il database è uno,
-- condiviso con l'ambiente dev). Li toglie
-- `20260914140000_agenti_via_i_campi.sql`, da applicare a rilascio fatto.
alter table velia.agenti alter column istruzioni drop not null;

-- ---------------------------------------------------------------------------
-- Il tick accoda solo i piani confermati
-- ---------------------------------------------------------------------------
-- Due parametri, entrambi per i test d'integrazione, che pg_cron non passa:
-- la coda (quella locale, CODA_LAVORI, è l'unica da cui il loro worker
-- pesca) e il tenant (il database è condiviso con l'ambiente dev, e un test
-- non deve accodare nella sua coda gli agenti veri di un'altra agenzia).
-- Via la vecchia firma, o la chiamata senza argomenti diventerebbe ambigua.

drop function velia.accoda_agenti_pianificati();

create function velia.accoda_agenti_pianificati(
  coda text default 'lavori',
  solo_tenant uuid default null
) returns int
language plpgsql as $$
declare
  a record;
  esecuzione_id uuid;
  nuovo_job_id uuid;
  accodate int := 0;
begin
  for a in
    select id, tenant_id, pian_frequenza, pian_orario, pian_giorno_settimana, pian_giorno_mese
    from velia.agenti
    where attivo and not pian_sospesa and piano_stato = 'confermato'
      and prossima_esecuzione is not null and prossima_esecuzione <= now()
      and (solo_tenant is null or tenant_id = solo_tenant)
    for update skip locked
  loop
    insert into velia.agenti_esecuzioni (agente_id, tenant_id, modalita, log)
    values (a.id, a.tenant_id, 'pianificata',
            jsonb_build_array(jsonb_build_object(
              'istante', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'livello', 'info',
              'messaggio', 'Esecuzione pianificata accodata.')))
    returning id into esecuzione_id;

    insert into velia.jobs (tipo, payload, tenant_id)
    values ('agente', jsonb_build_object('esecuzioneId', esecuzione_id), a.tenant_id)
    returning id into nuovo_job_id;
    perform pgmq.send(coda, jsonb_build_object('jobId', nuovo_job_id));

    update velia.agenti_esecuzioni set job_id = nuovo_job_id where id = esecuzione_id;
    update velia.agenti
    set prossima_esecuzione = velia.prossimo_tick(
          a.pian_frequenza, a.pian_orario, a.pian_giorno_settimana, a.pian_giorno_mese, now())
    where id = a.id;
    accodate := accodate + 1;
  end loop;
  return accodate;
end;
$$;
