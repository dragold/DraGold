# DraGold AI — Product + Competitive Gap Audit

> **Autore:** agente Principal Architect / Product Manager · **Data:** 2026-09-03
> **Natura:** decisione di prodotto, non ricerca tecnica. Nessun file toccato, nessun codice, nessuna migration.
> **Metodo:** audit del repository reale (verifica diretta) + ricerca web aggiornata con fonti primarie (GitHub, siti ufficiali, app store). Le feature dei competitor sono verificate, non assunte.

---

## 0. TL;DR — la decisione

**DIREZIONE: A — continuare a trasformare DraGold in un prodotto AI TCG**, riformulato come *"the open, self-hostable TCG intelligence agent"*. Non B (prodotto separato: l'infra *è* DraGold). Non C (abbandonare: il gap è reale e verificato).

**PRODUCT #1: `Ask DraGold`** — un agente conversazionale open source, provider-agnostic, che risponde a domande su carte e collezioni con **provenienza e confidenza su ogni numero**, o un onesto "non lo so". Due output di punta: il **Card Dossier** (ricerca completa e sourced su una carta) e il **Collection Report** (valore + percorso più economico per completare un set).

**MVP: 10 giorni.** Riusa il 90% dell'infrastruttura. Zero nuove tabelle tranne `agent_queries`.

**Se fossi co-founder/PM: investirei i prossimi 30 giorni? → YES**, con un gate esplicito: settimana 4 = beta pubblica + un post r/PTCG/Show HN per misurare se a qualcuno importa. Costo per scoprirlo: 30 giorni. Downside limitato.

---

## 1. Audit del repository — EXISTS / PARTIAL / MISSING

Verificato oggi sul codice reale + DB Supabase `pimwkmwrduqkaydyvxqz`.

| Componente | Stato | Cosa c'è davvero | Riuso per l'AI |
|---|---|---|---|
| **Card catalog** | ✅ **EXISTS** | `cards` 203.863 righe (Pokémon 156k · One Piece 5.7k · MTG 27k · YGO 14k). Sync Pokémon giornaliero TCGdex, One Piece via TCGCSV (OP-17 dentro). | Diretto: il tool `card_search`/`card_lookup` interroga questa tabella. |
| **Canonical identity** | 🟡 **PARTIAL** | `canonical_cards` 88.292 righe, unique `(tcg, set_id, card_number)`. **9.306 carte (4,6%) senza `canonical_card_id`**. | Base del raggruppamento varianti; il gap del 4,6% va colmato. |
| **Cross-language identity** | 🟡 **PARTIAL → in progress** | Per One Piece funziona (2.553/2.554 EN+JA condividono canonical). Per **Pokémon è rotto al 99,8%** (set JA con codici propri: SV2a≠sv03.5). **Spec + piano Fase A pronti** (`set_alias` + RPC `card_versions`), non ancora implementati. | **È il differenziatore chiave** (§6). `card_versions` = primo tool deterministico dell'agente. |
| **Search** | ✅ **EXISTS** | `src/lib/search.js` (`searchCards`, `rankSearchResults`, `groupByCanonical`) + RPC `search_cards`/`suggest_cards` (trigram GIN) + espansione multilingua client-side. | Tool `card_search` = wrapper. |
| **Card pages** | ✅ **EXISTS** | `CardPage.jsx` + `cardPageData.js` — SEO (canonical tag, JSON-LD, sitemap), `languagePills` + `crossLangBadge` già in UI, storico prezzi, sold data eBay. | Pattern per il tool `card_lookup`; il "Card Dossier" ne è l'estensione conversazionale. |
| **Knowledge Graph** | 🔴 **MISSING (come entità)** | `cards` + `canonical_cards` + `rarities`. `character` / `illustrator` / `series` sono **colonne di testo libero** — nessuna tabella, nessuna dedup, nessun edge. `sets` (1.668 righe) rotta (`released_at` NULL 100%). `set_logos` (345, decente). Nessuna tabella `characters`/`illustrators` in nessuna migration. | KG come "tool dell'agente" oggi = solo `card_search`. Le pagine entità e la vista grafo sono lavoro futuro. |
| **Academy** | 🟡 **PARTIAL (scheletro)** | `src/pages/academy/academyContent.js` = **141 righe, ~5 lezioni**. `academy_progress` (5 righe, 1 utente). Hub + quiz esistono come struttura. | Non un asset AI oggi. Un "tutor" AcademyAI è Fase 3, non ora. |
| **Collection** | ✅ **EXISTS** | `collection` (22 colonne! `card_api_id` text no-FK, quantity, condition, purchase_price, wishlist). **66 righe, 1 utente.** RPC `add_or_increment_collection` / `decrement_or_remove_collection`. | Tool `collection` (JWT utente). Il "Collection Report" ci si costruisce sopra. |
| **Market Intelligence** | ✅ **EXISTS** | Separazione netta: `market_valuations` (stima) / `api/live-market.js` (eBay Browse annunci attivi) / `src/lib/ebayLinks.js` (affiliate EPN). | Tre tool distinti: `card_valuation`, `live_market`, link affiliati. |
| **`market_valuations`** | ✅ **EXISTS** | **6.706 carte valutate**, tutte con `estimated_value` + `confidence` + **`confidence_reason` JSONB spiegabile**. Distribuzione: 6.706 `medium`, 0 `high` (1 fonte: TCGCSV), 0 `none`. | Il cuore dell'onestà del prodotto: ogni risposta economica cita `confidence_reason`. |
| **`market_observations`** | ✅ **EXISTS** | Append-only, **20.117 osservazioni** con `price_eur` + `fx_rate` (Frankfurter/BCE). Indici su `(card_id, observed_at)`, `source`, `canonical_card_id`. | Tool `price_history`. |
| **Valuation engine** | ✅ **EXISTS** | `scripts/lib/valuation/` — `computeValuation` (weighted median, dedupe per fonte, no blend finish), `computeConfidence` (rubrica 4 componenti), `stats.js`. **Puro, testato** (parte dei 567 test). Casi outlier già fixati (Fase 2.1). | Non serve rifarlo. L'agente legge `market_valuations` prodotta da qui. |
| **Portfolio** | ✅ **EXISTS** | `src/lib/portfolio/` — 5 moduli puri (`valuation`, `insights`, `history`, `confidence`, `unavailableReason`) + RPC `portfolio_valuations` / `portfolio_value_history` + `set_identity_key`. UI `PortfolioView` con `ConfidenceBadge`, breakdown per TCG/set/lingua, "carte non valutate", **nessun badge "High"** (onesto). | **~70% del "Collection Report" è già qui.** |
| **live-market** | ✅ **EXISTS** | `api/live-market.js` (eBay Browse, marketplace-aware IT/DE/…, `buildBrowseQuery` da campi carta) + `api/ebay-search.js` + `api/_lib/ebay.js` (OAuth client-credentials). | Tool `live_market` = fetch interno. |
| **reconcile** | ✅ **EXISTS** | `scripts/lib/reconcile/` — `reconcile-catalog.mjs` (read-only, per-set, resumable), `classify-findings`, `identity-cascade`, `recovery.mjs`, fetcher `fetch-tcgdex`/`fetch-optcg`. `catalog_gaps` (14 righe) + `catalog_freshness_runs` + workflow giornaliero (ha rilevato OP-17). | Base del "Catalog Copilot" (BUILD LATER). |
| **API** | ✅ **EXISTS** | `/api` Vercel serverless Node ESM: `live-market`, `ebay-search`, `cache-image` (fetch→WebP→Storage), `img` (proxy CORS WebGL), `scan-images`, `delete-account`, `sitemap-*`. `middleware.js` (41KB, redirect/SEO). | L'endpoint agente `/api/ask` segue lo stesso pattern. |
| **scripts** | ✅ **EXISTS** | ~30 script: sync (`sync-cards`, `sync-onepiece`), ingest (`ingest-market-tcgcsv`, `ingest-fx`), `compute-valuations`, `catalog-freshness`, `image-audit/`. Pattern GitHub Actions + artifact. | Job batch (embed, eval) seguono questo pattern. |
| **Supabase** | ✅ **EXISTS** | Postgres 17.6. 30 tabelle. RLS public-read ovunque, scrittura service_role. Estensioni: **installate** `pg_cron`, `pg_net`, `pg_trgm`; **disponibili** `vector` 0.8 (pgvector), `pgroonga` (full-text JA-aware), `pgmq` (coda). | pgroonga = win reale per search JA. pgvector solo se serve (non subito). |
| **Vercel** | ✅ **EXISTS** | `vercel.json` minimale (rewrite SPA + cache asset). Funzioni serverless. Timeout dipende dal piano. | L'endpoint agente è l'unica funzione "lunga" (streaming). |
| **GitHub workflows** | ✅ **EXISTS** | 14 workflow: `sync-cards` (daily), `market-valuation` (daily), `catalog-freshness`, `image-audit`, `enrich-cards`, `tests`, `deploy-edge-functions`, ecc. | Pattern per eval notturno. |
| **Scanner / image capabilities** | 🔴 **MISSING (totalmente)** | **Nessun codice** OCR / vision / camera / barcode / photo-upload. `CardIdPage.jsx` = identificazione **testuale** (nome + set + numero → search) + form contribuzione carta mancante. `card_submissions` = metadati testuali. `cache-image`/`img` = proxy immagini, non riconoscimento. | Per lo scanner servirebbe tutto da zero. **§4-D: è una commodity affollata — NON costruirlo.** |
| **Test infrastructure** | ✅ **EXISTS** | Cultura `node:test` forte: **567 test scripts** verdi + test src. `npm run test:scripts` / `npm test`. Pattern TDD nei doc di fase. | Eval agente livello 1 (assert deterministici) = estensione naturale. |
| **AI / LLM** | 🔴 **MISSING** | Zero dipendenze, zero endpoint, zero Python. | Da costruire — ma sottile (§8). |
| **Licenza / repo pubblico** | 🔴 **MISSING** | `licenseInfo: null`, **repo PRIVATO**. | **Precondizione bloccante per "open source"** (§11). |
| **Utenti** | 🔴 ~0 | 3 profili, 1 collezione, 5 righe academy. Pre-lancio. | Determina tutto: la prova deve costare poco. |

**Sintesi audit:** l'infrastruttura *dati e valutazione* è EXISTS o PARTIAL-quasi-pronta. Mancano: l'AI (sottile), il KG come entità (futuro), lo scanner (da non fare), e — banale ma bloccante — **rendere il repo davvero open source**.

---

## 2. Competitive audit

Ricerca verificata su fonti primarie (GitHub, siti ufficiali, app store, 2026-09).

### 2.1 Open source / self-hosted

| Progetto | Target | Problema risolto | Core feature | AI | Identificazione | Pricing | Collection | Market intel | Research | KG | API | OSS | Self-host | Forza | Debolezza | Cosa NON fa |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **The Tin** ([thetinapp.com](https://thetinapp.com/), GitHub `the-tin-app/the_tin`) | Collezionisti Pokémon iOS | "so quanto vale la mia collezione, senza account né paywall" | Scan carta **on-device** (OCR + fingerprint visivo), prezzi USD/EUR notturni, sparkline 2 anni, CSV import/export, offline | ❌ nessun agente/chat; solo "on-device affinity" per raccomandazioni | ✅ **on-device**, attraverso sleeve/case | ✅ TCGdex + TCGplayer + Cardmarket + PSA graded, notturno | ✅ gruppi, wishlist, condizioni | 🟡 sparkline per carta, niente indici | ❌ | ❌ | 🟡 pipeline dati self-host | ✅ **AGPL-3.0** (app + pipeline + server) | ✅ catalog server Docker | Privacy assoluta (niente cloud), CSV no-lock-in, pipeline dati OSS | **iOS only**, **Pokémon only**, **7 stelle GitHub** (v1.0 lug 2026), nessun agente, nessuna profondità cross-lingua | Android (in roadmap), multi-TCG, ricerca, KG, qualsiasi cosa conversazionale |
| **TCGdex** ([tcgdex.dev](https://tcgdex.dev/), GitHub `tcgdex/cards-database`) | Sviluppatori | "un DB carte Pokémon multilingua, gratis, senza chiave" | API REST/GraphQL, 10+ lingue, immagini, SDK (JS/PHP/Kotlin/Python/Zig), PR-driven | ❌ | ❌ (è dati, non prodotto) | ❌ (nessun prezzo) | ❌ | ❌ | ❌ | 🟡 serie→set | ✅ REST/GraphQL, no key | ✅ dati open, codice MIT | ✅ Dockerfile | **La fonte** de-facto per Pokémon OSS. DraGold la usa già. | Solo Pokémon. Nessun prezzo. Nessun prodotto utente. | Tutto ciò che è prodotto, prezzo, collezione, AI |
| **pokemontcg.io / Scrydex** ([docs.pokemontcg.io](https://docs.pokemontcg.io/), [scrydex.com](https://scrydex.com/)) | Sviluppatori | API carte + prezzi Pokémon (poi multi-TCG) | REST, prezzi TCGplayer+Cardmarket embedded | ❌ (Scrydex ha una "Vision" call per identificazione) | 🟡 via Scrydex Vision (a crediti) | ✅ TCGplayer + Cardmarket | ❌ | ❌ | ❌ | ❌ | ✅ ma **il free tier v2 sta morendo**; Scrydex è **a crediti** (5.000/mese Starter, 1-5 cred/call) | ❌ | 🟡 dati storici v2, futuro a pagamento | Storicamente lo standard. | **Free tier in dismissione.** Scrydex commerciale. | Self-host, OSS, agente |
| **open-cards / open-tcg-store / tcg-pocket-collection-tracker** (GitHub vari) | Nicchia | DB collector / store TCG / tracker Pokémon Pocket | Cataloghi/store/tracker minori | ❌ | ❌ / manuale | 🟡 vario | 🟡 | ❌ | ❌ | ❌ | 🟡 | ✅ MIT/vari | 🟡 | Esistono, provano la voglia di OSS TCG tooling | Traction minima, scope stretto, nessuna infra dati seria | Praticamente tutto |
| **MTG MCP servers** (`pato/mtg-mcp`, `artillect/mtg-mcp-servers`, Scryfall MCP vari) | Utenti Claude/LLM | "far chiedere al mio LLM info su carte MTG" | Wrapper MCP su Scryfall (search, rulings, prezzi), gestione decklist/mano | 🟡 sono *tool* per un LLM esterno, non un prodotto | ❌ (solo lookup per nome) | 🟡 Scryfall prices (solo MTG) | ❌ | ❌ | ❌ | ❌ | ✅ MCP | ✅ MIT | ✅ (giri il tuo MCP) | **Confermano che il pattern "LLM + tool TCG" esiste e interessa** | **MTG only**, thin (solo Scryfall), no valutazione, no cross-lingua, no collezione, no backend proprio | Un vero backend dati, valutazione, identità, collezione, prodotto finito |

### 2.2 Commercial / consumer

| Prodotto | Target | Problema | Core feature | AI | Identificazione | Pricing | Collection | Market intel | Research | KG | API | OSS | Self-host | Forza | Debolezza | Cosa NON fa |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **PokePrices** ([pokeprices.io](https://www.pokeprices.io/)) | Collezionisti Pokémon | "quanto vale, chat gratis" | **AI assistant chat** (valori, PSA 10, trend set, grading), price checker 40k carte/156 set | ✅ **chat** | 🟡 ricerca | ✅ PriceCharting sold + PSA pop | ❌ | 🟡 trend | 🟡 via chat | ❌ | ❌ | ❌ | ❌ | **Il comparabile più diretto ad "Ask DraGold".** Gratis, no login, no paywall, EN+JA, 5+ anni storico | **Closed. Non self-hostable. Solo Pokémon. Nessuna collezione. Nessuna identità deterministica cross-lingua. Nessuna provenienza per risposta (dice il numero, non "da dove/quando/confidenza").** | Open source, multi-TCG, collezione, provenance-first, provider-agnostic |
| **Collectr** ([getcollectr.com](https://getcollectr.com/)) | Collezionisti multi-hobby | "la mia collezione come portfolio" | Scan, 25+ TCG + sport + Funko, valore raw/graded/sealed, gain/loss, 200k+ prodotti | 🟡 scan | ✅ scan (in-app purchase per illimitato) | ✅ aggregato | ✅ completo | ✅ trend, movers | ❌ | ❌ | ❌ | ❌ | ❌ | Ampiezza (25+ giochi), UX pulita, community | Closed, scan/filtri/export dietro IAP, nessuna chat/agente, nessuna profondità cross-lingua | AI conversazionale, self-host, research sourced |
| **CollX** | Collezionisti sport + TCG | "cataloga veloce + marketplace" | Scan (DB 20M+), free tier generoso, marketplace integrato, CollX Gold $9.99/mo | 🟡 scan | ✅ (base ✓, **parallel sbagliata ~35%**) | 🟡 ~22% sopra eBay sold | ✅ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | Free tier + marketplace + UI | Accuratezza parallel/pricing debole, no AI vera, no cross-lingua | Research, valutazione onesta, OSS |
| **Ludex** | Set builder, dealer | "scan ad alto volume accurato" | Scan-first iOS/Android, **parallel corretta ~85%**, prezzi TCGplayer, ~8% sopra eBay sold. **$19.99/mo Premium** | 🟡 scan | ✅ **il migliore** sui parallel | ✅ TCGplayer, il più vicino a eBay sold | ✅ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | Miglior riconoscimento, prezzi realistici | Caro, closed, scan-centrico, no chat, no cross-lingua | Tutto ciò che non è scan+track |
| **PriceCharting** ([pricecharting.com](https://www.pricecharting.com/)) | Chiunque cerchi un prezzo | "prezzo gratis, molti TCG" | DB gratis, prezzi da eBay/Heritage/PWCC daily, graded vs raw, valore collezione | ❌ | ❌ manuale | ✅ **ampio e gratis** | 🟡 valore totale | 🟡 | ❌ | ❌ | 🟡 solo via `tcgapi.net` (terzo) | ❌ | ❌ | Gratis, ampio, dati sold reali | Nessuno scanner, nessuna AI, ricerca manuale, no cross-lingua | Identità, collezione ricca, AI, self-host |
| **Card Ladder** | Investitori sport card | "l'S&P 500 delle carte" | Indici (CL50, per-player), storico dal 2000, 14 marketplace, portfolio | ❌ | ❌ | ✅ sold aggregato | ✅ portfolio | ✅ **il migliore** (indici) | ❌ | ❌ | 🟡 | ❌ | ❌ | Indici + storico profondo | **Sport-centrico**, DB non scanner, closed, caro | TCG-first, identità, AI, self-host |
| **TCGIndex** ([tcgindex.io](https://tcgindex.io/)) | Investitori TCG | "il mio mercato sta salendo?" | Indice live per 14 giochi, valore a livello set, "opportunity model" daily con track record pubblico | 🟡 modello | ❌ | ✅ cross-market | ❌ (non cataloga) | ✅ **cross-market intel** | ❌ | ❌ | ❌ | ❌ | ❌ | Intel di mercato aggregata, multi-gioco | Non cataloga, non identifica, closed, niente collezione | Identità, collezione, AI conversazionale, self-host |
| **Cards AI / Cardly AI / CardGrader.AI / Underpriced AI / PriceSnap.AI / CardGrading.app** | Collezionisti casual | "foto → cos'è + quanto vale + che grade prende" | Foto → identificazione + valore da eBay sold + **AI grade prediction** (PSA 9/10) | ✅ vision + grade | ✅ da foto (60-70% su vintage) | ✅ eBay sold | 🟡 | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | "istantaneo da una foto", grade estimate | **Spazio saturo** (10+ prodotti quasi identici), closed, subscription, accuratezza vintage bassa, grade prediction = commodity + rischio legale | Research sourced, cross-lingua, collezione, OSS |
| **OP.TCG / OneCollector / MyOPCards** ([optcg.app](https://optcg.app/), [onecollector.de](https://onecollector.de/)) | Collezionisti One Piece | "traccia la mia collezione OP + prezzi" | Scan AI (incl. DON!!), 20k carte, prezzi Cardmarket/TCGplayer/eBay/PSA, deck, alert. **OP.TCG: 200k+ collezionisti** | 🟡 scan | ✅ scan | ✅ multi-fonte | ✅ | 🟡 | ❌ | ❌ | ❌ | ❌ | Traction reale su One Piece, free | Closed, scanner+tracker, nessuna profondità KG/cross-lingua/research | Ricerca sourced, KG, AI conversazionale, OSS |
| **ManaBox / Moxfield / Archidekt** | Giocatori MTG | "collezione + deck" | ManaBox: scan mobile veloce; Moxfield/Archidekt: deck builder + collezione + prezzi live + trade finder | 🟡 scan (ManaBox) | ✅ (ManaBox) | ✅ live | ✅ | 🟡 | ❌ | ❌ | 🟡 | ❌ | ❌ | Dominano MTG, CSV export | **MTG only**, deck-centrico, closed, no AI vera, no cross-lingua | AI, multi-TCG con parità, self-host |

### 2.3 Pattern di mercato (verificati)

1. **Lo scanner è una commodity satura.** The Tin (OSS) + Ludex + CollX + Collectr + ManaBox + OP.TCG + 10+ "AI card scanner" quasi identici. L'accuratezza sui parallel/vintage è ancora un problema *per tutti* (60-85%). Entrare qui = arrivare 20° in una gara già decisa.
2. **La chat AI per valori esiste già** — **PokePrices** — ma è **closed, hosted-only, Pokémon-only, senza collezione, senza provenienza per-risposta, senza identità deterministica cross-lingua.**
3. **Nessun prodotto** — OSS o commerciale — offre insieme: **agente conversazionale + valutazione con provenienza + identità deterministica cross-lingua + collezione + self-hostable + provider-agnostic.**
4. **Il fossato dati si è chiuso per i nuovi entranti:** la **TCGplayer API è chiusa ai nuovi sviluppatori da fine 2024**; pokemontcg.io free tier sta morendo. Chi (come DraGold) ha già una pipeline **free e no-key** (TCGdex + TCGCSV) ha un vantaggio strutturale che un nuovo concorrente non può replicare facilmente.
5. **Il gap EN/JA è a picco di attenzione** — PokemonPriceTracker pubblica guide "JA vs EN 2026" trimestrali; la confusione (sealed JA -60/75%, single JA +15/40%) è documentata ovunque — ma **nessuno ha un layer di identità che colleghi deterministicamente EN 199/165 ↔ JA 193/165 e mostri le due valutazioni separate.**
6. **Gli MTG MCP server dimostrano la domanda** di "LLM + tool TCG" ma sono gusci sottili su Scryfall. Nessuno ha un backend con valutazione, identità, collezione.

**Sources:** [thetinapp.com](https://thetinapp.com/) · [github.com/the-tin-app/the_tin](https://github.com/the-tin-app/the_tin) · [tcgdex.dev](https://tcgdex.dev/) · [github.com/tcgdex/cards-database](https://github.com/tcgdex/cards-database) · [pokeprices.io](https://www.pokeprices.io/) · [getcollectr.com](https://getcollectr.com/) · [cardsaiapp.com/blog/collx-vs-ludex](https://www.cardsaiapp.com/blog/collx-vs-ludex) · [cardgrader.ai/blog/best-ai-powered-apps-scan-value-trading-cards](https://cardgrader.ai/blog/best-ai-powered-apps-scan-value-trading-cards) · [pricecharting.com](https://www.pricecharting.com/) · [tcgindex.io](https://tcgindex.io/) · [rippr.app](https://rippr.app/) · [github.com/pato/mtg-mcp](https://github.com/pato/mtg-mcp) · [github.com/artillect/mtg-mcp-servers](https://github.com/artillect/mtg-mcp-servers) · [developer.tcgplayer.com](https://developer.tcgplayer.com/) · [cardgrader.ai/blog/tcgplayer-api-alternatives](https://cardgrader.ai/blog/tcgplayer-api-alternatives) · [docs.pokemontcg.io/getting-started/migration](https://docs.pokemontcg.io/getting-started/migration/) · [scrydex.com/faq](https://scrydex.com/faq) · [optcg.app](https://optcg.app/) · [onecollector.de](https://onecollector.de/) · [pokemonpricetracker.com/blog/posts/japanese-vs-english-pokemon-cards-2026-price-guide](https://www.pokemonpricetracker.com/blog/posts/japanese-vs-english-pokemon-cards-2026-price-guide)

---

## 3. Find the gap — 3 opportunità

### GAP 1 — "Cos'è *davvero* questa carta e quanto vale, con le fonti"

| | |
|---|---|
| **Problema** | Un collezionista con una carta in mano (o un ID) vuole: identità esatta (set, numero, lingua, variante), tutte le versioni linguistiche/regionali, rarità, valore **con fonte e data**, storico, comparabili, "è la EN o la JA e perché una vale di più". |
| **Utente** | Collezionista intermedio/avanzato, in particolare EU (compra sia EN che JA), che rivende o assicura. |
| **Job-to-be-done** | "Aiutami a capire cosa ho e cosa vale, senza che io debba fidarmi ciecamente." |
| **Perché oggi è frustrante** | Si fa manualmente in 5 tab: Bulbapedia (identità) + PriceCharting (prezzo) + TCGplayer (prezzo) + eBay sold (realtà) + Cardmarket (EU). Nessuno collega EN e JA. I scanner danno *un* numero senza dire da dove né quanto è affidabile. ChatGPT lo inventa. |
| **Competitor** | PokePrices (chat, ma Pokémon-only, closed, no provenienza, no identità cross-lingua), scanner (numero secco), PriceCharting (manuale). |
| **Perché non lo risolvono bene** | Nessuno ha un **layer di identità deterministico cross-lingua** + una **valutazione con `confidence_reason` esplicito** + l'onestà di dire "non lo so". I scanner ottimizzano velocità, non verità. PokePrices non è verificabile né self-hostable. |
| **Perché l'AI migliora il workflow** | Trasforma 5 tab + copia-incolla in una domanda. L'agente orchestra i tool deterministici e *sintetizza con le fonti in chiaro* — non sostituisce i dati, li rende conversazionali. |
| **Cosa può fare DraGold che gli altri non possono facilmente** | `card_versions` (identità EN↔JA deterministica, SQL) + `market_valuations` con provenienza + pipeline dati **free/no-key** che un nuovo entrante non può ricostruire (TCGplayer API chiusa). E può essere **open + self-hostable + con Ollama**. |

### GAP 2 — "Quanto vale la MIA collezione e come la completo al minor costo"

| | |
|---|---|
| **Problema** | Valore totale onesto (per lingua/set), cosa manca per completare il set X, **quali carte comprare e a che prezzo per completarlo spendendo meno**, quali posizioni concentrano il rischio, cosa merita attenzione. |
| **Utente** | Completisti di set, collezionisti con 100+ carte. |
| **Job-to-be-done** | "Dammi un piano d'azione sulla mia collezione, non solo un numero." |
| **Perché oggi è frustrante** | Collectr/CollX danno il valore totale ma **nessuno calcola il percorso di completamento** dalla *tua* collezione reale. "Cheapest way to complete a set" è un tema con video YouTube e thread di forum — **tutto consiglio manuale**. Le carte JA nella collezione spesso non hanno valore mostrato (fonti EN-only). |
| **Competitor** | Collectr (valore, no piano), Moxfield (deck, no completamento-set economico), forum/YouTube (manuale). |
| **Perché non lo risolvono bene** | È un problema di **ottimizzazione su dati di mercato + il tuo inventario** — deterministico, ma nessuno l'ha impacchettato. E richiede la copertura cross-lingua per non ignorare metà collezione. |
| **Perché l'AI migliora il workflow** | L'LLM genera la **narrativa e le raccomandazioni** ("compra prima queste 8, sono l'80% del gap a €X"); i **numeri restano deterministici** (`portfolio_valuations` + un solver di ordinamento per prezzo). |
| **Cosa può fare DraGold che gli altri non possono facilmente** | `src/lib/portfolio/*` fa già il 70%. `portfolio_valuations` RPC risolve gli alias a query-time. `catalog_gaps` sa cosa esiste nel set. Manca solo il solver (~100 righe, deterministico) e il wrapping conversazionale. |

### GAP 3 — "Manutenere e migliorare un catalogo TCG open source con l'aiuto dell'AI"

| | |
|---|---|
| **Problema** | Un catalogo TCG serio ha debito continuo: canonical mancanti, alias cross-lingua, illustrator testo libero, immagini sbagliate, duplicati. Rilevarlo e proporre fix è lavoro manuale lento — il collo di bottiglia di *ogni* progetto catalogo (incluso DraGold: 9.306 canonical mancanti, `me4/me04`, `sets` rotta). |
| **Utente** | Manutentori DraGold + **contributor open source** (è uno strumento di progetto, non di consumo — molto on-brand per un OSS). |
| **Job-to-be-done** | "Proponi fix di data-quality che io possa rivedere e mergiare, senza scrivere niente automaticamente." |
| **Perché oggi è frustrante** | `catalog_gaps` rileva gap *set/carta* ma non gap di *qualità*. Il resto è lettura manuale di diff. TCGdex accetta PR ma la curatela resta umana. |
| **Competitor** | Nessuno. È un problema interno ai progetti catalogo, non un mercato. |
| **Perché l'AI migliora il workflow** | "Questi due set sembrano lo stesso perché [evidenza]", "queste 40 carte dovrebbero condividere canonical", "'Himeno Kagemaru' = 'Kagemaru Himeno'" — proposte strutturate, mai scritture. |
| **Cosa può fare DraGold che gli altri non possono facilmente** | `scripts/lib/reconcile/*` esiste già (classify-findings, identity-cascade, recovery). `card_versions` + `set_identity_key` danno il ground truth. È anche un **template riusabile da altri progetti catalogo** — un contributo all'ecosistema OSS. |

**Nota:** GAP 1 e GAP 2 sono **due modalità dello stesso agente**, non due prodotti. GAP 3 è un tool di progetto, non di consumo.

---

## 4. Candidati di prodotto — valutazione

### A — Ask DraGold (agente conversazionale)
**Verdetto: ✅ È il Prodotto #1.** Copre GAP 1. Con i due "recipe" (Card Dossier, Collection Report) copre anche GAP 2. Riusa tutto. Il comparabile (PokePrices) è closed e più povero. Vedi §9.

### B — Collection Intelligence
**Verdetto: 🟡 Non un prodotto separato — è un *recipe* di A (il "Collection Report").** ~70% già in `src/lib/portfolio/`. Il solver "cheapest completion path" (~100 righe deterministiche) è l'unico pezzo nuovo di sostanza. Farlo come modalità di A, non come app.

### C — TCG Research Agent
**Verdetto: 🟡 Non un prodotto separato — è l'altro *recipe* di A (il "Card Dossier").** È letteralmente A applicato a una carta con output strutturato (identità + versioni + rarità + market + storico + comparabili + KG + provenienza + confidence). Stesso agente, stessi tool, output schema diverso.

### D — AI Card Scanner / Identifier
**Verdetto: 🔴 DON'T BUILD.** È una **commodity affollata**: The Tin (OSS, on-device, AGPL) + Ludex + CollX + Collectr + ManaBox + OP.TCG + 10+ "AI scanner" quasi identici. L'accuratezza sui parallel/vintage è un problema irrisolto *per tutti*. DraGold non ha **nessun** codice vision e partirebbe da zero contro incumbent con anni di training data. **Non è differenziante.** Se un giorno serve, si integra un modello vision open (via il layer provider) come *input* all'agente — non come prodotto. La differenziazione DraGold è *dopo* l'identificazione (cosa vale, in quali lingue, con che fonti), non *nell'* identificazione.

### E — Catalog Copilot
**Verdetto: 🟡 BUILD LATER.** Copre GAP 3. Alto valore per la *salute del progetto* e la storia OSS/community, ma: (a) valore utente diretto basso, (b) il più difficile da fare bene (serve eval robusto per non proporre spazzatura), (c) ha senso *dopo* che l'harness e gli eval di A esistono. Da fare come 2° blocco, quando A è in produzione.

---

## 5. Product score

Scala 1–10. Complessità/dipendenza/rischio: **10 = migliore per noi** (cioè bassa complessità, bassa dipendenza, basso rischio).

| Dimensione | A — Ask DraGold | B — Collection Intel *(recipe di A)* | C — Research Agent *(recipe di A)* | D — Scanner | E — Catalog Copilot |
|---|---:|---:|---:|---:|---:|
| User pain | 8 | 8 | 8 | 6 | 4 *(pain del progetto)* |
| Market demand | 7 | 7 | 6 | 9 | 2 |
| Differentiation | 8 | 8 | 9 | **2** | 7 |
| AI leverage | 8 | 6 | 9 | 5 | 8 |
| DraGold leverage | 9 | **10** | 9 | **1** | 8 |
| Existing code reusable | 8 | **10** | 8 | **1** | 7 |
| Technical complexity *(10=semplice)* | 7 | 8 | 7 | **3** | 4 |
| Data dependency *(10=poca)* | 7 | 7 | 6 | 4 | 8 |
| Legal/data-source risk *(10=basso)* | 7 | 7 | 6 | **5** | 8 |
| Open-source fit | 9 | 9 | 9 | 6 *(The Tin già lo fa)* | **10** |
| Community potential | 8 | 6 | 7 | 4 | **9** |
| Monetization-around-OSS potential | 8 | 8 | 7 | 5 | 4 |
| Speed to MVP *(10=veloce)* | 8 | 7 | 8 | **2** | 4 |
| Long-term moat | 7 | 7 | **8** | **2** | 6 |
| **Media ragionata** | **7,9** | **7,7** | **7,6** | **3,8** | **6,1** |

### Giudizio da Product Manager (oltre il numero)

- **A, B, C non sono in competizione** — sono lo stesso prodotto. La matrice lo conferma: hanno profili quasi identici. La domanda reale non è "A o B o C" ma "quale *recipe* spedisco per prima dentro A". → **Card Dossier prima** (è A applicato a 1 carta, il caso d'uso più frequente e il più dimostrabile), **Collection Report subito dopo**.
- **D (Scanner) è un no netto** nonostante la "market demand" 9: differentiation 2, DraGold leverage 1, reusable code 1, speed-to-MVP 2. Arriveremmo ultimi in una gara persa, seny nessun asset. Il 9 di domanda è per *altri*.
- **E (Catalog Copilot)** ha il miglior *open-source fit* (10) e *community potential* (9) ma il peggior *speed-to-MVP* tra i sensati (4) e valore utente basso. È il **secondo blocco**, non il primo — e la sua vera funzione è rendere il progetto manutenibile da una community, il che conta *dopo* che una community esiste.
- Il numero da guardare è **DraGold leverage + reusable code**: A/B/C sono 8-10, D è 1-1. Costruiamo dove abbiamo già l'80% fatto.

---

## 6. The moat — "perché non chiedere direttamente a ChatGPT/Gemini/Claude?"

### Dimostrazione concreta

**Domanda:** *"Quanto vale il mio Charizard ex 151, versione giapponese, rispetto a quella inglese?"*

**ChatGPT / Gemini / Claude da soli:**
- Rispondono con **sicurezza** un numero (es. "circa $200-300").
- Non sanno che l'EN è `199/165` e la JA è `193/165` — **inventano** la corrispondenza dal nome.
- Nessun dato di mercato **live**: il prezzo è la media del training, mesi/anni vecchia.
- Nessuna **fonte**, nessuna **data**, nessuna **confidenza**.
- Nessun accesso alla **tua collezione**.
- Confondono spesso lingua, variante (SIR vs SAR vs base), e set (151 vs Obsidian Flames).

**Ask DraGold:**
1. `card_search("Charizard ex 151 japanese")` → candidati con set/numero/lingua reali → disambigua se serve.
2. `card_versions(canonical)` → **deterministicamente** (SQL, non "secondo me"): EN `sv03.5/199` ↔ JA `SV2a/193`, `link_basis='number_alias'`, `alias_note` = l'evidenza curata.
3. `card_valuation(en_id, 'EUR')` → `€152 · confidence: medium · confidence_reason: {3 obs, 1 source (TCGplayer market), updated Sep 2} · as_of: 2026-09-02`.
4. `card_valuation(ja_id, 'EUR')` → `confidence: none` → **"non ho ancora dati di mercato affidabili per la stampa giapponese"** (invece di inventarne uno).
5. Sintesi: *"EN Charizard ex 199/165 (151): €152 (medium, TCGplayer, al 2 set). JA 193/165: dati di mercato JP non ancora coperti. Sono la stessa carta (mappatura curata: SV2a 193 = sv03.5 199), ma mercati distinti — il premium JP tipico su questa categoria è +15/40%, ma senza dati diretti non lo affermo come valore."*

### Il moat è la *combinazione*, non un singolo pezzo

| Ingrediente | Perché un LLM generico non ce l'ha | Perché è difficile replicare |
|---|---|---|
| **Structured TCG identity** (`cards` + `canonical_cards`) | non ha un DB, ha ricordi | dati pubblici (TCGdex) — **non è un moat da solo** |
| **Cross-language identity** (`card_versions` + `set_alias` curato) | non può ricostruire SV2a≡sv03.5 dal testo | **la mappa curata + le eccezioni numero-a-numero sono lavoro editoriale che si accumula** |
| **Market data con provenienza** (`market_valuations` + `market_observations` + `confidence_reason`) | nessun dato live, nessuna fonte | **pipeline free/no-key** (TCGplayer API chiusa ai nuovi) + la metodologia di confidence |
| **Valuation engine spiegabile** | non calcola, ricorda | ~1.500 righe testate + i casi outlier già fixati (Fase 2.1) |
| **Collection data** (RPC con RLS) | non conosce la tua collezione | dati dell'utente, per definizione |
| **Deterministic tools** | l'LLM è probabilistico; i tool sono SQL | è *design*, non dati — ma pochi lo fanno |
| **Agent orchestration + honesty rules** | un LLM generico ottimizza la fluidità, non l'onestà | il system prompt + `agent_queries` che lo tunano nel tempo |
| **Open + self-hostable + provider-agnostic** | i prodotti chat closed (PokePrices) non lo sono | **è una scelta strategica che un incumbent commerciale non farà** (romperebbe il loro modello) |

### Cosa NON è un moat (da dire chiaramente)

- ❌ "Abbiamo dati carte" — TCGdex è pubblico, TCGCSV pure.
- ❌ "Usiamo l'AI" — tutti.
- ❌ "Abbiamo una chat" — è un `<input>` + un endpoint.
- ❌ Lo scanner — commodity, The Tin lo fa già in OSS.
- ❌ Il modello LLM — **è swappable, è il punto** (provider-agnostic).
- ❌ Grading prediction — commodity + rischio legale.
- ❌ "Multi-TCG" da solo — Collectr fa 25 giochi.

### Il moat difendibile, in una frase

> **DraGold AI è l'unico posto dove puoi chiedere in linguaggio naturale — o farlo dal tuo Ollama locale — e ottenere una risposta su identità cross-lingua e valore di mercato con la fonte, la data e la confidenza su ogni numero, o un onesto "non lo so"; e la mappa di identità cross-lingua + la metodologia di valutazione + la pipeline dati free sono un asset che si accumula e che un nuovo entrante commerciale non può ricostruire facilmente perché la TCGplayer API è chiusa e un incumbent non aprirà il proprio stack.**

---

## 7. OSS stack audit

| Categoria | Componente | Verdetto | Motivazione |
|---|---|---|---|
| **Agent/tool orchestration** | **Vercel AI SDK** (`ai` + `@ai-sdk/*`) | ✅ **USE** | MIT. È *già* il layer provider-agnostic (Anthropic/Google/Ollama/OpenAI-compatible). `streamText` + `tools` + `stopWhen` gestisce il loop. Streaming e structured output normalizzati. Non costruire un'astrazione propria. |
| | LangChain / LlamaIndex / CrewAI | ❌ **DON'T USE** | 40+ dipendenze transitive, astrazione sopra l'astrazione, lock-in, per 6 tool. |
| | Anthropic SDK `tool_runner` | 🟡 **MAYBE** | Valido se si resta Anthropic-only. Ma la provider-agnosticità è un requisito → AI SDK. |
| **Provider LLM** | Ollama | ✅ **USE** (come opzione self-host) | Apache-2.0, endpoint OpenAI-compatible. Zero API key per un fork. |
| | Gemini 2.0 Flash / Flash-Lite | ✅ **USE** (default hosted) | Miglior costo/qualità per il tier hosted (~$0,005/query). |
| | Claude Haiku/Sonnet | ✅ **USE** (opzione qualità / escalation) | Miglior tool-calling. |
| | Groq / DeepInfra / Together | 🟡 **MAYBE** | OpenAI-compatible → stesso adapter. Utile per un tier hosted economico e veloce. |
| **Vision / OCR / card recognition** | qualsiasi | ❌ **DON'T USE** (per ora) | Non costruiamo lo scanner (§4-D). Se un giorno serve un input-immagine per l'agente, un modello vision open (Qwen2-VL, ecc.) via il layer provider — non prima. |
| **Embeddings** | `@xenova/transformers` (bge-m3) / `nomic-embed-text` via Ollama | 🟡 **MAYBE** (non nel MVP) | Solo se serve ricerca semantica sul *testo effetto* delle carte. I primi recipe non ne hanno bisogno (§4 doc AI precedente). |
| **Vector DB** | **pgvector** (già su Supabase) | 🟡 **MAYBE** (non nel MVP) | Se/quando embeddings. Nessun DB nuovo. |
| | Pinecone / Qdrant / Weaviate | ❌ **DON'T USE** | Servizio in più per zero valore vs pgvector. |
| **PostgreSQL / search** | **pgroonga** | ✅ **USE** (prossimo, non MVP) | Tokenizzazione giapponese reale → search JA molto migliore di `pg_trgm`. Supabase-native. Utile alla multilingua a prescindere dall'AI. |
| **Web research** | Anthropic `web_search` / Gemini grounding | 🟡 **MAYBE** (Fase 2) | Per "quanto vale *oggi*" quando la cache è vecchia. A consumo. |
| | SearXNG self-hosted | 🟡 **MAYBE** | AGPL, servizio separato (non infetta il codice). Per il fork che vuole web research 100% self-host. |
| **Browser automation** | Playwright / Puppeteer | ❌ **DON'T USE** | Non facciamo scraping di marketplace (ToS). `node-html-parser` (già dep) basta per le fonti consentite. |
| **Scraping / ingestion** | `node-html-parser` (già dep) | ✅ **USE** (già in uso) | Immagini OP, nomi JA. Rate limit conservativo. |
| **Evaluation** | **`promptfoo`** | ✅ **USE** | MIT. Matrice modelli (Gemini × Haiku × Ollama) + assert ("0 prezzi inventati") + LLM-judge + report CI. Trigger notturno, non per-PR (costa). |
| | `node:test` (già in uso) | ✅ **USE** | Assert deterministici sui tool wrapper, in CI ad ogni PR. |
| | Braintrust / LangSmith | ❌ **DON'T USE** | SaaS, lock-in, per un eval che promptfoo fa in OSS. |
| **Observability** | Tabella `agent_queries` (nostra) + `@vercel/analytics` (già dep) | ✅ **USE** | Log per-query (domanda, tool, token, costo, modello, resolved). Semplice, self-hosted, sufficiente. |
| | Langfuse | 🟡 **MAYBE** | OSS, self-hostable, tracing agente ricco. Buono *se* il volume cresce. Non nel MVP (una tabella basta). |
| **Prompt/version management** | git + file `.md` nel repo | ✅ **USE** | I prompt sono codice, versionati con il resto. Niente tool esterno. |
| | PromptLayer / Humanloop | ❌ **DON'T USE** | SaaS per un problema che git risolve. |
| **Schema validation** | `zod` | ✅ **USE** | MIT, micro-dep. Schema "answer card" con `required` sui campi di provenienza. |

**Regola applicata:** aggiungere una dipendenza solo se sostituisce codice che dovremmo scrivere *e* mantenere. `ai` + `zod` + `promptfoo` (dev) = tutto il nuovo stack OSS. Il resto è codice DraGold o già-dep.

---

## 8. Build our own?

| Livello | Cosa | Chi lo fa | Perché |
|---|---|---|---|
| **COMMODITY — integra/riusa OSS, non costruire** | LLM inference | provider (Gemini/Claude/Ollama) via Vercel AI SDK | swappable per design |
| | Agent loop | Vercel AI SDK (`streamText` + `tools`) | MIT, fatto |
| | Output schema | `zod` | micro-dep |
| | Eval harness | `promptfoo` + `node:test` | MIT |
| | Vision/OCR (se un giorno) | modello open via provider | non è il nostro problema |
| | Embeddings/vector (se un giorno) | Transformers.js/Ollama + pgvector | fatto |
| | Search JA | pgroonga | Supabase-native |
| **DRAGOLD-SPECIFIC — costruire/mantenere noi** | I **tool** (`api/_lib/agent-tools.js`) | noi | codificano il modello dati + le regole di onestà |
| | Il **system prompt** + guardrail anti-allucinazione | noi | è il carattere del prodotto |
| | `card_versions` RPC + `set_alias` seed | noi (Fase A) | identità cross-lingua deterministica |
| | Valuation engine (`scripts/lib/valuation/`) | noi (già fatto) | metodologia confidence spiegabile |
| | `market_valuations` / `market_observations` + pipeline ingest | noi (già fatto) | dati free/no-key |
| | Il **solver "cheapest completion path"** (~100 righe) | noi | deterministico, nessuno l'ha impacchettato |
| | Gli **eval fixtures** (~30 domande + risposte attese) | noi | il contratto di qualità |
| | `agent_queries` + rate limiting + cost cap | noi | 1 tabella |
| | La UI "answer card" / "dossier" / "report" | noi | riusa componenti portfolio |
| **POTENTIAL MOAT — ciò che si accumula e diventa difficile replicare** | La **mappa di identità cross-lingua curata** (`set_alias` + `card_number_alias`) | noi + community | lavoro editoriale che cresce carta per carta, set per set |
| | I **KG edge** (`same_card_across_region` e futuri character/illustrator) | noi + community | grafo che si densifica nel tempo |
| | La **metodologia di valutazione** (rubrica confidence, outlier, dedupe) | noi | testata, raffinata su casi reali |
| | Il **corpus `agent_queries`** che tuna prompt e tool nel tempo | emergente | non replicabile senza traffico reale |
| | La **pipeline dati free/no-key** (TCGdex + TCGCSV) | noi (già) | **strutturalmente non replicabile dai nuovi entranti** (TCGplayer API chiusa) |
| | La **community OSS** attorno al progetto | da costruire | il moat più forte se si forma, zero se non si forma |

**Risposta secca:**
- **Costruiamo noi:** i tool, il system prompt, `card_versions`, il solver di completamento, gli eval, `agent_queries`, la UI. + il moat accumulabile (mappa cross-lingua, KG, metodologia).
- **Prendiamo OSS:** Vercel AI SDK, zod, promptfoo, pgroonga, (dopo) Transformers.js/pgvector.
- **Integriamo:** Ollama / Gemini / Claude come provider intercambiabili.

---

## 9. Prodotto #1 — BUILD THIS FIRST

### `Ask DraGold` — the open TCG intelligence agent

**Nome provvisorio:** `Ask DraGold` (il campo), con due output firmati: **Card Dossier** e **Collection Report**.

**Value proposition:** *"Chiedi qualsiasi cosa su una carta o sulla tua collezione — dal browser o dal tuo Ollama locale — e ricevi una risposta con la fonte, la data e la confidenza su ogni numero. O un onesto 'non lo so'. Open source, self-hostable, senza vendor AI obbligatorio."*

**Target:** collezionista intermedio/avanzato EU (compra EN + JA), completista di set, chi rivende/assicura. Secondariamente: sviluppatori/contributor OSS che vogliono un backend TCG agentico reale.

**User journey:**
1. Home DraGold: campo *"Ask about any card…"* + 3 esempi (*"How much is my Charizard ex 199/165?"* · *"What's my collection worth?"* · *"Japanese vs English version of this card?"*).
2. L'utente scrive. Streaming della risposta.
3. **Card Dossier** (domanda su una carta): answer card con — carta identificata · tutte le versioni linguistiche (da `card_versions`) · rarità · valore EN + valore JA **separati**, ciascuno con range/confidence/as-of/fonti · trend 30d · comparabili · link "vedi annunci attivi" (eBay) · azioni (aggiungi a portfolio, apri card page). Oppure "non ho abbastanza dati".
4. **Collection Report** (domanda sulla collezione, richiede login): valore totale EUR (breakdown lingua/set) · mix confidence · top movers · sezione "carte non valutate" · **"percorso più economico per completare il set X: queste 8 carte, €Y totali"**.
5. Follow-up in un pannello (stesso `session_id`): *"and near-mint?"*, *"add 2 to my collection"*.

**MVP — cosa include:**
- `POST /api/ask` (Vercel serverless Node, streaming, Vercel AI SDK).
- 6 tool read-only: `card_search`, `card_versions`, `card_valuation`, `price_history`, `live_market`, `collection`.
- Structured output `AnswerCard` (zod, `required`: value/currency/confidence/as_of/sources).
- System prompt + 6 regole anti-allucinazione.
- `agent_queries` (log + rate limit + cost).
- UI: campo "Ask" in home + `<AnswerCard>` (riusa `ConfidenceBadge`, `portfolio-valuation.css`) + follow-up panel.
- Provider via env: default Gemini Flash; `DRAGOLD_LLM_PROVIDER=openai-compatible` → Ollama.
- ~25 eval fixtures (promptfoo).

**Cosa NON includere nel MVP:**
- ❌ Lo scanner / input immagine.
- ❌ Il solver "cheapest completion path" (Collection Report v1 = valore + gap list; il solver è la settimana successiva).
- ❌ `web_research` (cache-only per ora).
- ❌ Embeddings / ricerca semantica testo effetto.
- ❌ Grading prediction.
- ❌ KG traversal (character/illustrator) — le entità non sono normalizzate.
- ❌ Memoria cross-sessione.
- ❌ Academy tutor.
- ❌ Multi-TCG "completo" — coprire dove ci sono valutazioni (Pokémon SV + One Piece OP-01→17); dire onestamente "non coperto" altrove.

**Schermate principali:** (1) Home con campo Ask + esempi. (2) Answer card (Dossier). (3) Follow-up panel. (4) Collection Report (per utenti loggati, CTA da Collection view).

**Agent workflow (Card Dossier):**
```
domanda → [card_search] → (disambigua se >1) → card_id/canonical
  → [card_versions] → righe EN/JA/altre + link_basis + alias_note
  → per la lingua chiesta (o EN default): [card_valuation]
  → per la lingua alternativa: [card_valuation]
  → opz. [price_history] se la domanda cita trend
  → opz. [live_market] se confidence='none' o "oggi"
  → sintesi in AnswerCard (numeri verbatim dai tool, provenienza obbligatoria)
```

**Tool necessari:** i 6 sopra. `card_versions` richiede **Fase A** (spec + piano già pronti).

**Dati necessari:** `cards`, `canonical_cards`, `market_valuations` (6.706), `market_observations` (20k), `set_alias` (Fase A seed), `collection` (JWT). Tutti esistono o Fase A.

**Componenti OSS:** `ai` + `@ai-sdk/google` + `@ai-sdk/openai-compatible` (+ `@ai-sdk/anthropic` opz.), `zod`, `promptfoo` (dev).

**Codice DraGold riutilizzato:** `src/lib/search.js`, `scripts/lib/valuation/*` (via `market_valuations`), `api/live-market.js` + `api/_lib/ebay.js`, RPC `portfolio_valuations`/`portfolio_value_history`/`card_versions`, `src/lib/portfolio/*`, `ConfidenceBadge`/`portfolio-valuation.css`.

**Nuovo codice:** `/api/ask` (~150) · `api/_lib/agent-tools.js` (~220) · `api/_lib/llm/index.js` (~40) · system prompt (~1 file) · migration `agent_queries` (~30) · `<AskField>` + `<AnswerCard>` + follow-up panel (~250) · ~25 eval fixtures. **~700 righe totali + i fixtures.**

**Architettura:** un endpoint serverless sullo stesso Vercel, stesso Supabase, stesso linguaggio (JS ESM). Nessun servizio nuovo, nessuna coda, nessun Python. `card_versions` (Fase A) come backbone identità.

**Difficoltà:** **Media.** Il rischio è l'identificazione carta da NL — mitigato da `card_search` + `card_versions` deterministici e dalla regola "disambigua, non indovinare".

**Tempo realistico:** **10 giorni** (dopo che Fase A è mergiata). §10.

**Rischi:**
| Rischio | Mitigazione |
|---|---|
| Pre-lancio, 0 utenti → nessuno lo prova | Beta pubblica + post community alla settimana 4 come gate |
| Identificazione carta sbagliata | disambiguazione obbligatoria; `card_versions` deterministico; eval con target ≥90% |
| Prezzo inventato / provenienza persa | structured output `required`; system prompt vieta aritmetica; eval assert bloccante "0 fabbricazioni" |
| Copertura valutazione ~3% delle carte | MVP limitato ai TCG/set coperti; "non coperto" onesto; espansione fonti prezzo in parallelo |
| Costo inference se decolla senza monetizzazione | rate limit stratificato, `agent_queries.cost_usd` monitorato, kill-switch |
| Fase A non ancora fatta | è prerequisito — spec + piano pronti, ~1 settimana |

**Metriche di successo (dopo 4 settimane beta):**
- ≥ 60% domande economiche `resolved` con carta corretta al 1° tentativo.
- **0 casi di prezzo inventato / provenienza mancante** (audit manuale campione).
- Costo medio/query < $0,02.
- Almeno un segnale di retention (utenti che tornano).
- Almeno un segnale di community (star, fork, issue, un contributor esterno) dopo il post pubblico.

---

## 10. MVP in 10 giorni (costruibile con Claude Code / Codex)

Precondizione: **Fase A mergiata** (spec + piano `docs/plans/2026-09-03-cross-language-identity-*` — ~1 settimana a parte) e **repo pubblico + LICENSE** (~mezza giornata).

| Giorno | Lavoro | Milestone verificabile |
|---|---|---|
| **1** | `api/_lib/llm/index.js` (factory provider da env) + `npm i ai @ai-sdk/google @ai-sdk/openai-compatible zod`. Smoke test: `generateText` con Gemini Flash e con Ollama locale. | `node scripts/smoke-llm.mjs` risponde con entrambi i provider. |
| **2** | `api/_lib/agent-tools.js` — `card_search`, `card_lookup`. Test `node:test` (mock Supabase): shape output, input malformato → errore pulito, **mai una scrittura**. | `node --test` verde per i 2 tool. |
| **3** | `agent-tools.js` — `card_versions`, `card_valuation`. Test. `agent_queries` migration + `_down` + apply. | 4 tool testati; tabella `agent_queries` in DB. |
| **4** | `agent-tools.js` — `price_history`, `live_market`, `collection` (JWT). Test. | 7 tool testati (contando `card_lookup`). |
| **5** | `POST /api/ask` — `streamText({ model, system, messages, tools, stopWhen: stepCountIs(6) })` + structured output `AnswerCard` (zod) + write `agent_queries`. System prompt v1 + 6 regole. | `curl -N /api/ask -d '{"q":"how much is charizard ex 199/165"}'` → risposta streaming con provenienza. |
| **6** | Iterazione system prompt su ~15 domande di test (identificazione, disambiguazione EN/JA, "non lo so", fuori scope). Rate limit (counter `agent_queries` + edge middleware anon). | 15/15 domande gestite correttamente a mano. |
| **7** | UI: `<AskField>` in home (sopra l'Atlas) + 3 esempi. `<AnswerCard>` (riusa `ConfidenceBadge`, palette portfolio). | Domanda dalla home → answer card renderizzata, mobile 390px ok. |
| **8** | Follow-up panel (stesso `session_id`, pannello espandibile). CTA "Ask about your collection" nella Collection view (pre-carica contesto). `npm run build` verde. | Follow-up funziona; build verde; preview Vercel. |
| **9** | ~25 eval fixtures + `promptfoo` config (Gemini Flash × Haiku × qwen2.5:14b). Run. Assert: identificazione ≥ 85%, **0 prezzi inventati**. | Report promptfoo allegato; assert bloccanti verdi. |
| **10** | Beta flag (`VITE_ASK_ENABLED`). QA autenticato (Collection Report v1 = valore + gap list, **senza** solver). Smoke test costo (`agent_queries.cost_usd`). Deploy. Scrivi il post community (r/PTCG o r/onepiececg + Show HN, se il repo è pubblico). | `Ask DraGold` live dietro flag; `agent_queries` popolata; post pronto. |

**Reversibile:** è 1 endpoint + 1 componente + 1 tabella + 1 dep. `git revert` + `drop table agent_queries` + `_down` = stato pre-MVP.

**Settimana successiva (non nel MVP):** solver "cheapest completion path" (~100 righe) → Collection Report v2. Poi: espansione fonti prezzo (Cardmarket + eBay-sold) per rompere il cap `medium`.

---

## 11. Open source strategy

### Precondizione (oggi mancante)

Il repo è **PRIVATO e senza `LICENSE`**. Prima di tutto:
1. **Repo pubblico.**
2. **`LICENSE`** + **`LICENSING.md`** (sotto).
3. `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `SELF_HOSTING.md`.
4. `docker-compose.yml` + `.env.example`.

### Apache-2.0 vs MIT vs AGPL — raccomandazione: **Apache-2.0**

| | MIT | **Apache-2.0** | AGPL-3.0 |
|---|---|---|---|
| Permissiva | ✅ | ✅ | ❌ copyleft forte |
| Clausola brevetti esplicita | ❌ | ✅ | ✅ |
| `NOTICE` / attribuzione strutturata | ❌ | ✅ | ✅ |
| Un fork ospitato deve ripubblicare le modifiche | ❌ | ❌ | ✅ |
| Adozione da parte di aziende/altri progetti | massima | massima | **frenata** |
| Coerente con "monetizzazione = hosting, non codice" | ✅ | ✅ | ⚠️ AGPL protegge il codice ma la monetizzazione DraGold non è sul codice |

**Apache-2.0:** stesso spirito di MIT + protezione brevetti (importante se il progetto scala e attira attenzione) + `NOTICE` per gestire pulitamente l'attribuzione. **AGPL sarebbe sbagliato qui:** frena l'adozione (aziende e altri progetti TCG lo eviterebbero) e "protegge" un asset — il codice — che non è dove sta il valore (il valore è hosting + dati curati + community). The Tin usa AGPL perché *è* un'app finita; DraGold vuole essere una *piattaforma riusata da altri*.

### Repository structure

```
/                     Apache-2.0
├── src/              frontend (React/Vite)
├── api/              serverless functions (+ api/_lib/llm, api/_lib/agent-tools)
├── scripts/          sync, ingest, valuation, reconcile, eval
├── supabase/migrations/   schema (open)
├── data/
│   ├── cross-language/     mappe curate — CC0-1.0 (LICENSE proprio)
│   └── ...                 altri dati curati — CC0
├── evals/            eval fixtures + promptfoo config
├── docs/             spec, plan, questo audit
├── docker-compose.yml
├── LICENSE           Apache-2.0
├── LICENSING.md      software vs dati (sotto)
├── SELF_HOSTING.md
└── CONTRIBUTING.md
```

### Distinzione codice / dati propri / dati di terzi (`LICENSING.md`)

| Classe | Cosa | Licenza | Redistribuibile |
|---|---|---|---|
| **Software** | tutto in `src/`, `api/`, `scripts/`, `supabase/migrations/` | Apache-2.0 | ✅ |
| **Dati curati first-party** | `data/cross-language/*`, futuri KG edge, contenuti Academy, note editoriali | **CC0-1.0** | ✅ |
| **Dati catalogo di terzi** | nomi/immagini/testo carta da TCGdex, prezzi/immagini da TCGCSV, immagini Bandai | non nostri | ❌ — un fork esegue la propria sync (tutte fonti free/no-key) |
| **Dati derivati** | `market_valuations`, `market_observations` (derivati da TCGCSV/TCGplayer market) | metodo aperto (codice); valori = derivato di fonte commerciale | 🟡 pubblica la metodologia, non promettere un bulk-dump di prezzi |
| **Output AI** | risposte dell'agente | generati per-richiesta | — |

### Local-first AI / no vendor lock-in / no pay-to-use

Il progetto **deve** funzionare completamente con:

```
Ollama (qwen2.5:14b + bge-m3)  +  Supabase/Postgres locale  +  TCGdex + TCGCSV (free, no key)
```

Nessun provider AI a pagamento obbligatorio. `DRAGOLD_LLM_PROVIDER=openai-compatible` + `DRAGOLD_LLM_BASE_URL=http://localhost:11434/v1`. `scripts/bootstrap-catalog.mjs` fa la prima sync. Il fork ha tutto.

### Community contribution

- `data/cross-language/set-aliases.json` — PR-friendly, ogni riga è un'asserzione fattuale con `note` e `confidence`. Un contributor aggiunge una mappa, la review verifica l'evidenza.
- `evals/agent/questions.yaml` — chiunque può aggiungere una domanda + risposta attesa.
- Il **Catalog Copilot** (BUILD LATER) genera candidati che i contributor rivedono → il ciclo di data-quality diventa community-driven.
- `CONTRIBUTING.md` con il "confidence bar" esplicito: *in dubbio → candidate, mai confirmed*.

---

## 12. Business model senza chiudere l'OSS

| Modello | Cosa vendi | Realistico **prima** della community? | Realistico **dopo** la community? |
|---|---|---|---|
| **Sponsorship / GitHub Sponsors / OpenCollective** | niente — supporto volontario | 🟡 marginale, ma zero attrito | ✅ |
| **Hosted DraGold** (dragold.org) | istanza gestita: catalogo sempre fresco, free tier generoso, **limiti più alti** a pagamento (non feature — *limiti*) | 🟡 puoi ospitarlo ora, ma senza utenti non genera | ✅ **il modello principale** |
| **DraGold Cloud API** | endpoint agente/valuation gestito, pay-per-use (paghi la *compute*, non il codice) | ❌ nessuno lo compra senza aver visto il valore | ✅ |
| **Managed data ingestion** (subscription) | un feed prezzi/mapping curato, verificato, sempre aggiornato — il *lavoro di curatela* | ❌ | ✅ (soprattutto per dealer/negozi) |
| **Professional services / white-label** | setup, personalizzazione, la-tua-istanza per un negozio/community | 🟡 possibile subito se qualcuno chiede | ✅ |
| **Enterprise support** | SLA, priorità, hosting dedicato | ❌ | ✅ (tardi) |

**Il modello che ha senso SOLO dopo la community:** Cloud API, data subscription, enterprise. Richiedono che qualcuno *voglia* già il prodotto.

**Il modello realistico PRIMA:** sponsorship + hosted con donazioni + eventuali professional services su richiesta. Basso, ma **zero attrito con l'OSS** e non serve a coprire i costi finché i costi sono bassi (pre-lancio).

**Regola:** ogni euro di monetizzazione arriva da *hosting, compute, curatela, supporto* — mai da una riga di codice che un fork non può eseguire. Precedenti: Supabase, Cal.com, PostHog, Plausible, Forgejo.

---

## 13. Final verdict

### BUILD NOW
- **Repo pubblico + Apache-2.0 + `LICENSING.md`** (mezza giornata — precondizione).
- **Fase A** (cross-language identity — spec + piano già pronti, ~1 settimana).
- **`Ask DraGold` MVP** (10 giorni) — l'agente + 6 tool + Card Dossier + Collection Report v1, dietro beta flag, Gemini Flash default + Ollama supportato.
- **Espansione fonti prezzo** (Cardmarket + eBay-sold) *in parallelo* — indipendente, rompe il cap `confidence=medium`.

### BUILD LATER
- Solver "cheapest completion path" → Collection Report v2 (settimana +1).
- `web_research` tool (quando la cache non basta).
- **Catalog Copilot** (GAP 3) — quando l'harness eval di Ask DraGold esiste; è il moltiplicatore di forza per la community.
- pgroonga per search JA.
- KG normalizzato (character/illustrator/series) + vista grafo.
- Embeddings / ricerca semantica testo effetto — solo se emerge la domanda.

### DON'T BUILD
- **Card scanner / vision / grading prediction** — commodity satura (The Tin OSS + 20 app), zero asset DraGold, zero differenziazione. Se serve un input-immagine all'agente un giorno, si integra un modello open via il layer provider.
- **Framework AI proprietario** — Vercel AI SDK esiste.
- **RAG / vector DB** senza un caso d'uso reale.
- **Un "ChatGPT con dati TCG"** — sarebbe PokePrices ma peggio. Il valore è nei *tool deterministici* e nella *provenienza*, non nella chat.
- **Pro edition / feature core a pagamento / feature che scadono** — vietato dalla strategia.
- **Multi-collezione, social, marketplace, trading** — scope creep.

### BIGGEST RISK
**Pre-lancio con 0 utenti: l'agente può essere ottimo e non presentarsi nessuno.** Secondariamente: il moat dipende da lavoro di data-quality (canonical, cross-lingua) ancora in corso; e il costo inference se decolla senza monetizzazione. → Mitigazione: la settimana 4 è un *gate* (beta pubblica + post community), non un traguardo.

### BIGGEST OPPORTUNITY
**Essere l'implementazione di riferimento open source dell'"agente di intelligence TCG"** — il backend reale che ogni MTG-MCP-server hobbyista vorrebbe avere, in un momento in cui (a) la TCGplayer API è chiusa ai nuovi, (b) pokemontcg.io free sta morendo, (c) il tool-calling LLM è maturo, (d) la provider-abstraction (Vercel AI SDK) è stabile, (e) il gap EN/JA è al picco di attenzione. First-mover su OSS + provider-agnostic + provenance-first.

### PRODUCT #1
**`Ask DraGold`** — l'agente conversazionale open, self-hostable, provider-agnostic, con Card Dossier e Collection Report come output firmati. Provenienza e confidenza su ogni numero, o un onesto "non lo so".

### WHY US
I tool deterministici che fanno la differenza **esistono già o sono a una settimana**: valuation engine testato (`scripts/lib/valuation/`), identità cross-lingua (Fase A pronta), pipeline dati free/no-key (TCGdex + TCGCSV), portfolio (`src/lib/portfolio/` — 70% del Collection Report), 567 test. **Nessun altro progetto OSS ha questo stack.** Un nuovo entrante commerciale non può replicare la pipeline dati (TCGplayer API chiusa) e non aprirà il proprio codice.

### WHY NOW
TCGplayer API chiusa ai nuovi sviluppatori (fine 2024) · pokemontcg.io free tier in dismissione · Vercel AI SDK stabile · Ollama tool-calling maturo · il gap EN/JA documentato ovunque e monetizzato da altri (PokemonPriceTracker) ma risolto da nessuno con identità deterministica · gli MTG-MCP-server provano la domanda ma non hanno un backend.

### "Se fossi il co-founder/PM di DraGold, investiresti i prossimi 30 giorni su questo progetto?"

# YES

**Motivazione:** il costo per scoprire se funziona è basso e limitato nel tempo. 30 giorni = (settimana 1) repo pubblico + LICENSE + merge Fase A · (settimane 2-3) `Ask DraGold` MVP riusando il 90% di ciò che esiste · (settimana 4) beta pubblica + un post r/PTCG/r/onepiececg/Show HN. Il downside è 30 giorni di lavoro su un'infrastruttura che comunque serve (identità cross-lingua, tool wrapper, eval). Il gap competitivo è **reale e verificato** — nessun prodotto OSS, self-hostable, provider-agnostic, provenance-first esiste, e il fossato dati si è chiuso per i nuovi entranti proprio mentre DraGold ha già risolto l'ingestione free. Se alla settimana 4 il post pubblico riceve solo silenzio, *quello* è il segnale per fermarsi — ma non lo sai finché non lo costruisci, e costruirlo costa poco.

Il **NO** sarebbe giustificato solo se: (a) volessimo competere sullo scanner (non lo facciamo), (b) il core dovesse essere closed per monetizzare (non deve), (c) non esistesse già l'infrastruttura dati (esiste). Nessuna delle tre è vera.

---

## Appendice — decisione A/B/C richiesta

**A) Continuare a trasformare DraGold in un prodotto AI TCG** → **✅ QUESTA.**
Riformulata: DraGold diventa *"the open TCG intelligence layer"*, con `Ask DraGold` come headline e KG/Academy/Collection che restano (l'agente li *usa*). Non si butta niente.

**B) Creare un prodotto separato con la tecnologia DraGold** → ❌ nessuna ragione. L'infrastruttura (valuation, identità, catalogo, portfolio) *è* DraGold; separarla creerebbe due codebase per zero beneficio.

**C) Abbandonare questa direzione** → ❌ il gap è reale e verificato, l'infrastruttura è pronta all'80%, il timing è favorevole. Abbandonare ora significherebbe non aver testato l'ipotesi più promettente a un costo di 30 giorni.
