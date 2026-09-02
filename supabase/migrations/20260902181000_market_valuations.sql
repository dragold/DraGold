-- Fase 2 — Market Valuation Foundation.
-- market_valuations: il layer di valutazione. Una riga per (card_id, currency),
-- RICALCOLATA da market_observations (compute-valuations.js). Porta sempre il
-- confidence_reason spiegabile.
--
-- DOWN: 20260902181000_market_valuations_down.sql

create table if not exists public.market_valuations (
  card_id            text not null references public.cards(id) on delete cascade,
  canonical_card_id  uuid,
  tcg                text not null,
  currency           text not null default 'EUR',
  estimated_value    numeric,
  observed_low       numeric,
  observed_median    numeric,
  observed_high      numeric,
  n_observations     integer not null default 0,
  n_sources          integer not null default 0,
  sources            text[] not null default '{}',
  trend_7d_pct       numeric,
  trend_30d_pct      numeric,
  newest_observed_at timestamptz,
  confidence         text not null check (confidence in ('high','medium','low','none')),
  confidence_score   numeric,
  confidence_reason  jsonb,
  computed_at        timestamptz not null default now(),
  primary key (card_id, currency)
);
create index if not exists market_val_canon_idx on public.market_valuations (canonical_card_id) where canonical_card_id is not null;
create index if not exists market_val_conf_idx  on public.market_valuations (tcg, confidence);
create index if not exists market_val_computed_idx on public.market_valuations (computed_at desc);

alter table public.market_valuations enable row level security;
drop policy if exists market_val_public_read on public.market_valuations;
create policy market_val_public_read on public.market_valuations for select using (true);
