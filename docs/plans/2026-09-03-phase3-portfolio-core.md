# Fase 3 — Portfolio Core — Implementation Plan

> **For agentic workers:** esecuzione task-by-task, checkbox `- [ ]`.
> **Spec:** `docs/plans/2026-09-02-dragold-vnext-audit-and-roadmap.md` (§Fase 3 / brief §3). Caveat vincolanti: `docs/plans/2026-09-03-phase2.1-hardening-RESULTS.md` §4.

**Goal:** trasformare il Portfolio da "lista di carte con prezzo spot" a **MY COLLECTION → MY MARKET VALUE**: valore totale stimato + breakdown (TCG / set / lingua) + performance + **confidence per posizione e aggregata** + collection intelligence — consumando il valuation layer di Fase 2 (`market_valuations`), **senza fingere precisione dove non esiste**.

**Architettura:**
1. **RPC `portfolio_valuations(p_card_ids text[])`** — risolve `collection.card_api_id` → `market_valuations` con fallback per gli spelling duplicati (`sv1`↔`sv01`, via `set_identity_key` SQL) e ritorna, per ogni id in input: valore EUR, confidence + reason, low/median/high, trend, n_osservazioni/fonti, `computed_at`, e `unavailable_reason` (`ja_not_covered` | `set_not_covered` | `no_data_yet` | `resolved_via_alias`). Una sola chiamata, RLS-safe (`market_valuations` è lettura pubblica; `collection` resta RLS per-utente e non è toccata dall'RPC).
2. **`src/lib/portfolio/valuation.js`** — dato `positions` + risultato RPC, calcola: total value EUR, delta di periodo (da `portfolio_value_history`), breakdown per `{tcg, set, lang}`, concentrazione (top-N % del valore), mix di confidence, movers, most valuable, bucket "senza valutazione affidabile" con conteggi per motivo, insight ("il tuo portfolio è concentrato in…", "le prime 10 carte valgono X%", "set più prezioso", "biggest mover"). Puro, testato.
3. **RPC `portfolio_value_history(p_card_ids text[], p_days int)`** — serie giornaliera del valore totale da `market_observations` (bucket giorno, ultimo `price_eur` noto ≤ fine giornata, × quantità passata a parte lato client). Finché c'è ~1 giorno di dati → serie corta → la UI mostra "storico in costruzione".
4. **PortfolioView** — modifiche **additive**: nuovi pannelli (Portfolio Confidence, Breakdown, Collection Intelligence, "Cards without a reliable valuation"), badge confidence per carta, e switch della fonte valore da `card_prices` spot → RPC valuations. Componenti esistenti (grid/compact/movers/mini-chart) mantengono la firma; cambia cosa gli passa il parent.

**Tech stack:** React + Vite (invariato), Supabase RPC (plpgsql `security invoker`), `node:test` per i moduli puri, Vitest per i componenti nuovi critici (approvato in roadmap §13). Nessuna nuova dipendenza npm.

## Global Constraints

- **JavaScript, non TypeScript.** Niente Redux/Zustand.
- **Nuove pagine → `src/pages/<entità>/`**; logica condivisa → `src/lib/`. PortfolioView **non** deve tornare un monolite — la logica di calcolo va in `src/lib/portfolio/`.
- **Non financial advice.** Copy "collection valuation" / "estimated market value". Nessuna estetica trading: niente verde/rosso dominante, palette neutra + gold DraGold (PRODUCT_SPEC §6). Il verde/rosso è ammesso solo per il segno di una variazione, mai come sfondo di sezione.
- **Onestà sui dati (caveat Fase 2.1 §4):**
  - `confidence` massimo = `medium`. **NON progettare uno stato UI "high"** (nessun badge verde "High"); i badge sono `Medium` (neutro) / `Low` (ambra) / `None` (grigio "not enough data").
  - `trend_*` è `null` per tutte le carte oggi → ogni vista trend deve gestire "not enough history yet" senza rompersi né mostrare 0%.
  - `observed_low == high` quando n=1 → mostrare "€X" senza range finché non c'è dispersione.
  - Copertura ~50% carte priorità; JP = nessuna valutazione. Il bucket "senza valutazione" **non è un edge case**, è una sezione di prima classe con spiegazione costruttiva ("la copertura si espande ogni giorno").
- **`market_valuations` è EUR.** I numeri basati sulla valutazione sono **EUR-nativi**. Il P&L "vs paid" (che usa `purchase_price`/`fmv_currency`, spesso USD) resta separato e invariato in questa fase — non mescolare le due contabilità.
- **Coordinamento con `feat/ui-ux-image-price-overhaul`** (tocca `PortfolioView.jsx` con virtualizzazione): mantenere le modifiche additive e le firme dei componenti stabili; la risoluzione conflitti sarà al rebase di quel branch.
- **`feat/sealed-products` congelato.** RLS: nessuna nuova policy utente; l'RPC non espone dati di altri utenti (opera solo su `market_valuations`/`market_observations`, entrambe già public-read).
- Branch: `feature/portfolio-core` (creato, stacked su `feature/market-valuation-foundation`). Commit atomici.

---

## Contesto verificato (2026-09-02)

- `collection`: 66 righe. Campi: `card_api_id, tcg, card_name, set_name, card_number, rarity, image_url, language, condition, purchase_price, purchase_date, fmv_snapshot, fmv_currency, quantity, added_at`. RLS per `user_id`. Letto via `listCollection()` (`src/supabase.js:71`).
- `market_valuations` (Fase 2.1): 5.746 righe, EUR, tutte `medium` (3 `low`). Campi: `card_id, canonical_card_id, tcg, currency, estimated_value, observed_low/median/high, n_observations, n_sources, sources[], trend_7d_pct, trend_30d_pct, newest_observed_at, confidence, confidence_score, confidence_reason(jsonb), computed_at`. PK `(card_id, currency)`. Public read.
- `market_observations`: append-only, `price_eur`, `observed_at`. Public read. Oggi ~1 giorno di storia.
- **Match `collection.card_api_id` → `market_valuations.card_id`**: verificato su dati reali —
  - diretto OK per `onepiece:optcg:OP10-025:en`, `pokemon:tcgdex:sv10-001:en`, ecc.
  - **null** per: tutte le carte `:ja` (fonte EN-only), namespace `pokemon:ptcg:*` con spelling non-canonico (`pokemon:ptcg:sv3pt5-173`), set fuori copertura, e `card_api_id` con set uppercase (`pokemon:tcgdex:SV3-118:ja`).
- `eurRate` (`src/DraGold.jsx:121`): `1 USD = X EUR` (default 0.92), passato a `PortfolioView` come prop. `fmt(usd)` converte per il display. **Il nuovo path valutazioni è EUR-nativo e NON passa da `fmt`/`eurRate`.**
- `set_identity_key`: la funzione JS `setIdentityKey` esiste (`scripts/lib/catalog/normalize-set-code.js`); serve la gemella SQL per l'RPC.

---

## File Structure

**Nuovi — SQL (migration):**
| File | Contenuto |
|---|---|
| `supabase/migrations/<ts>_set_identity_key_fn.sql` | funzione SQL `public.set_identity_key(text) returns text` (immutable) — gemella di `setIdentityKey` JS. |
| `supabase/migrations/<ts>_portfolio_valuation_rpcs.sql` | `portfolio_valuations(text[])` + `portfolio_value_history(text[], int)`, `security invoker`, `stable`. |

**Nuovi — moduli puri (`src/lib/portfolio/`):**
| File | Responsabilità |
|---|---|
| `valuation.js` | `buildPortfolioValuation({ positions, valuations })` → `{ totalEur, pricedCount, unvaluedCount, byTcg, bySet, byLang, confidenceMix, concentration, movers, mostValuable, unvalued }`. Puro. |
| `insights.js` | `deriveInsights(portfolio)` → `[{ kind, text, weight }]` (concentrazione, top-10 %, set più prezioso, biggest mover, "N carte senza valutazione affidabile"). Puro. |
| `history.js` | `buildValueHistory({ historyRows, positions })` → `[{ day, label, valueEur }]` + `historyState` (`'building' | 'ok'`). Puro. |
| `unavailableReason.js` | `explainUnavailable(reason, lang)` → stringa UX ("Japanese cards aren't valued yet", "This set isn't covered yet", "Not enough market data yet"). Puro. |

**Nuovi — componenti (`src/pages/portfolio/`):**
| File | Responsabilità |
|---|---|
| `ConfidenceBadge.jsx` | `<ConfidenceBadge level="medium|low|none" reason={jsonb} />` — chip + popover "perché". Nessun livello "high". |
| `PortfolioConfidence.jsx` | riepilogo aggregato: "X% del valore è a confidence Medium, Y% Low, Z carte senza dato". Barra segmentata neutra. |
| `PortfolioBreakdown.jsx` | tab TCG / Set / Language → righe con valore EUR + % + sparkline opzionale. |
| `CollectionIntelligence.jsx` | lista di `deriveInsights()` come card testuali brevi. |
| `UnvaluedSection.jsx` | le carte senza valutazione, raggruppate per motivo, con copy costruttivo. |

**Modificati:**
| File | Cambi |
|---|---|
| `src/supabase.js` | `+ fetchPortfolioValuations(cardIds)`, `+ fetchPortfolioValueHistory(cardIds, days)` (wrapper RPC). |
| `src/pages/portfolio/PortfolioView.jsx` | fonte valore: `priceMap` → `valuationMap`; nuovi pannelli montati fra HERO e MOVERS; badge confidence in `PortfolioGridCard`/`PortfolioRow`/`RailCard`; total/movers/mostValuable calcolati da `buildPortfolioValuation`. Firme componenti invariate (nuovi prop opzionali). |
| `src/lib/setSlug.js` | *(no change — `setIdentityKey` resta in scripts/lib; se serve lato UI si importa da lì o si duplica la regola con un test di equivalenza).* |

**Nuovi — test:**
- `src/lib/portfolio/__tests__/*.test.js` (node:test) per i 4 moduli puri.
- `src/pages/portfolio/__tests__/ConfidenceBadge.test.jsx` (Vitest) — rendering dei 3 livelli, assenza di "high".

---

## Schema / RPC

### `set_identity_key(text)` — SQL

```sql
create or replace function public.set_identity_key(raw text)
returns text language sql immutable as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(coalesce(raw,'')), 'pt([0-9])', '.\1', 'g'),
      '[^a-z0-9.]', '', 'g'),
    '([a-z])0+([0-9])', '\1\2', 'g'),
  '\.', '', 'g')
$$;
```
*(Equivalente a `setIdentityKey` JS: `me04`→`me4`, `sv08.5`→`sv85`, `sv1`≠`sv10`.)*

### `portfolio_valuations(p_card_ids text[])`

Ritorna una riga per ogni `card_api_id` in input:

```sql
create or replace function public.portfolio_valuations(p_card_ids text[])
returns table (
  input_card_id     text,
  resolved_card_id  text,
  tcg               text,
  estimated_value   numeric,   -- EUR
  observed_low      numeric,
  observed_median   numeric,
  observed_high     numeric,
  n_observations    int,
  n_sources         int,
  trend_7d_pct      numeric,
  trend_30d_pct     numeric,
  confidence        text,      -- 'medium' | 'low' | 'none'
  confidence_reason jsonb,
  computed_at       timestamptz,
  unavailable_reason text      -- null | 'ja_not_covered' | 'set_not_covered' | 'no_data_yet' | 'resolved_via_alias'
) language plpgsql stable security invoker as $$
begin
  return query
  with input as (select unnest(p_card_ids) as id),
  -- parse "tcg:source:setpart-num:lang" — best effort
  parsed as (
    select id,
           split_part(id, ':', 1) as tcg,
           split_part(id, ':', 4) as lang,
           split_part(split_part(id, ':', 3), '-', 1) as set_part,
           regexp_replace(split_part(id, ':', 3), '^[^-]*-', '') as num_part
    from input
  ),
  direct as (
    select p.id, mv.*
    from parsed p
    join public.market_valuations mv on mv.card_id = p.id and mv.currency = 'EUR'
  ),
  -- fallback: stessa tcg + stessa set_identity_key + stesso card_number_norm, lingua en
  alias as (
    select p.id, mv.*
    from parsed p
    join public.cards c
      on c.tcg = p.tcg and c.lang = 'en'
     and public.set_identity_key(c.set_id) = public.set_identity_key(p.set_part)
     and c.card_number_norm = lower(regexp_replace(p.num_part, '[^a-zA-Z0-9]', '', 'g'))
    join public.market_valuations mv on mv.card_id = c.id and mv.currency = 'EUR'
    where p.id not in (select id from direct)
  )
  select
    p.id,
    coalesce(d.card_id, a.card_id) as resolved_card_id,
    coalesce(d.tcg, a.tcg, p.tcg),
    coalesce(d.estimated_value, a.estimated_value),
    coalesce(d.observed_low, a.observed_low),
    coalesce(d.observed_median, a.observed_median),
    coalesce(d.observed_high, a.observed_high),
    coalesce(d.n_observations, a.n_observations),
    coalesce(d.n_sources, a.n_sources),
    coalesce(d.trend_7d_pct, a.trend_7d_pct),
    coalesce(d.trend_30d_pct, a.trend_30d_pct),
    coalesce(d.confidence, a.confidence, 'none'),
    coalesce(d.confidence_reason, a.confidence_reason),
    coalesce(d.computed_at, a.computed_at),
    case
      when d.card_id is not null then null
      when a.card_id is not null then 'resolved_via_alias'
      when p.lang = 'ja' then 'ja_not_covered'
      when exists (select 1 from public.market_valuations m2 where m2.tcg = p.tcg limit 1)
           and not exists (
             select 1 from public.cards c2
             where c2.tcg = p.tcg and c2.lang='en'
               and public.set_identity_key(c2.set_id) = public.set_identity_key(p.set_part)
           )
        then 'set_not_covered'
      else 'no_data_yet'
    end
  from parsed p
  left join direct d on d.id = p.id
  left join alias a on a.id = p.id;
end$$;

revoke all on function public.portfolio_valuations(text[]) from public;
grant execute on function public.portfolio_valuations(text[]) to anon, authenticated;
```

### `portfolio_value_history(p_card_ids text[], p_days int)`

```sql
-- per ogni (card_id, giorno) -> ultimo price_eur noto <= fine giornata,
-- limitato ai card_id passati (gia' risolti lato client via resolved_card_id).
create or replace function public.portfolio_value_history(p_card_ids text[], p_days int default 90)
returns table (as_of date, card_id text, unit_eur numeric)
language sql stable security invoker as $$
  with days as (
    select generate_series(current_date - (p_days - 1), current_date, interval '1 day')::date as d
  )
  select d.d, mo.card_id,
    (select o.price_eur from public.market_observations o
      where o.card_id = mo.card_id and o.kind in ('market','sold')
        and o.observed_at < d.d + 1 and o.price_eur is not null
      order by o.observed_at desc limit 1)
  from days d
  cross join (select distinct card_id from public.market_observations where card_id = any(p_card_ids)) mo;
$$;
grant execute on function public.portfolio_value_history(text[], int) to anon, authenticated;
```
*(Il client moltiplica `unit_eur × quantity` per posizione e somma per giorno. `historyState='building'` se < 3 giorni distinti con valore.)*

**Integrity check (nel task):** `select portfolio_valuations(array['onepiece:optcg:OP10-025:en','onepiece:optcg:OP09-072:ja','pokemon:ptcg:sv3pt5-173'])` → riga 1 diretta (val €0.10), riga 2 `ja_not_covered`, riga 3 `resolved_via_alias` **o** `set_not_covered`. `get_advisors` security → 0 nuovi warning.

---

## Task 1 — Migration `set_identity_key` + RPC

**Files:** Create `supabase/migrations/<ts>_set_identity_key_fn.sql`, `<ts>_portfolio_valuation_rpcs.sql` (+ `_down`).

- [ ] **1.1** Scrivere `set_identity_key(text)` (SQL sopra). `apply_migration`.
- [ ] **1.2** Test SQL: `select set_identity_key('me04')='me4'`, `set_identity_key('sv8pt5')=set_identity_key('sv08.5')`, `set_identity_key('sv1') <> set_identity_key('sv10')`.
- [ ] **1.3** Scrivere `portfolio_valuations` + `portfolio_value_history`. `apply_migration`.
- [ ] **1.4** Integrity: eseguire i 3 casi (sopra) via `execute_sql`. Verificare `unavailable_reason` corretto.
- [ ] **1.5** `get_advisors security` → nessun nuovo warning (funzioni `security invoker`, execute revocato da `public` e concesso ad `anon`/`authenticated`).
- [ ] **1.6** Commit: `feat(portfolio): RPC portfolio_valuations/value_history + set_identity_key SQL`.

---

## Task 2 — `src/supabase.js` wrapper

**Files:** Modify `src/supabase.js`.

**Interfaces — Produces:**
- `fetchPortfolioValuations(cardIds: string[]): Promise<Row[]>` — `supabase.rpc('portfolio_valuations', { p_card_ids: cardIds })`; ritorna `data || []`; su errore ritorna `[]` e logga (non lancia — la Portfolio deve degradare, non rompersi).
- `fetchPortfolioValueHistory(cardIds: string[], days=90): Promise<{as_of,card_id,unit_eur}[]>`.

- [ ] **2.1** Implementare i due wrapper (pattern identico a `listCollection`).
- [ ] **2.2** Verifica manuale: `node -e` non applicabile (usa `import.meta.env`) → verifica in browser QA (Task 10). Per ora: `npm run build` verde.
- [ ] **2.3** Commit: `feat(portfolio): wrapper client per gli RPC valuation`.

---

## Task 3 — `src/lib/portfolio/valuation.js` (puro, test-first)

**Files:** Create `src/lib/portfolio/valuation.js`, `__tests__/valuation.test.js`.

**Interfaces — Produces:**
- `buildPortfolioValuation({ positions, valuations }): object`
  - `positions`: righe `collection` (`card_api_id, tcg, set_name, set_id, language, quantity, ...`).
  - `valuations`: righe RPC `portfolio_valuations` indicizzabili per `input_card_id`.
  - Ritorna:
    ```
    {
      totalEur,               // Σ estimated_value × quantity (solo posizioni valutate)
      pricedCount, unvaluedCount, positionCount,
      byTcg:  [{ tcg, valueEur, pct, count }],
      bySet:  [{ set, tcg, valueEur, pct, count }],   // ordinato per valueEur desc
      byLang: [{ lang, valueEur, pct, count }],
      confidenceMix: { medium: {valueEur,pct,count}, low: {...}, none: {count} },
      concentration: { top1Pct, top5Pct, top10Pct, topPositions:[{card_api_id,valueEur,pct}] },
      movers:      [{ card_api_id, trendPct, valueEur }],   // trend_7d o 30d non-null, |trend| desc
      mostValuable:[{ card_api_id, valueEur, confidence }], // top 10
      unvalued:    [{ card_api_id, reason }],
    }
    ```
- Regole: una posizione con `estimated_value == null` **non contribuisce** a `totalEur`/`byTcg`/… ma va in `unvalued` con `reason`. `pct` sempre su `totalEur` (posizioni valutate).

- [ ] **3.1** Test: portfolio con 4 posizioni (2 valutate €10×2 e €5×1, 1 `ja_not_covered`, 1 `no_data_yet`) → `totalEur=25`, `pricedCount=2`, `unvaluedCount=2`, `byTcg` corretto, `confidenceMix.medium.count=2`, `concentration.top1Pct=80`.
- [ ] **3.2** Test: trend — solo le posizioni con `trend_7d_pct` o `trend_30d_pct` non-null entrano in `movers`; ordinate per `|trend|`.
- [ ] **3.3** Test: portfolio interamente non valutato → `totalEur=0`, `movers=[]`, `mostValuable=[]`, `unvalued.length=positionCount` (nessun crash, nessun NaN).
- [ ] **3.4** Run → FAIL → implementare → PASS.
- [ ] **3.5** Commit: `feat(portfolio): aggregazione valutazione (puro)`.

---

## Task 4 — `insights.js` + `unavailableReason.js` + `history.js` (puri, test-first)

**Files:** Create i 3 file + `__tests__`.

**Interfaces — Produces:**
- `deriveInsights(portfolio): [{ kind, text, weight }]` — `kind ∈ {concentration, top10, top_set, mover, unvalued, single_tcg}`. Solo insight *supportate dai dati*: niente "biggest mover" se `movers` è vuoto; niente concentrazione se < 3 posizioni valutate. `text` in inglese, tono neutro ("Your 10 most valuable cards are 74% of tracked value" — **non** "you should diversify").
- `explainUnavailable(reason, lang): string` — mappa fissa:
  - `ja_not_covered` → "Japanese cards aren't valued yet — our market data covers English printings."
  - `set_not_covered` → "This set isn't in our valuation coverage yet."
  - `no_data_yet` → "Not enough market data for this card yet."
  - `resolved_via_alias` → *(non un errore — non mostrare)*
- `buildValueHistory({ historyRows, positions }): { series:[{day,label,valueEur}], state:'building'|'ok' }` — `valueEur(day) = Σ unit_eur(card,day) × quantity`. `state='building'` se < 3 giorni con `valueEur > 0`.

- [ ] **4.1** Test `deriveInsights`: portfolio concentrato → include `concentration`; portfolio senza movers → nessun insight `mover`; portfolio 1 solo TCG → `single_tcg`.
- [ ] **4.2** Test `explainUnavailable` (4 chiavi + fallback).
- [ ] **4.3** Test `buildValueHistory`: 2 giorni di dati → `state:'building'`; 5 giorni → `state:'ok'`, `series` monotona nei giorni.
- [ ] **4.4** Run → FAIL → implementare → PASS.
- [ ] **4.5** Commit: `feat(portfolio): insights + spiegazione "non valutato" + storico valore (puri)`.

---

## Task 5 — `ConfidenceBadge.jsx` + `PortfolioConfidence.jsx`

**Files:** Create entrambi + `__tests__/ConfidenceBadge.test.jsx` (Vitest).

- [ ] **5.1** `ConfidenceBadge`: props `level` (`'medium'|'low'|'none'`), `reason` (jsonb opz.). Rendering: chip testo `Medium` (neutro `--surface-3`), `Low` (ambra), `Estimate pending` (grigio) per `none`. **Nessun ramo `high`.** `title`/popover dal `reason` ("3 osservazioni, 1 fonte, aggiornato oggi").
- [ ] **5.2** `PortfolioConfidence`: props `confidenceMix`. Barra segmentata orizzontale (medium / low / none) + legenda "X% del valore tracciato è a confidence Medium…". Copy: "One market source (TCGplayer). Confidence rises as more sources and days of data accumulate."
- [ ] **5.3** Vitest: `ConfidenceBadge` con `level='high'` (input imprevisto) → **non** rende un badge verde "High" (fallback a `Medium` o niente, mai "High").
- [ ] **5.4** Commit: `feat(portfolio): ConfidenceBadge + PortfolioConfidence (nessuno stato "high")`.

---

## Task 6 — `PortfolioBreakdown.jsx` + `CollectionIntelligence.jsx` + `UnvaluedSection.jsx`

**Files:** Create i 3.

- [ ] **6.1** `PortfolioBreakdown`: props `{ byTcg, bySet, byLang }`. Tre tab (TCG default). Riga: nome · valore EUR · barra % · `count` carte. `bySet` cap a 12 righe + "…and N more".
- [ ] **6.2** `CollectionIntelligence`: props `insights`. Rende ogni `text` come riga con icona per `kind`. Vuoto → non renderizza la sezione.
- [ ] **6.3** `UnvaluedSection`: props `{ unvalued, positionsById }`. Raggruppa per `reason` (via `explainUnavailable`), mostra `count` + le prime 6 miniature per gruppo. Header: "Not yet valued ({N})". Copy costruttivo, nessun rosso.
- [ ] **6.4** Commit: `feat(portfolio): Breakdown + Collection Intelligence + Unvalued section`.

---

## Task 7 — Cablaggio in `PortfolioView.jsx`

**Files:** Modify `src/pages/portfolio/PortfolioView.jsx`, `src/supabase.js` (già Task 2).

- [ ] **7.1** In `load()`: dopo `listCollection()`, chiamare `fetchPortfolioValuations(ids0)` → `setValuationMap(byInputId)`. Mantenere `fetchPortfolioValueHistory` dietro `ensureHistory`.
- [ ] **7.2** `buildPortfolioValuation({ positions, valuations })` in un `useMemo`. Da esso derivare: `totalEur`, `movers`, `mostValuable`, `confidenceMix`, breakdown, insights, unvalued.
- [ ] **7.3** HERO: `Total Value` = `fmtEur(totalEur)` (nuovo helper EUR-nativo, **non** `fmt`). Sotto: `<PortfolioConfidence confidenceMix={...} />`. `unpriced` badge → "N not yet valued" (link scrolla a `UnvaluedSection`).
- [ ] **7.4** Montare, fra HERO e MOVERS: `<PortfolioBreakdown />`, `<CollectionIntelligence />`.
- [ ] **7.5** MOVERS/MOST VALUABLE: alimentare da `buildPortfolioValuation` (non più da `perPositionChange` basato su `card_prices`). Se `movers` vuoto → sezione nascosta (già il pattern). `RailCard` riceve un prop `confidence` → mostra `<ConfidenceBadge>` piccolo.
- [ ] **7.6** `PortfolioGridCard` / `PortfolioRow`: prop nuovo `valuation` (opz.). Mostra `estimated_value` EUR + `<ConfidenceBadge level={valuation.confidence}>`; se `valuation` assente o `confidence==='none'` → "Estimate pending" invece di un prezzo finto. `trend` mostrato solo se non-null.
- [ ] **7.7** In fondo (dopo grid): `<UnvaluedSection unvalued={...} positionsById={...} />`.
- [ ] **7.8** P&L "vs paid": invariato (usa ancora `purchase_price`/`fmv_currency` in USD via `fmt`). Aggiungere una nota "P&L uses your purchase price; market value uses DraGold's estimate (EUR)".
- [ ] **7.9** Rimuovere la dipendenza da `card_prices` per il *valore* (resta usata solo per il P&L legacy se serve — o rimossa se il P&L può derivare da valuations). Decisione: mantenere `priceMap` **solo** se il P&L legacy lo richiede; altrimenti eliminare la query.
- [ ] **7.10** `npm run build` verde. Commit: `feat(portfolio): PortfolioView consuma market_valuations (valore, confidence, breakdown, insights)`.

---

## Task 8 — Storico valore (grafico)

**Files:** Modify `PortfolioView.jsx`, use `history.js`.

- [ ] **8.1** `ensureHistory(rangeKey)` → `fetchPortfolioValueHistory(resolvedIds, days)` dove `resolvedIds` = `valuations.map(v => v.resolved_card_id).filter(Boolean)`.
- [ ] **8.2** `buildValueHistory({ historyRows, positions })` → `heroSeries`. `HeroChart` invariato.
- [ ] **8.3** Se `state==='building'`: al posto del grafico, pannello "Your value history is being built — check back in a few days" + il valore corrente come singolo punto. **Nessun grafico piatto a 0.**
- [ ] **8.4** Le range pill (7D/30D/1Y/ALL) restano ma con tooltip "history starts {data del primo osservato}".
- [ ] **8.5** Commit: `feat(portfolio): storico valore da market_observations (+ stato "in costruzione")`.

---

## Task 9 — Test suite

- [ ] **9.1** `node --test "src/lib/portfolio/__tests__/*.test.js"` → verde (elencare conteggio).
- [ ] **9.2** Aggiungere Vitest se non presente: `npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom` **solo se la roadmap §13 lo conferma e non introduce conflitti** — altrimenti i test componente restano `node:test` con render minimale via `react-dom/server`. **Decisione:** partire con `react-dom/server` `renderToString` (zero nuove dip) per `ConfidenceBadge`; Vitest completo in una fase testing dedicata.
- [ ] **9.3** `ConfidenceBadge` test (renderToString): `level='medium'` → contiene "Medium"; `level='high'` → **non** contiene "High".
- [ ] **9.4** `npm test` (src) + `npm run test:scripts` → tutto verde.
- [ ] **9.5** Commit: `test(portfolio): moduli puri + ConfidenceBadge`.

---

## Task 10 — Browser QA (reale)

**Prerequisito:** dev server + login. Usare `claude-in-chrome` o chiedere a Ermal un utente di test.

- [ ] **10.1** Portfolio con la collection reale (66 carte, mix EN/JA/ptcg): HERO mostra un `Total Value` EUR plausibile (somma delle ~10-15 carte valutate), `PortfolioConfidence` mostra "100% Medium" o simile, e "N not yet valued" con N grande.
- [ ] **10.2** `UnvaluedSection`: le carte JA raggruppate sotto "Japanese cards aren't valued yet"; le `ptcg` risolte via alias **non** compaiono qui (sono valutate).
- [ ] **10.3** `ConfidenceBadge` visibile su ogni card valutata; **nessun badge "High"** da nessuna parte.
- [ ] **10.4** `Breakdown` per TCG/Set/Language coerente con le carte visibili.
- [ ] **10.5** Storico: stato "in costruzione" (1 giorno di dati) — nessun grafico rotto.
- [ ] **10.6** Mobile (viewport 390px): pannelli impilati, nessun overflow orizzontale.
- [ ] **10.7** Screenshot → `SendUserFile`.

---

## Task 11 — Verifica finale + report

- [ ] **11.1** `npm test` + `npm run test:scripts` + `npm run build` → verdi (conteggi).
- [ ] **11.2** DB: `portfolio_valuations` sui `card_api_id` reali della collection → % risolti (diretto + alias) vs unavailable per motivo.
- [ ] **11.3** `get_advisors` security + performance.
- [ ] **11.4** Rilettura diff completo. Nessun import da `DraGold.jsx` che ricrei un ciclo; `PortfolioView` non è cresciuta oltre ~ +250 righe (il resto in `src/lib/portfolio/` + componenti).
- [ ] **11.5** Report `docs/plans/2026-09-03-phase3-RESULTS.md` (formato Problema/Soluzione/Alternative/Implementation/Verification/Status/Remaining + KPI: valuation coverage del portfolio %, confidence mix, storico state). `SendUserFile` + push + PR (stacked su #17).

---

## Self-Review (coverage brief §3)

| Requisito brief | Task |
|---|---|
| valore totale stimato | Task 3, 7.3 |
| numero carte / set / TCG / lingua | Task 3 (`byTcg/bySet/byLang`, `positionCount`), Task 6.1 |
| variazione 24h/7d/30d/3m/1y quando i dati lo consentono | Task 8 (storico) + caveat "building"; trend per-carta 7d/30d in Task 7.6 (null-safe) |
| breakdown per TCG / set / carta / lingua | Task 6.1 |
| storico valore portfolio + grafico | Task 8 |
| top gainers / losers / most valuable / biggest mover | Task 3 (`movers`, `mostValuable`), Task 7.5 |
| market confidence High/Medium/Low senza fingere | Task 5 — **Medium/Low/None** (no High, per caveat 2.1) |
| collection intelligence (concentrazione, top-10 %, set più prezioso, biggest mover, carte senza valutazione) | Task 3 (`concentration`) + Task 4 (`deriveInsights`) + Task 6.2/6.3 |
| non financial advice | Global Constraints + copy neutro in ogni componente |
| dati reali, niente stime finte | RPC ritorna `null`/`unavailable_reason`; UI mostra "Estimate pending", mai un numero inventato |

**Rischi noti Fase 3:** copertura valutazione del portfolio bassa (molte carte JA/vecchie) — mitigato dalla `UnvaluedSection` di prima classe; storico assente per ~2 settimane — mitigato dallo stato "building"; conflitto di merge con `feat/ui-ux-image-price-overhaul` su `PortfolioView.jsx` — mitigato dalle modifiche additive + firme stabili.
