-- Academy MVP (Task 4): per-user lesson completion tracking.
-- Lesson content itself is static in the repo (src/pages/academy/academyContent.js,
-- keyed by slug) — this table only records which lessons a user has completed,
-- one row per (user, lesson_slug), so the Academy UI can resume/highlight
-- progress across sessions and devices. Same id/RLS convention as
-- public.collection (006_collection_denormalized.sql): uuid_generate_v4() pk,
-- owner-only RLS via auth.uid() = user_id.
create table if not exists public.academy_progress (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  lesson_slug   text not null,
  completed_at  timestamptz not null default now(),
  unique(user_id, lesson_slug)
);

create index if not exists academy_progress_user_idx on public.academy_progress(user_id);

alter table public.academy_progress enable row level security;
drop policy if exists "academy_progress_own" on public.academy_progress;
create policy "academy_progress_own" on public.academy_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
