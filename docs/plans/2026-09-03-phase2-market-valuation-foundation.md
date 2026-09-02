# Fase 2 — Market Valuation Foundation — Implementation Plan

> **For agentic workers:** esecuzione task-by-task, checkbox `- [ ]`.
> **Spec / contesto:** `docs/plans/2026-09-02-dragold-vnext-audit-and-roadmap.md` (§3 audit prezzi, §Fase 2, §8). Fase 1: `docs/plans/2026-09-03-phase1-RESULTS.md`.

**Goal:** dare a ogni carta un vero *layer di valutazione* — non `price = €123` ma `estimated value` + `observed low/median/high` + `n osservazioni` + `n fonti` + `trend` + `confidence` (High/Medium/Low) **realmente calcolata sulla qualità dei dati, non inventata** — a partire da osservazioni di mercato conservate nel tempo.

**Architettura:** tre layer additivi, coerenti con Fase 1.
1. **`market_observations`** (append-only): ogni osservazione grezza (fonte, tipo, prezzo, valuta, condizione, timestamp). La verità storica, mai sovrascritta. `card_prices` **resta invariata** (compat — PRODUCT_SPEC §4 "non toccare lo schema").
2. **`fx_rates`**: cambio giornaliero da Frankfurter (ECB, free, no key) → tutte le osservazioni hanno `price_eur` al momento della cattura.
3. **`market_valuations`** (una riga per `card_id` × currency, ricalcolata): `estimated_value`, low/median/high, `n_observations`, `n_sources`, `trend_7d/30d`, `confidence` + `confidence_score` (0..1) + `confidence_reason` (jsonb spiegabile). Calcolata da `compute-valuations.js`.

**Separazione richiesta dal brief:**
- **Market Valuation** = `market_valuations` (stima DraGold, da TCGCSV + Cardmarket + JustTCG).
- **Live Market** = eBay Browse API on-demand (annunci attivi) — **non** salvato come valutazione, endpoint separato.
- **Affiliate Discovery** = link EPN (invariato, fuori scope Fase 2).

**Tech stack:** Node 22 ESM, `@supabase/supabase-js`, `node:test`, GitHub Actions. Nessuna nuova dipendenza npm. Fonti: **TCGCSV** (già validata Fase 1 — prezzi TCGplayer per set), **Frankfurter** (`api.frankfurter.app`, FX ECB, no key), eventualmente **Cardmarket via pokemontcg.io** (già in `refresh-prices`), **JustTCG** free tier (già configurata). **eBay Browse API** (credenziali `EBAY_*` già presenti — usate da `fetch-ebay-sold`).

## Global Constraints

- **JavaScript, non TypeScript.** ESM.
- **Nessuna nuova dipendenza npm** senza decisione esplicita.
- **`feat/sealed-products` congelato.** `feat/ui-ux-image-price-overhaul` non toccato.
- **`card_prices` schema invariato.** La nuova pipeline scrive `market_observations`.
- **Migration reversibili** con `_down.sql` + integrity check.
- **Idempotenza:** ricalcolo valutazioni = upsert su chiave naturale; osservazioni = append (una per fonte/carta/run, `captured` unico per run).
- **Confidence spiegabile:** ogni valutazione porta `confidence_reason` con il breakdown numerico. Niente ML, niente algoritmi opachi.
- **Onestà sui dati:** meno di N osservazioni valide o troppo vecchie → `confidence='none'`, `estimated_value=null`. Mai una stima finta.
- **Non financial advice:** copy e naming "collection valuation", nessuna estetica trading.
- Branch: `feature/market-valuation-foundation`. Commit atomici.

---

## Contesto verificato (2026-09-02)

- `card_prices`: `card_id, source, currency, price_market, price_low, price_high, price_median, raw_response(jsonb), captured_at, timeframe`. FK `card_id → cards(id)`. Append-only, nessun unique. Ultimi 2gg: `tcgcsv` 476 carte (Fase 1), `ebay_sold` 47 carte.
- `refresh-prices` edge function (cron `0 */6 * * *`): scope = alerts + collection(2000) + watchlist(2000) + hot_picks top 200. Chain per carta: eBay Browse (`fetch-ebay-sold`) → justtcg/pokemontcgio (pkm) / scryfall (mtg) / ygoprodeck (ygo). Scrive `card_prices` currency='USD' (anche quando il dato è EUR, con `EUR_TO_USD=1.087` hardcoded). Scrive anche `price_history` ma **con colonne sbagliate** (`card_id`/`fetched_at`/`price_market` vs schema reale `card_api_id`/`captured_at`/`fmv_*`) → fallisce in silenzio, `price_history` vuota.
- `price_history` schema reale: `id, tcg, card_api_id, language, fmv_eur, fmv_usd, source, captured_at`. **Non** la useremo (legacy incoerente); il nostro storico è `market_observations`.
- `pokemontcgio`: 85% fail (audit) — da demotare a ultima risorsa.
- eBay: `fetch-ebay-sold` / `fetch-ebay-prices` edge function esistono, credenziali `EBAY_*` presenti. Marketplace Insights (sold) non disponibile → usiamo **Browse** (annunci attivi) per Live Market.

---

## File Structure

**Migration:**
| File | Contenuto |
|---|---|
| `supabase/migrations/<ts>_market_observations.sql` | `market_observations` + `fx_rates` + RLS + `_down` |
| `supabase/migrations/<ts>_market_valuations.sql` | `market_valuations` + RLS + `_down` |

**Moduli puri (`scripts/lib/valuation/`):**
| File | Responsabilità |
|---|---|
| `fx.js` | `parseFrankfurter(json)` → `{base:'EUR', date, rates:{USD:..}}`. `toEur(amount, currency, rateMap)` → numero \| null. |
| `observation-rows.js` | `tcgcsvPriceToObservation({cardId, canonicalId, tcg, priceEntry, capturedAt, eurRate})` → riga `market_observations` (kind `market`). `ebayListingToObservation(...)` → kind `listing`. |
| `stats.js` | `median(nums)`, `quantile(nums,q)`, `weightedMedian(pairs)`, `iqr(nums)`. Puri. |
| `confidence.js` | `computeConfidence({observations, now})` → `{score, band, reason}`. **La rubrica.** |
| `valuation.js` | `computeValuation({cardId, canonicalId, tcg, currency, observations, prior, now})` → riga `market_valuations` completa (estimated_value, low/median/high, trend, confidence, ...). Puro. |

**I/O isolato:**
| File | Responsabilità |
|---|---|
| `scripts/lib/valuation/obs-store.js` | `insertObservations(sb, rows[])` (append batch). `latestFxRate(sb, 'USD')`. `upsertFxRate(sb, row)`. |
| `scripts/lib/valuation/valuation-store.js` | `upsertValuations(sb, rows[])` (onConflict `card_id,currency`). `loadPriorValuations(sb, cardIds)`. `observationsForCards(sb, cardIds, sinceDays)`. |
| `scripts/ingest-fx.js` | Frankfurter → `fx_rates` (giornaliero). |
| `scripts/ingest-market-tcgcsv.js` | TCGCSV prezzi → `market_observations`. `--tcg=onepiece\|pokemon`, `--set=`, `--since=`, `--all`. |
| `scripts/compute-valuations.js` | `market_observations` → `market_valuations` per un insieme di carte (default: tutte quelle con ≥1 osservazione negli ultimi 120gg). |
| `scripts/live-market.js` | (opzionale CLI) query eBay Browse per una carta → annunci attivi. Il vero endpoint è `api/live-market.js`. |
| `api/live-market.js` | Vercel serverless: `GET /api/live-market?cardId=...` → `{listings:[...], count, currency}` da eBay Browse. **Non** scrive DB. |

**Workflow:**
- `.github/workflows/market-valuation.yml` — cron `30 5 * * *`: `ingest-fx` → `ingest-market-tcgcsv` (onepiece + pokemon) → `compute-valuations`.

**Modificati:**
- `supabase/functions/refresh-prices/index.ts` — demote `pokemontcgio` a ultimo link della chain; scrivere anche in `market_observations` (oltre a `card_prices`, per compat); rimuovere la insert rotta su `price_history`.
- `package.json` — script `ingest:fx`, `ingest:market`, `compute:valuations`.

---

## Schema

### `market_observations` (append-only, verità storica)

```sql
create table public.market_observations (
  id             bigint generated always as identity primary key,
  card_id        text not null references public.cards(id) on delete cascade,
  canonical_card_id uuid,
  tcg            text not null,
  source         text not null,          -- 'tcgcsv' | 'cardmarket' | 'justtcg' | 'ebay_browse' | 'refresh-prices'
  kind           text not null check (kind in ('market','listing','sold')),
  sub_type       text,                   -- 'Normal' | 'Foil' | 'Holofoil' | ...
  condition      text,                   -- 'NM' | 'LP' | ... | null
  price          numeric not null check (price >= 0),
  currency       text not null,
  price_eur      numeric,                -- price convertito a EUR al momento della cattura
  fx_rate        numeric,                -- il tasso usato (currency->EUR)
  observed_at    timestamptz not null default now(),
  raw            jsonb
);
create index market_obs_card_idx    on public.market_observations (card_id, observed_at desc);
create index market_obs_canon_idx   on public.market_observations (canonical_card_id) where canonical_card_id is not null;
create index market_obs_recent_idx  on public.market_observations (observed_at desc);
alter table public.market_observations enable row level security;
create policy market_obs_public_read on public.market_observations for select using (true);
```

### `fx_rates` (cambio giornaliero, EUR base)

```sql
create table public.fx_rates (
  as_of      date not null,
  quote      text not null,              -- es. 'USD'
  rate       numeric not null,           -- 1 EUR = <rate> <quote>
  source     text not null default 'frankfurter',
  fetched_at timestamptz not null default now(),
  primary key (as_of, quote)
);
alter table public.fx_rates enable row level security;
create policy fx_rates_public_read on public.fx_rates for select using (true);
```

### `market_valuations` (layer di valutazione, ricalcolato)

```sql
create table public.market_valuations (
  card_id           text not null references public.cards(id) on delete cascade,
  canonical_card_id uuid,
  tcg               text not null,
  currency          text not null default 'EUR',
  estimated_value   numeric,             -- headline; null se confidence 'none'
  observed_low      numeric,
  observed_median   numeric,
  observed_high     numeric,
  n_observations    integer not null default 0,
  n_sources         integer not null default 0,
  sources           text[] not null default '{}',
  trend_7d_pct      numeric,
  trend_30d_pct     numeric,
  newest_observed_at timestamptz,
  confidence        text not null check (confidence in ('high','medium','low','none')),
  confidence_score  numeric,             -- 0..1
  confidence_reason jsonb,               -- breakdown: {sources, observations, recency, agreement, notes}
  computed_at       timestamptz not null default now(),
  primary key (card_id, currency)
);
create index market_val_canon_idx on public.market_valuations (canonical_card_id) where canonical_card_id is not null;
create index market_val_conf_idx  on public.market_valuations (tcg, confidence);
alter table public.market_valuations enable row level security;
create policy market_val_public_read on public.market_valuations for select using (true);
```

**DOWN** per entrambe: `drop table if exists ...` (in `_down.sql`).

**Integrity check (nel task):** conteggi tabelle a 0 dopo la create; RLS on; `get_advisors` security → nessun nuovo warning; insert/delete di prova per validare i check constraint (`kind`, `confidence`, `price >= 0`).

---

## La rubrica di confidence (`confidence.js`) — spiegabile

`computeConfidence({observations, now})` dove `observations` = osservazioni `kind='market'` in EUR degli ultimi 90 giorni (le `listing` pesano meno, vedi valuation.js).

Quattro componenti, ognuna 0..1:

| Componente | Formula | Razionale |
|---|---|---|
| `sources` | `min(n_distinct_sources / 3, 1)` | 3+ fonti indipendenti che concordano = massima fiducia |
| `observations` | `min(n_observations / 8, 1)` | più osservazioni = meno rumore |
| `recency` | `1` se la più recente < 7g · `0.6` se < 30g · `0.25` se < 90g · `0` oltre | un prezzo vecchio è meno affidabile |
| `agreement` | `1 - min(IQR / median, 1)` (se median>0, e n≥3; altrimenti `0.5`) | dispersione bassa = mercato d'accordo |

`score = 0.30*sources + 0.30*observations + 0.20*recency + 0.20*agreement`

`band`:
- `n_observations == 0` → `none`
- `score ≥ 0.70` → `high`
- `score ≥ 0.42` → `medium`
- `score ≥ 0.18` → `low`
- altrimenti → `none`

`reason` = `{ score, sources:{value,n}, observations:{value,n}, recency:{value,newest_days}, agreement:{value,iqr,median}, band }` — trasportato in `market_valuations.confidence_reason` per la UI ("perché High?").

**Esempio concettuale del brief:** `€184 · High confidence · +12.4% / 30d` → `estimated_value=184`, `confidence='high'` perché (es.) 3 fonti, 12 osservazioni, la più recente ieri, IQR/median = 0.08.

---

## Il calcolo del valore (`valuation.js`)

`computeValuation({cardId, canonicalId, tcg, currency:'EUR', observations, prior, now})`:

1. Filtra a `price_eur` non-null degli ultimi **90 giorni**. Split per `kind`.
2. `estimated_value`:
   - se ci sono `market` negli ultimi **30 giorni** → `weightedMedian` con peso `recencyWeight(age) = exp(-age_days/20)`, per fonte prendi al più l'osservazione più recente per (fonte, sub_type) così una fonte non domina con 50 righe.
   - altrimenti `market` ultimi 90g stessa logica.
   - altrimenti (solo `listing`) → mediana dei listing × `0.92` (i listing sono ask, non transati) e `confidence` non può superare `low`.
   - altrimenti → `null`.
3. `observed_low/median/high` = `quantile(prices, 0.1 / 0.5 / 0.9)` sulle stesse osservazioni usate per la stima.
4. `trend_7d_pct` / `trend_30d_pct`: confronta la mediana delle osservazioni `market` in `[now-7d, now]` vs `[now-14d, now-7d]` (e 30/60). `null` se un lato ha < 2 osservazioni.
5. `confidence` = `computeConfidence(...)` (con il cap `low` del caso "solo listing").
6. Ritorna la riga completa `market_valuations`.

Puro: nessun I/O, `now` iniettato, deterministico dato l'input.

---

## Task 1 — Migration `market_observations` + `fx_rates`

**Files:** Create `supabase/migrations/<ts>_market_observations.sql`, `_down.sql`.

- [ ] **1.1** Scrivere la migration (schema sopra) + `_down.sql`.
- [ ] **1.2** `apply_migration` (nome `market_observations_and_fx_rates`).
- [ ] **1.3** Integrity: `list_tables` → entrambe rls on, 0 righe. `execute_sql`: insert valido + delete; insert con `kind='bogus'` → errore; insert con `price=-1` → errore.
- [ ] **1.4** `get_advisors` security → nessun nuovo warning.
- [ ] **1.5** Commit: `feat(valuation): market_observations (append-only) + fx_rates`.

---

## Task 2 — `fx.js` + `scripts/ingest-fx.js`

**Files:** Create `scripts/lib/valuation/fx.js`, `scripts/lib/valuation/__tests__/fx.test.js`, `scripts/lib/valuation/obs-store.js` (parte FX), `scripts/ingest-fx.js`.

**Interfaces — Produces:**
- `parseFrankfurter(json): { base, date, rates }` — puro. Da `GET https://api.frankfurter.app/latest?from=EUR&to=USD` → `{amount:1, base:'EUR', date:'2026-09-02', rates:{USD:1.08}}`.
- `toEur(amount, currency, ratesMap): number|null` — `currency==='EUR'` → amount; else `amount / ratesMap[currency]` (ratesMap = 1 EUR → X quote); currency assente → null.
- `latestFxRate(sb, quote): Promise<{as_of, rate}|null>` — la riga più recente in `fx_rates`.
- `upsertFxRate(sb, {as_of, quote, rate, source})`.

- [ ] **2.1** Test `parseFrankfurter` + `toEur` (USD 12.99 @ rate 1.08 → 12.03 EUR; EUR passthrough; currency ignota → null).
- [ ] **2.2** Run → FAIL → implementare → PASS.
- [ ] **2.3** `ingest-fx.js`: fetch Frankfurter `?from=EUR&to=USD` (+ estendibile), `upsertFxRate`. `--dry-run`.
- [ ] **2.4** Run reale: `node scripts/ingest-fx.js` → 1 riga in `fx_rates` per oggi, `rate` ~1.0–1.2. Re-run stesso giorno → upsert, non duplica (PK `(as_of, quote)`).
- [ ] **2.5** Commit: `feat(valuation): cambio EUR giornaliero da Frankfurter (ECB)`.

---

## Task 3 — `stats.js` + `confidence.js` (puri, test-first)

**Files:** Create `scripts/lib/valuation/stats.js`, `confidence.js`, `__tests__/stats.test.js`, `__tests__/confidence.test.js`.

**Interfaces — Produces:**
- `median(nums): number|null`, `quantile(nums, q): number|null`, `iqr(nums): number|null`, `weightedMedian(entries: {value,weight}[]): number|null`.
- `computeConfidence({observations, now}): { score, band, reason }` — `observations` = `[{price_eur, observed_at, source, sub_type, kind}]`.

- [ ] **3.1** Test `stats`: `median([1,2,3])===2`, `median([1,2,3,4])===2.5`, `median([])===null`, `quantile([1..10],0.9)`, `iqr`, `weightedMedian([{value:10,weight:1},{value:20,weight:3}])` (=20).
- [ ] **3.2** Test `confidence`:
  - 0 osservazioni → `band:'none'`, `score:0`.
  - 3 fonti, 10 obs, la più recente oggi, IQR/median 0.05 → `band:'high'`, `score ≥ 0.9`.
  - 1 fonte, 2 obs, 40 giorni fa, spread ampio → `band:'low'` o `none`.
  - `reason` contiene `sources/observations/recency/agreement` con i valori.
- [ ] **3.3** Run → FAIL → implementare → PASS.
- [ ] **3.4** Commit: `feat(valuation): stats + rubrica confidence spiegabile`.

---

## Task 4 — `valuation.js` (puro, test-first)

**Files:** Create `scripts/lib/valuation/valuation.js`, `__tests__/valuation.test.js`.

**Interfaces — Consumes:** `computeConfidence`, `weightedMedian`, `quantile` da Task 3.
**Produces:** `computeValuation({ cardId, canonicalId, tcg, currency, observations, prior, now }): object` (riga `market_valuations`).

- [ ] **4.1** Test:
  - 12 osservazioni `market` EUR ultimi 20g, 3 fonti, tight → `estimated_value` ≈ mediana pesata, `confidence:'high'`, `observed_low<median<high`, `n_sources:3`.
  - solo `listing` → `estimated_value` = mediana listing × 0.92, `confidence` ≤ `low`.
  - 0 osservazioni valide → `estimated_value:null`, `confidence:'none'`, `n_observations:0`.
  - trend: obs a 15€ (settimana -2) poi 18€ (settimana -1) → `trend_7d_pct` ≈ +20.
  - una fonte con 40 righe non domina (si prende la più recente per fonte/sub_type).
- [ ] **4.2** Run → FAIL → implementare → PASS.
- [ ] **4.3** Commit: `feat(valuation): motore di valutazione (estimated value + low/median/high + trend)`.

---

## Task 5 — `observation-rows.js` + `obs-store.js` + `valuation-store.js`

**Files:** Create `scripts/lib/valuation/observation-rows.js`, completare `obs-store.js`, create `valuation-store.js` + test con client mock.

**Interfaces — Produces:**
- `tcgcsvPriceToObservation({ cardId, canonicalId, tcg, priceEntry, capturedAt, eurRate }): row` — `priceEntry` = `{subType, market, low, mid, high}` da `listTcgcsvGroupPrices`. Usa `market` (fallback `mid`) come `price`, `currency:'USD'`, `price_eur = toEur(price,'USD',{USD:eurRate})`, `fx_rate`, `kind:'market'`, `sub_type`, `raw`.
- `insertObservations(sb, rows[]): Promise<{inserted}>` — insert batch 500.
- `upsertValuations(sb, rows[]): Promise<{upserted}>` — upsert onConflict `card_id,currency`.
- `observationsForCards(sb, cardIds, sinceDays): Promise<Map<cardId, obs[]>>`.
- `loadPriorValuations(sb, cardIds): Promise<Map<cardId, row>>`.
- `cardIdsWithRecentObservations(sb, sinceDays, tcg?): Promise<{cardId,canonicalId,tcg}[]>`.

- [ ] **5.1** Test `observation-rows` (product price → observation con price_eur corretto).
- [ ] **5.2** Test store con fake client (payload di `upsertValuations` ha `onConflict:'card_id,currency'`; `insertObservations` non fa upsert).
- [ ] **5.3** Integration reale: `insertObservations` con 1 riga probe (`card_id` reale OP-17, `source:'__probe__'`) → poi delete.
- [ ] **5.4** Commit: `feat(valuation): righe osservazione + store observations/valuations`.

---

## Task 6 — `scripts/ingest-market-tcgcsv.js` (One Piece)

**Files:** Create `scripts/ingest-market-tcgcsv.js`.

**Comportamento:**
1. Arg: `--tcg=onepiece` (Task 6) / `--tcg=pokemon` (Task 8), `--set=`, `--since=`, `--all`, `--dry-run`.
2. FX: `latestFxRate(sb,'USD')` (fallback: fetch al volo se manca oggi).
3. One Piece: `mapOnePieceGroups(listTcgcsvGroups(68))` → group selezionati (stessa selezione di `sync-onepiece.js`).
4. Per group: `listTcgcsvGroupProducts` + `listTcgcsvGroupPrices`. Per prodotto con `number`: `cardId = onepiece:tcgcsv:<productId>:en` (già in `cards` da Fase 1 — verifica esistenza in bulk, salta gli assenti con un warning contato). Per ogni `priceEntry` (Normal + Foil) → `tcgcsvPriceToObservation`. `insertObservations`.
5. Report JSON: `{groups, observations, cardsMatched, cardsMissing}`.

- [ ] **6.1** Implementare. `--dry-run` = nessuna scrittura.
- [ ] **6.2** Dry-run `--tcg=onepiece --set=OP-17` → ~177 osservazioni (una per productId, sub_type Normal/Foil), `price_eur` valorizzato.
- [ ] **6.3** Run reale `--tcg=onepiece --set=OP-17` → righe in `market_observations` (source `tcgcsv`, kind `market`), `cardsMissing=0`.
- [ ] **6.4** Idempotenza: re-run → append di un nuovo batch con `observed_at` diverso (storico), **nessun** vincolo violato, conteggio carte stabile.
- [ ] **6.5** Run `--tcg=onepiece --all` → osservazioni per l'intero catalogo One Piece EN in DB.
- [ ] **6.6** Commit: `feat(valuation): ingest prezzi One Piece TCGCSV -> market_observations`.

---

## Task 7 — `scripts/compute-valuations.js`

**Files:** Create `scripts/compute-valuations.js`.

**Comportamento:**
1. Arg: `--tcg=`, `--card-id=`, `--since-days=120` (finestra di selezione carte), `--dry-run`, `--limit=`.
2. `cardIdsWithRecentObservations(sb, 120, tcg)` → lista carte.
3. `observationsForCards(sb, cardIds, 90)` (batch da 200 carte). `loadPriorValuations`.
4. Per carta: `computeValuation({...})` → riga. `upsertValuations` batch 200.
5. Report: `{cards, valued, byConfidence:{high,medium,low,none}}`.

- [ ] **7.1** Implementare. `--dry-run` stampa le prime 20 valutazioni.
- [ ] **7.2** Dry-run `--tcg=onepiece --limit=50` → distribuzione confidence plausibile (One Piece TCGCSV = 1 fonte → attesa `medium`/`low`, non `high`).
- [ ] **7.3** Run reale `--tcg=onepiece` → righe in `market_valuations`. Verifica 10 carte campione: `estimated_value` fra `observed_low` e `observed_high`, `confidence_reason` presente e coerente col `band`.
- [ ] **7.4** Idempotenza: re-run → `upserted` = stesso numero, `computed_at` aggiornato, `count(*) == count(distinct (card_id,currency))`.
- [ ] **7.5** OP-17 `estimated_value` vs il prezzo TCGCSV grezzo di una carta nota (es. Shanks OP17-020) → coerente entro il ragionevole.
- [ ] **7.6** Commit: `feat(valuation): compute-valuations -> market_valuations con confidence`.

---

## Task 8 — Pokémon EN: matching TCGCSV -> tcgdex card_id

**Files:** Create `scripts/lib/valuation/pokemon-price-match.js` + test. Modify `ingest-market-tcgcsv.js`.

**Problema:** i prodotti TCGCSV Pokémon (`categoryId 3`) hanno `productId` e `extendedData` con `Number` (es. "174/198") e il group (set). Le nostre carte sono `pokemon:tcgdex:<setId>-<localId>:en`. Serve un match su **(set, numero)**.

**Interfaces — Produces:**
- `mapTcgcsvGroupToTcgdexSet(groupName, groupAbbrev): string|null` — mappa il nome/abbr del group TCGCSV al `set_id` TCGdex. Tabella di corrispondenza esplicita + euristica su `set_logos.set_name` (già popolata Fase 1). Ritorna null se incerto (mai un match a caso).
- `tcgcsvPokemonNumberToLocalId(numberField): string|null` — "174/198" → "174"; "TG12/TG30" → "TG12"; "SWSH284" → "SWSH284".
- `resolvePokemonCardId(sb, tcgdexSetId, localId): Promise<string|null>` — cerca `cards.id` per `tcg='pokemon' lang='en' set_id=? card_number=?` (con `card_number_norm`).

- [ ] **8.1** Test `tcgcsvPokemonNumberToLocalId` + `mapTcgcsvGroupToTcgdexSet` (casi noti: "SV: Scarlet & Violet 151" → "sv3pt5"; "Prismatic Evolutions" → "sv8pt5"; group ignoto → null).
- [ ] **8.2** Estendere `ingest-market-tcgcsv.js` ramo `--tcg=pokemon`: per group con set risolto e numero risolto → osservazione; conta e **logga** i non-risolti (mai un match forzato).
- [ ] **8.3** Dry-run `--tcg=pokemon --set=<un set recente>` → match rate > 80% sui set moderni; i non-matchati elencati.
- [ ] **8.4** Run reale su 3-4 set Pokémon EN recenti. `compute-valuations --tcg=pokemon`.
- [ ] **8.5** Commit: `feat(valuation): ingest prezzi Pokémon EN TCGCSV (match set+numero -> tcgdex id)`.

---

## Task 9 — Live Market (eBay Browse) — separato dalla valutazione

**Files:** Create `api/live-market.js`, `scripts/lib/valuation/ebay-browse.js` + test.

**Interfaces — Produces:**
- `buildBrowseQuery({name, tcg, setName, number, lang}): string` — puro.
- `parseBrowseResponse(json): { listings: [{title, price, currency, condition, url, seller, imageUrl}], count }` — puro.
- `api/live-market.js`: `GET /api/live-market?cardId=<id>` → carica la carta da Supabase (service role), costruisce la query, chiama eBay Browse API (`https://api.ebay.com/buy/browse/v1/item_summary/search`) con OAuth client-credentials (token cache in memoria), ritorna `{listings, count, currency, query}`. **CORS**: `Access-Control-Allow-Origin: *`, solo GET. Nessuna scrittura DB. Rate-limit soft (cache 10 min per cardId in memoria).

- [ ] **9.1** Test `buildBrowseQuery` + `parseBrowseResponse` (fixture risposta Browse reale/documentata).
- [ ] **9.2** Implementare `api/live-market.js`. Riusa il pattern OAuth di `fetch-ebay-sold` (client id/secret da env `EBAY_*`).
- [ ] **9.3** Verifica locale: `node -e` che chiama la logica per una carta OP-17 nota → ritorna annunci attivi con prezzo/URL. Se le credenziali non sono disponibili localmente → verificare la forma con un fixture e documentare che il test end-to-end è post-deploy su Vercel preview.
- [ ] **9.4** **Non** inserisce in `market_observations` di default (Live Market ≠ valutazione). Opzione `?record=1` per salvare come `kind='listing'` — spento di default.
- [ ] **9.5** Commit: `feat(market): endpoint Live Market (eBay Browse, annunci attivi) separato dalla valutazione`.

---

## Task 10 — `refresh-prices`: demote pokemontcgio, feed market_observations, fix price_history

**Files:** Modify `supabase/functions/refresh-prices/index.ts`. Deploy.

- [ ] **10.1** Spostare il link `pokemontcgio` in **ultima** posizione della chain (dopo justtcg ed eBay).
- [ ] **10.2** In `tryPriceChain`, dopo la insert su `card_prices`, inserire anche in `market_observations` (`kind: link.source==='ebay_sold' ? 'sold' : 'market'`, `currency:'USD'`, `price_eur` via FX letto da `fx_rates`, `source: 'refresh-prices:'+link.source`).
- [ ] **10.3** Rimuovere la insert rotta su `price_history` (colonne inesistenti — fallisce in silenzio).
- [ ] **10.4** Deploy via `deploy-edge-functions.yml` o `mcp deploy_edge_function`. Trigger manuale (`compute-hot-picks` cron non necessario). Verifica: `api_call_log` mostra il nuovo ordine; `market_observations` riceve righe `refresh-prices:*`.
- [ ] **10.5** Commit: `fix(prices): refresh-prices demota pokemontcgio, alimenta market_observations, rimuove price_history rotto`.

---

## Task 11 — Workflow `market-valuation.yml`

**Files:** Create `.github/workflows/market-valuation.yml`.

```yaml
name: Market Valuation
on:
  schedule: [{ cron: '30 5 * * *' }]
  workflow_dispatch:
    inputs:
      tcg: { description: 'onepiece | pokemon | (vuoto=entrambi)', default: '' }
jobs:
  valuation:
    runs-on: ubuntu-latest
    timeout-minutes: 40
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: '22' }
      - run: npm install @supabase/supabase-js
      - run: node scripts/ingest-fx.js
        env: { SUPABASE_URL: ..., SUPABASE_SERVICE_KEY: ... }
      - run: node scripts/ingest-market-tcgcsv.js --tcg=onepiece --all
        env: { ... }
      - run: node scripts/ingest-market-tcgcsv.js --tcg=pokemon --since=2025-01-01
        env: { ... }
      - run: node scripts/compute-valuations.js
        env: { ... }
```

- [ ] **11.1** Scrivere il file (secrets `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`).
- [ ] **11.2** `workflow_dispatch tcg=onepiece` → verde, `market_valuations` popolata.
- [ ] **11.3** Commit: `ci(valuation): workflow market-valuation giornaliero`.

---

## Task 12 — Verifica finale + report Fase 2

- [ ] **12.1** Test: `node --test "scripts/**/*.test.js"` → verde (elencare conteggio). Build `npm run build` → verde.
- [ ] **12.2** DB: `market_observations` (righe, per fonte, con `price_eur`), `market_valuations` (righe, distribuzione confidence per tcg), `fx_rates` (oggi).
- [ ] **12.3** Explain di 10 carte: `estimated_value` ∈ [`observed_low`, `observed_high`], `confidence_reason` coerente col `band`, `trend` plausibile o null.
- [ ] **12.4** Idempotenza globale: re-run workflow → `market_valuations` `count == count(distinct (card_id,currency))`; `market_observations` cresce di un batch (storico), zero errori.
- [ ] **12.5** Coerenza col brief: una carta mostra `€X · <High|Medium|Low> confidence · <±Y>% / 30d`; una carta senza dati sufficienti → nessuna stima finta (`estimated_value` null, `confidence='none'`).
- [ ] **12.6** `get_advisors` security + performance.
- [ ] **12.7** Report `docs/plans/2026-09-03-phase2-RESULTS.md` (formato Problema/Soluzione/Alternative/Implementation/Verification/Status/Remaining + KPI: valuation coverage %, confidence distribution, price coverage, observation count, FX status). `SendUserFile` + push + PR.

---

## Self-Review (coverage brief §2 + §5)

| Requisito brief | Task |
|---|---|
| estimated market value | Task 4, 7 (`estimated_value`) |
| market/observed price + min/max quando significativo | Task 4 (`observed_low/median/high`) |
| numero di osservazioni + fonti | Task 4/7 (`n_observations`, `n_sources`, `sources[]`) |
| trend + timestamp | Task 4 (`trend_7d/30d_pct`, `newest_observed_at`, `computed_at`) |
| source | `market_observations.source`, `market_valuations.sources[]` |
| confidence realmente calcolata + spiegabile | Task 3 (`confidence.js` + `confidence_reason`) |
| lingua / printing / set / condizione quando disponibile | `market_observations.sub_type`/`condition`; `card_id` porta lang+variant; `condition` da eBay/Cardmarket quando c'è |
| Market Valuation vs Live Market vs Affiliate — separati | `market_valuations` / `api/live-market.js` (Task 9) / EPN invariato |
| Market History robusta, non distruggere lo storico | `market_observations` append-only (Task 1); `card_prices` invariata |
| niente algoritmi finanziari inutilmente sofisticati | rubrica a 4 componenti lineari, documentata |
| free/open-source prima | TCGCSV + Frankfurter (no key); eBay Browse (già in casa); nessun acquisto |

**Rischi noti Fase 2:** One Piece TCGCSV = **1 sola fonte** → confidence realistica cap a `medium` per la maggior parte (corretto, non un bug — servono Cardmarket/eBay per `high`); match TCGCSV↔tcgdex per Pokémon imperfetto sui set vecchi (loggato, non forzato); eBay Browse rate limit (mitigato da cache + on-demand); FX solo USD→EUR in Fase 2 (altre valute quando servono).
