-- DraGold v3: per-user collection (vault) e watchlist persistenti.
-- Senza queste tabelle il portfolio è solo localStorage → si perde cambiando device.
-- refresh-prices/index.ts già fa SELECT da `collection`: questo finalmente la crea.

-- ============ COLLECTION (vault) ============
create table if not exists public.collection (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  card_id     text not null references public.cards(id) on delete cascade,
  tcg         text not null,             -- copia per query veloci senza join
  card_api_id text,                       -- legacy: id sorgente API (per refresh-prices)
  quantity    int not null default 1 check (quantity > 0),
  condition   text default 'NM',          -- NM, LP, MP, HP, DMG
  paid_eur    numeric(10,2),              -- quanto pagato (sempre EUR)
  paid_usd    numeric(10,2),              -- mirror in USD (per stats globali)
  notes       text,
  added_at    timestamptz default now(),
  updated_at  timestamptz default now(),
  unique(user_id, card_id, condition)     -- stesso card+condition = stesso slot
);
create index if not exists collection_user_idx on public.collection(user_id, added_at desc);
create index if not exists collection_card_idx on public.collection(card_id);
create index if not exists collection_tcg_idx  on public.collection(tcg);

alter table public.collection enable row level security;
create policy "collection_owner_read"   on public.collection for select using (auth.uid() = user_id);
create policy "collection_owner_insert" on public.collection for insert with check (auth.uid() = user_id);
create policy "collection_owner_update" on public.collection for update using (auth.uid() = user_id);
create policy "collection_owner_delete" on public.collection for delete using (auth.uid() = user_id);

-- ============ WATCHLIST ============
create table if not exists public.watchlist (
  id        bigserial primary key,
  user_id   uuid not null references auth.users(id) on delete cascade,
  card_id   text not null references public.cards(id) on delete cascade,
  tcg       text not null,
  added_at  timestamptz default now(),
  unique(user_id, card_id)
);
create index if not exists watchlist_user_idx on public.watchlist(user_id, added_at desc);

alter table public.watchlist enable row level security;
create policy "watchlist_owner_read"   on public.watchlist for select using (auth.uid() = user_id);
create policy "watchlist_owner_insert" on public.watchlist for insert with check (auth.uid() = user_id);
create policy "watchlist_owner_delete" on public.watchlist for delete using (auth.uid() = user_id);

-- ============ ALERTS (idempotent: già usata da refresh-prices) ============
create table if not exists public.alerts (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  card_id      text not null references public.cards(id) on delete cascade,
  tcg          text not null,
  card_api_id  text,
  target_eur   numeric(10,2),
  direction    text default 'below' check (direction in ('below','above')),
  is_active    boolean default true,
  email        text,
  created_at   timestamptz default now(),
  triggered_at timestamptz
);
create index if not exists alerts_user_idx   on public.alerts(user_id);
create index if not exists alerts_active_idx on public.alerts(is_active, tcg) where is_active = true;

alter table public.alerts enable row level security;
create policy "alerts_owner_read"   on public.alerts for select using (auth.uid() = user_id);
create policy "alerts_owner_insert" on public.alerts for insert with check (auth.uid() = user_id);
create policy "alerts_owner_update" on public.alerts for update using (auth.uid() = user_id);
create policy "alerts_owner_delete" on public.alerts for delete using (auth.uid() = user_id);

-- ============ Portfolio summary view ============
-- Aggrega per utente: totale speso, valore corrente, P/L
create or replace view public.user_portfolio_summary as
select
  c.user_id,
  count(*)::int                                        as card_count,
  sum(c.quantity)::int                                 as total_quantity,
  coalesce(sum(c.paid_eur * c.quantity), 0)::numeric   as total_paid_eur,
  coalesce(sum(p.price_market * c.quantity), 0)::numeric as total_value_usd
from public.collection c
left join public.card_prices_latest p on p.card_id = c.card_id
group by c.user_id;
