# DraGold vNext — Audit live, Research, Roadmap operativa

> **Autore:** agente CTO / Senior Product Engineer
> **Data:** 2026-09-02
> **Scope:** ciclo evolutivo "TCG Knowledge + Explore + Collection + Portfolio + Market Valuation + Market Discovery"
> **Stato del documento:** piano approvato per esecuzione autonoma per fasi. Le decisioni tecniche sono già prese (sezione Research). Le uniche domande aperte per Ermal sono nella sezione §7 e non bloccano l'avvio.

---

## 0. TL;DR — verdetto

DraGold **non è "un buon database TCG con qualche problema di freshness"**. È un catalogo Pokémon vivo, con **tutto il resto della pipeline dati fermo o rotto**:

| Area | Stato reale verificato (2026-09-02) |
|---|---|
| Catalogo Pokémon EN/JA | ✅ Vivo. Sync giornaliero TCGdex funziona. |
| Catalogo One Piece EN | 🔴 Fermo. 0 carte nuove in 30 giorni. Manca **OP-17** (uscito EN il 2026-08-28). Fonte upstream (optcgapi.com) ferma a OP-12 / "inizio 2025". |
| Catalogo One Piece JA | 🔴 Congelato dal 2026-06-15. |
| Catalogo MTG / YGO | ⚪ Congelati da maggio 2026 (accettabile per priorità prodotto, ma il dato va qualificato). |
| Tabella `sets` | 🔴 1.668 righe, `released_at` NULL sul **100%**, nomi troncati/corrotti, sincronizzata una volta sola il 2026-06-08. Nessun concetto di status/upcoming/lingua. |
| Prezzi / valutazione | 🔴 **69 carte in tutto il DB** hanno un'osservazione di prezzo negli ultimi 30 giorni (su 203.384). `pokemontcgio` fallisce l'85% delle chiamate. `price_history` vuota. |
| "Released but missing" detector | 🟡 Il codice **esiste già** (`scripts/lib/reconcile/reconcile-catalog.mjs`, read-only, per-set, resumable) ma **non è collegato a nessun workflow** e non gira mai contro produzione. |
| Portfolio | 🟡 Funziona come lista con valore derivato da `card_prices`, ma `card_prices` è stale → il valore mostrato è vecchio di mesi. |
| Branch in volo | 🟡 `feat/ui-ux-image-price-overhaul-2026-09-02` (7 commit non mergiati) copre già virtualizzazione, search parallela, skeleton, fallback immagini OP JA. Va coordinato, non ignorato. |

**Conseguenza strategica:** l'ordine di priorità del brief è corretto. P0 = far tornare freschi catalogo e valutazione. Tutto il resto (Portfolio, Explore, Search, UI) si appoggia su questi due layer e oggi si appoggia su dati morti.

---

## 1. Metodo dell'audit

Tutto verificato **live** il 2026-09-02, non riciclato da audit precedenti:

- **DB Supabase** (`pimwkmwrduqkaydyvxqz`): `list_tables`, `list_migrations`, ~20 query dirette su `cards`, `sets`, `card_prices`, `price_sources`, `api_call_log`, `set_logos`, `canonical_cards`, `cron.job`.
- **Edge Functions**: `list_edge_functions` + lettura sorgente di `sync-sets`.
- **GitHub Actions**: lettura di tutti gli 11 workflow in `.github/workflows/`.
- **Script di sync**: lettura di `sync-cards.js`, `sync-full.js`, `reconcile-catalog.mjs`, `reconcile-pokemon.js`, glob completo di `scripts/`.
- **Branch**: `git branch -a` + diff-stat dei branch potenzialmente rilevanti.
- **Research fonti dati**: 12 ricerche web + fetch diretti su `api.tcgdex.net`, `optcgapi.com`, `docs.apitcg.com`, `docs.limitlesstcg.com`, `tcgcsv.com`.
- **CodeGraph**: usato per la topologia della pipeline di ingestion.

Non verificati in questo giro (da coprire in Fase 0): interni di `refresh-prices` e delle edge function `fetch-ebay-*`, dettaglio del resolver immagini, stato UI di `PortfolioView`/`ExploreView` in produzione.

---

## 2. AUDIT — Catalogo & Freshness (P0)

### 2.1 Catalogo Pokémon — vivo ma "guarda indietro"

**Problema:** il sync giornaliero (`sync-cards.js`, cron `0 3 * * *`, TCGdex a due stadi) funziona: 2.636 carte nuove nelle ultime 24h, `last_created` = oggi. **Ma** le carte nuove di oggi erano set storici JA (`sm6`–`sm12`, `sv10` JA) e un set FR (`B1 Méga-Ascension`). Lo script itera tutti i set di TCGdex in ordine di lista, non con priorità alle uscite recenti → un set nuovo EN può aspettare che il crawler ci arrivi.

**Evidenza:**
- `cards`: pokemon EN 44.358 / JA 8.759. Immagini: EN 44.260/44.358 con URL, 98 senza immagine reale, 23.781 con URL TCGdex nativo.
- TCGdex EN è aggiornato: la lista `/v2/en/sets` contiene già `me05` (Pitch Black, uscito 2026-07-17), `B2a`, `sv10.5b/w`. Quindi **la fonte non è il collo di bottiglia, lo è la strategia di scansione**.
- `enrich-cards.js` gira ogni 2h **solo su `--lang=en`** → JA e altre lingue non ricevono mai enrichment schedulato di illustrator/evolveFrom.

**Fix (Fase 1):** aggiungere al sync una **priorità per release date** (prima i set con `releaseDate` negli ultimi ~120 giorni o assente, poi il resto in coda) e un passaggio "recent-first" separato dal full crawl settimanale.

### 2.2 Catalogo One Piece — fermo, fonte upstream morta

**Problema:** doppio: (a) la fonte primaria `optcgapi.com` è **ferma a OP-12 / "inizio 2025"** (verificato su optcgapi.com/about/general); (b) `sync-full.js` enumera set **hardcoded** (`OP-01..25`, `ST-01..30`, `EB-01..05`) → nessuna scoperta di nuovi set, nessuna copertura di `PRB-*` né dei promo oltre a quelli che optcgapi già espone.

**Evidenza:**
- One Piece: 0 carte nuove in 7 e 30 giorni (EN +20/30gg, JA 0/30gg).
- Il DB **ha** OP-01→OP-16, EB-01/02/03, PRB-01/02, ST-01→30, `P` (214 promo), `OTHER` (152). **Manca OP-17** (EN 2026-08-28, ~2 mesi di ritardo) e tutto il successivo.
- OP-13→OP-16 sono entrati il 2026-05-25 da un import massivo (probabilmente `bulk-import-onepiece` edge function o un dump), **non** dal sync corrente — optcgapi non li fornisce.
- Data quality: `EB-02` ha `card_number` max `OP08-098` (numerazione sbagliata), `PRB-02` ha righe `ST20-003` → mescolanza di set.
- Immagini OP: 2.641/2.661 EN e 2.554/2.554 JA puntano a `onepiece-cardgame.com` in **hotlink** → rotte in rendering per referrer protection (problema noto, PRODUCT_SPEC §1).
- Il fix "alias `op`→`onepiece`" in `sync-cards.js` è già su main, ma il ramo One Piece di `sync-cards.js` usa "TCGdex serie onepiece" che **non esiste** (TCGdex è Pokémon-only) → fallisce in silenzio.

**Fix (Fase 1):** sostituire optcgapi come primaria con **apitcg.com** (vedi §5), ingestion **set-driven** (lista set dalla fonte, non enumerazione), backfill OP-17 + promo + correzione EB-02/PRB-02.

### 2.3 Tabella `sets` — inutilizzabile come catalogo autoritativo

**Problema:** `sets` è popolata dall'edge function `sync-sets` che pesca da `tcgpricelookup.com` (200 req/giorno) e non gira da mesi.

**Evidenza:**
- 1.668 righe. `released_at` **NULL su tutte**. `synced_at` = `2026-06-08` per tutte.
- Nomi corrotti: `"SV:"`, `"SV01:"`, `"SV10: Destined"` con `card_count = 2`, `"MEE: Mega"`.
- Colonne: `id, slug, game, name, card_count, released_at, synced_at`. **Nessuna** colonna per lingua, status, logo, symbol, artwork, series, source, confidence.
- Le immagini set vivono in una **seconda** tabella scollegata: `set_logos` (214 righe, chiave `set_code+tcg`, `release_date` come **testo**).
- Terzo posto dove vive il concetto di set: `cards.set_id` / `cards.set_name` / `cards.series_id` / `cards.series_name`.

→ Tre rappresentazioni divergenti dello stesso concetto. La `sets` attuale non è recuperabile con una pulizia: va **ricostruita da fonti autoritative** (TCGdex per Pokémon, apitcg per One Piece) con uno schema nuovo.

### 2.4 Release Monitor — il motore esiste, non è acceso

**Problema:** il brief chiede un sistema `SOURCE CATALOG → DraGold CATALOG → DIFF → MISSING → SYNC QUEUE`. **Esiste già** come libreria:

- `scripts/lib/reconcile/reconcile-catalog.mjs`: orchestratore **read-only**, per-set, **resumable** (checkpoint + NDJSON), che per ogni `(tcg, lang, setId)` confronta fonte esterna vs `cards` e produce finding `MISSING` (`PRESENT_IN_EXTERNAL_SOURCE_NOT_IN_DB`) / `EXTRA`. Copre Pokémon EN/JA + One Piece EN/JA. Fetcher esterni: `fetch-tcgdex.js`, `fetch-optcg.js`. Riusa `identity-cascade.js` + `classify-findings.js`.
- Test presenti: `reconcile-catalog.test.js`, `supabase-read.test.js`, `normalize-*.test.js`, `recovery.test.js`.
- `scripts/lib/reconcile/recovery.mjs` = STEP 5 (write-back delle carte mancanti), esiste come modulo.

**Cosa manca:** nessun workflow lo esegue; `reconcile-pokemon.js` è solo offline-fixture; nessuna tabella conserva i gap nel tempo; nessuna KPI. Il fetcher One Piece è `fetch-optcg.js` (fonte morta).

**Fix (Fase 1):** operazionalizzare — nuovo workflow giornaliero, nuova tabella `catalog_gaps`, nuovo fetcher `fetch-apitcg.js`, KPI **"Released but missing"**.

### 2.5 Cron & workflow — mappa reale

**Supabase `cron.job`:**
| job | schedule | stato | note |
|---|---|---|---|
| `refresh-prices` | `0 */6 * * *` | attivo | ma produce quasi zero (vedi §3) |
| `compute-hot-picks` | `0 3 * * *` | attivo | dipende da prezzi stale |
| `check-alerts` | `*/15 * * * *` | attivo | **JWT service_role hardcoded nel comando cron** → da spostare in secret |
| `bulk-import-pokemon` | `0 4 * * 0` | disattivo | |

**GitHub Actions:**
| workflow | schedule | fa davvero |
|---|---|---|
| `sync-cards.yml` | `0 3 * * *` | Pokémon TCGdex 2-stadi (EN+JA+lingue). MTG/YGO/OP nei parametri ma inefficaci. |
| `sync-full.yml` | `0 4 * * 0` | Pokémon TCGdex + One Piece optcgapi (enum hardcoded). |
| `sync-pokemon-ja.yml` | `0 5 * * 0` | JA via TCGdex/PokemonPriceTracker. |
| `enrich-cards.yml` | `15 */2 * * *` | enrichment **solo EN**. |
| `sync-set-catalog.yml` | manuale | MTG/YGO/Lorcana. |
| `sync-onepiece-ja.yml` | manuale, temp | dry-run validation. |
| `sync-pokemon-ptcg.yml` | manuale | backfill illustrator. |
| `cache-*-images.yml`, `image-audit.yml` | vari | pipeline immagini. |

Nessun workflow: (a) sincronizza il catalogo set con release date reali; (b) esegue reconcile/diff upstream; (c) rileva "released but missing".

### 2.6 Integrità dati

- `canonical_cards`: 88.292. Carte senza `canonical_card_id`: **8.827** (4,3%).
- Dedup `sv10`/`SV10`: risolto da migration `20260902143056_dedupe_ja_set_id_casing`. **Manca** un vincolo/normalizzazione che impedisca la regressione → da aggiungere (Fase 1a).
- `cards.source`/`source_id` sono `NOT NULL` senza default (bug storico già gestito negli script, ma fragile per nuove pipeline).
- RLS attivo su tutte le tabelle (migrazioni `rls_perf_*` recenti). Advisor da rieseguire dopo ogni DDL.

---

## 3. AUDIT — Market / Price Engine (P0)

**Problema:** il motore di valutazione è, di fatto, **spento**.

**Evidenza:**
- **69 carte** (su 203.384) hanno un'osservazione prezzo negli ultimi 30 giorni.
- `card_prices` per fonte:
  | source | righe | ultimo capture | carte distinte | ultimi 7gg |
  |---|---|---|---|---|
  | `ygoprodeck` | 86.218 | 2026-05-29 | 14.372 | 0 |
  | `scryfall` | 26.266 | 2026-05-29 | 25.562 | 0 |
  | `pokemontcgio` | 18.699 | 2026-08-28 | 12.576 | **1** |
  | `cardmarket` | 18.607 | 2026-06-13 | 12.508 | 0 |
  | `ebay_sold` | 8.329 | 2026-09-02 | **52** | 1.287 |
  | `optcg` | 7.359 | 2026-05-29 | 2.453 | 0 |
  | `justtcg` | 2.700 | 2026-08-31 | **34** | 277 |
- `api_call_log` ultimi 7gg: solo `justtcg` (48,5% fail) e `pokemontcgio` (**85,3% fail**). Nessun'altra fonte chiama.
- `price_history` (tabella dedicata storico): **0 righe**. `ebay_clicks`: **0 righe**.
- `price_sources`: 11 configurate (`scrydex` 1000/mese free, `tcglookup` 10000/mese, `justtcg`, `optcg`, `ebay-rss`, ...) — tracking `consecutive_failures`/`is_active` presente ma non alimentato.

**Diagnosi:** la "cascata di fonti" è un'architettura senza fonti che rispondono. `pokemontcgio` è morta (il team è migrato a Scrydex commerciale). `ebay_sold` copre 52 carte. Non c'è un layer di **valutazione** separato dagli snapshot grezzi: nessun `estimated_value`, `confidence`, `trend`, `n_observations`.

---

## 4. AUDIT — Portfolio, Explore, Search, Immagini, UI

- **Portfolio** (`src/pages/portfolio/PortfolioView.jsx`): valore derivato a lettura da `card_prices` (Addendum PRODUCT_SPEC §4). Logica corretta, **ma input stale** → il valore è vecchio di mesi. Manca: confidence per posizione, "carte senza valutazione affidabile", insight di concentrazione.
- **Explore/Sets** (`src/pages/sets/SetsView.jsx`): gerarchia attuale non è `TCG → Sets → Set detail → Cards` con selettore TCG esplicito. Da rifare sopra il nuovo schema `sets`.
- **Search**: branch in volo `feat/ui-ux-image-price-overhaul` ha già `a15ce8a fix(P3): search_cards/suggest_cards bypassavano gli indici GIN trigram` + migration `20260902130000_fix_search_functions_index_usage.sql` + ricerca parallela con `AbortController`. **Da valutare e integrare, non riscrivere.** Benchmark reale in Fase 5.
- **Immagini**:
  - Pokémon: copertura URL ~99,8% EN, 98 carte senza immagine.
  - One Piece: 99% con URL ma **hotlink rotto**. Il branch in volo ha `bbef9e4 feat(P2): fallback immagini One Piece JA via scraping` + `fetch-onepiece-ja.js`.
  - `card_image_cache`: 5.197 righe — proxy/cache proprietaria esiste, va estesa e resa la sorgente primaria di rendering.
  - Nessuna pipeline per gli asset dei **set** (logo/symbol/artwork con confidence).
- **UI/UX**: `feat/ui-ux-image-price-overhaul` ha virtualizzazione (`@tanstack/react-virtual`), stagger motion, skeleton. GSAP + Lenis già installati.

---

## 5. RESEARCH — Fonti dati: decisioni

Criteri del brief applicati: affidabilità → accuratezza → costo (free/quasi-free) → OSS → manutenzione → compatibilità stack → no lock-in → performance → sicurezza → scalabilità.

### 5.1 Catalogo carte + metadata

| TCG | Scelta | Perché | Alternative scartate |
|---|---|---|---|
| **Pokémon EN/JA** | **TCGdex** (`api.tcgdex.net/v2`) — *confermata, già in uso* | Gratis, no API key, OSS, multi-lingua, immagini incluse, `releaseDate` per set, **aggiornata** (ha già i set di luglio/agosto 2026). REST + GraphQL. | `pokemontcg.io` → deprecata di fatto (team migrato a **Scrydex** commerciale; 85% fail nel nostro log). `Scrydex` → a pagamento per i prezzi, tenuta come fallback metadata (free tier 1000/mese già in `price_sources`). `PokéWallet` → chiuso, meno lingue. |
| **One Piece EN/JA** | **apitcg.com** (`api.apitcg.com`) primaria + **one-piece-api.com** / **optcgapi** secondarie | apitcg è **attivamente mantenuta** (One Piece + Pokémon + Digimon + Riftbound + Gundam...), API key free, endpoint `sets`/`cards`. Bandai dal 2026 rilascia JP/EN in simultanea (OP-15+) → ID condivisi EN/JA. | `optcgapi.com` → **ferma a OP-12 / inizio 2025**, non commerciale esplicito, non affidabile per day-one. `Limitless` API → solo dati tornei/deck, **nessun catalogo carte**. Scraping `onepiece-cardgame.com` → WAF/referrer, ultima risorsa solo per immagini. |
| **MTG** | Scryfall (bulk giornaliero) — *invariato* | Standard de-facto, gratis, licenza chiara. Catalogo "architecture-only" per priorità prodotto. | — |
| **YGO** | YGOPRODeck — *invariato* | Gratis. "Architecture-only". | — |

**Azione Fase 0:** validare hands-on gli endpoint apitcg (campi `releaseDate`, logo/symbol, rate limit reali, **ToS uso commerciale**). Se il ToS vieta l'uso commerciale → escalation a Ermal (§7), fallback su one-piece-api.com + optcgapi + scraping controllato.

### 5.2 Prezzi / Market Valuation

| Layer | Scelta | Perché |
|---|---|---|
| **Estimated Market Value (baseline, tutti i TCG)** | **TCGCSV.com** | Gratis, **no API key**, aggiornato **1×/giorno**, prezzi *market* TCGplayer per **ogni** gioco, organizzati per set/prodotto. Perfetto come base di valutazione a costo zero e a copertura totale. Backed Patreon. |
| **Prezzi EU** | **Cardmarket** (già presente come source) + **JustTCG** free tier | Copertura Europa (utenti reali DraGold sono EU). JustTCG: real-time, condition-specific, free tier senza carta. |
| **Live Market (cosa offre il mercato ORA)** | **eBay Browse API** (active listings) | Marketplace Insights (sold) è **gated ai grandi partner** → non disponibile. Browse API (annunci attivi) sì. |
| **Affiliate Discovery (dove comprare)** | **eBay Partner Network** (link/CTA) — *invariato* | Già integrato. Nessuna logica di prodotto costruita sopra, solo deep-link onesti. |
| **Sold data eBay** | **de-prioritizzata** | Nessuna API pubblica. L'attuale `ebay_sold` (52 carte) resta come spot-check, non come input primario di valutazione. |

**Separazione netta richiesta dal brief:**
- **Market Valuation** = `market_valuations` (stima DraGold, da TCGCSV+Cardmarket+JustTCG aggregati).
- **Live Market** = query on-demand a eBay Browse API (annunci attivi, non salvati come "prezzo").
- **Affiliate Discovery** = link EPN.

### 5.3 Upcoming sets

Nessuna API pulita esiste. Strategia (priorità **secondaria** per esplicita indicazione di Ermal):
1. **Derivare** da upstream: un set presente in TCGdex/apitcg con `releaseDate` futura **o** con 0 carte disponibili = `upcoming`.
2. **Seed curato** minimale in-repo (`data/upcoming-seed.json`) per gli annunci non ancora nelle API (es. "30th Celebration" 2026-09-16, "Mega Evolution Delta Reign" 2026-11-06), aggiornato da un job che legge un calendario pubblico.
3. Transizione automatica `upcoming → released` quando `release_date <= today`, che **inserisce il set nella sync queue** del Release Monitor.

---

## 6. ROADMAP — fasi indipendenti

Ogni fase: testabile, reviewabile, committabile, revertibile in isolamento. Branch dedicato per fase. Nessun mega-refactor. `feat/sealed-products` **congelato, mai toccato**.

### FASE 0 — Validazione fonti & prima fotografia dei gap *(no schema change, ~1-2 gg)*
- 0.1 Validare hands-on: apitcg (endpoint OP, `releaseDate`, rate limit, **ToS**), one-piece-api.com, TCGCSV (copertura OP + ToS), credenziali eBay Browse API.
- 0.2 Nuovo fetcher `scripts/lib/reconcile/sources/fetch-apitcg.js` (read-only, testato con fixture).
- 0.3 Workflow **`catalog-freshness.yml`** (manuale, dry-run): esegue `reconcile-catalog.mjs` su Pokémon EN/JA + One Piece EN/JA contro le fonti scelte, pubblica il report NDJSON come artifact CI.
- 0.4 Deliverable: **primo report reale "Released but missing"** + go/no-go per fonte.
- **Verifica:** artifact CI con conteggi; nessuna scrittura DB.

### FASE 1 — Catalog Freshness & Release Monitor *(P0)*
- 1a **Migration `sets` v2** (reversibile): aggiunge `tcg`, `language`, `release_date DATE`, `status` (`announced|upcoming|released|syncing|available|complete`), `logo_url`, `symbol_url`, `series_id`, `source`, `source_confidence`, `card_count_official`, `card_count_available`. Normalizzazione `set_id` case-insensitive + **unique index** anti-regressione `sv10/SV10`. Backfill da `set_logos` dove possibile.
- 1b **`scripts/sync-set-catalog.js`** nuovo: TCGdex (Pokémon, per-set detail → `releaseDate`+logo+symbol+cardCount) + apitcg (One Piece). Popola `sets` v2. Workflow settimanale + manuale. Deprecazione `sync-sets` edge function.
- 1c **Tabella `catalog_gaps`** + **`catalog-freshness.yml` giornaliero**: operazionalizza `reconcile-catalog.mjs` (read-only), scrive i gap con `first_detected_at`/`resolved_at`, calcola le KPI (§8).
- 1d **One Piece ingestion rebuild**: `scripts/sync-onepiece.js` set-driven da apitcg (EN+JA), sostituisce l'enum hardcoded in `sync-full.js`. Backfill OP-17 + promo, fix numerazione EB-02/PRB-02.
- 1e **Sync queue**: tabella `sync_queue` + consumer job che trasforma i `catalog_gaps` (missing set/card) in run di sync mirati; gestisce le transizioni `status`.
- 1f **Pokémon recent-first**: passo di priorità per `release_date` in `sync-cards.js` (i set recenti/senza data prima del full crawl). Enrichment JA schedulato.
- **Verifica per task:** test unit su normalizzazione/diff; run reale limitato a 1 set; query KPI prima/dopo; nessun DELETE.

### FASE 2 — Market Valuation Foundation *(P0)*
- 2a **Migration `market_observations`** (append-only): `card_id, canonical_card_id, source, kind` (`market|listing|sold`), `price, currency, condition, observed_at, raw`. `card_prices` **invariata** (compat), la nuova pipeline scrive qui.
- 2b **`scripts/ingest-tcgcsv.js`** giornaliero: TCGCSV → `market_observations` per Pokémon + One Piece (+ snapshot MTG/YGO). Mapping set/prodotto → `canonical_card_id`.
- 2c **Cardmarket + JustTCG** come fonti secondarie in `market_observations`.
- 2d **Migration `market_valuations`** + **`scripts/compute-valuations.js`**: per `(canonical_card_id, currency)` calcola `estimated_value`, `observed_low/median/high`, `n_observations`, `n_sources`, `trend_7d/30d`, `confidence` (`High|Medium|Low`), `computed_at`. **Rubrica confidence esplicita e spiegabile** (n. fonti indipendenti × n. osservazioni × recency × dispersione IQR/median × livello prezzo), documentata, niente ML.
- 2e **eBay Browse API** → endpoint `Live Market` on-demand (annunci attivi), separato dalla valutazione. Retire `pokemontcgio` dalla cascata (demote a last-resort o rimozione).
- 2f `refresh-prices` riscritta per orchestrare la nuova pipeline; `price_sources` alimentata davvero (health tracking).
- **Verifica:** test sulla rubrica confidence con dataset sintetici; copertura valutazione prima/dopo; explain di 10 carte campione.

### FASE 3 — Portfolio core *(P1)*
- Overview (valore totale stimato, #carte/#set/#TCG, delta 24h/7d/30d/3m/1y dove i dati lo consentono).
- Breakdown per TCG / set / carta / lingua.
- Performance: storico valore portfolio (da `market_observations` bucket giornaliero), grafico, top gainers/losers, most valuable, biggest mover.
- Confidence badge per posizione; sezione esplicita "carte senza valutazione affidabile".
- Collection intelligence (concentrazione, top-10 % del valore, set più prezioso) — solo su dati reali.
- Coordinamento con il branch `feat/ui-ux-image-price-overhaul` (che tocca `PortfolioView.jsx`): **rebase dopo Fase 2**, risoluzione conflitti qui.
- **Non** advisory finanziario: copy "collection valuation", nessuna estetica trading.

### FASE 4 — Explore hierarchy *(P1)*
- Selettore TCG esplicito → Sets → Set detail → Cards.
- Tab `Recent` / `Upcoming` / `All Cards` guidati da `sets.status` + `sets.release_date`.
- TCG attivi in UI: **Pokémon, One Piece**. MTG/YGO dietro label "catalog snapshot" o nascosti (non inventare freschezza).
- **Non** virtualizzare Set Detail (SEO/indicizzabilità).

### FASE 5 — Search *(P1)*
- Benchmark reale: client-side `ilike` vs RPC `search_cards`/`suggest_cards` (post-fix GIN del branch in volo) vs trigram. Decisione basata su numeri.
- Cancellation + debounce + parallelizzazione + no race condition. Virtualizzazione risultati (`@tanstack/react-virtual`, già approvato).
- Integrare il lavoro del branch in volo, non riscriverlo.

### FASE 6 — Image system *(P1)*
- Proxy `card_image_cache` come sorgente di rendering primaria; risolvere l'hotlink One Piece.
- **Pipeline asset SET** (`SOURCE → CANDIDATE → EXACT MATCH → CONFIDENCE → WRITE → VERIFY`), stessa filosofia delle card image: mai logo generico per somiglianza di nome; meglio nessuna immagine che una sbagliata; review queue.
- Estendere `image-taxonomy.js` / resolver a logo/symbol/artwork set.

### FASE 7 — UI/UX WOW *(P2)*
- Rebase + merge del branch `feat/ui-ux-image-price-overhaul`.
- Motion system coerente (GSAP dove porta valore reale), skeleton, transizioni immagini, hover, mobile. Niente motion decorativo.

### FASE 8 — Accessibility CI *(P2)*
- `axe-core`/`playwright` in GitHub Actions, verificato davvero (no CI teorica). Keyboard nav, focus, contrast, ARIA, semantic markup.

### FASE 9 — Audit finale performance / SEO / regressioni *(P3)*

---

## 7. Decisioni che richiedono input di Ermal (non bloccanti)

Procedo in autonomia su tutto il resto. Queste due sono genuinamente di prodotto/business:

1. **apitcg.com — uso commerciale.** Se in Fase 0 il ToS risulta vietare l'uso commerciale, la scelta è: (a) fallback su one-piece-api.com + optcgapi + scraping controllato di `onepiece-cardgame.com` (più fragile), oppure (b) contattare apitcg per una licenza. Ti chiederò solo se il ToS è effettivamente ostativo.
2. **Branch `feat/ui-ux-image-price-overhaul-2026-09-02`.** Raccomandazione: **non** mergiarlo ora, trattarlo come input di Fase 5/7, rebasarlo dopo Fase 1–2. Se preferisci mergiarlo subito su main (per non perdere i fix search/immagini OP JA), dimmelo e lo integro come Fase 0.5 con QA dedicato.

---

## 8. DraGold vNext — fotografia baseline (2026-09-02) e target

| Metrica | Baseline oggi | Target fine roadmap |
|---|---|---|
| Catalog freshness (Pokémon EN) | Set nuovi entro giorni ma senza priorità | set nuovo EN in DB ≤ 48h dalla disponibilità upstream |
| Catalog freshness (One Piece) | 🔴 OP-17 mancante da ~2 mesi; 0 carte/30gg | ≤ 72h dalla disponibilità apitcg |
| **Released but missing** (set) | ignoto — nessun detector attivo | KPI monitorata, giornaliera, target → 0 per Pokémon+OP EN/JA |
| Released but missing (carte/promo) | ignoto | KPI monitorata |
| Set coverage con release date reale | **0%** | ≥ 95% Pokémon+OP |
| Set image accuracy | n/d (nessuna pipeline) | pipeline con confidence, 0 falsi positivi |
| Image coverage carte (Pokémon EN) | ~99,8% URL / 98 senza immagine | 100% servite da proxy |
| Image coverage carte (One Piece) | 99% URL ma **rendering rotto** (hotlink) | 100% servite da proxy |
| Card canonicalization | 8.827 carte (4,3%) senza canonical | < 1% |
| **Price coverage** (carte con osservazione ≤30gg) | **69 / 203.384 (0,03%)** | ≥ 60% Pokémon+OP EN/JA |
| **Valuation coverage** (`market_valuations`) | 0 (tabella non esiste) | ≥ 50% carte priorità con confidence esplicita |
| Market history | `price_history` vuota | `market_observations` append-only + storico carta/portfolio |
| Portfolio | lista + valore stale | overview + performance + confidence + insight su dati freschi |
| Search latency | non misurata | p95 < 150ms, cancellation, no race |
| Test | `node:test` su reconcile/sync/image; niente Vitest UI | + Vitest su valuation, resolver, search, portfolio, set-state |
| Build | Vite OK | invariato |
| CI | sync workflow attivi; niente freshness/a11y CI | + `catalog-freshness.yml` + a11y CI verificati |
| Security | RLS attivo, hardening recente; **JWT service_role hardcoded nel cron `check-alerts`** | secret, nessun segreto in chiaro |

---

## 8.bis — FASE 0: risultati validazione fonti (2026-09-02, chiamate reali)

| Fonte | Verificato | Esito |
|---|---|---|
| **TCGdex** set detail (`/v2/en/sets/me05`) | `releaseDate` (`2026-07-17`), `cardCount` (total/official/holo/reverse/normal), `logo`, `symbol`, `serie` (id+name) | ✅ Copre tutto ciò che serve per `sets` v2. Primaria Pokémon confermata. |
| **TCGCSV** — One Piece (`categoryId 68`) | `groups` → 87 set con `publishedOn` (incl. **OP-17** `2026-08-28`, **OP-18** `2026-11-20`, EB-05, SD01, release-event cards); `products` → `name`, `imageUrl` (CDN TCGplayer), `extendedData` (`Number`=`OP17-020`, `Rarity`, `Color`, `Power`, `Cost/Life`); `prices` → `marketPrice`/`low`/`mid`/`high` per `productId` × `subTypeName` (Normal/Foil) | ✅✅ **Oltre le attese.** Copre catalogo OP (set + carte con numero/rarità/immagine) **e** prezzi, in un'unica fonte free, no-key, daily (~20:00 UTC). |
| **TCGCSV** — Pokémon (`categoryId 3`) + Pokémon JP (`85`), Magic (`1`), YGO (`2`) | stessa struttura | ✅ Base prezzi multi-TCG a costo zero. |
| **apitcg.com** | base `https://apitcg.com/api`, auth `x-api-key`, repo dati `one-piece-tcg-data` (13★, ultimo update GitHub 2026-05-12); docs JS-rendered non fetchabili headless | 🟡 Non completamente validata (ToS, rate limit). **Retrocessa a secondaria** per enrichment immagini ufficiali / JA. Non più necessaria per sbloccare la freshness. |
| **optcgapi.com** | ferma a OP-12 | ❌ Scartata come primaria (confermato). |
| **eBay Browse API** | non ancora testata (richiede credenziali) | ⏳ Fase 2. |

**Decisione aggiornata (sostituisce §5.1/§5.2 per One Piece):**
la **primaria One Piece per catalogo-freshness e prezzi è TCGCSV** (`categoryId 68`), non apitcg. Motivi: unica fonte verificata end-to-end che dà set + carte + prezzi + release date, free, no-key, aggiornata il giorno stesso dell'uscita (OP-17 group pubblicato il 2026-08-28). Il knowledge-graph "ufficiale" (nomi JA, illustrator, testo carta) resta da arricchire con apitcg/scraping controllato in una fase successiva — ma la **presenza** della carta nel catalogo e il suo **valore** non aspettano quello.

Il Release Monitor userà quindi come *source catalog* di riferimento:
- Pokémon EN/JA → TCGdex
- One Piece EN → TCGCSV `categoryId 68`
- (Pokémon prezzi → TCGCSV `3`/`85`; One Piece prezzi → TCGCSV `68`)

---

## 9. Prossimo passo immediato

**Fase 0**, in questo ordine:
1. Branch `feature/catalog-freshness-monitor`.
2. Validazione fonti (apitcg / TCGCSV / eBay Browse) con chiamate reali documentate.
3. `fetch-apitcg.js` + `catalog-freshness.yml` dry-run.
4. Primo report "Released but missing" reale → lo invio come artifact.

Poi Fase 1a (migration `sets` v2) e a seguire, senza attendere conferme su dettagli tecnici.
