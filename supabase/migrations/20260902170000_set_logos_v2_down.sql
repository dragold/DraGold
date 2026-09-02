-- DOWN per 20260902170000_set_logos_v2.sql — NON applicata automaticamente.
-- Rimuove solo le colonne/indice additivi; le colonne storiche di set_logos
-- (set_code, set_name, logo_url, symbol_url, release_date, source, retrieved_at)
-- non vengono toccate. Nessuna perdita di dati storici.

drop index if exists public.set_logos_tcg_codenorm_uniq;

alter table public.set_logos
  drop column if exists set_code_norm,
  drop column if exists released_on,
  drop column if exists status,
  drop column if exists source_confidence,
  drop column if exists card_count,
  drop column if exists series_id,
  drop column if exists series_name,
  drop column if exists updated_at;
