-- DraGold Data Architecture: cards catalog + multi-source pricing + monitoring
-- Run this AFTER 001 schema.sql in Supabase SQL Editor.

-- ============ CARDS CATALOG ============
-- Universal cards table covering all TCGs and languages.
-- Populated by bulk-import functions (one per TCG).
create table if not exists public.cards (
  -- composite primary key: same physical card across languages has different rows
  id text primary key,                  -- e.g. "pokemon:tcgdex:sv03pt5-006:en"
  tcg text not null,                    -- pokemon | onepiece | mtg | ygo | lorcana | fab | digimon
  source text not null,                 -- tcgdex | scrydex | scryfall | ygoprodeck | etc.
  source_id text not null,              -- the ID as returned by the source
  lang text not null default 'en',      -- en, ja, ko, fr, de, it, es, pt, zh-tw, zh-cn, id, th
  name text not null,
  set_id text,
  set_name text,
  card_number text,
  rarity text,
  supertype text,
  image_url text,
  image_url_hi text,
  metadata jsonb default '{}'::jsonb,   -- any extra fields from the source
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Search indexes (case-insensitive name + set lookups)
create index if not exists cards_tcg_lang_idx on public.cards(tcg, lang);
create index if not exists cards_name_trgm_idx on public.cards using gin (name gin_trgm_ops);
create index if not exists cards_set_idx on public.cards(set_id);
create index if not exists cards_number_idx on public.cards(card_number);
-- enable trigram for fuzzy name search
create extension if not exists pg_trgm;

alter table public.cards enable row level security;
create policy "cards_public_read" on public.cards for select using (true);
-- writes happen only via service_role (Edge Function)

-- ============ CARD PRICES (multi-source) ============
-- One row per (card, source, snapshot). Allows historical price tracking.
create table if not exists public.card_prices (
  id bigserial primary key,
  card_id text references public.cards(id) on delete cascade,
  source text not null,                 -- justtcg | tcglookup | pokemontcgio | scryfall | ygoprodeck | scrydex
  currency text not null default 'USD',
  price_market numeric(10,2),
  price_low numeric(10,2),
  price_high numeric(10,2),
  raw_response jsonb,                   -- entire response for debugging
  captured_at timestamptz default now()
);
create index if not exists prices_card_idx on public.card_prices(card_id, captured_at desc);
create index if not exists prices_source_idx on public.card_prices(source, captured_at desc);

alter table public.card_prices enable row level security;
create policy "prices_public_read" on public.card_prices for select using (true);

-- Latest-price view for fast lookup
create or replace view public.card_prices_latest as
select distinct on (card_id, source)
  card_id, source, currency, price_market, price_low, price_high, captured_at
from public.card_prices
order by card_id, source, captured_at desc;

-- ============ PRICE SOURCES (monitoring + quota) ============
create table if not exists public.price_sources (
  id text primary key,                  -- justtcg | tcglookup | pokemontcgio | etc.
  name text not null,
  base_url text,
  free_limit_monthly int default 0,     -- 0 = unlimited
  monthly_usage int default 0,
  last_reset timestamptz default now(),
  last_success_at timestamptz,
  last_fail_at timestamptz,
  consecutive_failures int default 0,
  is_active boolean default true,
  notes text
);

-- Pre-populate known sources
insert into public.price_sources (id, name, base_url, free_limit_monthly, notes) values
  ('justtcg', 'JustTCG', 'https://api.justtcg.com', 0, 'Pokemon prices, 20 results/request limit'),
  ('tcglookup', 'TCG Price Lookup', 'https://www.tcgpricelookup.com', 10000, 'Universal fallback'),
  ('pokemontcgio', 'Pokemon TCG API', 'https://api.pokemontcg.io', 0, 'Pokemon metadata + TCGPlayer prices'),
  ('scryfall', 'Scryfall', 'https://api.scryfall.com', 0, 'Magic, daily bulk data'),
  ('ygoprodeck', 'YGOPRODeck', 'https://db.ygoprodeck.com', 0, 'Yu-Gi-Oh prices from CM/TCGP/eBay'),
  ('scrydex', 'Scrydex', 'https://api.scrydex.com', 1000, 'One Piece + Pokemon, paid for raw'),
  ('tcgdex', 'TCGdex', 'https://api.tcgdex.net', 0, 'Pokemon metadata only, multi-lang'),
  ('lorcast', 'Lorcast', 'https://api.lorcast.com', 0, 'Lorcana cards + prices'),
  ('fab', 'FaB Card API', 'https://api.fabdb.net', 0, 'Flesh and Blood, community'),
  ('ebay-rss', 'eBay Sold RSS', 'https://www.ebay.com', 0, 'Spot-check sold listings')
on conflict (id) do nothing;

alter table public.price_sources enable row level security;
-- only admin (service_role) can read this - keep quotas private
create policy "sources_admin_only" on public.price_sources for select using (false);

-- ============ API CALL LOG (debugging + monitoring) ============
create table if not exists public.api_call_log (
  id bigserial primary key,
  source text not null,
  endpoint text,
  status int,                           -- HTTP status code
  duration_ms int,
  card_id text,                         -- if call was for specific card
  error_message text,
  called_at timestamptz default now()
);
create index if not exists log_source_idx on public.api_call_log(source, called_at desc);
create index if not exists log_failures_idx on public.api_call_log(status, called_at desc) where status >= 400;

alter table public.api_call_log enable row level security;
create policy "log_admin_only" on public.api_call_log for select using (false);

-- Auto-cleanup logs older than 30 days (run weekly via cron)
create or replace function public.cleanup_old_logs() returns void as $$
begin
  delete from public.api_call_log where called_at < now() - interval '30 days';
  delete from public.card_prices where captured_at < now() - interval '180 days';
end;
$$ language plpgsql security definer;

-- ============ HELPER: card lookup with latest price ============
create or replace function public.search_cards(
  q text,
  tcg_filter text default null,
  lang_filter text default 'en',
  limit_n int default 50
) returns table(
  id text, name text, set_name text, card_number text, rarity text,
  image_url text, lang text, tcg text,
  price_usd numeric, price_source text
) language sql security definer as $$
  select
    c.id, c.name, c.set_name, c.card_number, c.rarity,
    coalesce(c.image_url_hi, c.image_url) as image_url,
    c.lang, c.tcg,
    p.price_market as price_usd,
    p.source as price_source
  from public.cards c
  left join lateral (
    select price_market, source from public.card_prices_latest
    where card_id = c.id order by captured_at desc limit 1
  ) p on true
  where (tcg_filter is null or c.tcg = tcg_filter)
    and c.lang = lang_filter
    and (c.name ilike '%' || q || '%' or c.card_number = q)
  order by similarity(c.name, q) desc nulls last
  limit limit_n;
$$;
