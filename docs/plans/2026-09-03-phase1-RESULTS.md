# Fase 1 — Catalog Freshness & Release Monitor — RISULTATI

> **Data:** 2026-09-02 · **Branch:** `feature/catalog-freshness-monitor` (pushato, non mergiato)
> **Piano:** `docs/plans/2026-09-03-phase1-catalog-freshness-release-monitor.md`
> **Verifica:** 54/54 test catalog, 495/495 test `scripts/**`, `npm run build` verde, migrazioni applicate su produzione con integrity check, OP-17 sincronizzato e verificato end-to-end.

---

## Sintesi

DraGold ora **si accorge da solo** quando un set/carta/promo esiste upstream e non è nel database, lo mette in coda, lo sincronizza e lo marca risolto — **senza modifiche al codice**. Verificato sul caso reale **OP-17** ("The World's Strongest Warriors", uscito EN il 2026-08-28): era assente da DraGold da 5 giorni, ora è dentro con 177 carte, immagini e prezzi, e il gap è `resolved`.

`Released but missing` è una **metrica persistente** in `catalog_gaps` + `catalog_freshness_runs`, non una riga di log.

---

## Per blocco

### 1. `Released but missing` come KPI persistente

**Problema.** Il diff upstream↔DB esisteva (`scripts/lib/reconcile/reconcile-catalog.mjs`) ma non era collegato a nulla, non girava mai contro produzione, e non conservava nulla nel tempo. Non c'era modo di rispondere a "quali carte ufficialmente disponibili non esistono ancora?".

**Soluzione.** Due tabelle nuove + un job giornaliero.
- `catalog_gaps` — una riga per entità mancante, con `source`, `source_id`, `entity_type` (set/card/promo/special/product), `set_code`, `card_number`, `name`, `release_date`, `status` (missing→queued→syncing→resolved/error/ignored), `detail` (evidenza jsonb), `error_message`, `retry_count`, `first_seen_at`, `last_seen_at`, `resolved_at`. **È anche la sync queue** (nessuna tabella coda separata → meno architettura). `unique(tcg, language, entity_type, source, source_id)` garantisce l'idempotenza.
- `catalog_freshness_runs` — storico KPI per ogni esecuzione.
- Entrambe RLS on, lettura pubblica (metrica trasparente), scrittura solo `service_role`.

**Alternative scartate.**
- Funzione Postgres `SECURITY DEFINER` per l'upsert parziale → scartata: il payload che **omette** `status`/`retry_count`/`resolved_at`/`first_seen_at` ottiene lo stesso risultato (default su INSERT, invariati su UPDATE) senza una funzione in più da auditare.
- Tabella `sync_queue` separata → scartata: `catalog_gaps.status` è già una coda.

**Implementation.** `supabase/migrations/20260902160000_catalog_gaps_and_freshness_runs.sql`; `scripts/lib/catalog/gaps-store.js` (unica scrittura DB del layer).

**Verification.** Migration applicata; check constraint verificati (`entity_type`/`status` invalidi → errore); `get_advisors` security → nessun nuovo warning; integration test reale: insert → re-upsert idempotente (`first_seen_at` stabile, `last_seen_at` avanza, 0 duplicati) → `resolveGapsNotIn` → cleanup.

**Status.** local + branch. **Remaining.** —

---

### 2. Discovery source-driven (niente più liste hardcoded)

**Problema.** One Piece EN era fermo: `sync-full.js` enumerava `OP-01..25, ST-01..30, EB-01..05` hardcoded, e la fonte primaria `optcgapi.com` è **ferma a OP-12 / "inizio 2025"**. Un OP-17 nuovo non poteva essere scoperto senza toccare il codice.

**Soluzione.**
- **Pokémon** → **TCGdex** (`/v2/{lang}/sets` + detail per `releaseDate`/serie/logo). Già in uso, aggiornata (ha me05 "Pitch Black" del 2026-07-17).
- **One Piece** → **TCGCSV** (`tcgplayer/68/groups` → 87 group con `abbreviation` + `publishedOn`; `.../products` → numero/rarità/immagine; `.../prices` → market/low/mid/high per productId × Normal/Foil). Free, no API key, aggiornata 1×/giorno ~20:00 UTC. **OP-17 era su TCGCSV il giorno stesso dell'uscita.**
- La lista dei set viene **sempre** da `listTcgcsvGroups(68)` / `listTcgdexSets()`. Un `OP-19` ancora ignoto diventa gap automaticamente (test dedicato: `reconcile.test.js` "scoperta del prossimo set ignoto").

**Alternative scartate.**
- **apitcg.com** → retrocessa a secondaria (ToS uso commerciale non validato, repo dati GitHub fermo a 2026-05). Non necessaria: TCGCSV copre catalogo + prezzi + date.
- **optcgapi.com** → scartata (ferma a OP-12).
- **Limitless API** → solo dati tornei, nessun catalogo carte.

**Dettaglio operativo scoperto in validazione.** TCGCSV **blocca lo User-Agent di default di Node** (`node`) con HTTP 401 → `tcgcsv-catalog.js` invia uno UA descrittivo `DraGold-CatalogBot/1.0 (+https://dragold.org)`.

**Implementation.** `scripts/lib/catalog/`: `normalize-set-code.js`, `sources/tcgdex-catalog.js`, `sources/tcgcsv-catalog.js`, `classify-entity.js`, `reconcile-sets.js`, `reconcile-cards.js`, `card-number-key.js`, `onepiece-groups.js`.

**Verification.** 54 test unit; smoke live: `diffSets` contro TCGCSV reale → OP-17 rilevato come released-but-missing, OP-18/EB-05 come upcoming.

**Status.** local + branch. **Remaining.** Etichette TCGCSV combinate (`OP15-EB04`, `EB-03-04`) gestite col "primo token strutturato"; i bucket promo a suffisso alfabetico (`OP-PR`, `OP-DD`) classificati come promo, mai come "set mancante".

---

### 3. Il job: `catalog-freshness.js` + KPI

**Comportamento.** Per ogni target (`pokemon:en`, `pokemon:ja`, `onepiece:en`): discovery upstream → `diffSets` vs `cards.set_id` (paginato — **non** `canonical_cards`, che copre solo ~18 set Pokémon) → gap `set`/`promo`/`special` → `upsertGaps` + `resolveGapsNotIn`. Card-level diff **solo Pokémon** (TCGdex = stessa numerazione del DB); per One Piece il diff per-carta è Fase 1.5 (oggi DB e TCGCSV usano numerazioni non allineate su anthology/reprint/parallel → falsi positivi). Copertura One Piece = **set-level** (set mancante ⇒ tutte le sue carte mancanti).

**KPI (`kpi.js`, puro).** `source_catalog_sets`, `dragold_catalog_sets`, `new_sets/cards/promos`, **`released_but_missing_sets`**, `released_but_missing_promos`, `released_but_missing_cards`, `upcoming_sets`, `resolved_gaps`, `failed_syncs`, `ingestion_delay_days` (solo espansioni numerate), `latest_upstream_release`, `latest_dragold_synced_release`, `cards_synced_24h/7d`, `stale_sources`, + `released_but_missing_detail` (tabella). Reso come markdown in `$GITHUB_STEP_SUMMARY`.

**Filtro "archeologia".** Un set mancante uscito oltre 900 giorni fa non è freschezza ma backfill storico → non genera gap (evita che i meta-set TCGdex tipo "Jumbo cards" del 2000 inquinino il KPI). Override `--backfill-window-days`.

**Verification.** Girato su produzione. Idempotenza: run 1 `new_sets:3, new_promos:11`; run 2 `new_sets:0` (nessun duplicato, `select count = count(distinct source_id)`).

**Status.** local + branch + **eseguito su produzione** (4 righe in `catalog_freshness_runs`).

---

### 4. Ingestion One Piece da TCGCSV — `sync-onepiece.js`

**Soluzione.** `runOnePieceSync({ sets | since | all })`. Lista set **sempre** da `listTcgcsvGroups(68)`. Per group: prodotti + prezzi → righe. `id` namespaced `onepiece:tcgcsv:<productId>:en` (non collide con le righe `optcg` esistenti). Prodotti sigillati (box/pack/deck) esclusi da `cards`. `print_variant` dedotto dal nome (`(Alternate Art)`→parallel, `(Manga)`→manga). Prezzi → `card_prices` (source `tcgcsv`, **currency USD** — conversione EUR + valuation engine = Fase 2), una riga per carta/run.

**Verification (OP-17, produzione).** 177 carte (130 numeri + DON!!), **177 immagini** dal CDN TCGplayer (niente hotlink rotto), 177 prezzi FK-linked, 38 varianti. Re-run: `cards` invariato (upsert su `id`), `card_prices` = nuovo snapshot con `captured_at` distinto.

**Status.** local + branch + **OP-17 e altri 9 set su produzione**. **Remaining.** Vedi §Rischi.

---

### 5. La coda: `catalog-sync.js`

**Comportamento.** `nextQueuedGaps` (status missing/error, `retry_count < 3`, salta i set con release date **futura**) → `markSyncing` → ingestion mirata (`runOnePieceSync` per One Piece, `scripts/sync-cards.js --set=` per Pokémon) → verifica presenza reale in DB → `markResolvedById` | `markError` (+`retry_count++`, `error_message`).

**Verification (produzione).** 10 gap `missing` → tutti `resolved` in un run: OP-17, OP-17-RE, ST-31…ST-36, OP-15-RE, OP-16-RE. **OP-17: `first_seen_at` 16:43 → `resolved_at` 17:05** (`resolved_at > first_seen_at`). Freshness post-sync: `released_but_missing_sets` **1 → 0**. Re-run freshness: OP-17 resta `resolved` (non riaperto), OP-18/EB-05 restano `upcoming` (non `missing`).

**Status.** local + branch + eseguito su produzione.

---

### 6. `set_logos` v2 + Upcoming/transizione

**Problema.** `set_logos` (214 righe) aveva `release_date` come **testo**, per One Piece tutte `2025-02-28` (placeholder), nessun `status`, nessuna provenance, nessun guard anti-`sv10`/`SV10`. Era la tabella che l'app legge (`src/lib/tcgSets.js`, `src/pages/set/setPageData.js`).

**Soluzione.** Migration **additiva e reversibile**: `released_on` (date), `status` (announced/upcoming/released/available/complete/legacy), `source_confidence` (high/medium/low), `card_count`, `series_id/name`, `updated_at`, + `set_code_norm` **generated** con `UNIQUE(tcg, set_code_norm)` = guard anti-regressione casing. Backfill: `released_on` da testo (214/214 parsabili), `status` derivato dalla data, `source_confidence='low'` sulle righe non verificate. `sync-set-catalog-v2.js` popola da TCGdex (Pokémon) + TCGCSV (One Piece) con upsert per `(tcg, set_code_norm)` e **null-protection** sugli asset esistenti; a fine run `update ... set status='released' where status='upcoming' and released_on <= today`.

Le letture app usano ancora `release_date` (testo, invariato) → **nessuna regressione**; la migrazione a `released_on` è graduale (Fase 4 Explore).

**Verification.** Integrity check post-migration: 214→214 righe, 0 date perse, `count(distinct (tcg,set_code_norm)) = count(*)` (unique tiene). Run reale: `set_logos` **214 → 345** (92 Pokémon + 39 One Piece nuovi). OP-17 `released`/`tcgcsv`/`high`; me05 `released`/`high`/`card_count=84`; OP-18 `upcoming`. Re-run: `inserted:0` (idempotente). File DOWN presente (`..._down.sql`).

**Status.** local + branch + **applicata e popolata su produzione**.

---

### 7. Workflow `catalog-freshness.yml` + CI test

**Soluzione.** `.github/workflows/catalog-freshness.yml` — cron `0 6 * * *` + `workflow_dispatch` (`only`, `dry_run`). Job: `freshness` (detect+KPI) → `sync` (drain queue + set-catalog + re-KPI) → `report` (fallisce se un job fallisce). `concurrency` per evitare run sovrapposti.
`.github/workflows/tests.yml` — `node --test` su `src` + `scripts` (**prima non esisteva alcun gate CI**).
`package.json`: `test:scripts`, `catalog:freshness`, `catalog:sync`, `sync:onepiece`, `sync:set-catalog`.

**Verification.** YAML: 14 espressioni `${{ }}` bilanciate, 0 tab. Ogni script invocato dal workflow è stato **verificato individualmente end-to-end contro produzione**. `node --test "scripts/**/*.test.js"` → 495/495.

**Status.** local + branch. **Remaining.** L'esecuzione del workflow *assemblato* via GitHub Actions richiede il file sul branch di default (`workflow_dispatch` non è dispatchable da un feature branch) → si verifica dopo il merge su main.

---

## DraGold vNext — KPI Fase 1 (2026-09-02)

| Metrica | Prima | Dopo |
|---|---|---|
| One Piece — carte in catalogo | 5.215 | **5.694** (+479: OP-17, OP-15/16/17-RE, ST-31…36) |
| One Piece — `released but missing` (set) | ignoto (nessun detector) | **0** (era 1: OP-17) monitorato giornalmente |
| One Piece — ritardo di ingestion | ~2 mesi (OP-17) / non misurato | **0 giorni** |
| Pokémon EN — `released but missing` | ignoto | **0** (`latest synced == latest upstream` = 2026-07-17) |
| Set con release date reale | 0% (`released_at` NULL su 1.668) | `set_logos` 345 righe, **288 high-confidence**, 4 `upcoming` |
| Carte One Piece con prezzo fresco (≤30gg) | ~0 | **476** (source `tcgcsv`, USD) |
| `catalog_gaps` (KPI persistente) | non esisteva | 14 righe (10 `resolved`, 4 `missing` futuri) |
| `catalog_freshness_runs` | non esisteva | 4 run registrati |
| Discovery One Piece | enum hardcoded + optcgapi (OP-12) | **source-driven TCGCSV** |
| Test | nessun gate CI su `scripts/` | `tests.yml` — 495 test |
| Build | verde | verde |
| Security | RLS ok | RLS ok, 0 nuovi advisor, nessun segreto in chiaro |

---

## Rischi residui / fuori scope Fase 1

1. **One Piece JA** — non toccato (nessuna regressione; `syncOnePieceJA` in `sync-full.js` disattivata perché scriveva immagini hotlink rotte). → **Fase 1.5**: `sync-onepiece-ja.js` con pipeline immagini proprietaria.
2. **Prezzi TCGCSV in USD** — nessuna conversione EUR, nessun layer di valutazione. → **Fase 2** (`market_observations` + `market_valuations` + confidence).
3. **Diff per-carta One Piece** — disattivato in Fase 1 (numerazioni DB/TCGCSV non allineate su anthology/parallel). → **Fase 1.5**: dopo che l'ingestion è tutta TCGCSV-native, il diff per-numero diventa affidabile.
4. **`reconcile-catalog.mjs`** — ancora punta a `fetch-optcg.js` (optcgapi). Non nel percorso critico di Fase 1 (ho costruito un layer freshness più leggero). Swap rimandato a quando verrà operazionalizzato (audit profondo, Fase 6).
5. **Snapshot prezzo ridondanti** — le esecuzioni di test ripetute hanno creato ~4 snapshot di OP-17 nello stesso giorno (`captured_at` distinti, minuti di distanza). Innocuo; Fase 2 fa bucket giornaliero.
6. **`_deadSync*` in `sync-full.js`** — i vecchi path optcgapi lasciati come funzioni non referenziate (mojibake nei commenti rende rischiosa la cancellazione chirurgica). Cleanup in un task dedicato.
7. **Workflow assemblato** — verificabile solo post-merge (vedi §7).

---

## Cosa passa a Fase 2

`market_observations` (append-only) alimentata da TCGCSV (già validata qui per One Piece + disponibile per Pokémon/MTG/YGO con gli stessi endpoint) + Cardmarket + eBay Browse; `market_valuations` con confidence spiegabile; conversione valuta; retire della cascata `pokemontcgio` (85% fail).
