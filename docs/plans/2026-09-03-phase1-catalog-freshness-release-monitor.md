# Fase 1 — Catalog Freshness & Release Monitor — Implementation Plan

> **For agentic workers:** esecuzione task-by-task. Step con checkbox `- [ ]`.
> **Spec / contesto:** `docs/plans/2026-09-02-dragold-vnext-audit-and-roadmap.md` (§2, §6 FASE 1, §8).

**Goal:** rendere il catalogo DraGold *source-driven* — un nuovo set/carta/promo che compare upstream (TCGdex per Pokémon, TCGCSV per One Piece) viene rilevato, messo in coda, sincronizzato e verificato automaticamente, senza modifiche al codice. "Released but missing" diventa un KPI persistente.

**Architettura:** tre layer additivi, nessun mega-refactor.
1. **Discovery + Reconcile** (moduli puri, `scripts/lib/catalog/`): elencano il catalogo upstream e lo diffano contro il DB → findings `missing_set` / `missing_card` / `missing_promo`.
2. **Gap store** (`catalog_gaps` table): ogni gap persiste con `first_seen_at`/`last_seen_at`/`status`/`resolved_at`/`retry_count`/`error_message`. È **anche la sync queue** (nessuna tabella coda separata).
3. **Jobs** (`catalog-freshness.js` = detect+KPI, `catalog-sync.js` = drena la coda, `sync-onepiece.js` = ingestion OP TCGCSV-driven) orchestrati da un unico workflow giornaliero.

**Tech stack:** Node 22 ESM, `@supabase/supabase-js`, `node:test` per i moduli puri, GitHub Actions. Nessuna nuova dipendenza npm. Fonti: TCGdex (`api.tcgdex.net/v2`, no key), TCGCSV (`tcgcsv.com/tcgplayer/...`, no key, daily ~20:00 UTC).

## Global Constraints (dalla spec + istruzioni Ermal)

- **JavaScript, non TypeScript.** ESM (`import`/`export`), coerente con `scripts/`.
- **Nessuna nuova dipendenza npm** senza decisione esplicita.
- **`feat/sealed-products` congelato** — mai toccato.
- **Nessun DELETE distruttivo.** Migration reversibili con `-- DOWN` documentato + check di integrità.
- **Idempotenza:** una seconda esecuzione non crea duplicati (upsert su chiavi naturali ovunque).
- **Accuracy > coverage:** mai inventare un set/carta/immagine per somiglianza. Fonte assente → gap `error`, non dato finto.
- **Fonti free/OSS** già decise (spec §5, §8.bis). Nessuna API a pagamento in questa fase.
- Branch: `feature/catalog-freshness-monitor` (già creato). Commit atomici per task.
- Set code One Piece canonico in `cards.set_id`: **dashed uppercase** (`OP-17`, `EB-05`, `PRB-02`, `ST-30`, `P`). Set code Pokémon: come TCGdex (`sv10`, `me5`, `sv10.5b`).

---

## File Structure

**Nuovi — moduli puri (`scripts/lib/catalog/`):**
| File | Responsabilità |
|---|---|
| `normalize-set-code.js` | `normalizeSetCode(raw)` → chiave canonicale case/punctuation-insensitive (riusa la regola già in `src/lib/setSlug.js#normalizeSetKey`, portata lato script). `canonicalOnePieceSetId(raw)` → forma `OP-17`. |
| `sources/tcgdex-catalog.js` | `listTcgdexSets(lang, {fetchImpl})` → `[{code,name,releaseDate,cardCountOfficial,cardCountTotal,logo,symbol,serieId,serieName}]`. `listTcgdexSetCardNumbers(lang, code)` → `Set<string>` di `card_number`. |
| `sources/tcgcsv-catalog.js` | `listTcgcsvGroups(categoryId, {fetchImpl})` → `[{groupId,name,abbreviation,publishedOn,isSupplemental}]`. `listTcgcsvGroupCards(categoryId, groupId)` → `[{productId,name,number,rarity,imageUrl,extendedData}]`. `listTcgcsvGroupPrices(categoryId, groupId)` → `[{productId,subTypeName,marketPrice,lowPrice,midPrice,highPrice}]`. |
| `classify-entity.js` | `classifyEntityType({tcg,setCode,groupName,isSupplemental})` → `'set'|'promo'|'special'|'product'`. Regole esplicite (P- / promo / release-event / tournament / anniversary → promo/special). |
| `reconcile-sets.js` | `diffSets({upstreamSets, dbSetCodes})` → `{missing:[{code,name,releaseDate,entityType}], extra:[...], matched:[...]}`. Puro. |
| `reconcile-cards.js` | `diffSetCards({setCode, upstreamNumbers:Set, dbNumbers:Set})` → `{missingNumbers:[], extraNumbers:[]}`. Puro. |
| `kpi.js` | `computeFreshnessKpi({runs, gaps, upstreamCounts, dbCounts})` → oggetto KPI (spec §8 lista). Puro. |

**Nuovi — I/O isolato:**
| File | Responsabilità |
|---|---|
| `scripts/lib/catalog/gaps-store.js` | `upsertGaps(supabase, gaps[])`, `markResolved(supabase, keys[])`, `nextQueuedGaps(supabase, {limit,maxRetry})`, `markSyncing/markResolvedById/markError(supabase, id, ...)`. Solo scrittura su `catalog_gaps`. |
| `scripts/lib/catalog/db-read.js` | `dbSetCodes(supabase, tcg, lang)` → `Set` normalizzato. `dbCardNumbers(supabase, tcg, lang, setCode)` → `Set`. Solo lettura. |
| `scripts/catalog-freshness.js` | Orchestratore detect + KPI. Read-only su `cards`; scrive `catalog_gaps` + `catalog_freshness_runs`. |
| `scripts/catalog-sync.js` | Drena `catalog_gaps` (status `missing`/`error`, retry<3) → invoca ingestion mirata → `resolved`/`error`. |
| `scripts/sync-onepiece.js` | Ingestion One Piece EN da TCGCSV, **set-driven** (nessun enum). Scrive `cards` + `card_prices` (source `tcgcsv`). |
| `scripts/sync-set-catalog-v2.js` | Popola `set_logos` (v2) da TCGdex (pokemon) + TCGCSV (onepiece): `released_on`, `status`, `card_count`, `series_*`, `source`, `source_confidence`. |

**Nuovi — migration:**
- `supabase/migrations/<ts>_catalog_gaps.sql` — `catalog_gaps` + `catalog_freshness_runs` + RLS.
- `supabase/migrations/<ts>_set_logos_v2.sql` — colonne v2 su `set_logos` + `set_code_norm` generated + unique index.

**Nuovi — workflow:**
- `.github/workflows/catalog-freshness.yml` — cron giornaliero `0 6 * * *` + `workflow_dispatch`. Job: `freshness` → `sync` (needs) → `set-catalog` → `transition`.

**Modificati:**
- `scripts/sync-full.js` — `syncOnePieceEN`/`syncOnePieceJA`: rimuovere l'enumerazione hardcoded, delegare a `sync-onepiece.js` (import della funzione principale) o disattivare il ramo OP EN qui e lasciarlo a `catalog-sync.js`. Minimo: eliminare `allSets = [...OP-01..25, ST-01..30, EB-01..05]`.
- `scripts/lib/reconcile/reconcile-catalog.mjs` — `EXTERNAL_SOURCE_FETCHERS.onepiece`: puntare a un adapter TCGCSV (`fetchTcgcsvSet`) invece di `fetchOptcgSet`. Solo la mappa; il resto invariato.
- `package.json` — script npm: `"catalog:freshness"`, `"catalog:sync"`, `"sync:onepiece"`, `"sync:set-catalog"`.

---

## Schema

### `catalog_gaps` (KPI persistente + sync queue)

```sql
create table public.catalog_gaps (
  id            uuid primary key default gen_random_uuid(),
  tcg           text not null,
  language      text not null default 'en',
  entity_type   text not null check (entity_type in ('set','card','promo','special','product')),
  source        text not null,                       -- 'tcgdex' | 'tcgcsv'
  source_id     text not null,                       -- set code, o "<setCode>#<cardNumber>"
  set_code      text,                                -- normalizzato (dashed uppercase OP / tcgdex code pokemon)
  card_number   text,
  name          text,
  release_date  date,
  status        text not null default 'missing'
                check (status in ('missing','queued','syncing','resolved','error','ignored')),
  detail        jsonb,                               -- evidenza grezza del finding
  error_message text,
  retry_count   integer not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  resolved_at   timestamptz,
  unique (tcg, language, entity_type, source, source_id)
);
create index catalog_gaps_status_idx on public.catalog_gaps (status) where status in ('missing','queued','error');
create index catalog_gaps_tcg_idx on public.catalog_gaps (tcg, language, entity_type);
alter table public.catalog_gaps enable row level security;
-- lettura pubblica (KPI trasparente, nessun dato utente), scrittura solo service_role
create policy catalog_gaps_read on public.catalog_gaps for select using (true);
```

### `catalog_freshness_runs` (storico KPI per run)

```sql
create table public.catalog_freshness_runs (
  id                 uuid primary key default gen_random_uuid(),
  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  scope              jsonb not null,                 -- [{tcg,language}]
  kpi                jsonb not null,                 -- oggetto computeFreshnessKpi()
  ok                 boolean not null default true,
  error_message      text
);
alter table public.catalog_freshness_runs enable row level security;
create policy cfr_read on public.catalog_freshness_runs for select using (true);
```

### `set_logos` v2 (colonne additive)

```sql
alter table public.set_logos
  add column if not exists released_on       date,
  add column if not exists status            text
      check (status in ('announced','upcoming','released','available','complete','legacy')),
  add column if not exists source_confidence text check (source_confidence in ('high','medium','low')),
  add column if not exists card_count        integer,
  add column if not exists series_id         text,
  add column if not exists series_name       text,
  add column if not exists updated_at        timestamptz not null default now();

-- regression guard sv10/SV10, OP-01/op01: chiave normalizzata unica per tcg.
-- VERIFICATO 2026-09-02: 0 collisioni esistenti (norm_n == n per ogni tcg) → l'indice si crea pulito.
alter table public.set_logos
  add column if not exists set_code_norm text
    generated always as (lower(regexp_replace(coalesce(set_code,''), '[^a-zA-Z0-9]', '', 'g'))) stored;
create unique index if not exists set_logos_tcg_codenorm_uniq
  on public.set_logos (tcg, set_code_norm);

-- backfill: released_on da release_date (testo) dove parsabile; status per le righe esistenti.
update public.set_logos
   set released_on = nullif(release_date,'')::date
 where release_date ~ '^\d{4}-\d{2}-\d{2}$' and released_on is null;
update public.set_logos
   set status = case when released_on is null then 'legacy'
                     when released_on > current_date then 'upcoming'
                     else 'released' end
 where status is null;
```

**DOWN** (`<ts>_set_logos_v2_down.sql`, non applicata di default):
```sql
drop index if exists public.set_logos_tcg_codenorm_uniq;
alter table public.set_logos
  drop column if exists set_code_norm, drop column if exists released_on,
  drop column if exists status, drop column if exists source_confidence,
  drop column if exists card_count, drop column if exists series_id,
  drop column if exists series_name, drop column if exists updated_at;
```

**Check di integrità post-migration (nel task):**
1. `select count(*) from set_logos` invariato (214).
2. `select tcg, count(*), count(distinct (tcg,set_code_norm)) from set_logos group by 1` → nessun calo (unicità già rispettata).
3. `select count(*) from set_logos where release_date ~ '^\d{4}-\d{2}-\d{2}$' and released_on is null` = 0.
4. App build verde (le letture attuali usano `release_date` testo, invariato).

---

## Task 1 — Migration `catalog_gaps` + `catalog_freshness_runs`

**Files:** Create `supabase/migrations/<ts>_catalog_gaps.sql`.

- [ ] **1.1** Scrivere la migration (schema sopra, entrambe le tabelle + indici + RLS).
- [ ] **1.2** `apply_migration` (nome `catalog_gaps_and_freshness_runs`).
- [ ] **1.3** Verifica: `list_tables` mostra `catalog_gaps` (rls on) e `catalog_freshness_runs`. `insert` di prova + `delete` di prova via `execute_sql` per validare i check constraint (`entity_type` invalido → errore; `status` invalido → errore).
- [ ] **1.4** `get_advisors` type=security → nessun nuovo warning RLS.
- [ ] **1.5** Commit: `feat(catalog): tabelle catalog_gaps + catalog_freshness_runs (KPI persistente)`.

---

## Task 2 — `normalize-set-code.js` (puro, test-first)

**Files:** Create `scripts/lib/catalog/normalize-set-code.js`, Test `scripts/lib/catalog/__tests__/normalize-set-code.test.js`.

**Interfaces — Produces:**
- `normalizeSetCode(raw: string): string` — `lower(raw)` senza caratteri non alfanumerici. `'OP-17'→'op17'`, `'sv10.5b'→'sv105b'`, `'SV10'→'sv10'`.
- `canonicalOnePieceSetId(raw: string): string` — forma DB One Piece. `'OP17'→'OP-17'`, `'op-17'→'OP-17'`, `'EB05'→'EB-05'`, `'PRB02'→'PRB-02'`, `'ST36'→'ST-36'`, `'P'→'P'`, valori non riconosciuti → `raw` invariato (trim/upper).

- [ ] **2.1** Test: casi sopra + `normalizeSetCode('')===''`, `normalizeSetCode(null)` → `''` (no throw).
- [ ] **2.2** Run test → FAIL.
- [ ] **2.3** Implementare. `canonicalOnePieceSetId`: regex `^(OP|EB|PRB|ST|EX)-?(\d{1,2})$` (case-insensitive) → `${prefix}-${pad2(n)}`; `^P-?\d*$`→`'P'`; altrimenti `raw.trim()`.
- [ ] **2.4** Run test → PASS.
- [ ] **2.5** Commit: `feat(catalog): normalizzazione set code condivisa`.

---

## Task 3 — `sources/tcgdex-catalog.js` (Pokémon discovery, test-first sulle parti pure)

**Files:** Create `scripts/lib/catalog/sources/tcgdex-catalog.js`, Test `.../__tests__/tcgdex-catalog.test.js`.

**Interfaces — Consumes:** `fetchTcgdexSet` da `scripts/lib/reconcile/sources/fetch-tcgdex.js` (già esistente) per i card number.
**Produces:**
- `mapTcgdexSet(raw): {code,name,releaseDate|null,cardCountOfficial|null,cardCountTotal|null,logo|null,symbol|null,serieId|null,serieName|null}` — puro, da un oggetto set TCGdex (`/v2/{lang}/sets/{id}` detail).
- `listTcgdexSets(lang, {fetchImpl}): Promise<mappedSet[]>` — GET `/v2/{lang}/sets` (lista, senza date) poi per ogni set GET detail per `releaseDate` (rate-limit 120ms, come `sync-cards.js`). Ritorna solo set con `name`.
- `listTcgdexSetCardNumbers(lang, code, {fetchImpl}): Promise<Set<string>>` — via `fetchTcgdexSet`, estrae `card_number` (string) da ogni riga.

- [ ] **3.1** Test `mapTcgdexSet` con un fixture reale (set `me05`, campi verificati 2026-09-02: `releaseDate:"2026-07-17"`, `cardCount.official:84`, `cardCount.total:120`, `logo`, `symbol`, `serie.id:"me"`, `serie.name:"Mega Evolution"`).
- [ ] **3.2** Test `listTcgdexSetCardNumbers` con `fetchImpl` mock che ritorna `{cards:[{localId:'1',...},{localId:'TG01',...}]}` → `Set{'1','TG01'}`.
- [ ] **3.3** Run → FAIL. Implementare. Run → PASS.
- [ ] **3.4** Smoke reale (non in CI unit): `node -e` che chiama `listTcgdexSets('en')` e stampa gli ultimi 10 per `releaseDate` — atteso: contiene `me05`, `sv10.5b`, ecc. Documentare l'output nel commit body.
- [ ] **3.5** Commit: `feat(catalog): discovery set Pokémon da TCGdex (con release date)`.

---

## Task 4 — `sources/tcgcsv-catalog.js` (One Piece discovery + prezzi, test-first sulle parti pure)

**Files:** Create `scripts/lib/catalog/sources/tcgcsv-catalog.js`, Test `.../__tests__/tcgcsv-catalog.test.js`.

**Endpoint verificati 2026-09-02:**
- `https://tcgcsv.com/tcgplayer/{cat}/groups` → `{results:[{groupId,name,abbreviation,publishedOn,isSupplemental,...}]}`
- `https://tcgcsv.com/tcgplayer/{cat}/{groupId}/products` → `{results:[{productId,name,imageUrl,extendedData:[{name:'Number',value:'OP17-020'},{name:'Rarity',value:'SR'},...]}]}`
- `https://tcgcsv.com/tcgplayer/{cat}/{groupId}/prices` → `{results:[{productId,subTypeName:'Normal'|'Foil',marketPrice,lowPrice,midPrice,highPrice}]}`
- `categoryId`: One Piece = **68**, Pokémon = 3, Pokémon JP = 85, MTG = 1, YGO = 2.

**Interfaces — Produces:**
- `extFieldValue(extendedData, name): string|null` — puro.
- `mapTcgcsvGroup(raw): {groupId,name,abbreviation|null,publishedOn|null,isSupplemental:boolean}` — puro.
- `mapTcgcsvProduct(raw): {productId,name,number|null,rarity|null,imageUrl|null,raw}` — puro. `number` da `extFieldValue(_,'Number')`.
- `listTcgcsvGroups(cat, {fetchImpl}): Promise<mappedGroup[]>`
- `listTcgcsvGroupCards(cat, groupId, {fetchImpl}): Promise<mappedProduct[]>`
- `listTcgcsvGroupPrices(cat, groupId, {fetchImpl}): Promise<Map<productId, {market,low,mid,high,subType}[]>>`

- [ ] **4.1** Test `extFieldValue` / `mapTcgcsvGroup` / `mapTcgcsvProduct` con fixture reali (OP-17 group `24736`, prodotto `705922` "Shanks (020)" number `OP17-020` rarity `L`).
- [ ] **4.2** Test list* con `fetchImpl` mock (JSON `{results:[...]}`).
- [ ] **4.3** Run → FAIL → implementare (timeout 20s, `TcgcsvFetchError` tipizzato su non-2xx/JSON invalido — mai `[]` silenzioso) → PASS.
- [ ] **4.4** Smoke reale: `listTcgcsvGroups(68)` → atteso contiene `OP17` (publishedOn `2026-08-28`) e `OP18`. Output nel commit body.
- [ ] **4.5** Commit: `feat(catalog): discovery One Piece + prezzi da TCGCSV (categoryId 68)`.

---

## Task 5 — `classify-entity.js` + `reconcile-sets.js` + `reconcile-cards.js` (puri, test-first)

**Files:** Create i 3 file + `__tests__/reconcile.test.js`.

**Interfaces — Produces:**
- `classifyEntityType({tcg,setCode,groupName,isSupplemental}): 'set'|'promo'|'special'|'product'`
  - `promo` se `setCode` normalizza a `p`/inizia con `p` isolato, o `groupName` match `/promo|black star|winner|pre-?release|championship|tournament|anniversary|release event|prize/i`.
  - `special` se `isSupplemental` true e non promo (es. Extra Booster? → no, EB è `set`). Regola: `isSupplemental && /demo|deck set|gift|starter|ultra deck|premium/i` → `product`. Default → `set`.
- `diffSets({upstreamSets, dbSetCodesNorm}): {missing, extra, matched}` — `missing` = upstream set il cui `normalizeSetCode(code)` non è in `dbSetCodesNorm`. Ogni `missing` porta `{code,name,releaseDate,entityType}`.
- `diffSetCards({setCode, upstreamNumbers, dbNumbers}): {missingNumbers, extraNumbers}` — set difference su string esatte (upstream `number` già normalizzato al formato DB dal chiamante).

- [ ] **5.1** Test `classifyEntityType`: `{tcg:'onepiece',setCode:'P'}` → `promo`; `{groupName:'OP17 Release Event Cards'}` → `promo`; `{setCode:'OP-17',groupName:'The World's Strongest Warriors'}` → `set`; `{setCode:'EB-05'}` → `set`.
- [ ] **5.2** Test `diffSets`: upstream `[{code:'OP-17'},{code:'OP-16'}]`, db `Set{'op16'}` → `missing:[{code:'OP-17'}]`, `matched:[{code:'OP-16'}]`.
- [ ] **5.3** Test `diffSetCards`: upstream `Set{'OP17-001','OP17-002'}`, db `Set{'OP17-001'}` → `missingNumbers:['OP17-002']`.
- [ ] **5.4** Run → FAIL → implementare → PASS.
- [ ] **5.5** Commit: `feat(catalog): classificazione entità + diff set/carte (puri)`.

---

## Task 6 — `db-read.js` + `gaps-store.js` (I/O isolato, integration-verified)

**Files:** Create `scripts/lib/catalog/db-read.js`, `scripts/lib/catalog/gaps-store.js`, Test `__tests__/gaps-store.test.js` (con client mock).

**Interfaces — Produces:**
- `dbSetCodes(supabase, tcg, lang): Promise<Set<string>>` — `select distinct set_id from cards where tcg=_ and lang=_`, normalizzati con `normalizeSetCode`.
- `dbCardNumbers(supabase, tcg, lang, setCodeCandidates:string[]): Promise<Set<string>>` — `select card_number from cards where tcg=_ and lang=_ and set_id in (candidates)`.
- `upsertGaps(supabase, gaps[]): Promise<{inserted,updated}>` — upsert su `(tcg,language,entity_type,source,source_id)`; su conflitto aggiorna `last_seen_at=now()`, `name`, `release_date`, `detail`; **non** tocca `status`/`retry_count`/`resolved_at`.
- `resolveGapsNotIn(supabase, scope, liveKeys:Set): Promise<number>` — per lo `scope` (tcg,language,entity_type), i gap con `status in ('missing','queued','error')` la cui `source_id` **non** è più in `liveKeys` → `status='resolved', resolved_at=now()`.
- `nextQueuedGaps(supabase, {limit,maxRetry}): Promise<gap[]>` — `status in ('missing','error') and retry_count < maxRetry` order `release_date desc nulls last, first_seen_at`.
- `markSyncing/markResolvedById/markError(supabase, id, msg?)`.

- [ ] **6.1** Test `gaps-store` con client mock (oggetto che registra le chiamate `.from().upsert()/.update().eq()`), verificando i payload (es. `upsertGaps` non include `status`).
- [ ] **6.2** Implementare. `db-read` verificato con `execute_sql` equivalente (query manuale sullo stesso predicato, confronto conteggi).
- [ ] **6.3** Integration reale: `node -e` che chiama `upsertGaps` con 1 gap fittizio (`source_id:'__test__'`), poi `resolveGapsNotIn` con `liveKeys` vuoto → il gap va `resolved`; poi `delete` manuale della riga di test.
- [ ] **6.4** Commit: `feat(catalog): store gap persistente + letture DB catalogo`.

---

## Task 7 — `scripts/catalog-freshness.js` (detect + KPI)

**Files:** Create `scripts/catalog-freshness.js`, `scripts/lib/catalog/kpi.js` + test `__tests__/kpi.test.js`.

**Comportamento:**
1. Target: `[{tcg:'pokemon',lang:'en'},{tcg:'pokemon',lang:'ja'},{tcg:'onepiece',lang:'en'}]` (arg `--only=onepiece:en` per restringere).
2. Per target:
   - `pokemon` → `listTcgdexSets(lang)`; `onepiece` → `listTcgcsvGroups(68)` + `classifyEntityType`.
   - `diffSets` vs `dbSetCodes`.
   - Per ogni set **matched** con `releaseDate` negli ultimi 400 giorni **o** assente: card-number diff (`listTcgdexSetCardNumbers` / `listTcgcsvGroupCards` vs `dbCardNumbers`). Set più vecchi: skip del card-diff (solo presenza set) — mantiene il run sotto ~10 min.
   - Costruisci i gap: `entity_type` da `classifyEntityType` (set-level) o `'card'` (card-level, con `set_code`+`card_number`+`source_id="<setCode>#<number>"`).
3. `upsertGaps` di tutti i gap del target; `resolveGapsNotIn` per lo stesso scope con le chiavi viste in questo run.
4. **Auto-resolve per presenza reale:** prima di scrivere, per ogni candidato gap `card`/`set`, se ora esiste in DB → non è un gap (skip) e se esisteva come gap → `resolveGapsNotIn` lo chiude.
5. `computeFreshnessKpi(...)` → `insert` in `catalog_freshness_runs` + `console.log('CATALOG_FRESHNESS_KPI=' + JSON.stringify(kpi))` + `$GITHUB_STEP_SUMMARY` (markdown).

**KPI (`kpi.js`, puro) — campi (spec §8):** `source_catalog_sets`, `dragold_catalog_sets`, `new_sets` (gap set nuovi in questo run), `new_cards`, `new_promos`, `released_but_missing_sets`, `released_but_missing_cards`, `upcoming_sets`, `resolved_gaps` (in questo run), `failed_syncs` (gap `status='error'`), `ingestion_delay_days` (max `current_date - release_date` fra i gap `missing` con `entity_type in ('set','promo')`), `latest_upstream_release`, `latest_dragold_synced_release`, `cards_synced_24h`, `cards_synced_7d`, `stale_sources` (fonti in `price_sources`/`api_call_log` senza successo >14g).

- [ ] **7.1** Test `computeFreshnessKpi` con input sintetici (verifica `released_but_missing_sets`, `ingestion_delay_days`, `upcoming_sets`).
- [ ] **7.2** Run → FAIL → implementare `kpi.js` → PASS.
- [ ] **7.3** Implementare `catalog-freshness.js` (read-only su `cards`; env `SUPABASE_URL`+`SUPABASE_SERVICE_KEY`; `--dry-run` = nessuna scrittura, stampa i gap).
- [ ] **7.4** Dry-run reale: `node scripts/catalog-freshness.js --only=onepiece:en --dry-run` → atteso: `OP-17` fra i `missing` set, `released_but_missing_sets >= 1`, `ingestion_delay_days ~ giorni da 2026-08-28`. Salvare l'output → primo report "Released but missing".
- [ ] **7.5** Run reale (scrive): `node scripts/catalog-freshness.js --only=onepiece:en` → riga in `catalog_freshness_runs`, gap `OP-17` in `catalog_gaps` con `status='missing'`, `entity_type='set'`, `release_date=2026-08-28`.
- [ ] **7.6** **Idempotenza:** rilanciare → stesso gap, `first_seen_at` invariato, `last_seen_at` aggiornato, nessun duplicato (`select count(*) from catalog_gaps where source_id='OP-17'` = 1).
- [ ] **7.7** Commit: `feat(catalog): job catalog-freshness — detect gap + KPI persistente`.

---

## Task 8 — `scripts/sync-onepiece.js` (ingestion One Piece TCGCSV-driven)

**Files:** Create `scripts/sync-onepiece.js`, `scripts/lib/catalog/onepiece-rows.js` (puro) + test.

**Interfaces — Produces (`onepiece-rows.js`):**
- `tcgcsvProductToCardRow({product, groupName, setCode, lang='en'}): cardRow` — `id: 'onepiece:tcgcsv:'+cardId+':'+lang` (dove `cardId` = `product.number` o `<setCode>-p<productId>` se number assente), `source:'tcgcsv'`, `source_id: String(productId)`, `tcg:'onepiece'`, `set_id: canonicalOnePieceSetId(setCode)`, `set_name: groupName`, `card_number: product.number`, `rarity`, `image_url`/`image_url_hi: product.imageUrl`, `name: product.name`, `lang`.
- `tcgcsvPriceToPriceRow({productId, priceObj, cardId}): priceRow` — `{card_id: cardId, source:'tcgcsv', currency:'USD', price_market, price_low, price_high, captured_at: now, timeframe:'point'}`.

**`sync-onepiece.js` comportamento:**
1. Arg: `--set=OP-17` (uno o più, virgola) **oppure** `--all` (tutti i group di categoryId 68) **oppure** `--since=2026-06-01` (group con `publishedOn >= since`). Nessun enum hardcoded — la lista viene **sempre** da `listTcgcsvGroups(68)`.
2. Map group → `setCode` via `abbreviation` (fallback: parse dal `name`); `classifyEntityType`.
3. Per group selezionato: `listTcgcsvGroupCards` + `listTcgcsvGroupPrices` → righe → `upsert cards on conflict id` (batch 100, `ignoreDuplicates:false`, ma **null-protection**: non sovrascrive `name` non-EN già presente — pattern di `sync-full.js#syncOnePieceJA`). Prezzi → `upsert card_prices` (batch 200).
4. Report JSON finale: `{groupsProcessed, cardsUpserted, pricesUpserted, perGroup:[...]}`.

- [ ] **8.1** Test `onepiece-rows.js` (product `705922` → row con `id:'onepiece:tcgcsv:OP17-020:en'`, `set_id:'OP-17'`, `card_number:'OP17-020'`; price obj → priceRow USD).
- [ ] **8.2** Run → FAIL → implementare i puri → PASS.
- [ ] **8.3** Implementare `sync-onepiece.js`. `--dry-run` = nessuna scrittura.
- [ ] **8.4** Dry-run: `node scripts/sync-onepiece.js --set=OP-17 --dry-run` → ~120 carte base + parallel, prezzi presenti.
- [ ] **8.5** Run reale: `node scripts/sync-onepiece.js --set=OP-17` → `select count(*) from cards where tcg='onepiece' and set_id='OP-17'` > 100; `select count(*) from card_prices where source='tcgcsv' and card_id like 'OP17-%'` > 0.
- [ ] **8.6** **Idempotenza:** rilancio → conteggio `cards` invariato (upsert, non insert doppio); `card_prices` cresce di 1 snapshot per carta (atteso: è uno storico) — verificare che NON crei righe con lo stesso `captured_at`.
- [ ] **8.7** Commit: `feat(catalog): sync One Piece source-driven da TCGCSV (rimuove enum hardcoded)`.

---

## Task 9 — `scripts/catalog-sync.js` (drena la coda) + wiring reconcile

**Files:** Create `scripts/catalog-sync.js`. Modify `scripts/lib/reconcile/reconcile-catalog.mjs` (solo la mappa fetcher), `scripts/sync-full.js` (rimuovi enum OP).

**`catalog-sync.js` comportamento:**
1. `nextQueuedGaps(supabase,{limit: arg --limit||20, maxRetry:3})`.
2. Per gap:
   - `markSyncing(id)`.
   - `entity_type in ('set','promo','special')` + `tcg='onepiece'` → `sync-onepiece.js` logic per quel `set_code`.
   - `entity_type='card'` + `onepiece` → stesso sync del set contenitore (TCGCSV non fa fetch per-carta).
   - `tcg='pokemon'` → invoca `sync-cards.js` mirato (`--tcg=pokemon --lang=<lang> --set=<code>`) via `child_process` **oppure** import diretto se rifattorizzabile senza rischio; in Fase 1: `execFileSync('node',['scripts/sync-cards.js',...])` (minimo, isolato).
   - Successo (verifica: l'entità ora esiste in `cards`) → `markResolvedById(id)`. Fallimento → `markError(id, msg)` + `retry_count++`.
3. Report JSON: `{processed, resolved, errored, perGap:[...]}`.

- [ ] **9.1** `reconcile-catalog.mjs`: aggiungere `fetchTcgcsvSet` adapter (nuovo file `scripts/lib/reconcile/sources/fetch-tcgcsv.js`, forma riga come `fetch-optcg.js#cardToRow` ma da TCGCSV) e puntarci `EXTERNAL_SOURCE_FETCHERS.onepiece`. Test `fetch-tcgcsv.test.js`. Lasciare `fetch-optcg.js` in repo (non cancellare) ma non più referenziato.
- [ ] **9.2** Run i test reconcile esistenti (`node --test scripts/lib/reconcile/__tests__/`) → tutti verdi (la modifica alla mappa non deve rompere `reconcile-catalog.test.js` — se usa un fetcher mock, ok; se usa `fetchOptcgSet` reale, aggiornare il test al nuovo adapter).
- [ ] **9.3** `sync-full.js`: sostituire `syncOnePieceEN`/`syncOnePieceJA` con una chiamata a `runOnePieceSync({ mode:'recent', sinceDays:120 })` importata da `sync-onepiece.js`. Rimuovere gli array `allSets`. JA: per ora `syncOnePieceJA` → no-op documentato (JA resta Fase 1.5 / gestito da `sync-onepiece-ja.js` esistente) — **non** regredire i dati JA presenti.
- [ ] **9.4** Implementare `catalog-sync.js`. Dry-run.
- [ ] **9.5** Run reale: `node scripts/catalog-sync.js --limit=5` → il gap `OP-17` passa `missing→syncing→resolved`, `resolved_at` valorizzato; `cards` OP-17 popolato.
- [ ] **9.6** Commit: `feat(catalog): catalog-sync drena la coda gap; reconcile usa TCGCSV per One Piece; sync-full senza enum OP`.

---

## Task 10 — Migration `set_logos` v2 + `sync-set-catalog-v2.js` + auto-transition

**Files:** Create `supabase/migrations/<ts>_set_logos_v2.sql`, `supabase/migrations/<ts>_set_logos_v2_down.sql`, `scripts/sync-set-catalog-v2.js`, `scripts/lib/catalog/set-logo-rows.js` + test.

- [ ] **10.1** Scrivere la migration v2 (schema sopra) + il file down.
- [ ] **10.2** `apply_migration` → eseguire i 4 check di integrità (sezione Schema). Registrare i risultati.
- [ ] **10.3** `set-logo-rows.js` (puro): `tcgdexSetToLogoRow(mappedSet)` e `tcgcsvGroupToLogoRow(mappedGroup, setCode, entityType)` → riga `set_logos` con `released_on`, `status` (`upcoming` se `released_on>today` else `released`), `card_count`, `series_*`, `source` (`'tcgdex'`/`'tcgcsv'`), `source_confidence` (`high` se la fonte dà una data reale, `low` se ereditata/placeholder). Test.
- [ ] **10.4** `sync-set-catalog-v2.js`: upsert su `set_logos` con `onConflict: 'tcg,set_code_norm'`. **Null-protection:** non azzerare `logo_url`/`symbol_url` esistenti se la fonte non li ha. `--dry-run`.
- [ ] **10.5** Run reale: Pokémon (TCGdex) → `set_logos` ottiene `me5`, `sv10.5b/w`, `30th`... con `released_on` reale e `status`. One Piece (TCGCSV) → `OP-17`,`OP-18` con date reali; le 31 righe placeholder `2025-02-28` vengono **corrette** con `released_on` reale da TCGCSV (`publishedOn`), `source_confidence` sale a `high`.
- [ ] **10.6** **Auto-transition:** aggiungere a `catalog-freshness.js` (o step SQL dedicato nel workflow) `update set_logos set status='released', updated_at=now() where status='upcoming' and released_on <= current_date`. Verifica: nessun set con `released_on < today` resta `upcoming`.
- [ ] **10.7** Idempotenza: rilancio `sync-set-catalog-v2.js` → `select count(*) from set_logos` invariato, `updated_at` aggiornato.
- [ ] **10.8** Commit: `feat(catalog): set_logos v2 (release_date reale + status + provenance) + auto-transition upcoming→released`.

---

## Task 11 — Workflow `catalog-freshness.yml`

**Files:** Create `.github/workflows/catalog-freshness.yml`.

```yaml
name: Catalog Freshness & Release Monitor
on:
  schedule: [{ cron: '0 6 * * *' }]
  workflow_dispatch:
    inputs:
      only: { description: 'es. onepiece:en (vuoto = tutti)', required: false, default: '' }
      dry_run: { type: boolean, default: false }
jobs:
  freshness:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: '22' }
      - run: npm install @supabase/supabase-js
      - name: Detect gaps + KPI
        run: node scripts/catalog-freshness.js ${{ inputs.only && format('--only={0}', inputs.only) || '' }} ${{ inputs.dry_run && '--dry-run' || '' }}
        env: { SUPABASE_URL: ${{ secrets.SUPABASE_URL }}, SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }} }
  sync:
    needs: freshness
    if: ${{ !inputs.dry_run }}
    runs-on: ubuntu-latest
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: '22' }
      - run: npm install @supabase/supabase-js
      - name: Drain sync queue
        run: node scripts/catalog-sync.js --limit=25
        env: { SUPABASE_URL: ${{ secrets.SUPABASE_URL }}, SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }} }
      - name: Refresh set catalog + transition
        run: node scripts/sync-set-catalog-v2.js
        env: { SUPABASE_URL: ${{ secrets.SUPABASE_URL }}, SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }} }
  report:
    needs: [freshness, sync]
    if: always()
    runs-on: ubuntu-latest
    steps:
      - run: echo "freshness=${{ needs.freshness.result }} sync=${{ needs.sync.result }}"
```

- [ ] **11.1** Scrivere il file.
- [ ] **11.2** `workflow_dispatch` con `only=onepiece:en dry_run=true` → verde, KPI nel job summary.
- [ ] **11.3** `workflow_dispatch` con `only=onepiece:en dry_run=false` → gap OP-17 → sync → `resolved`.
- [ ] **11.4** Commit: `ci(catalog): workflow giornaliero freshness + sync + set-catalog`.

---

## Task 12 — Verifica finale OP-17 end-to-end + report Fase 1

- [ ] **12.1** **Test automatici:** `node --test scripts/lib/catalog/__tests__/ scripts/lib/reconcile/__tests__/` → tutti verdi. Elencare il conteggio.
- [ ] **12.2** **Build:** `npm run build` → verde (nessuna regressione app; le letture set usano ancora `set_logos.release_date` testo).
- [ ] **12.3** **Verifica DB:**
  - `catalog_gaps`: gap OP-17 `status='resolved'`, `resolved_at` valorizzato, `first_seen_at < resolved_at`.
  - `cards`: `select count(*) from cards where tcg='onepiece' and set_id='OP-17'` ≈ card_count TCGCSV.
  - `card_prices`: righe `source='tcgcsv'` per OP-17.
  - `set_logos`: `OP-17` con `released_on='2026-08-28'`, `status='released'`, `source='tcgcsv'`, `source_confidence='high'`.
  - `catalog_freshness_runs`: ≥1 riga con KPI.
- [ ] **12.4** **Reconciliation reale:** `node scripts/catalog-freshness.js --only=onepiece:en` post-sync → `released_but_missing_sets` **scende** (OP-17 non più missing); OP-18 (futuro) compare come `upcoming`, non `missing`.
- [ ] **12.5** **Idempotenza globale:** rilanciare l'intero workflow → `select tcg,entity_type,count(*),count(distinct source_id) from catalog_gaps group by 1,2` → `count == count(distinct)` (zero duplicati). `cards` OP-17 invariato.
- [ ] **12.6** **Gap risolto resta risolto:** un gap `resolved` non deve tornare `missing` al run successivo se l'entità esiste ancora (verifica: `catalog-freshness.js` salta le entità presenti in DB).
- [ ] **12.7** **Scoperta del prossimo ignoto:** simulare "OP-19 non ancora noto" — verificare che appena `listTcgcsvGroups(68)` lo esporrà, `diffSets` lo marcherà `missing`/`upcoming` **senza modifiche al codice** (test con fixture group list che include un `OP19` fittizio → gap generato).
- [ ] **12.8** **Report finale** in `docs/plans/2026-09-03-phase1-RESULTS.md`: file modificati/creati, migration applicate, commit, KPI prima/dopo, rischi residui (JA One Piece, currency USD dei prezzi TCGCSV, Pokémon card-level diff performance), e cosa passa a Fase 2.
- [ ] **12.9** `SendUserFile` del report + KPI. Push del branch. **Non** mergiare su main senza ok di Ermal (cambi rischiosi → Vercel preview prima, CLAUDE.md §2).

---

## Self-Review (coverage acceptance criteria Ermal)

| Criterio | Task |
|---|---|
| 1. Catalog freshness P0 | Tutta la fase; Upcoming è solo un `status` derivato (Task 10). |
| 2. `Released but missing` KPI persistente con source/ID/type/date/first_seen/last_seen/status/resolved/retry/error | Task 1 (schema), Task 6 (store), Task 7 (popolamento). |
| 3. Reconcile copre SETS/CARDS/PROMOS/SPECIAL | Task 5 (`classifyEntityType` + `diffSets`/`diffSetCards`), Task 7 (applicazione). |
| 4. No liste hardcoded — TCGCSV source-driven | Task 4 + Task 8 (`listTcgcsvGroups` è l'unica fonte della lista set), Task 9.3 (rimozione enum in `sync-full.js`). |
| 5. OP-17 end-to-end (no import manuale) | Task 7→8→9→10→12. Il flusso parte da `catalog-freshness` che *scopre* OP-17, non da un `--set=OP-17` digitato a mano. |
| 6. Upcoming derivato da release_date + auto-transition | Task 10.3 (status da `released_on`), Task 10.6 (transition job). |
| 7. `set_logos` v2 provenance/source/confidence + guard sv10/SV10 + reversibile + integrity | Task 10.1–10.2 (unique index su `set_code_norm`, file down, 4 check). |
| 8. `catalog-freshness.yml` operativo su prod + report KPI | Task 7 (KPI completo §8), Task 11 (workflow). |
| 9. No mega-refactor | Solo codice additivo + 1 migration additiva a `set_logos` + rimozione di 1 enum rotto. `reconcile-catalog.mjs` toccato solo nella mappa fetcher. |
| 10. Test + build + DB + workflow + reconcile reale + no-dup + gap→resolved + report | Task 12 (tutti i punti). |

**Rischi noti / fuori scope Fase 1:** One Piece **JA** (resta ai dati attuali, non regredisce; Fase 1.5); prezzi TCGCSV in **USD** (conversione EUR + valuation engine = Fase 2); Pokémon card-level diff su tutti i set potrebbe essere lento → mitigato dal cutoff "solo set con release_date < 400g o assente".
