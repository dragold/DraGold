-- Auth + Profile + Username feature.
-- Extends the existing public.profiles table for username-based registration,
-- adds case-insensitive username uniqueness, and restricts public profile
-- exposure (profiles.email was previously readable by ANY anon/authenticated
-- request via the "Profili visibili a tutti" policy — see section 6 below).
-- Non-destructive: no DROP TABLE / DROP COLUMN, no existing rows touched.
-- Applied to the live project via mcp__Supabase__apply_migration on 2026-08-23.

-- 1. New columns (nullable / defaulted — non-breaking for existing rows)
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

-- 2. Case-insensitive uniqueness on username (blocks "Ermal" vs "ermal").
--    The pre-existing case-sensitive unique constraint on username is left as-is.
create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username))
  where username is not null;

-- 3. Charset/length guard, applied only to NEW/UPDATED rows (NOT VALID skips
--    checking existing data, e.g. the legacy "DraGold Staff" username).
--    Safe for a future /u/{username} URL: 3-20 chars, [a-zA-Z0-9_].
alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles
  add constraint profiles_username_format
  check (username is null or username ~ '^[a-zA-Z0-9_]{3,20}$') not valid;

-- 4. Keep updated_at current on every UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- 5. Capture username (and display_name) at signup time from
--    raw_user_meta_data (passed via supabase.auth.signUp({ options: { data }})),
--    so it lands on the profile row even before email confirmation, when the
--    client has no session yet to run an UPDATE with.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, username, display_name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data->>'username', ''),
    nullif(new.raw_user_meta_data->>'display_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 6. RLS fix: public.profiles had TWO permissive SELECT policies —
--    "profiles_select_own" (auth.uid() = id) AND "Profili visibili a tutti"
--    (qual: true). Postgres OR-combines permissive policies for the same
--    command, so the "true" policy silently made ALL columns of EVERY
--    profile — including email — readable by anyone with the anon key.
--    Task spec requires "own profile only" for profiles; dropping the
--    public policy also closes that leak.
--    NOTE: DraGold.legacy.jsx's dormant Community feed (explicitly commented
--    "disabled until posts/likes/followers/comments tables are set up") reads
--    other users' profiles(username,avatar_url) via this now-removed public
--    policy. It is currently unreachable from the UI, so nothing breaks today,
--    but when Community ships it will need a public-safe view exposing only
--    username/display_name/avatar_url (never email) — flagged, not built here
--    (out of scope for this task).
drop policy if exists "Profili visibili a tutti" on public.profiles;
-- profiles_select_own / profiles_insert_own / profiles_update_own already
-- existed and already match "own row only" semantics — left unchanged.

-- 7. public.collection / public.alerts / public.watchlist already carry
--    "own row only" RLS (collection_own / alerts_own / watchlist_owner_*),
--    and collection.user_id -> profiles.id -> auth.users.id is already an FK
--    chain. Verified via list_tables/pg_policies, no change needed here.
