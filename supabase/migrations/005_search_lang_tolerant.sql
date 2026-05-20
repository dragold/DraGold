-- DraGold v4: rendi search_cards e suggest_cards realmente cross-lang.
-- Problema risolto: prima si filtrava `c.lang = lang_filter` rigido.
-- Per YGO/MTG con lang fisso 'en' e utente IT/JP, niente match → "non esce nulla".
-- Adesso: lang_filter NULL = cerca su tutte le lingue; quando specificato è preferenza,
-- non esclusione (cards con quella lingua scorano +10, ma le altre lingue rimangono visibili).

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
        when c.card_number = q then 100
        when lower(c.name) = (select ql from q_norm) then 95
        when lower(c.name) like (select ql || '%' from q_norm) then 80
        when lower(c.name) like (select '%' || ql || '%' from q_norm) then 60
        when similarity(c.name, q) > 0.3 then 40
        else 0
      end
      + case when lang_filter is not null and c.lang = lang_filter then 10 else 0 end
      as score
    from public.cards c
    where (tcg_filter is null or c.tcg = tcg_filter)
      and (
        c.card_number = q
        or lower(c.name) like (select '%' || ql || '%' from q_norm)
        or similarity(c.name, q) > 0.3
      )
  ),
  -- Dedup per (source_id, tcg): se la stessa carta esiste in EN+JP, mostriamo una sola riga
  -- preferendo lang_filter, poi EN, poi qualsiasi
  ranked as (
    select m.*,
      row_number() over (
        partition by m.source_id, m.tcg
        order by
          case when lang_filter is not null and m.lang = lang_filter then 0 else 1 end,
          case when m.lang = 'en' then 0 else 1 end,
          m.lang
      ) as dedup_rank
    from matched m
    where m.score > 0
  )
  select
    r.id, r.name, r.set_name, r.card_number, r.rarity,
    coalesce(r.image_url_hi, r.image_url) as image_url,
    r.lang, r.tcg,
    p.price_market as price_usd,
    p.source as price_source
  from ranked r
  left join lateral (
    select price_market, source
    from public.card_prices_latest
    where card_id = r.id
    order by captured_at desc limit 1
  ) p on true
  where r.dedup_rank = 1
  order by r.score desc, r.name asc
  limit limit_n;
$$;

-- Autocomplete: stesso fix lang-tolerant
create or replace function public.suggest_cards(
  q text,
  tcg_filter text default null,
  lang_filter text default 'en'
) returns table(id text, name text, set_name text, image_url text, tcg text)
language sql stable as $$
  with ranked as (
    select c.*,
      row_number() over (
        partition by c.source_id, c.tcg
        order by
          case when lang_filter is not null and c.lang = lang_filter then 0 else 1 end,
          case when c.lang = 'en' then 0 else 1 end,
          c.lang
      ) as dedup_rank
    from public.cards c
    where (tcg_filter is null or c.tcg = tcg_filter)
      and lower(c.name) like (lower(q) || '%')
  )
  select r.id, r.name, r.set_name,
    coalesce(r.image_url_hi, r.image_url) as image_url, r.tcg
  from ranked r
  where r.dedup_rank = 1
  order by length(r.name), r.name
  limit 8;
$$;
