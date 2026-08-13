-- 20260809_knowledge_graph_schema_baseline.sql
--
-- Baseline "freeze" dello schema reale verificato su Supabase (progetto pimwkmwrduqkaydyvxqz,
-- Postgres 17.6) per le 4 tabelle del Knowledge Graph: cards, card_prices, canonical_cards,
-- rarities. Formalizza esclusivamente la STRUTTURA gia' presente in produzione, verificata via
-- query read-only (information_schema, pg_constraint, pg_index, pg_policies) il 2026-08-09.
--
-- Questo file descrive schema, non stato dei dati: percentuali di copertura, righe popolate,
-- conteggi e altre osservazioni contingenti sui dati vivono in SCHEMA_VERIFICATION_REPORT.md,
-- non qui. I commenti in questo file (COMMENT ON TABLE/COLUMN) descrivono solo cosa una colonna
-- rappresenta e come si collega al resto dello schema.
--
-- Cosa fa questa migration:
--   - Crea canonical_cards e rarities se non esistono (oggi esistono gia' in produzione: le
--     CREATE TABLE sono no-op li', servono a rendere il file applicabile anche altrove).
--   - Aggiunge a cards e card_prices le colonne che sono in produzione ma non in nessuna
--     migration precedente (002_data_architecture.sql non le definiva).
--   - Aggiunge gli indici/unique/FK/policy che esistono gia' in produzione ma non erano
--     documentati in nessun file .sql di questo repository.
--   - Dichiara la dipendenza da pg_trgm (gia' installata in produzione) per gli indici GIN
--     trigram, cosi' che il file resti applicabile anche su un database dove l'estensione non
--     fosse ancora presente.
--
-- Cosa NON fa (deliberatamente, fuori scope):
--   - Non tocca collection, sets, ne' il collegamento cards.set_id <-> sets.
--   - Non deduplica gli slug duplicati di canonical_cards, non li rigenera.
--   - Non fa backfill di canonical_card_id per le righe di cards oggi senza gruppo canonico.
--   - Non modifica alcun dato esistente.
--   - Non abilita RLS su canonical_cards ne' su rarities (oggi disabilitata in produzione).
--     Abilitarla senza policy scritte apposta bloccherebbe le letture che il codice fa oggi
--     senza autenticazione: e' un fix di sicurezza a parte, da decidere esplicitamente (vedi
--     SCHEMA_VERIFICATION_REPORT.md). Questa migration si limita a formalizzare lo stato
--     strutturale reale, comprese le sue lacune.
--   - Non sposta pg_trgm dallo schema public a extensions: e' un'estensione gia' installata in
--     public in produzione (verificato), spostarla e' un fix di best-practice indipendente con
--     implicazioni sulle dipendenze degli indici esistenti — fuori perimetro qui.
--
-- Ogni statement e' idempotente (IF NOT EXISTS o guardia via DO block) per poter essere
-- applicata in sicurezza su un database dove tutto questo esiste gia', senza effetti collaterali.

-- ============================================================================
-- 0) Estensione richiesta dagli indici trigram su cards (cards_name_trgm_idx e i nuovi indici
--    trgm aggiunti in questa migration). Gia' installata in schema "public" in produzione
--    (coerente con "create extension if not exists pg_trgm;" di 002_data_architecture.sql,
--    che non specificava schema): dichiarata qui senza schema per restare coerente con lo
--    stato reale, non per introdurre un cambiamento.
-- ============================================================================

create extension if not exists pg_trgm;

-- ============================================================================
-- 1) canonical_cards — tabella usata da cardPageData.js e api/sitemap-cards.js,
--    oggi assente da ogni migration versionata.
-- ============================================================================

create table if not exists public.canonical_cards (
  id                     uuid primary key default gen_random_uuid(),
  tcg                    text not null,
  base_name              text not null,
  set_id                 text,
  card_number            text,
  slug                   text,
  primary_image_card_id  text,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

comment on table public.canonical_cards is
  'Carta canonica: raggruppa le righe di cards che rappresentano la stessa carta (stesso tcg+set_id+card_number) attraverso lingue e print_variant. slug e'' il target pubblico di /carta/{slug}.';

-- Regola di raggruppamento canonico in vigore in produzione: verificato che e' implementata
-- come UNIQUE INDEX (non come table constraint) — replicata identica.
create unique index if not exists canonical_cards_group_uk
  on public.canonical_cards using btree (tcg, set_id, card_number);

-- Indice non-unique sullo stesso gruppo di colonne, presente in produzione. Preservato per
-- fedelta' allo schema reale; probabile ridondanza con canonical_cards_group_uk (che serve
-- anche come indice di lookup) da valutare in un task dedicato, non qui.
create index if not exists canonical_cards_group_idx
  on public.canonical_cards using btree (tcg, set_id, card_number);

-- FK verso cards.id: nessun IF NOT EXISTS nativo per ALTER TABLE ADD CONSTRAINT in Postgres,
-- guardia esplicita via DO block.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'canonical_cards_primary_image_card_id_fkey'
  ) then
    alter table public.canonical_cards
      add constraint canonical_cards_primary_image_card_id_fkey
      foreign key (primary_image_card_id) references public.cards(id) on delete set null;
  end if;
end $$;

-- RLS: NON toccata. Fuori perimetro per questa migration.


-- ============================================================================
-- 2) rarities — tabella usata da cardPageData.js, oggi assente da ogni migration versionata.
-- ============================================================================

create table if not exists public.rarities (
  id          uuid primary key default gen_random_uuid(),
  tcg         text not null,
  raw_value   text not null,
  slug        text not null,
  label_en    text not null,
  tier        integer not null default 0,
  created_at  timestamptz default now()
);

comment on table public.rarities is
  'Rarita'' normalizzata per tcg. raw_value = valore grezzo come arriva dalla fonte (es. "Rare Holo VMAX"); il collegamento da cards.rarity a questa tabella e'' applicativo (query separata), non imposto da FK.';

-- In produzione e' un vero UNIQUE CONSTRAINT (non solo un indice): replicato come tale.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rarities_tcg_raw_value_key'
  ) then
    alter table public.rarities
      add constraint rarities_tcg_raw_value_key unique (tcg, raw_value);
  end if;
end $$;

-- RLS: NON toccata. Fuori perimetro per questa migration.


-- ============================================================================
-- 3) cards — colonne aggiuntive verificate in produzione, assenti da 002_data_architecture.sql.
--    La tabella esiste gia' (create table if not exists sarebbe no-op): qui solo ALTER additivi.
-- ============================================================================

alter table public.cards add column if not exists name_en            text;
alter table public.cards add column if not exists canonical_card_id  uuid;
alter table public.cards add column if not exists print_variant      text;
alter table public.cards add column if not exists illustrator        text;
alter table public.cards add column if not exists evolves_from       text;
alter table public.cards add column if not exists series_id          text;
alter table public.cards add column if not exists series_name        text;

comment on column public.cards.name_en is
  'Nome inglese denormalizzato, usato da ricerca/UI come chiave di visualizzazione indipendente da cards.lang.';
comment on column public.cards.canonical_card_id is
  'FK verso canonical_cards.id: collega questa riga (lingua+stampa specifica) alla sua carta canonica.';
comment on column public.cards.print_variant is
  'Variante di stampa della carta (es. holo/reverse/1st edition), indipendente dalla lingua.';
comment on column public.cards.illustrator is
  'Nome dell''illustratore, valore grezzo per-fonte (nessuna tabella illustrators normalizzata a oggi).';
comment on column public.cards.evolves_from is
  'Nome della forma pre-evoluzione (solo Pokemon).';
comment on column public.cards.series_id is
  'Id serie grezzo per-fonte (es. TCGdex serie id), non normalizzato in una tabella series a oggi.';
comment on column public.cards.series_name is
  'Nome serie grezzo per-fonte, corrispondente a series_id.';

-- FK verso canonical_cards.id, verificata in produzione con ON DELETE SET NULL.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cards_canonical_card_id_fkey'
  ) then
    alter table public.cards
      add constraint cards_canonical_card_id_fkey
      foreign key (canonical_card_id) references public.canonical_cards(id) on delete set null;
  end if;
end $$;

-- Indici verificati in produzione, assenti da ogni migration precedente.
create index if not exists cards_canonical_card_idx   on public.cards using btree (canonical_card_id);
create index if not exists cards_lang_idx             on public.cards using btree (lang);
create index if not exists cards_card_number_trgm_idx on public.cards using gin (card_number gin_trgm_ops);
create index if not exists cards_set_name_trgm_idx    on public.cards using gin (set_name gin_trgm_ops);
create index if not exists cards_rarity_trgm_idx      on public.cards using gin (rarity gin_trgm_ops);
create index if not exists cards_illustrator_idx      on public.cards using btree (illustrator) where (illustrator is not null);
create index if not exists cards_series_idx           on public.cards using btree (tcg, series_id) where (series_id is not null);

-- RLS: gia' abilitata in produzione. Rieseguire ENABLE e' idempotente (nessun errore se gia'
-- attiva) — formalizzato per completezza, nessun cambio di comportamento.
alter table public.cards enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'cards' and policyname = 'cards_public_read'
  ) then
    create policy cards_public_read on public.cards for select using (true);
  end if;
end $$;


-- ============================================================================
-- 4) card_prices — colonne aggiuntive verificate in produzione, assenti da
--    002_data_architecture.sql. La tabella esiste gia': qui solo ALTER additivi.
-- ============================================================================

alter table public.card_prices add column if not exists timeframe     text;
alter table public.card_prices add column if not exists price_median numeric;

comment on column public.card_prices.timeframe is
  'Finestra temporale del prezzo (es. 7d/30d/90d per prezzi "sold" tipo eBay Finding API). NULL = prezzo spot da altre fonti.';
comment on column public.card_prices.price_median is
  'Prezzo mediano sul periodo timeframe, alternativa piu'' robusta alla media per mercati sottili. Dichiarato numeric senza precision/scale in produzione, a differenza di price_market/low/high che sono numeric(10,2): differenza di tipo replicata fedelmente, non uniformata.';

create index if not exists idx_card_prices_tf
  on public.card_prices using btree (card_id, source, timeframe, captured_at desc)
  where (timeframe is not null);

-- RLS: gia' abilitata in produzione. Rieseguire ENABLE e' idempotente.
alter table public.card_prices enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'card_prices' and policyname = 'prices_public_read'
  ) then
    create policy prices_public_read on public.card_prices for select using (true);
  end if;
end $$;
