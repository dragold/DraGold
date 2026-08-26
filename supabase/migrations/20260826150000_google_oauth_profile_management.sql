-- Google OAuth + Profile Management (username changes, avatar, GDPR delete).
-- Extends 20260823120000_auth_profile_username.sql. Non-destructive: no
-- DROP TABLE / DROP COLUMN, no existing rows overwritten (avatar_url /
-- google_id backfill below only fills currently-NULL values).
-- Applied to the live project via mcp__Supabase__apply_migration on 2026-08-26.

-- 1. New columns.
alter table public.profiles add column if not exists google_id text;
alter table public.profiles add column if not exists username_updated_at timestamptz;

-- 2. google_id uniqueness (partial: most rows have no Google identity).
create unique index if not exists profiles_google_id_idx
  on public.profiles (google_id)
  where google_id is not null;

-- 3. handle_new_user(): capture Google profile data (avatar, display name,
--    provider subject id) from raw_user_meta_data — GoTrue populates this
--    synchronously on the auth.users row itself for OAuth signups, so it's
--    reliable at trigger time (unlike auth.identities, whose row can still
--    be mid-insert in the same transaction). Also auto-generates a unique
--    temporary username (user_XXXXXX) when the signup didn't supply one
--    (true for every Google signup, and for any future OAuth provider) —
--    the pre-existing email/password flow keeps supplying its own via
--    signUp({ options: { data: { username }}}).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  gen_username text;
  i int := 0;
begin
  gen_username := nullif(new.raw_user_meta_data->>'username', '');
  if gen_username is null then
    loop
      gen_username := 'user_' || substr(md5(random()::text || clock_timestamp()::text || i::text), 1, 6);
      exit when not exists (select 1 from public.profiles where lower(username) = lower(gen_username));
      i := i + 1;
      exit when i > 20; -- effectively unreachable (36^6 keyspace), just a hard stop
    end loop;
  end if;

  insert into public.profiles (id, email, username, display_name, avatar_url, google_id)
  values (
    new.id,
    new.email,
    gen_username,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
    new.raw_user_meta_data->>'sub'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 4. Backfill google_id/avatar_url for accounts that already signed in with
--    Google before this migration (coalesce = fills NULLs only).
update public.profiles p
set google_id = coalesce(p.google_id, i.identity_data->>'sub'),
    avatar_url = coalesce(p.avatar_url, i.identity_data->>'avatar_url', i.identity_data->>'picture')
from auth.identities i
where i.user_id = p.id and i.provider = 'google';

-- 5. update_username(): server-side validation + case-insensitive
--    uniqueness (both already enforced by the profiles_username_format
--    check + profiles_username_lower_idx unique index) PLUS a 24h
--    rate-limit per user, so the RPC is the single source of truth for a
--    username change instead of relying on client-side checks alone.
create or replace function public.update_username(new_username text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cur public.profiles;
  clean text := trim(new_username);
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  if clean is null or clean !~ '^[a-zA-Z0-9_]{3,20}$' then
    raise exception 'profiles_username_format';
  end if;

  select * into cur from public.profiles where id = uid;
  if not found then
    raise exception 'not_authenticated';
  end if;

  -- No-op: re-submitting the current username doesn't cost a rate-limit slot.
  if cur.username is not null and lower(cur.username) = lower(clean) then
    return cur;
  end if;

  if cur.username_updated_at is not null and now() - cur.username_updated_at < interval '24 hours' then
    raise exception 'username_rate_limited';
  end if;

  if exists (select 1 from public.profiles where lower(username) = lower(clean) and id <> uid) then
    raise exception 'profiles_username_taken';
  end if;

  update public.profiles
    set username = clean, username_updated_at = now()
    where id = uid
    returning * into cur;

  return cur;
end;
$$;

-- 6. Avatar storage: dedicated "avatars" bucket, same size/type limits the
--    task specifies (2MB, png/jpg/webp) — kept separate from the existing
--    "card-images" bucket (system-managed cache, not user-writable).
--    Path convention: avatars/{user_id}/avatar.{ext} — RLS below restricts
--    writes to the owner's own folder; reads are public (avatars are shown
--    on public-facing UI, same as any profile picture).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_insert" on storage.objects;
create policy "avatars_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- 7. Lock down EXECUTE on both functions above beyond the default PUBLIC
--    grant Postgres applies at CREATE time (applied live as a separate
--    follow-up migration on 2026-08-26, folded in here so the tracked file
--    matches the final live state in one place).
revoke execute on function public.update_username(text) from public;
revoke execute on function public.update_username(text) from anon;
grant execute on function public.update_username(text) to authenticated;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

-- 8. Account deletion (GDPR): public.profiles.id -> auth.users.id is already
--    ON DELETE CASCADE (profiles_id_fkey), and every user-owned table FKs
--    into profiles/auth.users with ON DELETE CASCADE too (collection,
--    alerts, watchlist, binders, posts, comments, likes, followers,
--    academy_progress, card_submissions — verified via
--    information_schema.referential_constraints on 2026-08-26). So deleting
--    the auth.users row (done server-side via the Admin API, see
--    api/delete-account.js — the anon/authenticated client role cannot call
--    it) cascades through the entire graph with no further SQL needed here.
--    ebay_clicks.user_id and collection.binder_id/canonical_cards.*_id are
--    ON DELETE SET NULL by design (anonymize, not cascade — those rows
--    carry aggregate/product data, not personal data).

-- 9. Rate-limit enforcement at the row level, not just inside
--    update_username(): profiles_update_own (RLS) permits an
--    authenticated client to UPDATE its own profiles.username directly
--    over the REST client, bypassing the RPC (and its rate-limit check)
--    entirely. A BEFORE UPDATE trigger closes that gap for every write
--    path, not just the RPC one.
create or replace function public.enforce_username_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.username is distinct from old.username then
    if old.username_updated_at is not null and now() - old.username_updated_at < interval '24 hours' then
      raise exception 'username_rate_limited';
    end if;
    new.username_updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_username_rate_limit on public.profiles;
create trigger profiles_username_rate_limit
  before update on public.profiles
  for each row execute function public.enforce_username_rate_limit();
