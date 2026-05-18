-- DraGold: schema Supabase completo
-- Da incollare nello SQL Editor di Supabase, in ordine.

-- ============ EXTENSIONS ============
create extension if not exists "uuid-ossp";

-- ============ PROFILES ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  username text unique,
  country text default 'IT',
  region text default 'EU', -- EU | US
  plan text default 'free', -- free | pro
  stripe_customer_id text,
  pro_until timestamptz,
  scans_used_month int default 0,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Profili visibili solo dal proprietario"
  on public.profiles for select using (auth.uid() = id);
create policy "Profili modificabili solo dal proprietario"
  on public.profiles for update using (auth.uid() = id);
create policy "Insert proprio profilo"
  on public.profiles for insert with check (auth.uid() = id);

-- Crea profilo automaticamente alla registrazione
create or replace function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============ BINDERS ============
create table if not exists public.binders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  layout text default '3x3', -- 2x2, 3x3, 3x4, 4x4, 1x1
  cover_color text default '#fbbf24',
  is_public boolean default false,
  created_at timestamptz default now()
);

alter table public.binders enable row level security;
create policy "Binder propri" on public.binders for all using (auth.uid() = user_id);
create policy "Binder pubblici leggibili" on public.binders for select using (is_public = true);

-- ============ COLLECTION (carte nei binder) ============
create table if not exists public.collection (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade,
  binder_id uuid references public.binders(id) on delete set null,
  tcg text not null, -- pokemon | mtg | yugioh | onepiece
  card_api_id text not null, -- id dalla rispettiva API
  card_name text,
  set_name text,
  card_number text,
  rarity text,
  image_url text,
  condition text default 'NM', -- NM, LP, MP, HP, DMG
  is_graded boolean default false,
  grade_company text, -- PSA, CGC, Beckett
  grade_value text, -- 10, 9.5, 9
  purchase_price numeric(10,2),
  purchase_date date,
  fmv_snapshot numeric(10,2),
  fmv_currency text default 'EUR',
  notes text,
  added_at timestamptz default now()
);

alter table public.collection enable row level security;
create policy "Collection propria" on public.collection for all using (auth.uid() = user_id);
create policy "Collection in binder pubblici"
  on public.collection for select
  using (exists (select 1 from public.binders b where b.id = collection.binder_id and b.is_public = true));

create index if not exists collection_user_idx on public.collection(user_id);
create index if not exists collection_binder_idx on public.collection(binder_id);

-- ============ ALERTS ============
create table if not exists public.alerts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade,
  tcg text not null,
  card_api_id text not null,
  card_name text not null,
  language text default 'EN', -- EN, JP, IT, DE, FR, ES, PT, KO, ZH
  threshold_price numeric(10,2) not null,
  direction text default 'below', -- below | above
  currency text default 'EUR',
  country text default 'US',
  region text default 'US',
  is_active boolean default true,
  last_triggered_at timestamptz,
  last_checked_at timestamptz,
  created_at timestamptz default now()
);

alter table public.alerts enable row level security;
create policy "Alert propri" on public.alerts for all using (auth.uid() = user_id);

create index if not exists alerts_active_idx on public.alerts(is_active) where is_active = true;
create index if not exists alerts_user_idx on public.alerts(user_id);

-- ============ BLOG ============
create table if not exists public.blog_posts (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  title text not null,
  excerpt text,
  cover_image text,
  content_md text not null,
  tcg text default 'pokemon',
  cards_featured jsonb default '[]'::jsonb,
  published boolean default false,
  published_at timestamptz,
  views int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.blog_posts enable row level security;
create policy "Blog pubblici leggibili" on public.blog_posts for select using (published = true);

create index if not exists blog_published_idx on public.blog_posts(published, published_at desc);

-- ============ NEWSLETTER ============
create table if not exists public.newsletter (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  source text default 'landing',
  confirmed boolean default false,
  confirmed_at timestamptz,
  created_at timestamptz default now()
);

alter table public.newsletter enable row level security;
create policy "Newsletter insert pubblico"
  on public.newsletter for insert with check (true);

-- ============ PRICE HISTORY (per grafici e movers) ============
create table if not exists public.price_history (
  id bigserial primary key,
  tcg text not null,
  card_api_id text not null,
  fmv_eur numeric(10,2),
  fmv_usd numeric(10,2),
  source text default 'cardmarket', -- cardmarket | tcgplayer | ebay
  captured_at timestamptz default now()
);

create index if not exists ph_card_idx on public.price_history(tcg, card_api_id, captured_at desc);

-- ============ EBAY CLICKS (per tracking conversioni) ============
create table if not exists public.ebay_clicks (
  id bigserial primary key,
  user_id uuid references public.profiles(id) on delete set null,
  card_api_id text,
  card_name text,
  country text,
  domain text,
  clicked_at timestamptz default now()
);

create index if not exists ebay_clicks_user_idx on public.ebay_clicks(user_id, clicked_at desc);

-- ============ DONE ============
-- After running everything above:
-- 1. Settings > Auth: enable "Email" as provider
-- 2. Settings > Auth > URL Configuration: add https://dragold.app as Site URL
-- 3. Copy anon key + URL into Vercel as VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
-- 4. For hourly alerts: Database > Functions > Schedule the `check-alerts` Edge Function
--    with cron `0 * * * *` (every hour). Set RESEND_API_KEY secret for email sending.
