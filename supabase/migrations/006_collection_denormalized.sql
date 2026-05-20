-- DraGold v5: fix bug "vault non persiste dopo refresh"
--
-- Problema risolto:
-- La FK collection.card_id → cards(id) faceva fallire silently l'upsert
-- quando l'utente salvava una carta arrivata dal live-API fallback (Scryfall,
-- pokemontcg.io live, YGOPRODeck) — id non presente nel catalogo Supabase locale.
-- Risultato: localStorage saveCol funzionava, ma Supabase no → dopo refresh la
-- ricarica da Supabase ritornava 0 righe e il vault sembrava vuoto.
--
-- Fix:
-- 1) Drop FK su collection.card_id, watchlist.card_id, alerts.card_id
-- 2) Aggiunge colonne denormalizzate card_name, card_set, card_img, card_lang
--    direttamente nelle tabelle utente → niente join obbligatorio per render.
-- 3) Crea tabelle se non esistono già (idempotent).

-- ============ COLLECTION (vault) — idempotent ============
create table if not exists public.collection (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  card_id     text not null,                  -- NO foreign key (denormalizzato)
  tcg         text not null,
  card_api_id text,
  quantity    int not null default 1 check (quantity > 0),
  condition   text default 'NM',
  paid_eur    numeric(10,2),
  paid_usd    numeric(10,2),
  notes       text,
  added_at    timestamptz default now(),
  updated_at  timestamptz default now(),
  unique(user_id, card_id, condition)
);

-- Drop existing FK if it was created by previous migration 004
alter table public.collection drop constraint if exists collection_card_id_fkey;

-- Add denormalized columns
alter table public.collection add column if not exists card_name text;
alter table public.collection add column if not exists card_set  text;
alter table public.collection add column if not exists card_img  text;
alter table public.collection add column if not exists card_lang text;

create index if not exists collection_user_idx on public.collection(user_id, added_at desc);
create index if not exists collection_card_idx on public.collection(card_id);

alter table public.collection enable row level security;
drop policy if exists "collection_owner_read"   on public.collection;
drop policy if exists "collection_owner_insert" on public.collection;
drop policy if exists "collection_owner_update" on public.collection;
drop policy if exists "collection_owner_delete" on public.collection;
create policy "collection_owner_read"   on public.collection for select using (auth.uid() = user_id);
create policy "collection_owner_insert" on public.collection for insert with check (auth.uid() = user_id);
create policy "collection_owner_update" on public.collection for update using (auth.uid() = user_id);
create policy "collection_owner_delete" on public.collection for delete using (auth.uid() = user_id);

-- ============ WATCHLIST — idempotent ============
create table if not exists public.watchlist (
  id        bigserial primary key,
  user_id   uuid not null references auth.users(id) on delete cascade,
  card_id   text not null,
  tcg       text not null,
  added_at  timestamptz default now(),
  unique(user_id, card_id)
);

alter table public.watchlist drop constraint if exists watchlist_card_id_fkey;
alter table public.watchlist add column if not exists card_name text;
alter table public.watchlist add column if not exists card_set  text;
alter table public.watchlist add column if not exists card_img  text;

create index if not exists watchlist_user_idx on public.watchlist(user_id, added_at desc);

alter table public.watchlist enable row level security;
drop policy if exists "watchlist_owner_read"   on public.watchlist;
drop policy if exists "watchlist_owner_insert" on public.watchlist;
drop policy if exists "watchlist_owner_delete" on public.watchlist;
create policy "watchlist_owner_read"   on public.watchlist for select using (auth.uid() = user_id);
create policy "watchlist_owner_insert" on public.watchlist for insert with check (auth.uid() = user_id);
create policy "watchlist_owner_delete" on public.watchlist for delete using (auth.uid() = user_id);

-- ============ ALERTS — drop FK only (table may already exist) ============
create table if not exists public.alerts (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  card_id      text not null,
  tcg          text not null,
  card_api_id  text,
  target_eur   numeric(10,2),
  direction    text default 'below' check (direction in ('below','above')),
  is_active    boolean default true,
  email        text,
  created_at   timestamptz default now(),
  triggered_at timestamptz
);

alter table public.alerts drop constraint if exists alerts_card_id_fkey;

create index if not exists alerts_user_idx   on public.alerts(user_id);
create index if not exists alerts_active_idx on public.alerts(is_active, tcg) where is_active = true;

alter table public.alerts enable row level security;
drop policy if exists "alerts_owner_read"   on public.alerts;
drop policy if exists "alerts_owner_insert" on public.alerts;
drop policy if exists "alerts_owner_update" on public.alerts;
drop policy if exists "alerts_owner_delete" on public.alerts;
create policy "alerts_owner_read"   on public.alerts for select using (auth.uid() = user_id);
create policy "alerts_owner_insert" on public.alerts for insert with check (auth.uid() = user_id);
create policy "alerts_owner_update" on public.alerts for update using (auth.uid() = user_id);
create policy "alerts_owner_delete" on public.alerts for delete using (auth.uid() = user_id);

-- ============ Portfolio summary view ============
create or replace view public.user_portfolio_summary as
select
  c.user_id,
  count(*)::int                                          as card_count,
  sum(c.quantity)::int                                   as total_quantity,
  coalesce(sum(c.paid_eur * c.quantity), 0)::numeric     as total_paid_eur,
  coalesce(sum(p.price_market * c.quantity), 0)::numeric as total_value_usd
from public.collection c
left join public.card_prices_latest p on p.card_id = c.card_id
group by c.user_id;
