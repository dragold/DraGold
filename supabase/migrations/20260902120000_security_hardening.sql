-- Security hardening — trovato durante audit full-stack del 2026-09-02.
--
-- 1) cleanup_old_logs / compute_hot_picks_today / fix_missing_images_from_en sono
--    SECURITY DEFINER senza alcun controllo interno ed erano eseguibili da anon e
--    authenticated via /rest/v1/rpc/<nome> (get_advisors: anon_security_definer_
--    function_executable). Sono job di manutenzione/cron, non azioni utente: si
--    revoca EXECUTE a anon/authenticated, restano eseguibili solo da service_role
--    (cron GitHub Actions/Supabase) e dal ruolo postgres.
-- 2) increment_likes/decrement_likes/increment_comments/decrement_comments erano
--    chiamabili anche da anon: chiunque poteva alterare i contatori di un post
--    qualsiasi senza autenticarsi. Si richiede almeno un utente autenticato
--    (REVOKE da anon), senza toccare il corpo delle funzioni.
-- 3) function_search_path_mutable (WARN) su tutte le funzioni sotto: si fissa
--    search_path esplicitamente per evitare hijack via search_path di sessione.
-- 4) extension_in_public (WARN): pg_trgm era installata in public, unica fra le
--    estensioni del progetto (uuid-ossp/pgcrypto sono gia' in `extensions`, schema
--    gia' presente nel default search_path del progetto). Spostata in extensions;
--    gli indici GIN esistenti (gin_trgm_ops) e le funzioni che chiamano similarity()
--    continuano a risolvere perche' `extensions` resta nel search_path.

revoke execute on function public.cleanup_old_logs() from public, anon, authenticated;
revoke execute on function public.compute_hot_picks_today() from public, anon, authenticated;
revoke execute on function public.fix_missing_images_from_en() from public, anon, authenticated;

revoke execute on function public.increment_likes(uuid) from anon;
revoke execute on function public.decrement_likes(uuid) from anon;
revoke execute on function public.increment_comments(uuid) from anon;
revoke execute on function public.decrement_comments(uuid) from anon;

alter function public.cleanup_old_logs() set search_path = public;
alter function public.compute_hot_picks_today() set search_path = public;
alter function public.fix_missing_images_from_en() set search_path = public;
alter function public.increment_likes(uuid) set search_path = public;
alter function public.decrement_likes(uuid) set search_path = public;
alter function public.increment_comments(uuid) set search_path = public;
alter function public.decrement_comments(uuid) set search_path = public;
alter function public.card_image_cache_set_updated_at() set search_path = public;
alter function public.set_updated_at() set search_path = public;
alter function public.search_cards(text, text, text, integer) set search_path = public, extensions;
alter function public.suggest_cards(text, text, text) set search_path = public, extensions;

alter extension pg_trgm set schema extensions;
