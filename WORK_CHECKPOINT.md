# CHECKPOINT OPERATIVO — Work in corso

**Data:** 2026-09-19
**Stato:** Analisi completa effettuata. Inizio lavorazioni.

## Cosa ho verificato (fatti, non ipotesi)

### Repository structure
- `src/` — 117 source files (.jsx, .js), React + Vite
- `src/DraGold.jsx` (455 righe) — shell principale
- `src/DraGold.legacy.jsx` (4440 righe) — logica legacy con dati hardcoded
- `src/pages/` — 20+ pagine (home, card, set, tcg, academy, auth, portfolio, alerts, etc.)
- `src/components/` — 20+ componenti (AssetView, SearchView, SetSelector, etc.)
- `src/lib/` — utility (auth, search, portfolio, tcgConfig, state, etc.)
- `src/pages/home/webgl/` — 13 file WebGL (Three.js/R3F)
- `api/` — 9 Vercel serverless functions + 1 lib (ebay.js)
- `supabase/functions/` — 8 Edge Functions Deno/TS
- `supabase/migrations/` — 28 migrazioni SQL
- `scripts/` — 30+ script di sync/import
- `.github/workflows/` — 14 GitHub Actions
- `public/fonts/` — 3 famiglie (Fraunces, Space Mono, Plus Jakarta Sans — SIL OFL verificati)
- `public/logos/` — 4 logo TCG (MTG, One Piece, Pokémon, Yu-Gi-Oh! — da documentare come terze parti)
- `.github/ISSUE_TEMPLATE/` — 2 template (bug, feature)
- `.github/PULL_REQUEST_TEMPLATE.md` — template PR

### Build
- `npm run build` → ✅ build completo, nessun errore
- Output in `dist/` — React app SPA con code splitting

### Test esistenti
- 52 test files totali
- Scripts: ottima copertura (image-audit, lib, valuation, catalog, reconcile, pokemon-jp)
- src: 7 test files — poca copertura su componenti React

### Font licenses (VERIFICATI via sorgenti ufficiali)
- Fraunces → SIL OFL 1.1 (github.com/undercasetype/Fraunces)
- Space Mono → SIL OFL 1.1 (github.com/googlefonts/spacemono)  
- Plus Jakarta Sans → SIL OFL 1.1 (github.com/tokotype/PlusJakartaSans)

### API routes da DOCUMENTARE (9 endpoint)
1. `GET /api/img` — image proxy WebGL (allow-listed hosts, CORS, size cap)
2. `POST /api/cache-image` — image cache proxy (auth interna, allow-listed sources, sharp → WebP)
3. `GET /api/ebay-search` — eBay Browse search (OAuth, marketplace map)
4. `GET /api/live-market` — eBay active listings per card (Supabase + eBay Browse)
5. `POST /api/delete-account` — GDPR account deletion (service role, storage cleanup, cascata FK)
6. `GET /api/scan-images` — read-only image scan (auth interna, HEAD probe)
7. `GET /api/sitemap-cards` — dynamic sitemap cards (per-TCG, max 49k URL/TCG)
8. `GET /api/sitemap-sets` — dynamic sitemap sets (canonical_cards + fallback cards per-TCG)
9. `GET /api/sitemap-illustrators` — dynamic sitemap illustrators (single file, no partition)

10. `api/_lib/ebay.js` — eBay OAuth client-credentials + marketplace map (condiviso)

### Edge Functions da DOCUMENTARE (8 funzioni)
1. `sync-sets` — sync set catalogs da TCG Price Lookup (env: TCG_LOOKUP_API_KEY, **FIXATA: nessun hardcoded**)
2. `bulk-import-mtg` — import MTG da Scryfall bulk data (~340 MB, streaming) ⚠️
3. `bulk-import-pokemon` — import Pokémon da TCGdex multi-lang ⚠️ (supertype null per Energy/Trainer)
4. `bulk-import-ygo` — import YGO da YGOPRODeck (free, 30 MB)
5. `check-alerts` — check price alerts con fallback chain (eBay, TCGdex) ⚠️ (eBay camp hardcoded)
6. `compute-hot-picks` — daily hot picks computation (RPC `compute_hot_picks_today`)
7. `fetch-ebay-prices` — eBay Browse price fetcher ⚠️ (eBay affiliate hardcoded)
8. `refresh-prices` — price refresh con fallback chain per TCG ⚠️ (potenziali N+1)

### Cosa ho trovato nel report e cosa modificherò

#### 1. Error Boundary globale — CREA
- Creo `src/components/shared/ErrorBoundary.jsx` (classe React con getDerivedStateFromError + componentDidCatch)
- Monto in `main.jsx` avvolgendo RootView
- Hook opzionale per notifiche/analytics

#### 2. Alt text mancanti — SISTEMA
- Aggiungo `alt=""` o `alt` descrittivo dove manca
- Controllo anche SetPage.jsx e SetDetailPage.jsx per fallback logo

#### 3. WebGL cleanup mancante — SISTEMA
- Componenti DA sistemare (mancano cleanup): AtlasScene, DustField, HeroCard, WebGLBoundary, atlasScroll, cardBackTexture, webglImage, FoilMaterial, gpuTier
- AtlasCanvas e CardBurst hanno già cleanup
- ConstellationField: ha useLayoutEffect con cleanup?
- IconCards.jsx: ha cleanup
- Controllo se cleanup è necessario (some sono singletons condivisi)

#### 4. Console.error senza gestione — SISTEMA
- Unisca i file con console.error non gestiti
- In produção, sostituisce con logging appropriato o gestione errori

#### 5. API documentation — CREA
- Documento tutti e 9 gli API routes in `docs/api-routes.md`
- Documento le 8 Edge Functions in `docs/edge-functions.md`
- Specifico: endpoint, method, params, response, env vars, auth, rate limits

#### 6. DraGold.legacy.jsx refactoring selettivo — ESEGUI
- Estraggo dati hardcoded di esempio in file separato `src/lib/legacy-demo-data.js`
- Rimuovo e importo dove necessario
- Documento cosa è legacy vs attivo

#### 7. Test mancanti — AGGIUNGO
- Test per funzioni critiche non coperte:
  - `src/lib/search.js` (searchCards, groupByCanonical, rankSearchResults)
  - `src/lib/setSlug.js`
  - `src/lib/illustratorSlug.js`
  - `src/lib/state.js`
  - `src/lib/auth.js` (useAuth, AuthProvider)
  - Componenti semplici
- Test WebGL: studio se aggiungere test per funzioni pure (cardBurst.pure.js già testato)

#### 8. API routes — RATE LIMITING
- Investigo pattern per Vercel/serverless
- Documento ma non implemento senza capire meglio il deployment

#### 9. Sitemap URLs hardcoded — DOCUMENTO
- `https://dragold.org` hardcoded in sitemap-cards, sitemap-sets, sitemap-illustrators
- Documento come rendere configurabile

#### 10. CORS origins hardcoded — DOCUMENTO
- `ALLOWED_ORIGINS = new Set(["https://dragold.org", "https://www.dragold.org"])` in cache-image e scan-images
- Documento come rendere configurabile

#### 11. `any` tipo nelle Edge Functions — DOCUMENTO
- Documento dove sono usati `any` e suggerisco tipi stretti

#### 12. Migrazioni non applicate — DOCUMENTO
- 2 file untracked: `20260916_normalize_canonical_slugs.sql` (distruttivo!) e `20260917_mvp_set_logos_and_counts.sql`
- Documento che non sono state applicate e i rischi
- Non le applico — decisione del founder

#### 13. eBay affiliate ID hardcoded — DOCUMENTO
- `EBAY_CAMP = '5339152703'` in check-alerts
- `EBAY_AFFILIATE_ID = '5339152703'` in fetch-ebay-prices
- Documento come spostare in env var

#### 14. bulk-import-mtg memory risk — DOCUMENTO
- 340 MB bulk data vs 256 MB memory limit Supabase Edge Functions
- Streaming potrebbe non bastare

#### 15. Hot picks / refresh-prices — DOCUMENTO
- Documento la logica e suggerisco verifiche

## Cosa NON modifico (scope limitato)
- package.json, package-lock.json (modificati preesistentmente)
- src/pages/set/SetPage.jsx (modificata preesistentemente)
- src/pages/home/* (modifiche preesistenti)
- database schema, migrazioni esistenti
- dati di produzione

## Cosa salto (fuori scope per questa sessione)
- TypeScript migration completa
- i18n implementazione
- Test E2E completi
- Rate limiting implementazione (richiede deployment test)
- Refactoring completo DraGold.legacy.jsx (richiederebbe settimane)
- Design system documentazione completa
- Migrazioni non applicate (richiedono approvazione founder)

## Piano di lavoro

1. Error Boundary + main.jsx modification
2. Alt text fixes (tutti i file)
3. WebGL cleanup analysis + fixes
4. Console.error fixes
5. API documentation (docs/api-routes.md, docs/edge-functions.md, docs/font-licenses.md, docs/third-party-assets.md update)
6. DraGold.legacy.jsx refactoring (estrai dati hardcoded)
7. Test aggiuntivi (search.js, auth.js, state.js, setSlug.js, illustratorSlug.js)
8. Build verification + test execution
9. Final report

Inizio con Error Boundary + alt text.
