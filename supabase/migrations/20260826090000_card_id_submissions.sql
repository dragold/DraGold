-- Card ID microproduct (sprint 2026-08-26): missing-card contributions.
-- Un utente autenticato puo' proporre una carta non ancora presente nel
-- catalogo (Card ID, sez. 8/9 del task). Stesso pattern RLS owner-only gia'
-- usato da collection/watchlist/alerts (004_user_collection.sql): la
-- submission resta privata a chi l'ha creata, nessuna riga scrivibile in
-- canonical_cards/cards, nessun path per approvare/rifiutare esposto da qui
-- (review resta un'operazione separata, sez. 12 del task: "non costruire un
-- CMS"). Nessuna policy di update/delete: una volta inviata, l'utente non
-- puo' alterare stato o contenuto della propria submission (evita che una
-- submission gia' in review venga cambiata sotto al reviewer). Se in futuro
-- serve permettere la modifica/ritiro di una submission ancora pending, va
-- aggiunta una policy dedicata con check esplicito su status='pending'.
create table if not exists public.card_submissions (
  id            bigserial primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  game          text not null,
  name          text not null,
  set_name      text not null,
  card_number   text not null,
  language      text not null,
  rarity        text,
  variant       text,
  image_url     text,
  notes         text,
  source_url    text,
  status        text not null default 'pending' check (status in ('pending','approved','rejected','duplicate')),
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz
);
create index if not exists card_submissions_user_idx on public.card_submissions(user_id, created_at desc);
create index if not exists card_submissions_status_idx on public.card_submissions(status);

alter table public.card_submissions enable row level security;

create policy "card_submissions_owner_insert" on public.card_submissions
  for insert with check (auth.uid() = user_id);
create policy "card_submissions_owner_read" on public.card_submissions
  for select using (auth.uid() = user_id);

-- ============ Contributor level (MVP derivato, nessuna nuova tabella) ============
-- Livello calcolato SOLO da status='approved' (mai pending/rejected), come da
-- spec (sez. 11 del task). View invece di una contributor_profiles table:
-- "preferisci la soluzione meno complessa". security_invoker=true (PG15+,
-- supportato da Supabase) fa si' che la view rispetti la RLS della tabella
-- sottostante per il ruolo che interroga, invece di girare coi privilegi del
-- proprietario della view (default Postgres, che altrimenti farebbe trapelare
-- il conteggio approvato di TUTTI gli utenti a chiunque legga la view) — cosi'
-- ogni utente vede solo la propria riga, esattamente come card_submissions.
create or replace view public.contributor_levels
with (security_invoker = true) as
select
  user_id,
  count(*)::int as approved_count,
  case
    when count(*) >= 50 then 'Archivist'
    when count(*) >= 20 then 'Curator'
    when count(*) >= 5  then 'Contributor'
    when count(*) >= 1  then 'Finder'
    else 'Explorer'
  end as level
from public.card_submissions
where status = 'approved'
group by user_id;

grant select on public.contributor_levels to authenticated;
