-- Fase 1 — Release Monitor: KPI persistente "Released but missing" + storico run.
-- Piano: docs/plans/2026-09-03-phase1-catalog-freshness-release-monitor.md (Task 1).
--
-- catalog_gaps e' ANCHE la sync queue (campo `status`): nessuna tabella coda
-- separata. Un gap = un'entita' upstream (set/carta/promo) non ancora in DraGold.
--
-- DOWN:
--   drop table if exists public.catalog_freshness_runs;
--   drop table if exists public.catalog_gaps;

create table if not exists public.catalog_gaps (
  id            uuid primary key default gen_random_uuid(),
  tcg           text not null,
  language      text not null default 'en',
  entity_type   text not null check (entity_type in ('set','card','promo','special','product')),
  source        text not null,
  source_id     text not null,
  set_code      text,
  card_number   text,
  name          text,
  release_date  date,
  status        text not null default 'missing'
                check (status in ('missing','queued','syncing','resolved','error','ignored')),
  detail        jsonb,
  error_message text,
  retry_count   integer not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  resolved_at   timestamptz,
  unique (tcg, language, entity_type, source, source_id)
);

create index if not exists catalog_gaps_status_idx
  on public.catalog_gaps (status)
  where status in ('missing','queued','error');
create index if not exists catalog_gaps_scope_idx
  on public.catalog_gaps (tcg, language, entity_type);
create index if not exists catalog_gaps_release_idx
  on public.catalog_gaps (release_date desc nulls last);

alter table public.catalog_gaps enable row level security;

-- Lettura pubblica: la freschezza del catalogo e' una metrica trasparente,
-- nessun dato utente. Scrittura solo service_role (nessuna policy di
-- insert/update/delete -> negata a anon/authenticated).
drop policy if exists catalog_gaps_public_read on public.catalog_gaps;
create policy catalog_gaps_public_read on public.catalog_gaps
  for select using (true);

create table if not exists public.catalog_freshness_runs (
  id            uuid primary key default gen_random_uuid(),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  scope         jsonb not null,
  kpi           jsonb not null,
  ok            boolean not null default true,
  error_message text
);

create index if not exists catalog_freshness_runs_started_idx
  on public.catalog_freshness_runs (started_at desc);

alter table public.catalog_freshness_runs enable row level security;

drop policy if exists catalog_freshness_runs_public_read on public.catalog_freshness_runs;
create policy catalog_freshness_runs_public_read on public.catalog_freshness_runs
  for select using (true);
