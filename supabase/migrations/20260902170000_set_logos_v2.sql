-- Fase 1 — set_logos v2: catalogo set con release date reale, status
-- (upcoming/released/...), provenance/confidence, e guardia anti-regressione
-- per i duplicati di casing (sv10/SV10, OP-01/op01).
--
-- Additiva e reversibile. `set_logos` e' la tabella che l'app legge per i
-- metadati set (src/lib/tcgSets.js, src/pages/set/setPageData.js) — le colonne
-- esistenti (set_code, set_name, logo_url, symbol_url, release_date testo,
-- source, retrieved_at) restano invariate.
--
-- Verificato 2026-09-02 prima di applicare: 0 collisioni di set_code_norm per
-- tcg (l'indice unico si crea pulito); 214/214 righe hanno release_date in
-- forma YYYY-MM-DD (il backfill di released_on non perde nessuna riga).
--
-- DOWN: vedi 20260902170000_set_logos_v2_down.sql

alter table public.set_logos
  add column if not exists released_on       date,
  add column if not exists status            text
      check (status in ('announced','upcoming','released','available','complete','legacy')),
  add column if not exists source_confidence text
      check (source_confidence in ('high','medium','low')),
  add column if not exists card_count        integer,
  add column if not exists series_id         text,
  add column if not exists series_name       text,
  add column if not exists updated_at        timestamptz not null default now();

alter table public.set_logos
  add column if not exists set_code_norm text
    generated always as (lower(regexp_replace(coalesce(set_code, ''), '[^a-zA-Z0-9]', '', 'g'))) stored;

create unique index if not exists set_logos_tcg_codenorm_uniq
  on public.set_logos (tcg, set_code_norm);

-- backfill released_on dal testo esistente (tutte le righe sono YYYY-MM-DD)
update public.set_logos
   set released_on = nullif(release_date, '')::date
 where release_date ~ '^\d{4}-\d{2}-\d{2}$'
   and released_on is null;

-- status iniziale derivato dalla data
update public.set_logos
   set status = case
     when released_on is null            then 'legacy'
     when released_on > current_date      then 'upcoming'
     else 'released'
   end
 where status is null;

-- le righe preesistenti vengono da un bulk non verificato -> confidence bassa,
-- sync-set-catalog-v2.js la promuove a 'high' quando una fonte reale conferma.
update public.set_logos
   set source_confidence = 'low'
 where source_confidence is null;
