-- Task "Catalog Sync + Enrichment Fix": aggiunge provenance a set_logos riusando
-- il pattern gia' esistente su cards.source/cards.source_id, senza creare una
-- gerarchia di sorgenti parallela. Nullable, non distruttiva, idempotente.
-- Applicata live via Supabase MCP il 2026-08-23; file aggiunto al repo per
-- storico/tracciabilita' (stessa convenzione di supabase/migrations/*.sql
-- gia' in uso nel progetto).

alter table public.set_logos add column if not exists source text;
alter table public.set_logos add column if not exists retrieved_at timestamptz;

comment on column public.set_logos.source is
  'Fonte dati che ha popolato/aggiornato la riga (es. scryfall, ygoprodeck, lorcast, tcgdex, optcg). Nullable per compatibilita'' con le righe pokemon/onepiece gia'' esistenti, popolate prima di questo campo.';
comment on column public.set_logos.retrieved_at is
  'Timestamp dell''ultimo fetch riuscito dalla fonte esterna per questa riga.';
