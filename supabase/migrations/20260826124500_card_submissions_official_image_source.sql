-- Card ID -- Official Image Source Rule (data-quality patch, 2026-08-26).
-- The "Add missing card" form's Image URL field is client-validated against
-- an explicit official-domain allowlist (src/lib/cardId.js,
-- ALLOWED_IMAGE_DOMAINS), but client-side validation alone is not a security
-- boundary: card_submissions_owner_insert (20260826090000) already lets any
-- authenticated user INSERT their own row directly via the Supabase client,
-- so a modified/bypassed frontend (or a direct REST call with a valid user
-- JWT) could otherwise write any image_url. This CHECK constraint enforces
-- the same allowlist at the database layer, for every writer and every
-- future client, without touching RLS or canonical_cards -- the minimal
-- change consistent with the existing architecture (sez. 6 del task).
--
-- Kept in sync by hand with ALLOWED_IMAGE_DOMAINS in src/lib/cardId.js:
--   pokemon.com, pokemon-card.com, onepiece-cardgame.com (+ subdomains).
-- image_url stays optional: null/empty is allowed.
alter table public.card_submissions
  add constraint card_submissions_image_url_official_source
  check (
    image_url is null
    or trim(image_url) = ''
    or image_url ~* '^https://([a-z0-9-]+\.)*(pokemon\.com|pokemon-card\.com|onepiece-cardgame\.com)(/.*)?$'
  );
