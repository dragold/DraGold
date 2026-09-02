-- Fase 2 — Market Valuation Foundation.
-- market_observations: verita' storica append-only di ogni osservazione di
-- mercato (fonte, tipo, prezzo, valuta, condizione, timestamp). MAI sovrascritta.
-- card_prices resta invariata (compat, PRODUCT_SPEC §4).
-- fx_rates: cambio giornaliero EUR-base da Frankfurter (ECB).
--
-- DOWN: 20260902180000_market_observations_and_fx_rates_down.sql

create table if not exists public.market_observations (
  id                bigint generated always as identity primary key,
  card_id           text not null references public.cards(id) on delete cascade,
  canonical_card_id uuid,
  tcg               text not null,
  source            text not null,
  kind              text not null check (kind in ('market','listing','sold')),
  sub_type          text,
  condition         text,
  price             numeric not null check (price >= 0),
  currency          text not null,
  price_eur         numeric,
  fx_rate           numeric,
  observed_at       timestamptz not null default now(),
  raw               jsonb
);
create index if not exists market_obs_card_idx   on public.market_observations (card_id, observed_at desc);
create index if not exists market_obs_canon_idx  on public.market_observations (canonical_card_id) where canonical_card_id is not null;
create index if not exists market_obs_recent_idx on public.market_observations (observed_at desc);
create index if not exists market_obs_src_idx    on public.market_observations (source, observed_at desc);

alter table public.market_observations enable row level security;
drop policy if exists market_obs_public_read on public.market_observations;
create policy market_obs_public_read on public.market_observations for select using (true);

create table if not exists public.fx_rates (
  as_of      date not null,
  quote      text not null,
  rate       numeric not null check (rate > 0),
  source     text not null default 'frankfurter',
  fetched_at timestamptz not null default now(),
  primary key (as_of, quote)
);
alter table public.fx_rates enable row level security;
drop policy if exists fx_rates_public_read on public.fx_rates;
create policy fx_rates_public_read on public.fx_rates for select using (true);
