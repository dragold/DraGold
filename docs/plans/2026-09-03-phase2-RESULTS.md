# Fase 2 — Market Valuation Foundation — RISULTATI

> **Data:** 2026-09-02 · **Branch:** `feature/market-valuation-foundation` (stacked su Fase 1, pushato, non mergiato)
> **Piano:** `docs/plans/2026-09-03-phase2-market-valuation-foundation.md`
> **Verifica:** 529/529 test `scripts/**`, `npm run build` verde, 3 migrazioni applicate su produzione con integrity check, 5.755 carte valutate e verificate.

---

## Sintesi

Ogni carta non ha più `price = €X` ma un **layer di valutazione**: `estimated_value` + `observed_low/median/high` + `n_observations` + `n_sources` + `trend` + **`confidence` realmente calcolata sulla qualità dei dati** (rubrica a 4 componenti, con `confidence_reason` JSONB spiegabile).

**DraGold è passato da ~69 carte con un prezzo fresco a 5.755 carte con una valutazione completa** (3.008 Pokémon EN + 2.747 One Piece), a costo zero (TCGCSV + Frankfurter, nessuna API key, nessun acquisto).

I tre pilastri richiesti dal brief sono ora **separati**:
- **Market Valuation** → `market_valuations` (nuovo)
- **Live Market** → `api/live-market.js` (eBay Browse, annunci attivi — non scrive valutazioni)
- **Affiliate Discovery** → `src/lib/ebayLinks.js` (EPN, invariato)

---

## Per blocco

### 1. Market History — `market_observations` (append-only)

**Problema.** `price_history` esisteva ma vuota (schema incoerente: `refresh-prices` scriveva `card_id`/`fetched_at`/`price_market` mentre la tabella ha `card_api_id`/`captured_at`/`fmv_*` → insert falliva in silenzio). Nessuna verità storica delle osservazioni.

**Soluzione.** `market_observations` — una riga per ogni osservazione grezza: `card_id`, `canonical_card_id`, `tcg`, `source`, `kind` (`market`|`listing`|`sold`), `sub_type`, `condition`, `price`, `currency`, **`price_eur`** (convertito al momento della cattura), `fx_rate`, `observed_at`, `raw`. **Mai upsert, mai sovrascritta.** `card_prices` **invariata** (compat, PRODUCT_SPEC §4).

**Alternative scartate.** Riparare `price_history` → scartata (schema legacy incoerente, meglio un modello nuovo pulito). Scrivere su `card_prices` → scartata (quello schema è congelato).

**Implementation.** `supabase/migrations/20260902180000_market_observations_and_fx_rates.sql` (+ `_down`). `scripts/lib/valuation/obs-store.js`.

**Verification.** Migration applicata; check constraint (`kind`, `price >= 0`) verificati; RLS on, lettura pubblica; integration test append + cleanup. **10.349 osservazioni, tutte con `price_eur`.**

**Status.** local + branch + **applicata su produzione**.

---

### 2. FX — `fx_rates` + Frankfurter (BCE)

**Problema.** `refresh-prices` usava `EUR_TO_USD = 1.087` **hardcoded**; `card_prices.currency` diceva sempre `'USD'` anche per dati EUR.

**Soluzione.** `fx_rates` (`as_of, quote, rate`, PK composita) alimentata da **Frankfurter** (`api.frankfurter.app`, dati BCE, gratis, no key). Ogni osservazione porta il tasso reale usato.

**Alternative scartate.** exchangerate.host / open.er-api.com → Frankfurter è ECB-backed, il più autorevole per EUR.

**Verification.** `node scripts/ingest-fx.js` → 1 riga `USD 1.1578` per oggi; re-run idempotente (PK `as_of,quote`). 4/4 test.

**Status.** local + branch + **eseguito su produzione**.

---

### 3. La rubrica di confidence — spiegabile, non inventata

**Quattro componenti lineari 0..1**, su osservazioni `kind='market'` in EUR degli ultimi 90 giorni:

| Componente | Formula | Peso |
|---|---|---|
| `sources` | `min(n_fonti_distinte / 3, 1)` | 0.30 |
| `observations` | `min(n_bucket / 8, 1)` — bucket = (fonte, giorno di calendario), **non** righe grezze | 0.30 |
| `recency` | `1` se <7g · `0.6` se <30g · `0.25` se <90g · `0` oltre | 0.20 |
| `agreement` | `1 - min(IQR / median, 1)` (0.5 se n<3) | 0.20 |

`score = Σ(peso × componente)`. Band: `none` (n=0) · `high` (≥0.70) · `medium` (≥0.42) · `low` (≥0.18) · `none`.

**Regola di onestà (esplicita):** *una fonte sola non supera `medium`* — "high" richiede corroborazione da ≥2 fonti indipendenti. Il conteggio a bucket impedisce che ri-eseguire l'ingest 5×/giorno gonfi la confidence.

Ogni valutazione porta **`confidence_reason` (JSONB)** col breakdown completo → la UI può rispondere "perché medium?".

**Verification.** 14/14 test `confidence.test.js` (0 obs → none; 3 fonti tight → high; 1 fonte densa → medium con nota `capped`).

---

### 4. Il motore di valutazione — `computeValuation` (puro)

- `estimated_value` = **weighted median** delle osservazioni `market`/`sold` (finestra primaria 30g, fallback 90g), peso `exp(-età/20)`; **dedupe per (fonte, sub_type)** tenendo la più recente → nessuna fonte domina per volume.
- solo `listing` disponibili → `mediana × 0.92` (gli ask non sono transati), confidence cap `low`.
- `observed_low/median/high` = quantili 0.1/0.5/0.9.
- `trend_7d_pct` / `trend_30d_pct` = mediane su finestre mobili (`null` se < 2 osservazioni per lato).
- 0 osservazioni valide → `estimated_value = null`, `confidence = 'none'` (**mai una stima finta**).

**Verification.** 20/20 test `valuation.test.js`.

---

### 5. Ingestion prezzi — TCGCSV → `market_observations`

**Fonte.** TCGCSV (`categoryId 68` One Piece, `3` Pokémon) — prezzi *market* TCGplayer, giornalieri, free, no key. Già validata in Fase 1.

**Match carta.** Due strategie, **mai un match forzato**:
1. **Esatto** per `card_id` (`onepiece:tcgcsv:<productId>:en` — i set sincronizzati da TCGCSV in Fase 1).
2. **Per (set, numero)** quando l'esatto non esiste: `buildCardIndexForSets` (1 query/set), `card_number_norm` allineato, `pickCardId` preferisce la stampa base; ambiguo → `null` (contato, non forzato). Per Pokémon: `buildPokemonSetIndex` risolve i nomi-set contro `cards.set_name`, disambiguando gli alias (`me1`/`me01`) via la lista autoritativa TCGdex.

**Run reale su produzione:**
- **One Piece `--all`**: 74 group → 3.413 osservazioni (476 exact + **2.935 by-number** = OP-01…16 coperti).
- **Pokémon `--since=2024-01-01`**: 46 group → 5.441 osservazioni, **3.759 carte matchate** (SV04.5→SV10.5, ME01→ME06 — il catalogo Standard-legal + recente), 20 set-promo saltati (nome non univoco in DB), ~20% carte non risolte (secret/hyper rare con numerazione fuori set) — tutte loggate.

**Implementation.** `scripts/lib/valuation/{observation-rows,card-match}.js`, `scripts/ingest-market-tcgcsv.js`.

**Status.** local + branch + **eseguito su produzione**.

---

### 6. `compute-valuations.js` → `market_valuations`

**Comportamento.** Seleziona le carte con ≥1 osservazione recente → `observationsForCards` (batch 200) → `computeValuation` → upsert `(card_id, currency)`.

**Run reale su produzione — 5.755 carte valutate:**

| | |
|---|---|
| valued (estimated_value non-null) | **5.755 / 5.755** |
| estimated_value ∈ [observed_low, observed_high] | **5.755 / 5.755** |
| con `confidence_reason` | **5.755 / 5.755** |
| confidence: high / medium / low / none | **0 / 5.246 / 509 / 0** |
| Pokémon / One Piece | 3.008 / 2.747 |

**0 `high` è corretto**, non un bug: TCGCSV è una sola fonte → cap a `medium`. Le 509 `low` sono per lo più carte con `card_number_norm` che matcha in due `set_id` duplicati (vedi §Rischi) → osservazioni in conflitto → `agreement` basso → segnale onesto ("dati incoerenti").

**Spot check (plausibilità):** Umbreon ex SIR (Prismatic `sv08.5-161`) → **€1.254** · medium. Shanks alt-art OP17 → €27. Commons → €0.05–0.15.

**Verification.** Idempotente: re-run → 5.755 == distinct `(card_id,currency)`, `computed_at` aggiornato.

**Status.** local + branch + **eseguito su produzione**.

---

### 7. Live Market — separato dalla valutazione

**`api/ebay-search.js` era già un endpoint Live Market** (eBay Browse, annunci attivi, OAuth client-credentials, marketplace-aware). Fase 2:
- estratto `api/_lib/ebay.js` (OAuth + marketplace map) — condiviso, `ebay-search.js` rifattorizzato per riusarlo.
- nuovo **`api/live-market.js`**: `GET ?cardId=<id>&market=IT` → carica la carta da Supabase → `buildBrowseQuery` → Browse → `{listings, summary}`. **Non scrive `market_valuations`.** `?record=1` opzionale → osservazioni `kind='listing'` (spento di default; i listing non contano per `high`).
- `scripts/lib/valuation/ebay-browse.js` (puro): `buildBrowseQuery`, `parseBrowseResponse`, `summarizeListings` — 33/33 test.

**Verification.** Sintassi + build OK. **Test eBay end-to-end = post-deploy** (credenziali `EBAY_CLIENT_ID/SECRET` solo su Vercel, non in `.env` locale).

**Status.** local + branch. **Remaining.** QA reale su Vercel preview.

---

### 8. Workflow `market-valuation.yml`

cron `30 5 * * *` (dopo TCGCSV update ~20:00 UTC e dopo `catalog-freshness`): `ingest-fx` → `ingest-market-tcgcsv --tcg=onepiece --all` → `ingest-market-tcgcsv --tcg=pokemon --since=2023-01-01` → `compute-valuations`. `workflow_dispatch` con `tcg`/`dry_run`.

**Verification.** Ogni script verificato individualmente su produzione. YAML: 0 tab, espressioni bilanciate. Workflow assemblato → verificabile post-merge (`workflow_dispatch` non dispatchable da feature branch).

---

## DraGold vNext — KPI Fase 2 (2026-09-02)

| Metrica | Prima | Dopo |
|---|---|---|
| Carte con prezzo fresco (≤30gg) | **~69 / 203.384** | — |
| Carte con **valutazione** (`market_valuations`) | 0 (tabella non esisteva) | **5.755** (3.008 Pokémon EN + 2.747 One Piece) |
| Market history | `price_history` vuota (schema rotto) | `market_observations` append-only, **10.349 osservazioni** |
| Confidence | inesistente | rubrica a 4 componenti, **`confidence_reason` spiegabile** su ogni riga |
| distribuzione confidence | — | medium 5.246 · low 509 · high 0 (1 fonte) · none 0 |
| Cambio valuta | `1.087` hardcoded | `fx_rates` da BCE (Frankfurter), aggiornato giornalmente |
| Market Valuation / Live Market / Affiliate | mescolati | **separati** (`market_valuations` / `api/live-market.js` / `ebayLinks.js`) |
| Fonti a pagamento aggiunte | — | **nessuna** (TCGCSV + Frankfurter, no key) |
| Test | 495 (Fase 1) | **529** |
| Build | verde | verde |
| Security advisor | ok | ok, 0 nuovi warning |

---

## Rischi residui / fuori scope Fase 2

1. **Set-id duplicati per zero-padding** (`me4`/`me04`, `sv8pt5`/`sv08.5`): la guardia Fase 1 `UNIQUE(tcg, set_code_norm)` non li collassa (`normalizeSetCode` non toglie gli zeri iniziali dalla parte numerica). Effetto: alcune carte matchano in 2 set_id → osservazioni in conflitto → confidence `low`. **→ Fix Fase 1.x**: estendere `normalizeSetCode` a togliere lo zero-padding + dedup migration su `cards`/`set_logos`.
2. **Confidence cap a `medium`**: finché TCGCSV è l'unica fonte, nessuna carta raggiunge `high`. **Corretto per design.** Cardmarket (via pokemontcg.io) + eBay Browse come 2ª/3ª fonte → Fase 2.1.
3. **`refresh-prices` (Task 10) NON toccato**: il file su disco (`supabase/functions/refresh-prices/index.ts`, usa `findCompletedItems` / Finding API deprecata) **diverge dalla v14 deployata** (usa `fetch-ebay-sold`). Deployare il file su disco = **regressione**. → task dedicato di riconciliazione prima di qualunque modifica/deploy. I 3 obiettivi (demote `pokemontcgio`, feed `market_observations`, fix `price_history`) restano da fare lì.
4. **Pokémon match ~80%**: secret/hyper rare (numerazione fuori-set) e set-promo con nome ambiguo non risolti — loggati, mai forzati.
5. **eBay Live Market** verificabile solo post-deploy (credenziali su Vercel).
6. **Snapshot ridondanti**: un paio di batch di test parziali nello stesso giorno in `market_observations` (`captured_at` distinti) — innocui, il motore deduplica per (fonte, sub_type); Fase 3 fa bucket giornaliero.

---

## Cosa passa a Fase 3 (Portfolio core)

`market_valuations` + `market_observations` sono la base per: valore totale portfolio, storico valore (bucket giornaliero da `market_observations`), performance/movers, badge confidence per posizione, sezione "carte senza valutazione affidabile" (`confidence='none'`). Coordinare col branch `feat/ui-ux-image-price-overhaul` (che tocca `PortfolioView.jsx`) — rebase dopo il merge di Fasi 1–2.
