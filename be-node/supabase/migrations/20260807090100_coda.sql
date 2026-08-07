-- Fase 0 — Coda dei job e canale eventi (ASSIEME-piano-sviluppo-be.md §3, §5).
--
-- pgmq consegna (at-least-once, visibility timeout, archivio); la tabella
-- public.jobs è lo stato di dominio visibile all'API; eventi_job è il canale
-- degli eventi di avanzamento (streaming SSE) e il loro replay per l'audit.

create extension if not exists pgmq;

-- La coda unica dei lavori: il tipo sta nel messaggio, il worker smista.
select pgmq.create('lavori');

-- ---------------------------------------------------------------------------
-- Stato di dominio dei job
-- ---------------------------------------------------------------------------

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenant (id) on delete cascade,
  tipo text not null
    check (tipo in ('prova', 'ingestion', 'interrogazione', 'agente', 'memoria')),
  payload jsonb not null default '{}'::jsonb,
  stato text not null default 'in-coda'
    check (stato in ('in-coda', 'in-esecuzione', 'completato', 'fallito', 'annullato')),
  tentativi int not null default 0,
  errore text,
  utente_id uuid references public.utenti (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_tenant on public.jobs (tenant_id);
create index jobs_stato on public.jobs (stato) where stato in ('in-coda', 'in-esecuzione');

create trigger jobs_updated_at
  before update on public.jobs
  for each row execute function assieme.tocca_updated_at();

-- ---------------------------------------------------------------------------
-- Eventi di avanzamento
-- ---------------------------------------------------------------------------
-- Il worker scrive qui e fa NOTIFY col solo puntatore (il payload di NOTIFY
-- ha un limite di 8000 byte): chi ascolta rilegge la riga. La tabella è
-- anche il replay per l'audit (RNF-07).

create table public.eventi_job (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.jobs (id) on delete cascade,
  tipo text not null,
  dati jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index eventi_job_per_job on public.eventi_job (job_id, id);

-- ---------------------------------------------------------------------------
-- RLS: i job non sono un'API del client
-- ---------------------------------------------------------------------------
-- Il FE non legge mai queste tabelle direttamente: lo stato utente-visibile
-- vive nelle tabelle di dominio (documenti, messaggi, esecuzioni…). RLS
-- attiva e nessuna policy: per authenticated è tutto negato, la service
-- role scavalca.

alter table public.jobs enable row level security;
alter table public.eventi_job enable row level security;
