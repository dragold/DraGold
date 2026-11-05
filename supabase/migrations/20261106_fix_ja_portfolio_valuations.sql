-- 20261106_fix_ja_portfolio_valuations.sql
--
-- Fix: Valutazione carte giapponesi e alias canonici in portfolio_valuations RPC.
-- In precedenza, la RPC scartava categoricamente qualunque riga con p.lang = 'ja'
-- impostando 'ja_not_covered' (riga 83 di 20260902191000_portfolio_valuation_rpcs.sql),
-- rendendo di fatto impossibile valorizzare portfoli con carte One Piece o Pokémon JP.
--
-- Questa migration:
--   1. Aggiunge risoluzione tramite canonical_card_id (collega la carta JA alla
--      controparte EN dello stesso soggetto per trarre il benchmark di mercato).
--   2. Rimuove il blocco cieco 'ja_not_covered' quando è disponibile una risoluzione
--      canonica o un alias diretto.

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
  ),
  canonical_alias as (
    select distinct on (p.id) p.id, mv.*
    from parsed p
    join public.cards c_src on c_src.id = p.id
    join public.cards c_en
      on c_en.canonical_card_id = c_src.canonical_card_id
     and c_en.lang = 'en'
    join public.market_valuations mv on mv.card_id = c_en.id and mv.currency = 'EUR'
    where not exists (select 1 from direct d where d.id = p.id)
      and not exists (select 1 from alias a where a.id = p.id)
    order by p.id, mv.n_observations desc nulls last
  )
  select
    p.id,
    coalesce(d.card_id, a.card_id, ca.card_id),
    coalesce(d.tcg, a.tcg, ca.tcg, p.tcg),
    coalesce(d.estimated_value, a.estimated_value, ca.estimated_value),
    coalesce(d.observed_low, a.observed_low, ca.observed_low),
    coalesce(d.observed_median, a.observed_median, ca.observed_median),
    coalesce(d.observed_high, a.observed_high, ca.observed_high),
    coalesce(d.n_observations, a.n_observations, ca.n_observations),
    coalesce(d.n_sources, a.n_sources, ca.n_sources),
    coalesce(d.trend_7d_pct, a.trend_7d_pct, ca.trend_7d_pct),
    coalesce(d.trend_30d_pct, a.trend_30d_pct, ca.trend_30d_pct),
    coalesce(d.confidence, a.confidence, ca.confidence, 'none'),
    coalesce(d.confidence_reason, a.confidence_reason, ca.confidence_reason),
    coalesce(d.computed_at, a.computed_at, ca.computed_at),
    case
      when d.card_id is not null then null
      when a.card_id is not null then 'resolved_via_alias'
      when ca.card_id is not null then 'resolved_via_alias'
      when exists (select 1 from public.market_valuations m2 where m2.tcg = p.tcg limit 1)
           and not exists (
             select 1 from public.cards c2
             where c2.tcg = p.tcg and c2.lang = 'en'
               and public.set_identity_key(c2.set_id) = public.set_identity_key(p.set_part)
           )
        then 'set_not_covered'
      when p.lang = 'ja' then 'ja_not_covered'
      else 'no_data_yet'
    end
  from parsed p
  left join direct d on d.id = p.id
  left join alias a on a.id = p.id
  left join canonical_alias ca on ca.id = p.id;
$$;

revoke all on function public.portfolio_valuations(text[]) from public;
grant execute on function public.portfolio_valuations(text[]) to anon, authenticated;
