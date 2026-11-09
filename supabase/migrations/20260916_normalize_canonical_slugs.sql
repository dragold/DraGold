-- 20260916_normalize_canonical_slugs.sql
-- Normalizza canonical_cards: lowercase set_id per slug deterministico,
-- rigenera slug, deduplica gruppi (case-insensitive set_id), aggiunge UNIQUE(slug).
-- Applicabile in sicurezza su DB con dati esistenti (idempotente).

-- 1) Aggiunge colonna temporanea per il nuovo slug normalizzato
alter table public.canonical_cards add column if not exists slug_normalized text;

-- 2) Rigenera slug normalizzato: tcg + lowercase set_id + card_number
--    Nota: set_id viene normalizzato come in slugifySetId (lowercase, non-alfanumerico -> '-')
update public.canonical_cards
set slug_normalized = 
  lower(tcg) || '-' || 
  lower(regexp_replace(set_id, '[^a-z0-9]+', '-', 'g')) || '-' || 
  card_number
where slug_normalized is null or slug_normalized = '';

-- 3) Identifica e gestisce i duplicati (stesso slug_normalized)
--    Strategia: per ogni slug_normalized duplicato, manteniamo la riga con primary_image_card_id
--    se presente, altrimenti la prima per created_at. Le altre vengono eliminate.
--    NOTA: Questa operazione è distruttiva sui duplicati — verificare prima in staging.

-- Prima, creiamo una vista temporanea per vedere cosa succede
create temporary view canonical_slug_duplicates as
select 
  slug_normalized,
  count(*) as cnt,
  array_agg(id order by (primary_image_card_id is not null) desc, created_at) as ids,
  array_agg(base_name) as base_names,
  array_agg(set_id) as set_ids,
  array_agg(card_number) as card_numbers,
  array_agg(primary_image_card_id) as primary_ids
from public.canonical_cards
group by slug_normalized
having count(*) > 1;

-- 4) Elimina le righe duplicate, mantenendo la "migliore" per ogni slug_normalized
--    Criterio: prima riga con primary_image_card_id non null, altrimenti prima per created_at
with to_delete as (
  select unnest(ids[2:]) as id_to_delete
  from canonical_slug_duplicates
)
delete from public.canonical_cards
where id in (select id_to_delete from to_delete);

-- 5) Applica lo slug_normalized come nuovo slug ufficiale
update public.canonical_cards
set slug = slug_normalized
where slug_normalized is not null and slug != slug_normalized;

-- 6) Rimuove la colonna temporanea
alter table public.canonical_cards drop column if exists slug_normalized;

-- 7) Rimuove la vista temporanea
drop view if exists canonical_slug_duplicates;

-- 8) Aggiunge UNIQUE constraint su slug (ora che non ci sono più duplicati)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'canonical_cards_slug_key'
  ) then
    alter table public.canonical_cards
      add constraint canonical_cards_slug_key unique (slug);
  end if;
end $$;

-- 9) Commento per documentazione
comment on column public.canonical_cards.slug is
  'Slug pubblico per /carta/{slug}. Formato: {tcg}-{lowercase_set_id}-{card_number}. 
   Generato da tcg + lower(regexp_replace(set_id, ''[^a-z0-9]+'', ''-'', ''g'')) + card_number.
   UNIQUE constraint garantisce unicità per routing SEO.';

-- 10) Aggiorna anche cards.set_id per coerenza? 
--    NO: cards.set_id resta come sorgente (case-sensitive per tracciabilità sorgente).
--    La normalizzazione avviene SOLO a livello di slug/canonical_cards.