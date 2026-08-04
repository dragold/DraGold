-- 20260805_card_image_cache.sql
-- Server-side image cache/proxy support table for api/cache-image.js.
-- Tracks the outcome of caching an external card image (download -> WebP
-- convert -> upload to Supabase Storage bucket "card-images") so we never
-- re-download a source we've already resolved (or already know is broken).
--
-- language is NOT NULL / default 'any': a NULL value would make the
-- (card_id, source, language, variant) unique constraint useless, since
-- Postgres treats every NULL as distinct from every other NULL. The
-- application code normalizes language the same way before both the
-- Storage path and this row, so the two always stay in sync.

create table if not exists public.card_image_cache (
    id            bigint generated always as identity primary key,
    card_id       text not null references public.cards(id) on delete cascade,
    source        text not null,
    language      text not null default 'any',
    variant       text not null default 'default',
    original_url  text not null,
    cached_url    text,
    format        text,
    width         integer,
    height        integer,
    bytes         integer,
    status        text not null default 'pending'
                  check (status in ('pending', 'ready', 'error')),
    error_message text,
    cached_at     timestamptz,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),

  constraint card_image_cache_unique unique (card_id, source, language, variant)
  );

create index if not exists idx_card_image_cache_card_id on public.card_image_cache(card_id);
create index if not exists idx_card_image_cache_status  on public.card_image_cache(status);

create or replace function public.card_image_cache_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_card_image_cache_updated_at on public.card_image_cache;
create trigger trg_card_image_cache_updated_at
  before update on public.card_image_cache
  for each row execute function public.card_image_cache_set_updated_at();

alter table public.card_image_cache enable row level security;
-- No public policies: only the service role (used by api/cache-image.js)
-- can read/write. Add a select-only policy for status='ready' rows later
-- if the frontend ever needs to read cache state directly.
