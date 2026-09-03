-- Cross-Language Identity (Fase A) — M2: indexes for card_versions lookups.
-- Non-concurrent create index: cards is ~204k rows, brief write lock, acceptable pre-launch.
-- DOWN: 20260903175700_cards_tcg_set_number_idx_down.sql

-- (a) composite lookup: tcg + set_id + normalized number
create index if not exists cards_tcg_set_number_idx
  on public.cards (tcg, set_id, card_number_norm);

-- (b) functional index on set_identity_key(set_id) so card_versions can gather
--     spelling-equivalent sets (sv03.5 <-> sv3pt5 <-> sv3.5) without a full scan.
--     set_identity_key is IMMUTABLE (verified pg_proc.provolatile = 'i').
create index if not exists cards_tcg_set_identity_key_idx
  on public.cards (tcg, public.set_identity_key(set_id));
