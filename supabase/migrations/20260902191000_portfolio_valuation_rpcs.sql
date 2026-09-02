-- Fase 3 — Portfolio Core. RPC che il Portfolio chiama per risolvere le sue
-- posizioni in valutazioni EUR + confidence, con fallback per gli spelling
-- duplicati (pokemon:ptcg:sv3pt5-* -> pokemon:tcgdex:sv03.5-*).
--
-- security invoker: legge solo market_valuations/market_observations/cards
-- (tutte public-read). NON tocca `collection` (RLS per-utente): il client passa
-- la lista di card_api_id gia' filtrata dalla sua collection.
--
-- DOWN:
--   drop function if exists public.portfolio_valuations(text[]);
--   drop function if exists public.portfolio_value_history(text[], int);

create or replace function public.portfolio_valuations(p_card_ids text[])
returns table (
  input_card_id      text,
  resolved_card_id   text,
  tcg                text,
  estimated_value    numeric,
  observed_low       numeric,
  observed_median    numeric,
  observed_high      numeric,
  n_observations     int,
  n_sources          int,
  trend_7d_pct       numeric,
  trend_30d_pct      numeric,
  confidence         text,
  confidence_reason  jsonb,
  computed_at        timestamptz,
  unavailable_reason text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select distinct x as id from unnest(coalesce(p_card_ids, '{}')) as x
  ),
  parsed as (
    select
      id,
      lower(split_part(id, ':', 1))                                   as tcg,
      nullif(lower(split_part(id, ':', 4)), '')                       as lang,
      split_part(split_part(id, ':', 3), '-', 1)                      as set_part,
      lower(regexp_replace(regexp_replace(split_part(id, ':', 3), '^[^-]*-', ''), '[^a-zA-Z0-9]', '', 'g')) as num_norm
    from input
  ),
  direct as (
    select p.id, mv.*
    from parsed p
    join public.market_valuations mv on mv.card_id = p.id and mv.currency = 'EUR'
  ),
  alias as (
    select distinct on (p.id) p.id, mv.*
    from parsed p
    join public.cards c
      on c.tcg = p.tcg
     and c.lang = 'en'
     and c.card_number_norm = p.num_norm
     and public.set_identity_key(c.set_id) = public.set_identity_key(p.set_part)
    join public.market_valuations mv on mv.card_id = c.id and mv.currency = 'EUR'
    where not exists (select 1 from direct d where d.id = p.id)
    order by p.id, mv.n_observations desc nulls last
  )
  select
    p.id,
    coalesce(d.card_id, a.card_id),
    coalesce(d.tcg, a.tcg, p.tcg),
    coalesce(d.estimated_value, a.estimated_value),
    coalesce(d.observed_low, a.observed_low),
    coalesce(d.observed_median, a.observed_median),
    coalesce(d.observed_high, a.observed_high),
    coalesce(d.n_observations, a.n_observations),
    coalesce(d.n_sources, a.n_sources),
    coalesce(d.trend_7d_pct, a.trend_7d_pct),
    coalesce(d.trend_30d_pct, a.trend_30d_pct),
    coalesce(d.confidence, a.confidence, 'none'),
    coalesce(d.confidence_reason, a.confidence_reason),
    coalesce(d.computed_at, a.computed_at),
    case
      when d.card_id is not null then null
      when a.card_id is not null then 'resolved_via_alias'
      when p.lang = 'ja'          then 'ja_not_covered'
      when exists (select 1 from public.market_valuations m2 where m2.tcg = p.tcg limit 1)
           and not exists (
             select 1 from public.cards c2
             where c2.tcg = p.tcg and c2.lang = 'en'
               and public.set_identity_key(c2.set_id) = public.set_identity_key(p.set_part)
           )
        then 'set_not_covered'
      else 'no_data_yet'
    end
  from parsed p
  left join direct d on d.id = p.id
  left join alias  a on a.id = p.id;
$$;

revoke all on function public.portfolio_valuations(text[]) from public;
grant execute on function public.portfolio_valuations(text[]) to anon, authenticated;

-- Serie giornaliera: per ogni card_id, l'ultimo price_eur noto <= fine di ogni
-- giorno negli ultimi p_days. Il client moltiplica per quantity e somma.
create or replace function public.portfolio_value_history(p_card_ids text[], p_days int default 90)
returns table (as_of date, card_id text, unit_eur numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with ids as (select distinct x as cid from unnest(coalesce(p_card_ids, '{}')) as x),
  days as (
    select generate_series(
      current_date - (greatest(least(p_days, 400), 1) - 1),
      current_date, interval '1 day')::date as d
  )
  select d.d, i.cid,
    (select o.price_eur
       from public.market_observations o
      where o.card_id = i.cid
        and o.kind in ('market', 'sold')
        and o.price_eur is not null
        and o.observed_at < d.d + 1
      order by o.observed_at desc
      limit 1)
  from days d
  cross join ids i;
$$;

revoke all on function public.portfolio_value_history(text[], int) from public;
grant execute on function public.portfolio_value_history(text[], int) to anon, authenticated;
