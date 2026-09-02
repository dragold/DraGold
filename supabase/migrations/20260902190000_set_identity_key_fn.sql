-- Fase 3 — Portfolio Core.
-- set_identity_key: gemella SQL di scripts/lib/catalog/normalize-set-code.js#setIdentityKey.
-- Collassa zero-padding e notazione "point": "me04"=="me4", "sv8pt5"=="sv08.5",
-- ma "sv1" != "sv10". Serve all'RPC portfolio_valuations per risolvere gli
-- spelling duplicati (pokemon:ptcg:sv3pt5-* vs pokemon:tcgdex:sv03.5-*).
--
-- DOWN: drop function if exists public.set_identity_key(text);

create or replace function public.set_identity_key(raw text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(lower(coalesce(raw, '')), 'pt([0-9])', '.\1', 'g'),
               '[^a-z0-9.]', '', 'g'),
             '([a-z])0+([0-9])', '\1\2', 'g'),
           '\.', '', 'g')
$$;
