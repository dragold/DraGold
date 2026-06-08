-- Migration: tabella sets da TCG Price Lookup
-- id = UUID v7 (time-ordered, sort per id DESC = piu recenti prima)

create table if not exists public.sets (
  id           text primary key,
  slug         text not null,
  game         text not null,
  name         text not null,
  card_count   integer,
  released_at  date,
  synced_at    timestamptz default now()
);

create index if not exists sets_game_idx on public.sets(game);
create index if not exists sets_released_idx on public.sets(released_at desc nulls last, id desc);

alter table public.sets enable row level security;

create policy sets_public_read on public.sets for select using (true);
