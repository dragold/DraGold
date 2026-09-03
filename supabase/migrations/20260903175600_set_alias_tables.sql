-- Cross-Language Identity (Fase A) — M1: curated set/number mapping tables.
-- Additive. RLS public-read, service_role write. Spec: docs/plans/2026-09-03-cross-language-identity-spec.md §2
-- DOWN: 20260903175600_set_alias_tables_down.sql

create table if not exists public.set_alias (
  id               bigint generated always as identity primary key,
  tcg              text not null,
  alias_set_id     text not null,
  canonical_set_id text not null,
  relation         text not null default 'equivalent'
                   check (relation in ('equivalent','subset','superset','partial')),
  confidence       text not null default 'confirmed'
                   check (confidence in ('confirmed','candidate','rejected')),
  source           text not null default 'curated',
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint set_alias_not_self check (alias_set_id <> canonical_set_id),
  unique (tcg, alias_set_id)
);
create index if not exists set_alias_lookup_idx
  on public.set_alias (tcg, alias_set_id) where confidence = 'confirmed';
create index if not exists set_alias_canon_idx
  on public.set_alias (tcg, canonical_set_id) where confidence = 'confirmed';

alter table public.set_alias enable row level security;
drop policy if exists set_alias_public_read on public.set_alias;
create policy set_alias_public_read on public.set_alias for select using (true);

create table if not exists public.card_number_alias (
  id                    bigint generated always as identity primary key,
  tcg                   text not null,
  canonical_set_id      text not null,
  alias_set_id          text not null,
  alias_card_number     text not null,
  canonical_card_number text not null,
  relation              text not null default 'same_card' check (relation in ('same_card')),
  confidence            text not null default 'confirmed'
                        check (confidence in ('confirmed','candidate','rejected')),
  source                text not null default 'curated',
  note                  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (tcg, alias_set_id, alias_card_number),
  unique (tcg, canonical_set_id, alias_set_id, canonical_card_number)
);
create index if not exists card_number_alias_lookup_idx
  on public.card_number_alias (tcg, alias_set_id, alias_card_number) where confidence = 'confirmed';

alter table public.card_number_alias enable row level security;
drop policy if exists card_number_alias_public_read on public.card_number_alias;
create policy card_number_alias_public_read on public.card_number_alias for select using (true);

-- Difensivo: un set non può essere sia riferimento che alias per lo stesso tcg.
create or replace function public.set_alias_no_self_ref() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.set_alias
             where tcg = new.tcg and alias_set_id = new.canonical_set_id
               and (tg_op = 'INSERT' or id <> new.id)) then
    raise exception 'set % is already an alias_set_id for tcg % — cannot also be canonical', new.canonical_set_id, new.tcg;
  end if;
  if exists (select 1 from public.set_alias
             where tcg = new.tcg and canonical_set_id = new.alias_set_id
               and (tg_op = 'INSERT' or id <> new.id)) then
    raise exception 'set % is already a canonical_set_id for tcg % — cannot also be an alias', new.alias_set_id, new.tcg;
  end if;
  return new;
end $$;
drop trigger if exists set_alias_no_self_ref_trg on public.set_alias;
create trigger set_alias_no_self_ref_trg before insert or update on public.set_alias
  for each row execute function public.set_alias_no_self_ref();

drop trigger if exists set_alias_updated_at on public.set_alias;
create trigger set_alias_updated_at before update on public.set_alias
  for each row execute function public.set_updated_at();
drop trigger if exists card_number_alias_updated_at on public.card_number_alias;
create trigger card_number_alias_updated_at before update on public.card_number_alias
  for each row execute function public.set_updated_at();
