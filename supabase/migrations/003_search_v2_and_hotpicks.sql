-- DraGold v2: better search (prefix + number + autocomplete) + hot_picks daily snapshot

-- ============ search_cards v2: smarter matching + price-aware sort ============
create or replace function public.search_cards(
  q text,
  tcg_filter text default null,
  lang_filter text default 'en',
  limit_n int default 50
) returns table(
  id text, name text, set_name text, card_number text, rarity text,
  image_url text, lang text, tcg text,
  price_usd numeric, price_source text
) language sql stable as $$
  with q_norm as (select lower(coalesce(q,'')) as ql),
  matched as (
    select c.*,
      case
        when c.card_number = q then 100                          -- exact number match (top)
        when lower(c.name) = (select ql from q_norm) then 95     -- exact name
        when lower(c.name) like (select ql || '%' from q_norm) then 80   -- starts with
        when lower(c.name) like (select '%' || ql || '%' from q_norm) then 60 -- contains
        when similarity(c.name, q) > 0.3 then 40                 -- fuzzy
        else 0
      end as score
    from public.cards c
    where (tcg_filter is null or c.tcg = tcg_filter)
      and c.lang = lang_filter
      and (
        c.card_number = q
        or lower(c.name) like (select '%' || ql || '%' from q_norm)
        or similarity(c.name, q) > 0.3
      )
  )
  select
    m.id, m.name, m.set_name, m.card_number, m.rarity,
    coalesce(m.image_url_hi, m.image_url) as image_url,
    m.lang, m.tcg,
    p.price_market as price_usd,
    p.source as price_source
  from matched m
  left join lateral (
    select price_market, source
    from public.card_prices_latest
    where card_id = m.id
    order by captured_at desc limit 1
  ) p on true
  where m.score > 0
  order by m.score desc, m.name asc
  limit limit_n;
$$;

-- ============ Autocomplete suggestions (lightweight, top 8) ============
-- Fast suggestion endpoint for typing in search box (returns just name + id).
create or replace function public.suggest_cards(
  q text,
  tcg_filter text default null,
  lang_filter text default 'en'
) returns table(id text, name text, set_name text, image_url text, tcg text)
language sql stable as $$
  select c.id, c.name, c.set_name,
    coalesce(c.image_url_hi, c.image_url) as image_url, c.tcg
  from public.cards c
  where (tcg_filter is null or c.tcg = tcg_filter)
    and c.lang = lang_filter
    and lower(c.name) like (lower(q) || '%')
  order by length(c.name), c.name
  limit 8;
$$;

-- ============ HOT PICKS: daily snapshot of top movers ============
-- Computed nightly from card_prices history. Each row is one ranked pick for a date.
create table if not exists public.hot_picks (
  id bigserial primary key,
  computed_date date not null default current_date,
  rank int not null,                       -- 1..10 (1 = biggest mover)
  card_id text not null references public.cards(id) on delete cascade,
  tcg text not null,
  delta_pct numeric(10,2),                 -- % change vs previous day
  current_price numeric(10,2),
  previous_price numeric(10,2),
  reason text,                              -- human-readable, e.g. "set rotation news"
  created_at timestamptz default now()
);
create unique index if not exists hot_picks_date_rank_idx on public.hot_picks(computed_date, rank);
create index if not exists hot_picks_recent_idx on public.hot_picks(computed_date desc, rank asc);

alter table public.hot_picks enable row level security;
create policy "hot_picks_public_read" on public.hot_picks for select using (true);

-- Daily compute: top 10 cards by absolute % change in last 24h that have at least 2 price snapshots
create or replace function public.compute_hot_picks_today() returns int
language plpgsql security definer as $$
declare
  inserted_count int := 0;
begin
  -- Clear today's picks (idempotent if re-run)
  delete from public.hot_picks where computed_date = current_date;

  with latest_prices as (
    select distinct on (card_id) card_id, price_market as current_price, captured_at
    from public.card_prices
    where captured_at > now() - interval '30 hours'
      and price_market > 0
    order by card_id, captured_at desc
  ),
  prev_prices as (
    select distinct on (card_id) card_id, price_market as previous_price
    from public.card_prices
    where captured_at between now() - interval '48 hours' and now() - interval '20 hours'
      and price_market > 0
    order by card_id, captured_at desc
  ),
  deltas as (
    select l.card_id, l.current_price, p.previous_price,
      round(((l.current_price - p.previous_price) / p.previous_price * 100)::numeric, 2) as delta_pct
    from latest_prices l
    join prev_prices p using (card_id)
    where p.previous_price > 0 and abs(l.current_price - p.previous_price) > 0.01
  ),
  ranked as (
    select d.card_id, c.tcg, d.delta_pct, d.current_price, d.previous_price,
      row_number() over (order by abs(d.delta_pct) desc) as rnk
    from deltas d
    join public.cards c on c.id = d.card_id
    where c.tcg = 'pokemon'  -- start with Pokémon, extend later
  )
  insert into public.hot_picks (rank, card_id, tcg, delta_pct, current_price, previous_price, reason)
  select rnk, card_id, tcg, delta_pct, current_price, previous_price,
    case when delta_pct > 0 then 'Trending up · ' || delta_pct::text || '% in 24h'
         else 'Sliding · ' || delta_pct::text || '% in 24h' end
  from ranked where rnk <= 10;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;
