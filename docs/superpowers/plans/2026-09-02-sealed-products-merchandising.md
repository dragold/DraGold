# Sealed Products (Merchandising) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce sealed/merchandising products (Elite Trainer Box, booster box, starter deck, Ultimate Premium Collection, ecc.) for Pokémon and One Piece as a first-class, free-tier-only catalog entity: its own DB tables, a sync pipeline, a dedicated "Products" section in the UI, and full Portfolio/Collection integration (a product behaves like a card position: quantity, paid price, current value, P&L).

**Architecture:** Additive-only. New tables `sealed_products` / `sealed_product_prices` mirror the shape of `cards` / `card_prices` (same conventions: composite `source_id`, `image_url`, RLS pubblica in lettura, nessuna scrittura utente). One new sync script pulls both TCG from a single free provider (tcgapi.dev) and writes via service_role, same pattern as `scripts/sync-cards.js`. `collection` gets one new nullable column (`item_type`, default `'card'`) so existing card rows are untouched and a sealed-product row is just `item_type='sealed_product'` with `card_api_id` pointing at `sealed_products.id`. UI: new `src/pages/products/` (list + detail), reusing `Icon`, `pickCardImage`-equivalent, and the existing add-to-collection flow with one extra `itemType` argument threaded through.

**Tech Stack:** React 18 + Vite (JS, no TS), Supabase (Postgres 17 + RLS), Node `fetch` per gli script (no nuove dipendenze), `node:test`.

**Spec:** Nessuno spec-doc dedicato preesistente — questo piano nasce da audit + ricerca web del 2026-09-02 (vedi sezione "Provider verificato" sotto) e dalle decisioni di prodotto prese con Ermal in sessione (sezione dedicata "Prodotti", integrazione Portfolio si).

## Provider verificato (2026-09-02)

**tcgapi.dev** (`https://api.tcgapi.dev/v1`) — unico provider, copre sia Pokémon che One Piece, sealed products inclusi.
- Signup diretto self-serve su `https://tcgapi.dev/signup/`, nessuna carta di credito.
- Auth: header `X-API-Key: <key>`.
- Free tier: **100 richieste/giorno**, nessuna quota mensile documentata.
- I prodotti sigillati NON sono un endpoint separato: sono record "carta-shaped" con `product_type: "Sealed Products"` (vs `"Cards"`) nello stesso endpoint carte. Campo aggiuntivo `shipping_category_id` (`"3"`=box, `"4"`=case).
- Endpoint utili:
  - `GET /v1/games` — lista giochi supportati (slug, per popolare `game`).
  - `GET /v1/games/{game}/sets` — set per gioco.
  - `GET /v1/sets/{id}/cards` — tutte le righe (carte + sealed) di un set. **Non ancora verificato con una chiamata reale se il campo `product_type` è presente qui identico a `/v1/search`** — Task 1, Step 1 lo verifica con una vera richiesta prima di scrivere qualunque logica di parsing, stesso principio già in uso in `scripts/lib/reconcile/sources/fetch-optcg.js`.
  - `GET /v1/search?q=&game=&set_id=&type=Sealed+Products&page=&per_page=` — ricerca filtrata, `q` obbligatorio (min 2 caratteri) quindi non utilizzabile per un dump completo, solo per ricerca UI-side eventuale futura.
  - `GET /v1/cards/:id/prices` — storico prezzi per un id.
- Risposta (`/v1/search`, confermato via fetch reale della documentazione) include: `id, name, clean_name, number, rarity, image_url, tcgplayer_id, product_type, foil_only, total_listings, set_name, game_name, game_slug, printing, market_price, low_price, median_price, lowest_with_shipping, price_updated_at`, più `daily_limit, daily_remaining, daily_reset` per il rate-limit self-reporting (usabile per fermarsi PRIMA di un 429, non solo per fare retry dopo).
- **Non ancora verificato**: dominio host delle immagini (`image_url`) — necessario per aggiungerlo a `ALLOWED_SOURCE_HOSTS` in `api/cache-image.js` e `api/img.js`. Task 1, Step 1 lo cattura dalla prima risposta reale.
- **IMAGE_CACHE_KEY / API key**: la chiave tcgapi.dev va salvata come secret GitHub (`TCGAPI_KEY`) e in `.env.local` per sviluppo locale — non hard-coded, stesso pattern di `POKEMONPRICETRACKER_API_KEY`.

## Global Constraints

- JavaScript, non TypeScript. Niente Redux/Zustand, niente nuove dipendenze npm per gli script (solo `fetch` nativo + `@supabase/supabase-js` già presente).
- Nuove pagine → `src/pages/products/`, mai dentro `DraGold.jsx`.
- Non toccare `DraGold.legacy.jsx`.
- Ogni script di sync segue il pattern retry/backoff già introdotto in questa sessione (`api/cache-image.js`, `scripts/lib/image-resolver.js`, `scripts/image-audit/resolve-fallback.mjs`): 429/5xx ritentati con backoff esponenziale, mai un fallimento silenzioso che scrive dati parziali come completi.
- Mai inventare un URL immagine o un prezzo: se `tcgapi.dev` non ha un campo, la riga lo lascia `null`, non lo si deriva da un'altra fonte senza dichiararlo esplicitamente.
- Migration DB dirette sul progetto live (`pimwkmwrduqkaydyvxqz`) con verifica immediata via `get_advisors`, stesso workflow già usato in questa sessione — non serve un Supabase branch di test (decisione già presa con Ermal).
- Build/verify: `npm run build` (Vite) + `node --test "src/**/*.test.js"` + `node --test "scripts/**/*.test.js"` dopo ogni task che tocca codice condiviso.
- Branch dedicato: continuare su `fix/audit-wow-factor-2026-09-02` o aprirne uno nuovo `feat/sealed-products` — decisione dell'esecutore in base allo stato del branch precedente al momento dell'esecuzione (se già mergiato, nuovo branch da `main`).

---

## File Structure

**Creati:**

| Path | Responsabilità |
|---|---|
| `supabase/migrations/20260902130000_sealed_products.sql` | Tabelle `sealed_products`, `sealed_product_prices`, indici, RLS pubblica in lettura. |
| `supabase/migrations/20260902130100_collection_item_type.sql` | Colonna `collection.item_type text not null default 'card'` + check constraint, nessuna riga esistente alterata (default preserva il comportamento attuale). |
| `scripts/lib/tcgapi-client.js` | Client HTTP minimale per tcgapi.dev: auth header, retry/backoff su 429/5xx (rispetta `daily_remaining`/`Retry-After`), un metodo per gioco/set/prodotti. Puro, testabile senza rete (fetchImpl iniettabile, stesso pattern di `fetch-optcg.js`). |
| `scripts/lib/tcgapi-client.test.js` | Unit test del client con `fetchImpl` fake. |
| `scripts/sync-sealed-products.js` | CLI: `node scripts/sync-sealed-products.js --tcg=pokemon,onepiece [--dry-run]`. Enumera set via `/v1/games/{game}/sets`, per ciascuno chiama `/v1/sets/{id}/cards`, filtra `product_type==='Sealed Products'`, upsert in `sealed_products` + insert in `sealed_product_prices`. |
| `.github/workflows/sync-sealed-products.yml` | Manuale (`workflow_dispatch`, input `tcg`/`dry_run`) + schedule settimanale, stesso schema degli altri workflow sync già presenti. |
| `src/pages/products/ProductsPage.jsx` | Lista/ricerca prodotti sigillati (filtri TCG + tipo prodotto), skeleton loader, error state con retry — stesso pattern di `PortfolioView`/`SearchView`. |
| `src/pages/products/ProductPage.jsx` | Dettaglio prodotto: immagine, prezzo corrente, storico se disponibile, bottone "Add to Collection". |
| `src/pages/products/products.css` | Stili co-locati, riusa i token esistenti (`--gold`, `--surface`, ecc.), nessun nuovo design system. |
| `src/lib/products.js` | `listSealedProducts(filters)`, `getSealedProduct(id)`, `searchSealedProducts(q)` — query Supabase pure, stesso ruolo di `src/lib/search.js` per le carte. |

**Modificati:**

| Path | Cambio |
|---|---|
| `api/cache-image.js` | Aggiunto l'host immagini tcgapi.dev (verificato in Task 1) a `ALLOWED_SOURCE_HOSTS`. |
| `api/img.js` | Stesso host aggiunto a `ALLOWED_HOSTS` se le pagine prodotto useranno il proxy WebGL/CORS (verificare in Task 5 se serve — probabile di no, le pagine prodotto sono `<img>` normali, non texture WebGL). |
| `src/supabase.js` | Nuove funzioni `addSealedProductToCollection`, riuso di `addOrIncrementCollection`/`decrementOrRemoveCollection` esistenti passando `itemType`. |
| `src/pages/portfolio/PortfolioView.jsx` | `toCardObject`/`openPosition`/href dei link diramano su `pos.item_type`: `'card'` → `/card/{id}` (comportamento invariato), `'sealed_product'` → `/product/{id}`. Nessun'altra riga toccata. |
| `src/main.jsx` (o dove sono definite le route) | Aggiunte route `/products` e `/product/:id`. |
| `src/components/shell/SiteHeader.jsx` (o nav esistente) | Voce di navigazione "Products" verso `/products`. |

---

## Task 1: Client tcgapi.dev + verifica reale della forma dati

**Files:**
- Create: `scripts/lib/tcgapi-client.js`
- Test: `scripts/lib/tcgapi-client.test.js`

**Interfaces:**
- Produces: `fetchGames({fetchImpl, apiKey})`, `fetchSets({game, fetchImpl, apiKey})`, `fetchSetCards({setId, fetchImpl, apiKey})` — ognuna ritorna `{ok: true, data}` o lancia `TcgapiFetchError`/`TcgapiRateLimitExceededError` (quando `daily_remaining <= 0` nella risposta, per fermarsi PRIMA di sprecare la quota residua, non solo dopo un 429).

- [ ] **Step 1: chiamata reale di verifica (una tantum, manuale, non nel codice del client)**

Prima di scrivere qualunque logica di parsing, eseguire manualmente (`curl` o script scratch) UNA vera richiesta a `https://api.tcgapi.dev/v1/sets/{un_set_id_reale}/cards` con una API key free ottenuta da `https://tcgapi.dev/signup/`, e osservare:
  - se i record `product_type: "Sealed Products"` sono davvero presenti in questo endpoint (non solo in `/v1/search`);
  - il dominio esatto di `image_url` per un prodotto sigillato;
  - la forma esatta dei campi prezzo su un prodotto sigillato (potrebbero differire da quelli di una carta).

Se `/v1/sets/{id}/cards` NON contiene sealed products, il fallback è enumerare i prodotti via `/v1/search?type=Sealed Products&set_id={id}&q=<nome set o wildcard minimo 2 char>` per ogni set — annotare quale dei due percorsi è quello reale prima di procedere allo Step 2. Questo step non è automatizzabile a priori: va dichiarato esplicitamente quale dei due si è verificato, mai assunto.

- [ ] **Step 2: scrivere il client con retry/backoff, secondo quanto verificato allo Step 1**

```js
// scripts/lib/tcgapi-client.js
const BASE_URL = process.env.TCGAPI_BASE_OVERRIDE || 'https://api.tcgapi.dev/v1'
const MAX_ATTEMPTS = 4
const BASE_BACKOFF_MS = 500

export class TcgapiFetchError extends Error {
  constructor(message) { super(message); this.name = 'TCGAPI_FETCH_FAILED' }
}
export class TcgapiRateLimitExceededError extends Error {
  constructor(message) { super(message); this.name = 'TCGAPI_RATE_LIMIT_EXCEEDED' }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function getJson(path, { apiKey, fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  if (!apiKey) throw new TypeError('tcgapi-client: apiKey obbligatoria')
  const url = `${BASE_URL}${path}`
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), timeoutMs)
    let res
    try {
      res = await fetchImpl(url, { headers: { 'X-API-Key': apiKey }, signal: controller.signal })
    } catch (err) {
      clearTimeout(t)
      if (attempt === MAX_ATTEMPTS) throw new TcgapiFetchError(`GET ${path}: ${err.message}`)
      await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1))
      continue
    }
    clearTimeout(t)
    if (res.ok) {
      const json = await res.json()
      if (typeof json?.daily_remaining === 'number' && json.daily_remaining <= 0) {
        throw new TcgapiRateLimitExceededError(`Quota giornaliera tcgapi.dev esaurita (daily_reset=${json.daily_reset ?? 'sconosciuto'})`)
      }
      return json
    }
    const retryable = res.status === 429 || res.status >= 500
    if (!retryable || attempt === MAX_ATTEMPTS) {
      throw new TcgapiFetchError(`GET ${path} -> HTTP ${res.status}`)
    }
    const retryAfter = Number(res.headers.get('retry-after'))
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : BASE_BACKOFF_MS * 2 ** (attempt - 1))
  }
}

export async function fetchGames({ apiKey, fetchImpl = fetch } = {}) {
  return getJson('/games', { apiKey, fetchImpl })
}

export async function fetchSets({ game, apiKey, fetchImpl = fetch } = {}) {
  if (!game) throw new TypeError('fetchSets: "game" obbligatorio')
  return getJson(`/games/${encodeURIComponent(game)}/sets`, { apiKey, fetchImpl })
}

export async function fetchSetCards({ setId, apiKey, fetchImpl = fetch } = {}) {
  if (!setId) throw new TypeError('fetchSetCards: "setId" obbligatorio')
  return getJson(`/sets/${encodeURIComponent(setId)}/cards`, { apiKey, fetchImpl })
}
```

- [ ] **Step 3: test con fetchImpl fake (429 con Retry-After, quota esaurita, 200 ok)**

```js
// scripts/lib/tcgapi-client.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchSetCards, TcgapiRateLimitExceededError, TcgapiFetchError } from './tcgapi-client.js'

test('fetchSetCards: 200 ok -> ritorna il json', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ data: [{ id: 1 }], daily_remaining: 42 }) })
  const r = await fetchSetCards({ setId: 'sv1', apiKey: 'k', fetchImpl })
  assert.equal(r.data.length, 1)
})

test('fetchSetCards: daily_remaining <= 0 -> TcgapiRateLimitExceededError, non un fetch inutile', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ data: [], daily_remaining: 0, daily_reset: '2026-09-03T00:00:00Z' }) })
  await assert.rejects(() => fetchSetCards({ setId: 'sv1', apiKey: 'k', fetchImpl }), TcgapiRateLimitExceededError)
})

test('fetchSetCards: 429 poi 200 -> un retry basta, nessun errore propagato', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls++
    if (calls === 1) return { ok: false, status: 429, headers: { get: () => '0' } }
    return { ok: true, status: 200, json: async () => ({ data: [], daily_remaining: 10 }) }
  }
  const r = await fetchSetCards({ setId: 'sv1', apiKey: 'k', fetchImpl })
  assert.equal(calls, 2)
  assert.deepEqual(r.data, [])
})

test('fetchSetCards: 404 non viene ritentato', async () => {
  let calls = 0
  const fetchImpl = async () => { calls++; return { ok: false, status: 404, headers: { get: () => null } } }
  await assert.rejects(() => fetchSetCards({ setId: 'sv1', apiKey: 'k', fetchImpl }), TcgapiFetchError)
  assert.equal(calls, 1)
})
```

- [ ] **Step 4: eseguire i test**

Run: `node --test scripts/lib/tcgapi-client.test.js`
Expected: 4/4 PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/tcgapi-client.js scripts/lib/tcgapi-client.test.js
git commit -m "feat(sealed-products): client tcgapi.dev con retry/backoff e guardia sulla quota giornaliera"
```

---

## Task 2: Schema DB — sealed_products, sealed_product_prices, collection.item_type

**Files:**
- Create: `supabase/migrations/20260902130000_sealed_products.sql`
- Create: `supabase/migrations/20260902130100_collection_item_type.sql`

**Interfaces:**
- Produces: tabelle `public.sealed_products(id uuid pk, tcg text, source text, source_id text, name text, product_type text, set_id text, set_name text, lang text, image_url text, price_market numeric, price_updated_at timestamptz, created_at, updated_at)` — nota: `price_market`/`price_updated_at` denormalizzati sulla riga prodotto (comodo per liste, stesso pattern di `cards.image_url`) OLTRE alla tabella storica `sealed_product_prices` per il trend, coerente con `cards`+`card_prices`.
- `public.sealed_product_prices(id bigint identity pk, product_id uuid fk -> sealed_products.id, source text, currency text, price_market numeric, price_low numeric, captured_at timestamptz)`.
- `public.collection.item_type text not null default 'card' check (item_type in ('card','sealed_product'))`.

- [ ] **Step 1: scrivere la migration tabelle**

```sql
-- supabase/migrations/20260902130000_sealed_products.sql
create table public.sealed_products (
  id uuid primary key default gen_random_uuid(),
  tcg text not null check (tcg in ('pokemon', 'onepiece')),
  source text not null default 'tcgapi',
  source_id text not null,
  name text not null,
  product_type text not null,
  set_id text,
  set_name text,
  lang text not null default 'en',
  image_url text,
  price_market numeric,
  price_currency text not null default 'USD',
  price_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);

create table public.sealed_product_prices (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.sealed_products(id) on delete cascade,
  source text not null,
  currency text not null default 'USD',
  price_market numeric,
  price_low numeric,
  captured_at timestamptz not null default now()
);

create index sealed_products_tcg_type_idx on public.sealed_products (tcg, product_type);
create index sealed_products_set_idx on public.sealed_products (set_id) where set_id is not null;
create index sealed_products_name_trgm_idx on public.sealed_products using gin (name extensions.gin_trgm_ops);
create index sealed_product_prices_product_idx on public.sealed_product_prices (product_id, captured_at desc);

create trigger sealed_products_set_updated_at
  before update on public.sealed_products
  for each row execute function public.set_updated_at();

alter table public.sealed_products enable row level security;
alter table public.sealed_product_prices enable row level security;

-- Lettura pubblica come cards/card_prices — nessuna scrittura utente, solo service_role (sync script).
create policy sealed_products_public_read on public.sealed_products
  for select using (true);
create policy sealed_product_prices_public_read on public.sealed_product_prices
  for select using (true);
```

Nota: `extensions.gin_trgm_ops` (non `public.gin_trgm_ops`) perché questa sessione ha già spostato `pg_trgm` in `extensions` — vedi `20260902120000_security_hardening.sql`. Se questa migration viene eseguita PRIMA di quella (ordine cronologico dei file lo esclude, ma verificarlo comunque all'esecuzione), usare `public.gin_trgm_ops`.

- [ ] **Step 2: scrivere la migration collection.item_type**

```sql
-- supabase/migrations/20260902130100_collection_item_type.sql
alter table public.collection
  add column item_type text not null default 'card' check (item_type in ('card', 'sealed_product'));

comment on column public.collection.item_type is
  'Cosa rappresenta questa posizione: ''card'' (default, comportamento storico invariato) o ''sealed_product'' (card_api_id punta a sealed_products.id invece che a cards.id).';
```

- [ ] **Step 3: applicare via `mcp__claude_ai_Supabase__apply_migration` (o `supabase db push` se l'esecutore lavora da CLI locale) e verificare**

Run: query di verifica `select column_name from information_schema.columns where table_name='collection' and column_name='item_type';` deve tornare una riga. `select count(*) from public.collection where item_type <> 'card';` deve tornare 0 subito dopo la migration (nessuna riga esistente alterata).

- [ ] **Step 4: `get_advisors` (security + performance) e verifica che non emergano nuovi warning bloccanti sulle tabelle appena create**

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260902130000_sealed_products.sql supabase/migrations/20260902130100_collection_item_type.sql
git commit -m "feat(sealed-products): schema DB — sealed_products, sealed_product_prices, collection.item_type"
```

---

## Task 3: Script di sync + workflow GitHub Actions

**Files:**
- Create: `scripts/sync-sealed-products.js`
- Create: `.github/workflows/sync-sealed-products.yml`

**Interfaces:**
- Consumes: `fetchGames/fetchSets/fetchSetCards` da Task 1, tabelle da Task 2.
- Produces: righe in `sealed_products` (upsert su `source_id`) + `sealed_product_prices` (insert, storico append-only come `card_prices`).

- [ ] **Step 1: implementare `scripts/sync-sealed-products.js`**

CLI: `node scripts/sync-sealed-products.js --tcg=pokemon,onepiece [--dry-run] [--set=<id>]`. Per ogni tcg richiesto: `fetchSets({game})` (mappare `pokemon`→slug reale confermato in Task 1 Step 1, `onepiece`→slug reale confermato in Task 1 Step 1 — **non assumere lo slug, verificarlo da `fetchGames()` reale**), poi per ogni set `fetchSetCards({setId})`, filtrare i record con `product_type === 'Sealed Products'` (o l'equivalente confermato in Task 1), upsert su `sealed_products` (`onConflict: 'source,source_id'`) e insert su `sealed_product_prices`. `--dry-run` logga senza scrivere, stesso pattern di `scripts/sync-cards.js`.

- [ ] **Step 2: unit test della funzione pura di mapping riga-API → riga-DB** (stesso stile di `cardToRow` in `fetch-optcg.js`), con `fetchImpl` fake per il resto.

- [ ] **Step 3: `--dry-run` reale contro l'API vera con la free key, un solo set, verificare manualmente l'output prima di abilitare la scrittura**

- [ ] **Step 4: workflow**

```yaml
# .github/workflows/sync-sealed-products.yml
name: Sync Sealed Products (Pokémon + One Piece)

on:
  schedule:
    - cron: '30 5 * * 0'
  workflow_dispatch:
    inputs:
      tcg:
        description: 'TCG (pokemon, onepiece, pokemon,onepiece)'
        required: false
        default: 'pokemon,onepiece'
      dry_run:
        description: 'Dry run - solo fetch, nessuna scrittura su DB'
        required: false
        type: boolean
        default: false

jobs:
  sync:
    name: Sync sealed products
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: '22'
      - run: npm install @supabase/supabase-js
      - name: Run sync (scheduled)
        if: github.event_name == 'schedule'
        run: node scripts/sync-sealed-products.js --tcg=pokemon,onepiece
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          TCGAPI_KEY: ${{ secrets.TCGAPI_KEY }}
      - name: Run sync (manuale)
        if: github.event_name == 'workflow_dispatch'
        run: |
          ARGS="--tcg=${{ github.event.inputs.tcg }}"
          if [ "${{ github.event.inputs.dry_run }}" = "true" ]; then ARGS="$ARGS --dry-run"; fi
          node scripts/sync-sealed-products.js $ARGS
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          TCGAPI_KEY: ${{ secrets.TCGAPI_KEY }}
```

Nota per l'esecutore: `TCGAPI_KEY` va aggiunta ai secret del repo GitHub manualmente (non automatizzabile da qui) prima che questo workflow possa girare in CI.

- [ ] **Step 5: Commit**

```bash
git add scripts/sync-sealed-products.js scripts/sync-sealed-products.test.js .github/workflows/sync-sealed-products.yml
git commit -m "feat(sealed-products): script di sync tcgapi.dev + workflow schedulato"
```

---

## Task 4: Allow-list host immagini

**Files:**
- Modify: `api/cache-image.js`
- Modify: `api/img.js` (solo se necessario, vedi nota)

- [ ] **Step 1: aggiungere il dominio reale confermato in Task 1 Step 1 a `ALLOWED_SOURCE_HOSTS` in `api/cache-image.js`**

- [ ] **Step 2: verificare se le pagine prodotto useranno `<img>` diretta (no proxy) o necessitano `api/img.js`** — probabile che serva solo `api/cache-image.js` (cache asincrona via script, come già per le carte), non il proxy CORS/WebGL. Se le card prodotto in `ProductsPage`/`ProductPage` sono `<img>` HTML normali (non texture Three.js), **non** toccare `api/img.js`.

- [ ] **Step 3: build**

Run: `npm run build`
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add api/cache-image.js
git commit -m "feat(sealed-products): allow-list host immagini tcgapi.dev per la cache"
```

---

## Task 5: `src/lib/products.js` + pagine Products (lista + dettaglio)

**Files:**
- Create: `src/lib/products.js`
- Create: `src/pages/products/ProductsPage.jsx`
- Create: `src/pages/products/ProductPage.jsx`
- Create: `src/pages/products/products.css`
- Modify: file di routing (verificare se `src/main.jsx` o `DraGold.jsx` — CLAUDE.md richiede nuove pagine fuori da `DraGold.jsx`, ma il routing esistente va letto prima di assumere dove aggiungere le route)

**Interfaces:**
- Consumes: tabella `sealed_products` (Task 2).
- Produces: `listSealedProducts({tcg, productType, q, page})`, `getSealedProduct(id)` — usati da `ProductsPage`/`ProductPage`.

- [ ] **Step 1: `src/lib/products.js`** — query Supabase dirette (`supabase.from('sealed_products').select(...)`), stesso stile di `src/lib/search.js`. Nessuna logica di fallback/prezzo qui: i dati sono già quelli scritti dal sync.

- [ ] **Step 2: `ProductsPage.jsx`** — replica lo scheletro di `PortfolioView`/`SearchView`: stato `loading`/`error`/`empty`, skeleton loader (riusa le classi `skel-line` già in `styles.css`), filtri TCG (chip, come `pf-tcg-chips`) + filtro `product_type`, griglia con placeholder iniziali+colore TCG quando l'immagine manca (stesso pattern appena applicato a `RailCard` in questa sessione).

- [ ] **Step 3: `ProductPage.jsx`** — dettaglio: immagine, nome, tipo, prezzo corrente, bottone "Add to Collection" (Task 6).

- [ ] **Step 4: route** — leggere il file di routing reale del progetto (verificare se è `src/main.jsx`, un router custom, o path-based dentro `DraGold.jsx`) prima di aggiungere `/products` e `/product/:id`; seguire esattamente il pattern esistente per le altre pagine (`/set/:slug`, `/card/:id`).

- [ ] **Step 5: build + verifica manuale in dev server**

Run: `npm run build` — nessun errore. Avviare `npm run dev`, navigare `/products`, verificare skeleton → dati reali (dopo Task 3 aver popolato almeno un set in dry-run disattivato).

- [ ] **Step 6: Commit**

```bash
git add src/lib/products.js src/pages/products/
git commit -m "feat(sealed-products): pagine Products (lista + dettaglio)"
```

---

## Task 6: Integrazione Collection/Portfolio

**Files:**
- Modify: `src/supabase.js`
- Modify: `src/pages/portfolio/PortfolioView.jsx`
- Modify: `src/pages/products/ProductPage.jsx` (bottone "Add to Collection")

**Interfaces:**
- Consumes: `collection.item_type` (Task 2), RPC esistenti `decrement_or_remove_collection`/equivalente insert.
- Produces: `addSealedProductToCollection({productId, tcg, name, imageUrl, ...})` in `src/supabase.js`.

- [ ] **Step 1: leggere le funzioni esistenti `addOrIncrementCollection`/`decrementOrRemoveCollection` in `src/supabase.js` per capire la forma esatta della insert/RPC prima di estenderle** — non riscriverle, aggiungere solo il parametro `item_type` (default `'card'`, così ogni chiamata esistente per le carte resta bit-per-bit identica).

- [ ] **Step 2: `PortfolioView.jsx` — diramare su `item_type`**

In `toCardObject(pos)`: se `pos.item_type === 'sealed_product'`, ritornare una forma compatibile per `onOpenCard` che apra `/product/{id}` invece di `/card/{id}` — verificare come `onOpenCard`/`openPosition` instrada oggi (prop passata da `DraGold.jsx`) prima di decidere se serve un nuovo prop `onOpenProduct` o se `onOpenCard` può già ramificare per tipo.

In `PortfolioRow`/`PortfolioGridCard`/`RailCard`: l'`href` hardcoded `/card/${pos.card_api_id}` diventa `` `${pos.item_type === 'sealed_product' ? '/product/' : '/card/'}${pos.card_api_id}` ``.

- [ ] **Step 3: bottone "Add to Collection" in `ProductPage.jsx`** che chiama `addSealedProductToCollection`, stesso stile di conferma/toast già presente in `AssetView.jsx` per le carte (leggere quel componente per il pattern esatto prima di duplicarlo).

- [ ] **Step 4: test manuale end-to-end**: aggiungere un prodotto sigillato al Portfolio da `ProductPage`, verificare che compaia in `PortfolioView` con quantità 1, che il link apra `/product/{id}`, che P&L funzioni se c'è un `purchase_price` (il campo `purchase_price`/`fmv_currency` di `collection` è già generico, nessuna modifica necessaria lì).

- [ ] **Step 5: build + suite completa**

Run: `npm run build && npm test && node --test "scripts/**/*.test.js"`
Expected: tutto verde, nessuna regressione sui flussi carte esistenti (il default `item_type='card'` deve rendere invariato ogni comportamento preesistente).

- [ ] **Step 6: Commit**

```bash
git add src/supabase.js src/pages/portfolio/PortfolioView.jsx src/pages/products/ProductPage.jsx
git commit -m "feat(sealed-products): integrazione Collection/Portfolio per prodotti sigillati"
```

---

## Task 7: Verifica finale e preview

- [ ] **Step 1: rileggere l'intero diff del branch** (`git diff main...HEAD`), verificare che nessun flusso carte esistente sia stato alterato al di fuori delle diramazioni esplicite su `item_type`/`pos.tcg`.
- [ ] **Step 2: `npm run build` pulito, `npm test` + `node --test "scripts/**/*.test.js"` verdi.**
- [ ] **Step 3: push del branch, apertura PR, verifica su Vercel preview** (CLAUDE.md §2 — cambio rischioso, richiede preview prima del merge).
- [ ] **Step 4: `get_advisors` (security + performance) un'ultima volta sul progetto live dopo l'ultima migration di questo piano.**
