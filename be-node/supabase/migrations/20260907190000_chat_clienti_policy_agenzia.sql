-- Le chat cliente, dal lato dell'agenzia (07/09/2026).
--
-- La migrazione `20260907160000_chat_clienti` ha creato le tabelle e ha
-- scritto le policy **restrittive** che negano tutto all'ospite. Non ha
-- però scritto quelle permissive per l'agenzia, e senza di quelle le tabelle
-- sono chiuse a chiunque passi dalla RLS: nessuno le legge e nessuno ci
-- scrive. Se ne è accorto il primo test che ha provato a creare una chat.
--
-- È il rovescio della scelta di negare per default, e va bene così: la
-- dimenticanza si è manifestata come «non funziona niente» invece che come
-- «funziona troppo», che è l'unico dei due modi in cui si vuole sbagliare
-- su una tabella che governa chi vede cosa.

alter table velia.chat_clienti enable row level security;
alter table velia.chat_clienti_cartelle enable row level security;
alter table velia.chat_clienti_documenti enable row level security;

-- L'agenzia governa le proprie chat. Il filtro è per tenant come ovunque;
-- che sia riservato agli amministratori lo decide l'API, dove quella
-- distinzione è già scritta una volta sola (`richiediAmministratore`).
create policy chat_clienti_agenzia on velia.chat_clienti
  for all to authenticated
  using (tenant_id = velia.tenant_corrente())
  with check (tenant_id = velia.tenant_corrente());

-- Il cono segue la sua chat: non ha un tenant proprio da confrontare, ce
-- l'ha la riga a cui appartiene.
create policy chat_clienti_cartelle_agenzia on velia.chat_clienti_cartelle
  for all to authenticated
  using (exists (
    select 1 from velia.chat_clienti k
     where k.id = chat_clienti_cartelle.chat_id and k.tenant_id = velia.tenant_corrente()
  ))
  with check (exists (
    select 1 from velia.chat_clienti k
     where k.id = chat_clienti_cartelle.chat_id and k.tenant_id = velia.tenant_corrente()
  ));

create policy chat_clienti_documenti_agenzia on velia.chat_clienti_documenti
  for all to authenticated
  using (exists (
    select 1 from velia.chat_clienti k
     where k.id = chat_clienti_documenti.chat_id and k.tenant_id = velia.tenant_corrente()
  ))
  with check (exists (
    select 1 from velia.chat_clienti k
     where k.id = chat_clienti_documenti.chat_id and k.tenant_id = velia.tenant_corrente()
  ));
