# DraGold → AI-native TCG Intelligence Platform — Audit & Architettura

> **Autore:** agente Principal Architect / Product Engineer
> **Data:** 2026-09-03
> **Scope:** audit tecnico/prodotto + architettura target per l'evoluzione verso "The AI Intelligence Layer for TCG collectors". **Nessun file modificato, nessuna migration creata.**
> **Metodo:** verifica live su Supabase (`pimwkmwrduqkaydyvxqz`, ~30 query), lettura di 34 migration versionate, 14 workflow GitHub, 4 cron Supabase, 9 edge function, 8 endpoint `/api`, codice reale di `src/` e `scripts/`, e i 9 documenti di `docs/plans/` + i planning doc storici. Le fonti dati esterne non sono state ri-validate (già coperte da `docs/plans/2026-09-02-*` e `docs/data/SOURCE_COVERAGE_AND_INGESTION_MAP.md`, ≤ 2 giorni fa).

---

## 1. Executive assessment

DraGold **non è un progetto da zero**: è un'app pre-lancio con un catalogo TCG serio (203.863 carte) e — cosa che il brief non dà per scontata — **un motore di valutazione di mercato già costruito, testato e in produzione da 24 ore** (PR #16/#17/#18 mergiate su `main` il 2026-09-02). Il brief descrive un "Market Intelligence Engine" da progettare: il 70% di quel motore esiste già.

Stato verificato oggi:

| Layer | Stato reale (2026-09-03) |
|---|---|
| Catalogo carte | ✅ 203.863 carte (Pokémon 156.322 · One Piece 5.694 · MTG 27.475 · YGO 14.372). Sync Pokémon giornaliero (TCGdex). One Piece sbloccato via TCGCSV, OP-17 dentro. |
| Canonicalizzazione | 🟡 `canonical_cards` 88.292 righe. **9.306 carte (4,6%) senza `canonical_card_id`**. |
| Knowledge Graph "esplicito" | 🔴 Solo `cards` + `canonical_cards` + `rarities`. `character`, `illustrator`, `series` sono **colonne di testo libero**, nessuna tabella-entità, nessuna dedup. `sets` (1.668 righe) è inutilizzabile: `released_at` NULL al 100%, join a `cards` per `ilike` sul nome. |
| Market Valuation | ✅ **`market_valuations` — 6.706 carte valutate**, tutte con `estimated_value` + `confidence` + `confidence_reason` JSONB spiegabile. Motore puro, testato (567 test scripts verdi). |
| Market history | ✅ `market_observations` append-only, **20.117 osservazioni** con `price_eur` + `fx_rate`. `fx_rates` da BCE (Frankfurter). |
| Fonti prezzo attive | 🟡 **Una sola**: TCGCSV (market price TCGplayer, 1×/giorno, free, no-key). Confidence quindi **cap a `medium`** per design. eBay Browse API integrato (`api/live-market.js`) ma solo annunci attivi. |
| Portfolio | ✅ Consuma `market_valuations` via RPC (`portfolio_valuations`, `portfolio_value_history`). Confidence per posizione, sezione "non valutate", nessun badge "High" (onesto). |
| Catalog freshness monitor | ✅ `catalog_gaps` + `catalog_freshness_runs` + workflow giornaliero. Ha rilevato e risolto OP-17 da solo. |
| Immagini | 🟡 Proxy `card_image_cache` (5.195 righe) + `api/cache-image.js`. One Piece EN appena migrato a Bandai ufficiale (PR #22). Nessuna pipeline asset per i **set**. |
| **AI / LLM** | 🔴 **Zero.** Nessuna libreria, nessun endpoint, nessuna dipendenza Anthropic/OpenAI. Nessun Python nel repo. |
| **Utenti** | 🔴 **~0.** 3 profili, 1 collezione (66 carte), 5 righe `academy_progress`, 7 alert, 0 post. **Pre-lancio.** |

Lo stack: React 18 + Vite 5, Supabase (Postgres 17), Vercel (serverless Node in `/api`), niente TypeScript, niente state library. Home "Atlas" WebGL (three.js + GSAP + Lenis).

**Il fatto dominante per ogni decisione: DraGold non ha ancora utenti.** Questo rende la direzione "AI-native" legittima da esplorare *e* impone che la prova costi poco. Non stiamo rischiando di rompere un prodotto vivo; stiamo scommettendo il prossimo mese di lavoro su un'ipotesi non validata.

---

## 2. Is this product direction worth pursuing?

**Sì, condizionatamente — ed è un cambio di rotta esplicito che Ermal deve possedere, non un'estensione naturale.**

### A favore

1. **La domanda utente è reale.** "Quanto vale il mio Charizard ex 199/165?" è il primo pensiero di ogni collezionista. Nessun competitor la risolve con una conversazione: TCGplayer/Cardmarket sono cataloghi con prezzi, non assistenti.
2. **La base dati c'è.** Un agente ha bisogno di strumenti che restituiscano dati affidabili con provenienza. DraGold ha già: ricerca carte canonica, `market_valuations` con `confidence_reason` spiegabile, `market_observations` storiche, live market eBay. Un agente è un *layer di orchestrazione* sopra questo, non una nuova infrastruttura.
3. **L'onestà sui dati è già codificata.** Il motore di valutazione non inventa mai un prezzo (`estimated_value = null` se 0 osservazioni), il cap a `medium` con una fonte sola è esplicito, ogni riga porta il breakdown. Un agente costruito sopra eredita questa disciplina — è il differenziatore difendibile ("l'AI che non si inventa i prezzi").
4. **Costo di ingresso basso.** Non serve un modello proprio, non serve fine-tuning, non serve RAG nella v1. Serve *tool calling* contro API che in gran parte esistono.

### Contro / rischi strategici

1. **Contraddice `PRODUCT_SPEC.md` (approvato da Ermal il 2026-08-05).** La spec dice testualmente: DraGold è "il knowledge graph dei TCG ... più un layer di collezione"; "Non è più: cerca prezzo → aggiungi a portfolio → ricevi alert"; pricing/portfolio/alert sono "**Archived / Future Modules**". `CLAUDE.md §1` rinforza: "pricing, alert e portfolio avanzato sono moduli Future/Archived, non il core". **Questo brief inverte quella priorità.** È una decisione di prodotto legittima ma va presa consapevolmente e la spec va aggiornata, non aggirata.
2. **Nessuna validazione di mercato.** 0 utenti = 0 evidenza che i collezionisti vogliano *parlare* con un tool invece di cercarlo. L'ipotesi "conversational-first" è forte e non testata.
3. **Il costo per query è ricorrente e scala con l'uso.** A differenza di un catalogo statico (costo marginale ~0), ogni domanda AI costa $0,005–0,05. Con utenti reali e nessun paywall, il conto sale linearmente. La monetizzazione non è un "poi", è parte del design.
4. **Data quality debt non risolto.** 9.306 carte non canonicalizzate, `me4`/`me04` (~20k righe duplicate), `sets` rotta, `character`/`illustrator` non normalizzati. Un agente che sbaglia a identificare la carta è peggio di nessun agente. **L'accuratezza dell'identificazione carta è il gate assoluto.**

### Verdetto di direzione

**BUILD BUT CHANGE DIRECTION** — vedi §22 per la formulazione completa. In sintesi:
- **Completa il Market Intelligence Engine** (è a metà, 2-3 fonti mancanti) — vale comunque, con o senza agente.
- **Costruisci l'agente come MVP sottile** (un endpoint, tool esistenti) — non un servizio Python, non una rearchitettura, non "Ask DraGold come homepage".
- **Non abbandonare KG/Academy/Collection.** L'agente li *usa* come tool e li rende scopribili; non li sostituisce.
- **Aggiorna `PRODUCT_SPEC.md`** per riflettere la nuova gerarchia: "TCG Intelligence (KG + valuation + AI) + Collection + Academy".

---

## 3. What should DraGold become?

**"The honest TCG intelligence layer"** — un posto dove chiedi qualsiasi cosa su una carta (identità, valore, storia, differenze linguistiche, cosa ti manca) e ottieni una risposta *con le fonti e la confidenza in chiaro*, oppure un onesto "non lo so".

Tre superfici, una spina dorsale dati:

```
                    ┌─────────────────────────────────────────┐
                    │  ASK DRAGOLD  (conversational entry)     │  ← nuovo, sottile
                    │  "quanto vale…", "cosa mi manca…"        │
                    └───────────────┬─────────────────────────┘
                                    │ tool calls
   ┌────────────────────────────────┼────────────────────────────────┐
   │                                │                                │
┌──▼───────────┐          ┌─────────▼──────────┐          ┌──────────▼─────────┐
│ KNOWLEDGE     │          │ MARKET INTELLIGENCE│          │ COLLECTION          │
│ GRAPH         │          │ ENGINE             │          │ + PORTFOLIO         │
│ (Explore/SEO) │          │ (valuations,       │          │ (progress, value,   │
│ card/set/     │          │  observations,     │          │  gaps, movers)      │
│ character/    │          │  live market,      │          │                     │
│ illustrator   │          │  history)          │          │                     │
└──────────────┘           └────────────────────┘          └────────────────────┘
                    ┌─────────────────────────────────────────┐
                    │  ACADEMY  (quiz/XP/curiosità)           │  ← invariato, si aggancia alle entità
                    └─────────────────────────────────────────┘
```

L'agente non è "una chat in fondo alla pagina": è un **secondo modo di navigare lo stesso grafo** — linguaggio naturale invece di filtri. Ogni risposta dell'agente linka alle pagine di entità reali (SEO) e alle azioni reali (add to collection, view on eBay).

---

## 4. Current architecture audit

### 4.1 Frontend

- **`src/DraGold.jsx`** — 455 righe. **È diventato un orchestratore** (era un monolite): stato globale (auth, tab, valuta, sets map), routing via History API (`/explore`, `/collection`, `/alerts`, `/search`, `/`), composizione di `HomePage` / `AssetView` / `SetDetailPage`. Coerente con `CLAUDE.md §5`.
- **`src/DraGold.legacy.jsx`** — congelato, non toccato.
- **`src/pages/`** — modularizzato per dominio: `home/` (Atlas WebGL: `webgl/AtlasScene.jsx`, `FoilMaterial.js`, `HeroCard.jsx`, …), `card/` (`CardPage.jsx` — bundle pubblico SEO separato, canonical + JSON-LD + OG), `card-id/` (micro-prodotto `/card/:id`), `portfolio/` (`PortfolioView.jsx` + `CollectionIntelligence.jsx` + `ConfidenceBadge.jsx` + `PortfolioBreakdown.jsx` — consuma `market_valuations`), `academy/`, `set/`, `illustrator/`, `alerts/`, `auth/`, `legal/`.
- **`src/lib/`** — `search.js` (ranking client-side + `groupByCanonical`), `state.js` (shared state rule), `portfolio/` (5 moduli puri: `valuation.js`, `insights.js`, `history.js`, `confidence.js`, `unavailableReason.js`), `auth.js` (AuthProvider), `tcgConfig.js`, `ebayLinks.js` (EPN).
- **`src/components/`** — `shell/` (`SiteHeader`, `CommandSearch`, `Preloader`), `search/`, `asset/` (`AssetView`), `shared/`.
- **Deps:** React 18.3, Vite 5.4, `@supabase/supabase-js` 2.45, `@tanstack/react-virtual` 3.14, GSAP 3.15 + `@gsap/react`, `lenis`, `three` 0.169 + `@react-three/fiber`/`drei`, `sharp` (build), `node-html-parser` (scripts). **Niente TS, niente Redux/Zustand, niente AI.**
- Bundle: `AtlasCanvas` 838 KB (WebGL, lazy), `DraGold` 174 KB, `index` 381 KB. Warning chunk-size pre-esistente.

### 4.2 Backend / API (`/api`, Vercel serverless Node)

| Endpoint | Funzione |
|---|---|
| `api/live-market.js` | **Live Market** — eBay Browse (annunci attivi) per `cardId`, marketplace-aware. Non scrive valutazioni. |
| `api/ebay-search.js` | eBay Browse per query libera + `market`. Cache `s-maxage=900`. |
| `api/_lib/ebay.js` | OAuth client-credentials + `MARKETPLACE_MAP` (condiviso). |
| `api/cache-image.js` | Proxy immagini: fetch → WebP (`sharp`) → Supabase Storage → `card_image_cache`. Auth `x-internal-key`, host allow-list. |
| `api/img.js` | Proxy read-only CORS per texture WebGL, host allow-list. |
| `api/scan-images.js` | Batch scan copertura immagini. |
| `api/delete-account.js` | GDPR. |
| `api/sitemap-*.js` | Sitemap dinamiche (cards / illustrators / sets). |
| `middleware.js` (root) | 41 KB — edge middleware (redirect, SEO paths). |

### 4.3 Database (Supabase, Postgres 17.6)

**30 tabelle.** Le rilevanti:

- **`cards`** (203.863, 24 col) — riga per (tcg, lang, print). `id` = `<tcg>:<source>:<source_id>:<lang>`. `canonical_card_id` FK. `card_number_norm` (colonna generata). `metadata` jsonb. `illustrator`/`series_id`/`series_name`/`evolves_from` **testo libero**. RLS public-read.
- **`canonical_cards`** (88.292, 9 col) — `slug` (target SEO), `primary_image_card_id`. Unique `(tcg, set_id, card_number)`.
- **`market_observations`** (20.117, 14 col) — append-only. `source`, `kind` (`market`/`listing`/`sold`), `price`, `currency`, `price_eur`, `fx_rate`, `observed_at`, `raw` jsonb. Indici su `(card_id, observed_at desc)`, `canonical_card_id`, `source`.
- **`market_valuations`** (6.706, 18 col) — PK `(card_id, currency)`. `estimated_value`, `observed_low/median/high`, `n_observations`, `n_sources`, `sources[]`, `trend_7d/30d_pct`, `confidence` (`high|medium|low|none`), `confidence_score`, `confidence_reason` jsonb, `computed_at`. **Distribuzione: 6.706 medium, 0 high (1 fonte), 0 none.**
- **`fx_rates`** (PK `as_of, quote`) — Frankfurter/BCE.
- **`card_prices`** (11 col) — legacy snapshot, congelata (`PRODUCT_SPEC §4`), letta ancora da UI vecchia.
- **`price_history`** (8 col) — **vuota, schema legacy incoerente**. Da non riparare.
- **`collection`** (66 righe, 22 col!) — `card_api_id` (text, no FK), `quantity`, `condition`, `purchase_price`, `is_wishlist`, denormalizzazioni immagine/nome. RLS per-utente.
- **`catalog_gaps`** (14 righe, 4 non risolte) — "released but missing" + sync queue in una tabella. `status` (`missing→queued→syncing→resolved`).
- **`catalog_freshness_runs`** (7) — storico KPI.
- **`card_image_cache`** (5.195) — proxy immagini.
- **`sets`** (1.668, 7 col) — **`released_at` NULL 100%**, `synced_at` = 2026-06-08 per tutte, nomi troncati. `id` = ID esterno TCG Price Lookup. Inutilizzabile.
- **`set_logos`** (345) — loghi/simboli, chiave `set_code+tcg`, `release_date` come **testo**.
- **`hot_picks`** (238) — trending, cron giornaliero.
- **`alerts`** (7) / `alert_notifications` — soglie prezzo, cron 15min.
- **`academy_progress`** (5) — XP/streak.
- Social: `posts` (0), `comments`, `likes`, `followers`, `binders`, `blog_posts` — scaffolding, non usati.
- `profiles` (3), `watchlist` (9), `card_submissions`, `newsletter`, `ebay_clicks` (0), `api_call_log`, `price_sources` (11 config).

**RPC rilevanti:** `search_cards` / `suggest_cards` (trigram GIN), `portfolio_valuations(text[])`, `portfolio_value_history(text[], int)`, `set_identity_key(text)`, `collection_decrement`.

### 4.4 Pipeline dati (cron + GitHub Actions)

**Supabase cron:** `refresh-prices-6h` (attivo, ma vedi §12), `compute-hot-picks-daily`, `dragold-alert-checker` (*/15), `bulk-import-weekly` (off).

**GitHub Actions (14):** `sync-cards.yml` (Pokémon TCGdex, daily 03:00), `market-valuation.yml` (daily 05:30: `ingest-fx` → `ingest-market-tcgcsv` → `compute-valuations`), `catalog-freshness.yml`, `image-audit.yml`, `enrich-cards.yml` (*/2h, solo EN), `sync-onepiece-ja.yml`, `cache-*-images.yml`, `deploy-edge-functions.yml`, `tests.yml`, ecc.

**Edge functions (9):** `refresh-prices` (v14 deployata ≠ file su disco — vedi §12), `check-alerts`, `compute-hot-picks`, `fetch-ebay-prices`, `bulk-import-{pokemon,mtg,ygo}`, `sync-sets` (deprecata).

### 4.5 Debito tecnico noto (dai doc + verificato)

1. **`me4`/`me04` set-id duplication** — ~20.479 righe `pokemon:ptcg:*` con spelling non-padded, 26 gruppi di collisione. 0 impatto su valuation (verificato), impatto su collection/watchlist/alerts. Fix = migration Fase 1.x.
2. **9.306 carte senza `canonical_card_id`** — blocca pagine entità aggregate.
3. **`sets` non recuperabile** — va ricostruita da fonti autoritative con schema nuovo.
4. **`refresh-prices` divergenza repo↔prod** — il file su disco usa la eBay Finding API (morta). Non deployare.
5. **`character`/`illustrator`/`series` non normalizzati** — testo libero, no dedup, no pagine pulite.
6. **`card_prices` doppio-write** da `sync-onepiece.js` (`source='tcgcsv'`) — ridondante con `market_observations`.

---

## 5. Proposed target architecture

Principio: **massimo riuso, minimo nuovo runtime.** Un solo servizio nuovo (l'endpoint agente), sullo stesso Vercel, stesso linguaggio (Node/JS), stesso DB.

```
┌───────────────────────────────────────────────────────────────────┐
│ CLIENT (React SPA, invariato + 1 nuova superficie "Ask")           │
└────────────┬──────────────────────────────────────┬───────────────┘
             │ REST                                  │ REST
┌────────────▼────────────┐            ┌─────────────▼─────────────────┐
│ /api/ask  (NUOVO)       │            │ /api/live-market, /api/*      │
│ Vercel serverless Node  │            │ (esistenti)                   │
│ Anthropic SDK tool-     │            └───────────────────────────────┘
│ runner, structured out  │
│  tools ──────────────┐  │
└──────────────────────┼──┘
                       │ (in-process, stessa lambda — i tool sono funzioni JS)
      ┌────────────────┼────────────────────────────────┐
      ▼                ▼                ▼                ▼
┌───────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────────┐
│ Supabase  │  │ Supabase RPC │  │ eBay Browse│  │ (v2) web     │
│ REST      │  │ search_cards │  │ via /api   │  │ research     │
│ (tables)  │  │ portfolio_*  │  │ live-market│  │ (server tool)│
└───────────┘  └──────────────┘  └────────────┘  └──────────────┘
                       ▲
      ┌────────────────┴────────────────────────────────┐
      │ MARKET INTELLIGENCE PIPELINE (batch, invariato + esteso) │
      │ GitHub Actions daily:                                    │
      │  ingest-fx → ingest-market-{tcgcsv,cardmarket,justtcg}   │
      │             → compute-valuations → market_valuations     │
      └─────────────────────────────────────────────────────────┘
```

**Cosa NON cambia:** stack, DB engine, deploy, il modello `cards`/`canonical_cards`, la pipeline valutazione (si estende, non si riscrive).

**Cosa si aggiunge:**
1. `/api/ask` — un endpoint serverless, ~1 file, Anthropic SDK.
2. `scripts/ingest-market-cardmarket.js` + `scripts/ingest-market-justtcg.js` — 2 nuovi ingestor nella pipeline esistente (stesso pattern di `ingest-market-tcgcsv.js`, scrivono `market_observations`).
3. `agent_queries` — 1 tabella nuova per observability/cost (opzionale in MVP, vedi §9).

**Servizio Python separato: NO** (vedi §22). La pipeline batch è già Node, gira su GitHub Actions, scrive Supabase. Un servizio Python aggiungerebbe: un secondo linguaggio, un secondo deploy target, un secondo set di dipendenze, un confine di rete in più — per zero capacità che Node non abbia. Il pattern "SOURCE → NORMALIZE → MATCH → VALIDATE → OUTLIER → PRICE → CONFIDENCE → HISTORY → SUPABASE" del brief **è già implementato** in `scripts/lib/valuation/` in JS puro e testato.

---

## 6. Market Intelligence architecture

### 6.1 Cosa esiste (non ridisegnare)

Pipeline attuale, verificata:

```
TCGCSV (categoryId 68 One Piece, 3 Pokémon)
  → scripts/ingest-market-tcgcsv.js
      · match esatto per card_id  OR  match per (set, card_number_norm) — mai forzato
      · skip varianti One Piece (detectPrintVariant)
      · collapseByNumberDuplicates (tiene la stampa base)
  → market_observations  (kind='market', price + price_eur via fx_rates)
  → scripts/compute-valuations.js
      · computeValuation() [puro, scripts/lib/valuation/valuation.js]
      · weighted median (recency half-life ~14g), primary sub_type, no blend finish
      · confidence rubric a 4 componenti (sources·obs·recency·agreement), confidence_reason JSONB
  → market_valuations  (upsert per card_id+currency)
```

Qualità: 20/20 test `valuation.test.js`, 14/14 `confidence.test.js`, casi outlier (placeholder TCGplayer, blend varianti, range collassato) già identificati e fixati in Fase 2.1.

### 6.2 Cosa manca — le fonti

**Il problema non è l'architettura, è che c'è una fonte sola.** `confidence` è cappata a `medium` per tutti i 6.706. Serve corroborazione.

| Fonte | Priorità | Cosa aggiunge | Come |
|---|---|---|---|
| **Cardmarket** | **P0** | Prezzi EU reali (utenti DraGold = EU). Già in `price_sources`, già presente storicamente in `card_prices`. | Cardmarket non ha API pubblica libera → via il feed che pokemontcg.io/Scrydex espone (`cardmarket.prices`) per Pokémon; per One Piece via TCGCSV EU se disponibile, altrimenti gap dichiarato. Nuovo `scripts/ingest-market-cardmarket.js`, scrive `market_observations` `source='cardmarket'`. |
| **JustTCG** | **P1** | Real-time, condition-specific, free tier senza carta. | `scripts/ingest-market-justtcg.js`, `source='justtcg'`, `condition` popolato. |
| **eBay sold** (via `fetch-ebay-sold` edge fn esistente) | **P1** | L'unico dato "sold" reale. Oggi 50 carte in `card_prices`, non in `market_observations`. | Riconciliare `refresh-prices` v14 (§12) per scrivere anche `market_observations` `kind='sold'`. |
| **eBay Browse** (attivo) | già fatto | "Cosa offre il mercato ORA" — non una valutazione. | `api/live-market.js`, on-demand, `kind='listing'` se `?record=1`. Non alimenta `high`. |
| Scrydex | fallback a pagamento | Metadata + prezzi multi-lingua. | Solo se budget esplicito. `price_sources` ha già free tier 1000/mese. |

**Con Cardmarket + eBay-sold aggiunte:** le carte con ≥2 fonti indipendenti possono raggiungere `high`. La rubrica è già pronta (`sources` component = `min(n/3, 1)`).

### 6.3 Frequenza di aggiornamento — proposta

Il brief chiede 3/6/12/24h ma dice di proporre. **Proposta: cadenza differenziata per "temperatura" della carta, non uniforme.**

| Segmento | Frequenza | Perché |
|---|---|---|
| **Full recompute** (tutte le carte con osservazioni) | **1×/giorno** (05:30 UTC, dopo TCGCSV ~20:00 UTC prev day) | TCGCSV si aggiorna 1×/giorno. Ri-computare più spesso della fonte è spreco. Già così in `market-valuation.yml`. |
| **Hot cards** (top 500 per view/collection/hot_picks + carte in una collection utente) | **ogni 6h** — eBay Browse spot + JustTCG | Le carte che gli utenti guardano meritano un range "as of oggi" più fresco. Riusa la logica di `refresh-prices` v14 (che già seleziona `collection ∪ watchlist ∪ hot_picks top 200`). |
| **Live** (una carta, on-demand da agente o card page) | **real-time** | `api/live-market.js` — mai salvato come "valuation", solo mostrato. |
| **FX** | **1×/giorno** | Frankfurter/BCE pubblica 1×/giorno feriale. Già così. |

Regola: **la valutazione salvata (`market_valuations`) si aggiorna al ritmo della fonte più lenta che la alimenta (giornaliero). Il "prezzo di adesso" è un layer separato, on-demand, non persistito come stima.** Questo è già il design del brief ("Cached Market Intelligence" vs "Live AI Research") — è già implementato correttamente.

### 6.4 Outlier detection & validation — esiste, va rinforzata

Già nel motore: `isPlaceholderObservation` (scarta `low==mid==high && ≥€1000`), `primarySubtypeObservations` (no blend finish), dedupe `(source, sub_type, day)`, cap valore-alto-senza-corroborazione.

Da aggiungere quando ci sono ≥2 fonti: **cross-source outlier** — se una fonte devia >3× dalla mediana delle altre, escludila dal `weighted median` e loggala in `confidence_reason.excluded`. Puro, testabile, ~30 righe in `valuation.js`.

---

## 7. AI Agent architecture

### 7.1 Framework — decisione

**Anthropic SDK (`@anthropic-ai/sdk`) + Tool Runner (`client.beta.messages.toolRunner`), su Vercel serverless Node. Niente framework di orchestrazione (LangChain/LlamaIndex/etc.).**

Perché:
- Lo stack è già JS. `@anthropic-ai/sdk` è una dipendenza, non un runtime.
- Il Tool Runner gestisce il loop `request → execute tool → loop` con hook per-turno (approval gate, logging, retry, cache_control sui risultati) — è esattamente il loop del brief ("agent loop") senza scriverlo a mano.
- LangChain aggiungerebbe ~40 dipendenze transitive, un'astrazione sopra l'astrazione, e lock-in, per zero valore su 5 tool.
- Structured output nativo (`output_config.format`) per la "answer card".

### 7.2 Modello

| Uso | Modello | Rationale |
|---|---|---|
| Agente principale (routing, tool calls, sintesi) | **`claude-sonnet-5`** ($2/$10 per MTok) | Query tipica: ~2-4k token input (system + tool schemas + tool results) + ~500 output. **~$0,01–0,02 per query.** Sonnet 5 gestisce tool calling e disambiguazione carte senza problemi. |
| Escalation (query ambigue, "perché vale così tanto", ricerca comparativa multi-carta) | **`claude-opus-5`** ($5/$25) — rilevata dall'agente stesso o da un flag | ~$0,04–0,08 per query. Solo quando serve ragionamento profondo. |
| (v2) sub-agente di ricerca web reading-heavy | `claude-haiku-4-5` | Se si aggiunge web research, il reading va su Haiku. |

Adaptive thinking (`thinking: {type: "adaptive"}`), `effort: "medium"` di default (`high` per escalation).

### 7.3 Tool surface — v1 (tutti read-only, tutti wrapper su codice esistente)

| Tool | Wraps | Input | Output (con provenienza) |
|---|---|---|---|
| `card_search` | RPC `suggest_cards` + `search.js` ranking + `groupByCanonical` | `query` (NL: "Charizard ex 199/165 Pokemon 151") | lista candidati: `canonical_card_id`, name, set, number, lang disponibili, `slug` |
| `card_lookup` | query `cards` + `canonical_cards` + `rarities` | `card_id` o `canonical_card_id` | anagrafica completa: set, numero, lingua, rarità, illustratore, `print_variant`, immagine |
| `card_valuation` | tabella `market_valuations` | `card_id`, `currency` | `estimated_value`, `observed_low/median/high`, `confidence`, **`confidence_reason`**, `sources[]`, `n_observations`, `trend_7d/30d_pct`, **`computed_at`** |
| `price_history` | RPC `portfolio_value_history` / `market_observations` | `card_id`, `days` | serie `[{as_of, price_eur}]` + `source`, `kind` per punto |
| `live_market` | `api/live-market.js` (internal fetch) | `card_id`, `market` (IT/DE/…) | `{listings, summary:{count, lowest, median, currency}}` — **etichettato "annunci attivi, non transato"** |
| `collection_lookup` | RPC collection (auth JWT dell'utente) | — (user dal token) | posizioni utente + `portfolio_valuations` join |
| `set_progress` | `collection` + `canonical_cards` per set | `set_id`, user | posseduti / totali / mancanti (lista) |

**v2 (dietro validazione):** `web_research` (server tool `web_search_20260209` con `allowed_domains` = cardmarket, tcgplayer, pricecharting) per "quanto vale *oggi*" quando `market_valuations.computed_at` è vecchio o `confidence='none'`. `knowledge_graph` (traversal character→cards, illustrator→cards) quando le entità sono normalizzate (§8).

### 7.4 Anti-allucinazione — regole hard

1. **L'agente non calcola prezzi.** Il system prompt vieta esplicitamente aritmetica sui prezzi. Ogni numero economico viene *da un tool result*, verbatim.
2. **Ogni output economico porta `source` + `computed_at`/`observed_at` + `confidence`.** La structured output schema lo *richiede* (`required: ["value", "currency", "confidence", "as_of", "sources"]`). Se un tool non li fornisce, l'agente non può compilare il campo → dice "dato non disponibile".
3. **`confidence: 'none'` o riga `market_valuations` assente → l'agente dice "non ho abbastanza dati di mercato per questa carta"** e (v2) offre `web_research`. Mai una stima inventata.
4. **Disambiguazione obbligatoria.** Se `card_search` ritorna >1 candidato plausibile con set/numero/lingua diversi, l'agente *chiede* quale, non indovina.
5. **Structured output per l'answer card** — niente prosa libera per i numeri. Un blocco `{card:{...}, valuation:{value, range, confidence, as_of, sources[], trend}, actions:[...]}`.
6. **Guardrail di dominio** — il system prompt limita lo scope a TCG/carte/collezione. Fuori scope → declина educato.

### 7.5 Loop, caching, observability

- **Loop:** Tool Runner `runner.untilDone()`. Max ~6 iterazioni (guardrail hard). Timeout lambda 60s (streaming per risposte lunghe).
- **Prompt caching:** system prompt + tool schemas (stabili) dietro `cache_control` → ~90% sconto sul prefisso dopo la prima query. Le tool result (volatili) dopo il breakpoint.
- **Observability:** ogni query → riga `agent_queries` (§9): `user_id`, `question`, `tools_called[]`, `tokens_in/out`, `cost_usd`, `model`, `latency_ms`, `resolved` (bool), `card_ids_referenced[]`. È il dato per capire se funziona e quanto costa.
- **Rate limiting:** per-utente (Supabase RLS + counter in `agent_queries`), es. 10 query/giorno free, 200/giorno pro. Anon: 3/giorno per IP (edge middleware).
- **Cost control:** hard cap mensile per utente free; alert se il costo aggregato giornaliero supera una soglia (l'utente ha 0 utenti oggi, ma il cap va progettato ora).

### 7.6 RAG — non nella v1

Il catalogo è strutturato e interrogabile con SQL/RPC. Un agente con `card_search` + `card_lookup` non ha bisogno di embedding. RAG diventa utile *solo* per: testo carte in linguaggio naturale ("carte che fanno pescare 2 carte"), contenuti Academy, storia dei set. → v3, e solo se emerge la domanda. `pgvector` è disponibile su Supabase quando servirà.

---

## 8. Knowledge Graph role

**Tutte e tre le cose, in quest'ordine di priorità:**

1. **Strumento dell'agente (P1)** — `card_search`/`card_lookup` sono già query sul grafo. Quando `character`/`illustrator` sono normalizzati: `knowledge_graph` tool per "carte simili", "altre carte di questo illustratore", "differenza EN/JA di questa carta".
2. **Sezione esplorabile / motore SEO (P1, già in roadmap)** — le pagine entità (`/pokemon/character/charizard`, `/one-piece/illustrator/...`) sono migliaia di pagine indicizzabili con contenuto reale. È il canale di acquisizione organico che compensa il costo per-query dell'agente.
3. **UI principale (P2)** — una vista grafo navigabile (Card → Set → Character → Variant → Language → Related → Market) è un differenziatore visivo forte ma non blocca nulla. Dopo che l'agente e le entità normalizzate esistono.

**Il KG non si tocca in negativo.** Il rischio è lasciarlo com'è (testo libero) e non poterci costruire sopra né l'agente né le pagine. **Prerequisito abilitante: normalizzare `character`, `illustrator`, `series` in tabelle-entità** (schema già progettato in `KNOWLEDGE_GRAPH_PROPOSAL.md §E`, mai implementato).

---

## 9. Database / schema changes

**Minimi. In ordine di necessità.**

### Necessari per l'MVP agente

- **`agent_queries`** (nuova) — observability + rate limit + cost.
  ```
  id bigint identity PK
  user_id uuid null            -- null = anon
  session_id uuid              -- raggruppa follow-up
  question text
  answer_summary text
  model text
  tools_called text[]
  card_ids_referenced text[]
  tokens_in int, tokens_out int, tokens_cached int
  cost_usd numeric
  latency_ms int
  resolved boolean             -- l'agente ha risposto vs "non lo so"
  created_at timestamptz default now()
  ```
  RLS: l'utente legge le proprie; service_role scrive. Indice `(user_id, created_at desc)`, `(created_at desc)`.

### Necessari per completare il Market Engine (non per l'agente)

- **Nessuna tabella nuova.** `market_observations` accetta già `source` arbitrario → Cardmarket/JustTCG/eBay-sold scrivono lì. `compute-valuations` li aggrega senza modifiche di schema.

### Abilitanti per KG / agente v2 (schema già progettato, non nuovo)

- `illustrators`, `characters`, `card_characters` (M:N), `series` — da `KNOWLEDGE_GRAPH_PROPOSAL.md §E`. `cards.illustrator_id`/`series_id` FK. **Task dedicato, non nell'MVP.**
- `sets` v2 — da `docs/plans/2026-09-02 §1a` (già progettata: `tcg`, `language`, `release_date DATE`, `status`, `logo_url`, `source_refs jsonb`). **Task dedicato.**

### Debito da chiudere prima di scalare l'agente

- `me4`/`me04` dedup (migration Fase 1.x già progettata in `phase2.1-hardening-RESULTS.md`).
- Backfill 9.306 `canonical_card_id` mancanti.

**Regola:** nessuna modifica a `cards`/`card_prices`/`collection`/`canonical_cards` schema per l'MVP. L'agente legge; non serve nuova struttura per leggere.

---

## 10. Data pipeline

Estensione della pipeline esistente, stesso pattern.

```
GitHub Actions (daily 05:30 UTC) — market-valuation.yml, esteso:
  1. ingest-fx.js                          → fx_rates              [esiste]
  2. ingest-market-tcgcsv.js --onepiece    → market_observations   [esiste]
  3. ingest-market-tcgcsv.js --pokemon     → market_observations   [esiste]
  4. ingest-market-cardmarket.js           → market_observations   [NUOVO]
  5. ingest-market-justtcg.js              → market_observations   [NUOVO]
  6. compute-valuations.js                 → market_valuations     [esiste, +cross-source outlier]

GitHub Actions (every 6h) — hot-refresh.yml [NUOVO, o estensione refresh-prices]:
  · select carte "hot" (collection ∪ watchlist ∪ hot_picks top 500 ∪ agent_queries last 7d)
  · eBay Browse spot + JustTCG → market_observations (kine='listing'/'market')
  · compute-valuations --only-hot

On-demand (agente / card page):
  · api/live-market.js → eBay Browse, non persistito

Catalog freshness (daily) — catalog-freshness.yml [esiste, invariato]:
  · TCGCSV/TCGdex diff → catalog_gaps → sync mirato
```

Nessun nuovo runtime. Nessun Python. Nessuna coda (Supabase `catalog_gaps.status` è già una coda; per l'agente non serve — è sincrono, request/response).

---

## 11. Marketplace / source analysis

Sintesi (dettaglio completo e verificato in `docs/plans/2026-09-02-dragold-vnext-audit-and-roadmap.md §5` e `§8.bis`, ≤ 2 giorni fa — **non ri-verificato oggi**, ma nulla è cambiato).

| Fonte | API? | Ufficiale? | Free tier | Rate limit | Sold vs listing | Geo | ToS commerciale | Qualità | Verdetto DraGold |
|---|---|---|---|---|---|---|---|---|---|
| **TCGCSV** | ✅ REST, no key | No (mirror TCGplayer) | ✅ totale | Nessuno pubblicato (1 dump/giorno) | **Market price** (né puro listing né sold — prezzo "di mercato" TCGplayer) | US (mercato EN) | Patreon-backed, uso tollerato; ToS non esplicito su commerciale | Alta per catalogo+prezzo base | ✅ **Primaria** (già in uso). Copre catalogo + prezzi + release date. |
| **Cardmarket** | 🟡 API "MKM" esiste ma OAuth + approvazione + non-free per volume; feed prezzi via pokemontcg.io/Scrydex | Sì | Via terzi | — | Trend + low + avg (listing-derived) | **EU** | API ToS restrittiva; il feed via pokemontcg.io è zona grigia | Alta per EU | 🟡 **P0 secondaria** via feed pokemontcg.io/Scrydex (`cardmarket.prices`). No integrazione MKM diretta nella v1. |
| **eBay Browse API** | ✅ REST, OAuth client-credentials | Sì | ✅ 5.000 call/giorno free | 5k/giorno | **Listing attivi** (non sold) | Multi (marketplace per paese) | ✅ consentito con EPN | Media (annunci, non transato) | ✅ **Live Market** (già integrato, `api/live-market.js`). Non alimenta valutazione. |
| **eBay Marketplace Insights** (sold) | ✅ REST | Sì | ❌ **gated a partner enterprise** | — | **Sold reali** | Multi | Solo partner | Alta | ❌ **Non disponibile.** Non richiedibile a livello DraGold. |
| **eBay Finding API** (sold, legacy) | era ✅ | Sì | — | — | Sold | Multi | — | — | ❌ **Deprecata/spenta** (403 dal 2025). Il codice su disco in `refresh-prices/index.ts` la usa ancora — **fossile, non deployare.** |
| **JustTCG** | ✅ REST, key free senza carta | No | ✅ free tier | Basso ma sufficiente per hot-refresh | Listing real-time, condition-specific | US-centric | Da verificare | Media | 🟡 **P1 secondaria.** Utile per `condition`. |
| **Scrydex** (ex pokemontcg.io) | ✅ REST, key | No (ex-community, ora commerciale) | 1.000/mese free (già in `price_sources`) | A crediti | Market (aggrega TCGplayer/Cardmarket) | US+EU | Prodotto commerciale, ToS proprio | Alta | 🟡 **Fallback a pagamento.** Solo con budget. Utile per metadata multi-lingua e come 3ª fonte. `pokemontcgio` v2 storico: 85% fail, morto. |
| **PriceCharting** | 🟡 API a pagamento | No | ❌ | — | Sold (graded + raw) | US | Commerciale | Alta per graded | ⚪ Fuori scope v1. Rilevante se DraGold aggiunge grading PSA/BGS. |
| **PokéPrice / PokeData / TCGdx prices** | vari | No | vari | — | misti | — | vari | Bassa/media | ⚪ Nessuno supera TCGCSV+Cardmarket per il caso d'uso. |
| **TCGdex** (dati, non prezzi) | ✅ REST, no key, MIT | No (community) | ✅ | Nessuno | — (no prezzi) | Multi-lingua | ✅ MIT sui dati | Alta | ✅ **Primaria catalogo Pokémon** (già in uso). |

**Open-source / dataset:** `PokemonTCG/pokemon-tcg-data` (snapshot, no licenza esplicita — solo cross-check offline). Nessun dataset prezzi OSS affidabile e aggiornato esiste.

**Conclusione:** la strategia fonti è già decisa e corretta. Il lavoro è **aggiungere Cardmarket (via feed) + eBay-sold (via `fetch-ebay-sold` già esistente) al pipeline** per rompere il cap `medium`. Non serve nessuna fonte nuova non ancora valutata.

---

## 12. API vs scraping strategy

**Regola: scraping solo dove non esiste alternativa API/feed, e solo per dati non-prezzo, con rate limit conservativo e User-Agent onesto.**

| Dato | Metodo | Note |
|---|---|---|
| Catalogo Pokémon | **API** TCGdex | — |
| Catalogo + prezzi One Piece | **API** TCGCSV | — |
| Prezzi Pokémon (market + cardmarket) | **API/feed** TCGCSV + pokemontcg.io/Scrydex | — |
| Live market | **API** eBay Browse | — |
| FX | **API** Frankfurter | — |
| **Immagini ufficiali One Piece** | **scraping deterministico** `onepiece-cardgame.com` per `<card_number>.png` | Già fatto (PR #22). URL deterministico, non parsing HTML. Nessun'altra fonte ha le immagini OP. |
| Nomi JA / illustrator / testo carta One Piece | **scraping controllato** `onepiece-cardgame.com` (JA) — *futuro* | Solo enrichment KG, mai blocca presenza/valore. `fetch-onepiece-ja.js` esiste già. Rate limit basso. |
| Sold prices eBay | **niente** (né API né scraping) | eBay vieta lo scraping dei sold nei ToS; l'unico sold è `fetch-ebay-sold` (edge fn esistente, che usa un metodo consentito). |
| Cardmarket listing/sold diretti | **niente scraping** | ToS Cardmarket vietano scraping. Solo il feed via terzi. |

**Non fare:** scraping di TCGplayer, Cardmarket, eBay listing/sold, PriceCharting. Il rischio legale/tecnico non vale i dati marginali quando TCGCSV+feed coprono il caso.

### Bonus: riconciliare `refresh-prices` (debito che tocca il Market Engine)

`refresh-prices/index.ts` su disco usa la eBay Finding API morta; la v14 deployata usa `fetch-ebay-sold`. **Task (Fase 2.2 dai doc):** esportare la v14 nel repo, cancellare il codice Finding API, far scrivere anche `market_observations` (`kind='sold'`), togliere il doppio-write `card_prices` da `sync-onepiece.js`. ~mezza giornata, sblocca la 2ª fonte per la confidence.

---

## 13. Cached pricing vs live research

**Il brief chiede di proporre quando usare l'una e quando l'altra. La separazione è già implementata correttamente; ecco la regola per l'agente:**

| Situazione | Modalità | Fonte | Persistito? |
|---|---|---|---|
| "Quanto vale X?" — carta con `market_valuations` recente (`computed_at` < 48h) e `confidence ≥ medium` | **Cached** | `card_valuation` tool | Già persistito |
| "Quanto vale tutta la mia collection?" | **Cached** (batch) | `portfolio_valuations` RPC | Già persistito |
| "Quali Charizard sotto €100 stanno crescendo?" | **Cached** | query `market_valuations` + `trend_30d_pct` | Già persistito |
| "Grafico prezzo ultimi 90 giorni" | **Cached** | `price_history` tool | Già persistito |
| "Quanto vale X *oggi*?" / carta con `confidence='none'` o `computed_at` vecchio | **Live** | `live_market` tool (eBay Browse) + (v2) `web_research` | **No** — mostrato come "annunci attivi ora", non salvato come valuation |
| "Cosa c'è in vendita adesso per X?" | **Live** | `live_market` tool | No |
| Carta appena uscita, 0 osservazioni | **Live** + disclaimer | `live_market` + "mercato non ancora consolidato" | No (ma l'osservazione `listing` può essere registrata con `?record=1` per iniziare lo storico) |

**Principio:** la *valutazione* (numero con confidence, salvato, che alimenta portfolio/grafici/ranking) si muove al ritmo giornaliero della pipeline. La *ricerca live* (cosa offre il mercato in questo istante) è on-demand, etichettata come tale, mai promossa a "valore". L'agente sceglie in base a `computed_at` e `confidence` del tool result — logica deterministica, non a discrezione del modello.

---

## 14. AI / tool architecture

Vedi §7. Riepilogo operativo:

- **1 endpoint:** `POST /api/ask` (Vercel Node, `@anthropic-ai/sdk`, streaming).
- **Loop:** `client.beta.messages.toolRunner({ model, tools, messages, max_iterations: 6 })` → `runner.untilDone()`.
- **Tool = funzioni JS in-process** che chiamano Supabase REST/RPC e `api/live-market`. Nessun tool esegue codice arbitrario, nessuno scrive.
- **Structured output:** `output_config.format` con schema `AnswerCard` (card + valuation + actions), `required` sui campi di provenienza.
- **System prompt** (cached): identità, scope TCG, le 6 regole anti-allucinazione (§7.4), formato risposta, tono ("descrittivo, mai consiglio finanziario" — coerente con `PRODUCT_SPEC §6`).
- **Auth:** JWT Supabase dell'utente passato all'endpoint → i tool `collection_lookup`/`set_progress` girano con RLS dell'utente. Query anonime: solo tool pubblici.
- **Fallback modello:** `claude-fable-5-1`/`opus-5` con `fallbacks` server-side se una query viene declinata dai classificatori (raro per questo dominio, ma il pattern è gratis da includere).

---

## 15. UX proposal

**Non "una chat in fondo alla pagina". Non "Ask DraGold come unica homepage".** Un terzo modo di entrare nel grafo, accanto a Search ed Explore.

### 15.1 Superficie primaria — "Ask" nella home Atlas

La home resta l'Atlas WebGL (è il biglietto da visita). **Si aggiunge un campo "Ask" prominente** sopra o dentro l'Atlas:

```
┌────────────────────────────────────────────────────┐
│  DraGold                          [Search]  [☰]     │
│                                                    │
│      ╭──────────────────────────────────────╮      │
│      │ 🔍 Ask about any card…                │      │
│      │    "How much is my Charizard ex       │      │
│      │     199/165?"                         │      │
│      ╰──────────────────────────────────────╯      │
│                                                    │
│      Try:  · What's my collection worth?           │
│            · Which cards am I missing from 151?    │
│            · Why is this card so expensive?        │
│                                                    │
│         [ Atlas WebGL scene continues below ]      │
└────────────────────────────────────────────────────┘
```

### 15.2 La risposta — una "answer card", non un muro di testo

```
┌─────────────────────────────────────────────────────┐
│  Charizard ex · #199/165                             │
│  Pokémon 151 — English                    [img]     │
│                                                     │
│  Estimated Market Value                              │
│   €152          Range €145–€165                      │
│                                                     │
│  30d  ▲ +8.4%          Confidence: ● Medium          │
│                        3 observations · 1 source    │
│                        as of Sep 2, 2026            │
│                                                     │
│  Sources: TCGplayer market                          │
│  ⚡ See active listings on eBay (IT)  →              │
│  ＋ Add to Portfolio    ↗ Open card page             │
└─────────────────────────────────────────────────────┘
```

Riusa `ConfidenceBadge`, `PortfolioConfidence` copy, palette neutra+gold (`portfolio-valuation.css`), zero verde/rosso di sfondo (`PRODUCT_SPEC §6`). Ogni elemento linka a un'azione reale.

### 15.3 Follow-up conversazionale

Dopo la prima risposta, un thread leggero: "and the Japanese version?", "what about near-mint?", "add 2 to my collection". Mantiene `session_id`, storia in `messages`. Non un'esperienza chat a schermo intero — un pannello che si espande.

### 15.4 Il catalogo tradizionale resta primario

- **Search** (⌘K / `CommandSearch`) — invariato, per chi sa cosa cerca.
- **Explore** — `TCG → Sets → Set detail → Cards` (già in roadmap Fase 4). Le griglie di set mostrano `estimated_value` per carta da `market_valuations`.
- **Card page** — invariata (SEO), + sezione valutazione con lo stesso answer-card component.
- **Collection/Portfolio** — invariato, + un CTA "Ask about your collection" che apre l'agente pre-caricato col contesto collezione.
- **Academy** — invariato.

L'agente è **additivo**. Nessuna feature esistente viene rimossa o nascosta dietro la chat.

### 15.5 Mobile-first

L'answer card è un componente verticale che funziona a 390px. L'input "Ask" è un tap-target grande. Il follow-up è un bottom sheet. (L'Atlas WebGL ha già `gpuTier.js` per il fallback su device deboli.)

---

## 16. Monetization

**Contesto: 0 utenti. La monetizzazione va progettata ora ma attivata dopo il product-market fit.** I `PLANS` esistono già in codice (`PRODUCT_SPEC §6`: Free/Collector/Pro) e non gatekeepano nulla.

### 16.1 Cosa deve restare gratis (acquisizione + SEO + fiducia)

- Tutte le **pagine entità pubbliche** (card / set / character / illustrator) — sono il canale organico.
- **Search + Explore** completi.
- **Academy** completo (è il differenziatore di retention, non un premium).
- **Valutazione singola carta** — vederla su una card page. È l'aggancio.
- **Collection tracking** fino a ~N carte (progress, completamento set) — senza il valore aggregato.
- **~10 query AI/giorno** — abbastanza per provare, non per usare l'agente come strumento di lavoro.

### 16.2 Cosa monetizzare (PRO — indicativo €4–6/mese o €40–50/anno)

Rationale del range: sotto Cardmarket "Powerseller" (~€5,50/mo), in linea con app collection premium (Collectr, Dragon Shield MobileApp premium). Ancora ~€5/mo perché il valore per l'utente è "quanto vale la mia roba" ricorrente.

| Feature | Perché a pagamento | Costo marginale DraGold |
|---|---|---|
| **Bulk valuation** — valore totale collezione + breakdown + storico portfolio | È il momento "wow" ricorrente; costoso in compute solo se via agente (usare `portfolio_valuations` RPC batch = ~gratis) | ~0 (RPC) |
| **AI queries illimitate** (o alto cap, es. 200/giorno) | Costo per-query reale ($0,01–0,08) | $ variabile — **questo è il costo che il piano deve coprire** |
| **Alert prezzo** (soglie, movers, "la tua carta X è salita del 20%") | Feature "broker", `PRODUCT_SPEC §6` la mette in Future ma è naturale qui | ~0 (cron esistente) |
| **Storico prezzo esteso** (>90 giorni, per-condizione quando i dati ci sono) | I dati costano (retention) e sono premium in tutto il settore | storage |
| **Collection intelligence avanzata** (concentrazione, diversificazione, "cosa comprare per completare X al minor costo") | Analisi, non solo dati | compute agente |
| **Confidence "High" / multi-source detail** | Quando ci saranno ≥2 fonti, il breakdown completo è premium | ~0 |
| **Export** (CSV, per assicurazione/vendita) | Utility, willingness-to-pay chiara | ~0 |

### 16.3 POWER USER / futuro (€15–20/mo)

Solo se emerge una nicchia (dealer, negozi): API access ai propri dati, bulk import CSV, valutazioni per lotti di 1000+, multi-collezione, sub-account. **Non progettare ora oltre a "l'architettura non lo impedisce".**

### 16.4 Regola di costo

Ogni feature AI monetizzata deve avere **costo marginale < 30% del prezzo del piano** al livello di utilizzo atteso. `agent_queries.cost_usd` è il dato che lo verifica. Se un utente PRO costa >€1,50/mese in inference, il cap o il modello va rivisto.

---

## 17. Security / cost / rate-limit considerations

### Security

- **L'endpoint agente non scrive mai.** Tutti i tool sono SELECT/RPC read-only. `collection` è modificata solo dai flussi UI esistenti (RLS per-utente).
- **Auth pass-through:** il JWT Supabase dell'utente → i tool con dati personali girano con la sua RLS. Nessun tool usa `service_role` per dati utente.
- **Prompt injection:** i tool result (specie `live_market` con titoli di annunci eBay, e `raw` jsonb da fonti) sono **dati non fidati** → il system prompt istruisce l'agente a trattarli come dati, mai come istruzioni. Structured output limita la superficie.
- **Secrets:** `ANTHROPIC_API_KEY`, `EBAY_CLIENT_*` solo env Vercel, mai nel client. (Il debito storico "JWT service_role hardcoded nel cron `check-alerts`" — `docs/plans/2026-09-02 §2.5` — va chiuso a parte.)
- **SSRF:** i tool chiamano host fissi (Supabase, `api.ebay.com`, `api/live-market` interno). `web_research` v2 usa `allowed_domains` hard-coded.
- **RLS su `market_valuations`/`market_observations`:** public-read (corretto — è un dato di mercato trasparente). `agent_queries`: per-utente.

### Cost

| Voce | Stima |
|---|---|
| Inference agente | $0,01–0,02/query (Sonnet 5) · $0,04–0,08 (Opus 5 escalation). Con prompt caching sul prefisso: −80% sull'input dopo la 1ª. |
| eBay Browse | Free fino a 5.000/giorno. |
| TCGCSV / TCGdex / Frankfurter | Free. |
| Supabase | Piano attuale regge (200k righe, poche query/s). L'agente aggiunge ~5-10 query read per domanda. |
| Vercel | Serverless — l'endpoint agente è la sola funzione "lunga" (fino a 60s streaming). Attenzione al limite di durata del piano. |
| Cardmarket via Scrydex (se attivato) | 1.000/mese free, poi a crediti. |

**A regime, con 1.000 utenti attivi × 5 query/giorno = 5.000 query/giorno ≈ $50–100/giorno di inference.** Ecco perché il free tier è capato a ~10/giorno e PRO copre il resto.

### Rate limiting

- **Anon:** 3 query/giorno per IP (edge middleware + counter).
- **Free autenticato:** 10/giorno (counter in `agent_queries`, check RLS).
- **PRO:** 200/giorno (di fatto illimitato per uso umano).
- **Hard global kill-switch:** env var per disattivare `/api/ask` se il costo aggregato esplode.
- **Per-query:** max 6 iterazioni tool, timeout 60s, max_tokens output 4k.

---

## 18. MVP definition

> **La domanda chiave di Ermal: "qual è il più piccolo MVP che dimostra che l'idea funziona?"**

### "Ask DraGold" — 1 endpoint, 5 tool, 1 superficie UI. Niente Python, niente nuove tabelle (tranne `agent_queries`), niente scraping, niente cron.

**Backend:**
- `POST /api/ask` — Vercel Node, `@anthropic-ai/sdk` Tool Runner, `claude-sonnet-5`, streaming, structured output `AnswerCard`.
- 5 tool (tutti wrapper su codice esistente): `card_search`, `card_lookup`, `card_valuation`, `live_market`, `collection_lookup`.
- System prompt con le 6 regole anti-allucinazione.
- `agent_queries` per logging/cost/rate-limit.
- Rate limit: 3 anon / 10 free / illimitato per un flag beta manuale.

**Frontend:**
- Campo "Ask" nella home (sopra l'Atlas) + 3 query di esempio.
- `<AnswerCard>` component (riusa `ConfidenceBadge`, palette portfolio).
- Follow-up in un pannello espandibile (stesso `session_id`).
- CTA "Ask about your collection" nella Collection view.

**Scope dati:** solo le ~6.706 carte con `market_valuations` (Pokémon SV recenti + One Piece OP-01→17). Fuori copertura → l'agente dice "non ho dati di mercato affidabili per questa carta" + mostra `live_market`.

**Effort:** ~5–8 giorni. 1 branch. Reviewabile, revertibile (è un endpoint + un componente).

### Cosa dimostra (i criteri di successo dell'MVP)

1. **Identificazione carta da linguaggio naturale funziona** — "Charizard ex 199/165 Pokémon 151" → la carta giusta, con disambiguazione EN/JA quando serve. *(Se questo fallisce, l'idea non è pronta — è il gate.)*
2. **I dati di valutazione reggono all'interrogazione conversazionale** — la risposta è onesta (confidence, as-of, source visibili), mai un numero inventato.
3. **Gli utenti (i primi beta) preferiscono chiedere?** — `agent_queries.resolved` + retention + quali query fanno.
4. **Il costo per query è sostenibile** — `agent_queries.cost_usd` medio < $0,03.
5. **Il free→pro fa senso** — quante query prima che un utente colpisca il cap di 10.

### Metriche di go/no-go (dopo ~4 settimane di beta con utenti reali)

- ≥ 60% delle query economiche `resolved` con la carta corretta al primo tentativo.
- 0 casi di prezzo inventato / provenienza mancante (audit manuale su un campione).
- Costo medio/query < $0,03.
- Almeno un segnale di retention (utenti che tornano a chiedere).

Se sì → Fase 2. Se no → l'agente è prematuro, si torna a KG/Academy/Collection (`PRODUCT_SPEC` originale) e si riprova dopo.

---

## 19. Phase 2 (dopo validazione MVP)

**Obiettivo: rompere il cap `medium`, allargare la copertura, rendere l'agente "di lavoro".**

1. **2ª e 3ª fonte prezzo** — `ingest-market-cardmarket.js` (feed via Scrydex/pokemontcg.io) + riconciliazione `refresh-prices` v14 per `market_observations` `kind='sold'`. → carte con ≥2 fonti raggiungono `high`.
2. **Cross-source outlier detection** in `computeValuation`.
3. **Multilingua** (blocco già previsto da Ermal) — Search EN→JA→altre, card page con tutte le versioni, ranking linguistico, **nessun cross-match tra lingue/varianti**. Prerequisito per il tool `card_lookup` che risponde "la versione JA vale X, la EN Y".
4. **Copertura valutazione Pokémon JP** — TCGCSV `categoryId 85`.
5. **Tool agente aggiuntivi:** `price_history`, `set_progress`, `market_comparison` ("Charizard sotto €100 in crescita").
6. **`web_research` tool** (server tool `web_search`, `allowed_domains` fissi) — per "quanto vale *oggi*" quando la cache è vecchia.
7. **Monetizzazione attiva** — PRO con bulk valuation + AI illimitata + alert. Stripe.
8. **Hot-refresh 6h** per le carte in collezione/watched.
9. **Debito:** `me4`/`me04` dedup, backfill `canonical_card_id`.

---

## 20. Phase 3 (scala)

1. **Knowledge Graph normalizzato** — tabelle `illustrators`/`characters`/`series` + backfill + tool `knowledge_graph` ("carte simili", "tutte le carte di X", "differenza tra questa e quella").
2. **`sets` v2** — schema con `release_date`/`status`/`logo`, Explore hierarchy completa (Fase 4 vNext).
3. **KG come UI esplorabile** — vista grafo Card→Set→Character→Variant→Language→Market.
4. **RAG** su testo carte / Academy / storia set (`pgvector`) — solo se emerge la domanda ("carte che pescano 2", ricerca semantica).
5. **Academy × AI** — quiz generati e validati, spiegazioni ("perché questa carta è rara?") che usano il grafo.
6. **Grading / PriceCharting** — se DraGold entra nel graded (PSA/BGS population, valore per grade).
7. **Power user tier** — API, bulk, multi-collezione.
8. **Managed Agents** (Anthropic) — solo se l'agente diventa long-running / schedulato / multi-step complesso (report settimanali sulla collezione, monitoraggio). Non prima.

---

## 21. Risks and failure modes

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| **L'agente identifica la carta sbagliata** e dà il prezzo di un'altra | Media | Alto (fiducia distrutta) | Disambiguazione obbligatoria su >1 candidato; `card_search` ritorna sempre set+numero+lingua; l'answer card *mostra* quale carta ha valutato → l'utente corregge. Metrica di go/no-go. |
| **Prezzo inventato / provenienza persa** | Bassa (regole hard) | Alto | Structured output `required` sui campi provenienza; system prompt vieta aritmetica; `confidence='none'` → "non lo so". Audit manuale campione. |
| **Costo per-query esplode** con l'uso | Media (se traction) | Medio | Rate limit stratificato; `agent_queries.cost_usd` monitorato; kill-switch; PRO copre l'uso pesante. |
| **Contraddizione con PRODUCT_SPEC non risolta** → confusione di direzione nei task futuri | Alta se non affrontata | Medio | Aggiornare `PRODUCT_SPEC.md` esplicitamente prima di iniziare (decisione di Ermal). |
| **Nessuno usa l'agente** (l'ipotesi conversational è sbagliata) | Media | Medio (tempo perso) | MVP piccolo (5-8 giorni), metriche chiare, fallback su roadmap `PRODUCT_SPEC` originale. |
| **Una sola fonte prezzo → tutte le valutazioni `medium`** → l'agente sembra sempre incerto | Alta (stato attuale) | Medio | Fase 2 aggiunge fonti; nel frattempo il copy è onesto ("confidence cresce con più fonti"). |
| **Copertura 6.706/203.863 carte (3%)** → l'agente dice "non lo so" troppo spesso | Alta | Medio | MVP limitato ai TCG/set coperti; espansione in Fase 2 (Pokémon JP, più set); `live_market` come fallback. |
| **eBay Browse rate limit / downtime** | Bassa | Basso | Cache `s-maxage=900` già presente; degrado non-fatale (l'agente risponde senza il live). |
| **Anthropic API downtime / policy decline** | Bassa | Basso | `fallbacks` server-side; messaggio di errore pulito. |
| **Scraping One Piece rompe** (Bandai cambia WAF/URL) | Media (nel tempo) | Basso per l'agente (le immagini non bloccano il valore) | URL deterministici, `image-taxonomy.js` degrada a `null`, mai immagine sbagliata. |
| **Debito `me4`/`me04`** → collection utente non matcha `market_valuations` | Media | Medio | RPC `portfolio_valuations` già risolve via `set_identity_key` a query-time; dedup migration in Fase 2. |
| **Vercel function timeout** su query multi-tool lente | Media | Basso | Streaming; max 6 iterazioni; timeout 60s con messaggio parziale. |

---

## 22. What NOT to build

1. **❌ Un servizio Python separato.** La pipeline "SOURCE→NORMALIZE→MATCH→VALIDATE→OUTLIER→PRICE→CONFIDENCE→HISTORY→SUPABASE" **esiste già in JS puro e testato** (`scripts/lib/valuation/`). Un servizio Python aggiunge un linguaggio, un deploy, un confine di rete, per zero capacità nuove.
2. **❌ Un framework di agenti (LangChain / LlamaIndex / CrewAI).** 5 tool non richiedono un framework. `@anthropic-ai/sdk` Tool Runner basta.
3. **❌ "Ask DraGold" come homepage unica / sostituzione di Search/Explore.** L'agente è additivo. Search ed Explore restano primari.
4. **❌ RAG / vector DB nella v1.** Il catalogo è SQL-interrogabile. RAG solo per testo NL / Academy, in Fase 3.
5. **❌ Agent memory / conversazioni persistenti cross-sessione** nella v1. `session_id` per i follow-up basta.
6. **❌ Scraping di TCGplayer / Cardmarket / eBay listing-sold / PriceCharting.** ToS + rischio, per dati marginali.
7. **❌ Previsione prezzi / ML / "questa carta salirà".** Il motore è statistica trasparente, non predizione. `PRODUCT_SPEC`: "nessuna estetica trading".
8. **❌ eBay Marketplace Insights integration.** Gated, non disponibile a DraGold.
9. **❌ Riparare `price_history`** — schema legacy incoerente. Lo storico è `market_observations`.
10. **❌ Deployare `refresh-prices/index.ts` dal repo** — usa la Finding API morta. Esportare la v14, non il contrario.
11. **❌ Ricostruire il motore di valutazione.** Estenderlo (fonti, cross-outlier), non riscriverlo.
12. **❌ Toccare `sets` schema, `card_prices` schema, `DraGold.legacy.jsx`, `feat/sealed-products`.**
13. **❌ Managed Agents (Anthropic)** nella v1 — è per agenti long-running/schedulati/sandbox. L'MVP è request/response.
14. **❌ Nuovi TCG (MTG/YGO) come lavoro attivo.** Restano architecture-only (`PRODUCT_SPEC`).
15. **❌ Coda / worker / message bus** per l'agente. È sincrono.

---

## 23. Recommended tech stack

**Riuso massimo. Una dipendenza nuova.**

| Layer | Scelta | Nuovo? |
|---|---|---|
| Frontend | React 18 + Vite 5, JS (no TS) | invariato |
| SPA state | `useState` + `src/lib/state.js` | invariato |
| Backend | Vercel serverless functions (Node, ESM) | invariato |
| DB | Supabase Postgres 17, RLS public-read + per-user | invariato |
| **Agente** | **`@anthropic-ai/sdk`** — Tool Runner (`client.beta.messages.toolRunner`), `claude-sonnet-5` (+ `claude-opus-5` escalation), structured output, prompt caching, streaming | **NUOVA (1 dep)** |
| Market pipeline | `scripts/lib/valuation/` (JS puro), GitHub Actions cron | invariato + 2 script |
| Fonti dati | TCGdex (Pokémon), TCGCSV (One Piece + prezzi), Frankfurter (FX), eBay Browse (live), + Cardmarket via feed (Fase 2) | invariato + feed |
| Immagini | `card_image_cache` proxy + Supabase Storage + `sharp` | invariato |
| FX | Frankfurter (BCE) | invariato |
| Auth | Supabase Auth (magic link + Google OAuth) | invariato |
| Deploy | GitHub → Vercel auto-deploy | invariato |
| Test | `node:test` (scripts) + Vitest (da aggiungere per UI, già raccomandato nei doc) | invariato |
| Observability | `agent_queries` tabella + `@vercel/analytics` (già presente) | 1 tabella |

**Zero:** nuovo linguaggio, nuovo deploy target, framework di orchestrazione, vector DB, message queue, Redis, servizio esterno.

---

## 24. Exact implementation order

### Pre-work (decisione, non codice)

0. **Ermal aggiorna `PRODUCT_SPEC.md`** — nuova gerarchia: "TCG Intelligence (KG + Market Valuation + AI Assistant) + Collection + Academy". Spostare pricing/portfolio/AI da "Archived/Future" a "Core". *Gate: senza questo, ogni task futuro ha una direzione ambigua.*

### MVP — "Ask DraGold" (~5–8 giorni, 1 branch `feat/ask-dragold-mvp`)

1. **`agent_queries` migration** (reversibile) + RLS. ~30 min.
2. **Tool layer** — `api/_lib/agent-tools.js`: 5 funzioni pure-ish (`cardSearch`, `cardLookup`, `cardValuation`, `liveMarket`, `collectionLookup`) che chiamano Supabase RPC/REST + `api/live-market`. Test con `node:test` (mock Supabase). ~2 giorni.
3. **`POST /api/ask`** — Tool Runner loop, system prompt, structured output schema, streaming, rate-limit check, `agent_queries` write. ~1,5 giorni.
4. **System prompt + guardrail** — le 6 regole, scope, formato. Iterare su ~20 query reali di test. ~1 giorno.
5. **`<AnswerCard>` + campo "Ask"** nella home + follow-up panel + CTA collection. Riusa componenti portfolio. ~1,5 giorni.
6. **Verifica:** 20 query campione (identificazione, disambiguazione EN/JA, "non lo so" su carta non coperta, follow-up, collection). Build verde. Deploy preview. Smoke test costo (`agent_queries.cost_usd`). ~0,5 giorni.
7. **Beta chiusa** — flag manuale, 10–30 utenti reali, 4 settimane. Raccogliere `agent_queries` + retention.

### Go/no-go (fine beta)

→ metriche §18. Se no: stop agente, riprendi roadmap `PRODUCT_SPEC` (KG/Academy). Se sì: Fase 2.

### Fase 2 (~3–4 settimane, branch per task)

8. **`refresh-prices` v14 → repo + `market_observations` `kind='sold'`** + stop doppio-write `card_prices`. ~0,5 gg.
9. **`ingest-market-cardmarket.js`** (feed Scrydex/pokemontcg.io `cardmarket.prices`) → `market_observations`. ~2 gg.
10. **Cross-source outlier** in `computeValuation` + test. ~1 gg.
11. **Multilingua** — Search EN→JA→altre, card page multi-versione, ranking linguistico, no cross-match. *(Blocco esplicito già previsto da Ermal.)* ~1 settimana.
12. **Pokémon JP valuation** — TCGCSV `categoryId 85`. ~1 gg.
13. **Tool agente:** `price_history`, `set_progress`, `market_comparison`. ~2 gg.
14. **`web_research` tool** (server `web_search`, domini fissi) per cache-stale. ~1,5 gg.
15. **Monetizzazione:** Stripe, PRO (bulk valuation + AI illimitata + alert), gating. ~1 settimana.
16. **Debito:** `me4`/`me04` dedup migration, backfill `canonical_card_id`. ~2 gg.
17. **Hot-refresh 6h** per carte in collezione/watched. ~1 gg.

### Fase 3 (scala — quando c'è traction)

18. KG normalizzato (`illustrators`/`characters`/`series` + backfill + tool `knowledge_graph`).
19. `sets` v2 + Explore hierarchy.
20. KG come UI grafo esplorabile.
21. RAG (`pgvector`) su testo carte / Academy.
22. Academy × AI.
23. Power user tier / API.

---

## Raccomandazione finale

# BUILD BUT CHANGE DIRECTION

**Cosa costruire:**
1. **Completa il Market Intelligence Engine** (esiste al 70%: manca la 2ª/3ª fonte per rompere il cap `medium`). Vale a prescindere dall'agente.
2. **L'agente come MVP sottile** — 1 endpoint Vercel, `@anthropic-ai/sdk` Tool Runner, 5 tool read-only che wrappano codice esistente, 1 tabella nuova (`agent_queries`), 1 superficie UI ("Ask" nella home). **Niente Python, niente framework, niente scraping, niente nuove architetture.**

**Cosa NON fare:** il servizio Python separato, il framework di agenti, "Ask DraGold" come homepage unica, RAG in v1, scraping dei marketplace, previsione prezzi, e tutto il resto in §22.

**Cosa preservare:** Knowledge Graph, Academy, Collection, Card pages SEO, la disciplina "mai un prezzo inventato". L'agente li *usa* come tool, non li sostituisce.

**Prerequisito non tecnico:** Ermal deve aggiornare `PRODUCT_SPEC.md` — questo è un pivot esplicito dalla visione "knowledge graph, non price tracker" del 2026-08-05, e va posseduto come decisione, non fatto di soppiatto.

## Il più piccolo MVP che dimostra che l'idea funziona

**"Ask DraGold": un campo di input nella home + `POST /api/ask` + 5 tool sui dati che DraGold ha già.**

- **Endpoint:** Vercel serverless Node, `@anthropic-ai/sdk` Tool Runner, `claude-sonnet-5`, structured output.
- **Tool (tutti read-only, tutti wrapper su codice esistente):** `card_search` (RPC `suggest_cards`), `card_lookup` (`cards`+`canonical_cards`), `card_valuation` (`market_valuations` — con `confidence_reason`, `computed_at`, `sources`), `live_market` (`api/live-market.js`), `collection_lookup` (RPC, auth utente).
- **Regola ferrea:** ogni numero economico viene da un tool result, con `source` + `as_of` + `confidence` — o l'agente dice "non ho abbastanza dati".
- **1 nuova tabella:** `agent_queries` (cost + rate-limit + "ha risolto sì/no").
- **Effort:** 5–8 giorni, 1 branch, revertibile.
- **Scope dati:** le 6.706 carte già valutate (Pokémon SV recenti + One Piece OP-01→17).

**Dimostra:** (1) l'identificazione carta da linguaggio naturale funziona — il gate assoluto; (2) i dati di valutazione reggono l'interrogazione conversazionale in modo onesto; (3) gli utenti preferiscono chiedere; (4) il costo per query è sostenibile (~$0,02). Con metriche di go/no-go chiare dopo 4 settimane di beta con utenti reali — e un fallback pulito sulla roadmap `PRODUCT_SPEC` originale se l'ipotesi non regge.
