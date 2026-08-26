-- Security finding fix (E2E Verification Gate): public.canonical_cards and
-- public.rarities were flagged by Supabase advisors as RLS-disabled-in-public
-- (ERROR level) -- both are exposed to PostgREST with no row security at all.
-- Both tables are pure read-only reference/lookup data (canonical grouping +
-- rarity labels), read anonymously by the app on every Card/Set page, exactly
-- like public.cards and public.set_logos already are. Those two tables solve
-- the identical requirement today via a single permissive public SELECT
-- policy and NO write policy for anon/authenticated (verified via
-- pg_policies: cards_public_read / set_logos_public_read, cmd=SELECT,
-- roles={public}, qual=true) -- enabling RLS this way is a proven-safe,
-- already-used pattern in this app, not a new architecture. Mirroring it here
-- so canonical_cards/rarities become as safe as cards/set_logos without
-- changing any query the frontend already makes (all existing reads are
-- SELECT-only) and without opening any anonymous write path.
-- Applied live against project pimwkmwrduqkaydyvxqz on 2026-08-26 and
-- verified: security advisors no longer flag either table, and a real Card
-- Page load (Charizard EX, /card/pokemon:tcgdex:xy12-12:en) still renders
-- correctly with zero console errors after the change.
alter table public.canonical_cards enable row level security;
alter table public.rarities enable row level security;

create policy canonical_cards_public_read
  on public.canonical_cards for select
  to public
  using (true);

create policy rarities_public_read
  on public.rarities for select
  to public
  using (true);
