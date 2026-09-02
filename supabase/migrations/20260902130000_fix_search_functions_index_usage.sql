-- Fix performance search_cards/suggest_cards — trovato durante audit full-stack
-- del 2026-09-02 e verificato dal vivo: EXPLAIN ANALYZE su search_cards('charizard',
-- null, 'en', 20) impiegava 6811ms contro ~480ms dello stesso pattern via ILIKE.
--
-- Causa: `lower(c.name) like (lower(q) || '%')` / `like (... || ql || ...)` e
-- `similarity(c.name, q) > 0.3` non sono forme indicizzabili dagli indici GIN
-- gin_trgm_ops gia' presenti su cards(name)/cards(name_en)/cards(card_number)/
-- cards(card_number_norm) (cards_name_trgm_idx, ecc.) — lower() su una colonna
-- e' un'espressione diversa dalla colonna nuda, e similarity() come funzione
-- pura non usa l'indice (serve l'operatore `%`, che rispetta pg_trgm.similarity_
-- threshold). Risultato: seq scan su 200k+ righe per ogni chiamata.
--
-- Fix: sostituita `lower(col) like ...` con `col ilike ...` (ILIKE e' l'operatore
-- che l'indice GIN trgm sa effettivamente usare, verificato dal vivo:
-- "name ilike '%x%' or name_en ilike '%x%'" = bitmap index scan, ~480ms) e
-- `similarity(col, q) > threshold` con `col % q` (operatore pg_trgm, stesso
-- indice, threshold preso dal default di sessione pg_trgm.similarity_threshold
-- invece che hardcoded — comportamento equivalente, niente hardcode nuovo).
-- Nessun cambio di firma, nessun cambio di comportamento logico atteso (stesso
-- matching, solo forma indicizzabile) — solo query plan.
--
-- Nota: queste due funzioni non risultano chiamate da alcun componente React
-- montato in produzione oggi (solo da DraGold.legacy.jsx, non importato da
-- nessun entry point attivo — verificato via grep) — zero impatto utenti,
-- fix preventivo per non lasciare un'esca rotta pronta a essere riusata.

create or replace function public.search_cards(
  q text,
  tcg_filter text default null,
  lang_filter text default 'en',
  limit_n int default 50
) returns table(
  id text, name text, set_name text, card_number text, rarity text,
  image_url text, lang text, tcg text,
  price_usd numeric, price_source text
) language sql stable set search_path = public, extensions as $$
  with q_norm as (select lower(coalesce(q,'')) as ql),
  matched as (
    select c.*,
      case
        when c.card_number = q then 100
        when lower(c.name) = (select ql from q_norm) then 95
        when c.name ilike (select ql || '%' from q_norm) then 80
        when c.name ilike (select '%' || ql || '%' from q_norm) then 60
        when c.name % q then 40
        else 0
      end
      + case when lang_filter is not null and c.lang = lang_filter then 10 else 0 end
      as score
    from public.cards c
    where (tcg_filter is null or c.tcg = tcg_filter)
      and (
        c.card_number = q
        or c.name ilike (select '%' || ql || '%' from q_norm)
        or c.name % q
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

create or replace function public.suggest_cards(
  q text,
  tcg_filter text default null,
  lang_filter text default 'en'
) returns table(id text, name text, set_name text, image_url text, tcg text)
language sql stable set search_path = public, extensions as $$
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
      and c.name ilike (lower(q) || '%')
  )
  select r.id, r.name, r.set_name,
    coalesce(r.image_url_hi, r.image_url) as image_url, r.tcg
  from ranked r
  where r.dedup_rank = 1
  order by length(r.name), r.name
  limit 8;
$$;
