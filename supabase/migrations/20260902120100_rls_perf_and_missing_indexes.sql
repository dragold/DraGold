-- Performance — trovato durante audit full-stack del 2026-09-02.
--
-- 1) auth_rls_initplan (get_advisors, WARN): le policy sotto richiamavano
--    auth.uid()/auth.role() senza (select ...), quindi Postgres le rivalutava
--    per ogni riga invece che una volta per query. Comportamento logico
--    invariato, solo il wrapping cambia (fix standard raccomandato da Supabase).
-- 2) multiple_permissive_policies: blog_posts aveva due policy SELECT identiche
--    (anyone_read_published e blog_public_select, entrambe "published = true"),
--    valutate entrambe per ogni query pubblica. Rimossa la duplicata piu' vecchia.
-- 3) unindexed_foreign_keys: FK senza indice di copertura su tabelle interrogate
--    per join (commenti/post per utente, canonical_cards -> primary image, ecc.).

alter policy academy_progress_own on public.academy_progress
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy alerts_own on public.alerts
  using ((select auth.uid()) = user_id);

alter policy binders_own on public.binders
  using ((select auth.uid()) = user_id);

alter policy collection_own on public.collection
  using ((select auth.uid()) = user_id);

alter policy auth_read_all on public.blog_posts
  using ((select auth.role()) = 'authenticated'::text);
alter policy auth_write on public.blog_posts
  with check ((select auth.role()) = 'authenticated'::text);
alter policy auth_update on public.blog_posts
  using ((select auth.role()) = 'authenticated'::text);
alter policy auth_delete on public.blog_posts
  using ((select auth.role()) = 'authenticated'::text);

drop policy if exists anyone_read_published on public.blog_posts;

alter policy card_submissions_owner_insert on public.card_submissions
  with check ((select auth.uid()) = user_id);
alter policy card_submissions_owner_read on public.card_submissions
  using ((select auth.uid()) = user_id);

alter policy "Crea post autenticato" on public.posts
  with check ((select auth.uid()) = user_id);
alter policy "Elimina proprio post" on public.posts
  using ((select auth.uid()) = user_id);

alter policy "Crea commento autenticato" on public.comments
  with check ((select auth.uid()) = user_id);
alter policy "Elimina proprio commento" on public.comments
  using ((select auth.uid()) = user_id);

alter policy "Aggiungi like" on public.likes
  with check ((select auth.uid()) = user_id);
alter policy "Rimuovi like" on public.likes
  using ((select auth.uid()) = user_id);

alter policy "Segui utente" on public.followers
  with check ((select auth.uid()) = follower_id);
alter policy "Smetti di seguire" on public.followers
  using ((select auth.uid()) = follower_id);

alter policy profiles_select_own on public.profiles
  using ((select auth.uid()) = id);
alter policy profiles_update_own on public.profiles
  using ((select auth.uid()) = id);
alter policy profiles_insert_own on public.profiles
  with check ((select auth.uid()) = id);

alter policy watchlist_owner_read on public.watchlist
  using ((select auth.uid()) = user_id);
alter policy watchlist_owner_insert on public.watchlist
  with check ((select auth.uid()) = user_id);
alter policy watchlist_owner_delete on public.watchlist
  using ((select auth.uid()) = user_id);

create index if not exists binders_user_id_idx on public.binders (user_id);
create index if not exists canonical_cards_primary_image_card_id_idx on public.canonical_cards (primary_image_card_id);
create index if not exists comments_post_id_idx on public.comments (post_id);
create index if not exists comments_user_id_idx on public.comments (user_id);
create index if not exists followers_following_id_idx on public.followers (following_id);
create index if not exists hot_picks_card_id_idx on public.hot_picks (card_id);
create index if not exists posts_user_id_idx on public.posts (user_id);
