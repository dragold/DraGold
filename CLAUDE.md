# CLAUDE.md — DraGold

> Aggiornato: 2026-06-11

## Stato Reale del Progetto

- **DraGold.jsx**: ~3923 righe (non 1200 — non splittare ancora)
- **Deploy**: Vercel **ricostruisce dal sorgente** via `build-esbuild.mjs` (esiste). Non più `dist/` prebuilt manuale.
- **Git**: non installato sul PC di Ermal → deploy via **GitHub web** (commit su `main` → Vercel auto-deploya).
- **Lingue card live**: en, ja, it, es, pt, id

## Build & Deploy

```bash
# Dev locale
npm run dev          # Vite dev server → localhost:5173
```

**Deploy production (regola attuale):**
1. Modifica file → commit su `main` via GitHub web (upload/edit)
2. Vercel rileva il push e ricostruisce dal sorgente con `build-esbuild.mjs`
3. Production live su dragold.org in ~10-30s

**NOTA**: `build-esbuild.mjs` ESISTE ed è il build step usato da Vercel. La vecchia regola "solo dist/ prebuilt manuale" è superata.

## Struttura

```
src/
  DraGold.jsx    ← UNICO file UI + logica (~3923 righe)
  main.jsx       ← Entry point
  supabase.js    ← Client Supabase + auth + query DB
  styles.css     ← Design system completo

build-esbuild.mjs ← Build step usato da Vercel (ricostruisce da sorgente)
dist/            ← Output build (generata da Vercel)
public/          ← Asset statici (favicon, manifest, ecc.)
api/             ← Serverless functions Vercel (eBay search)
```

## Config principali in DraGold.jsx

- `PLANS`: Free / Collector / Pro
- `TCG_LIST`: pokemon, mtg, ygo, op (One Piece)
- `BINDER_TYPES`: formati binder fisici con griglie
- `CARD_LANGS`: en🇺🇸 ja🇯🇵 it🇮🇹 es🇪🇸 pt🇧🇷 id🇮🇩 (live=true) + ko fr de (live=false)
- `CONDITIONS`: NM, LP, MP, HP, DMG

## DB Supabase (RLS attivo)

- `profiles`: metadata utente, tier, country
- `collection`: vault carte (card_id, condition, grade, purchase_price)
- `alerts`: soglie prezzo (tcg, card_api_id, card_name, threshold_price, direction, is_active)
- `binders`: binder virtuali
- `watchlist`: carte tracciate (max 20 free tier)
- `cards`: catalogo carte (~170k righe: Pokemon, MTG, YGO, One Piece)
- `card_prices`: snapshot prezzi (card_id, source, price_market, captured_at) ← tabella REALE dei prezzi
- `price_history`: VUOTA, legacy — NON usare, lo schema attuale scrive su `card_prices`
- `api_call_log`: log di ogni chiamata API esterna (source, endpoint, status, error_message)
- `price_sources`: health delle fonti prezzo
- `newsletter`: iscritti email

## Pipeline prezzi (verificato 2026-06-11)

- Edge Function `refresh-prices` gira via pg_cron ogni 6h (`refresh-prices-6h`)
  → prende card da alerts attivi + collection → chain di fonti per TCG → insert su `card_prices`
- JustTCG: game slug One Piece = `one-piece-card-game` (NON `one-piece` → HTTP 400);
  il param `q` è ricerca testuale → si cerca il numero carta (es. OP05-119), non l'ID interno
- Altri cron: `bulk-import-weekly`, `compute-hot-picks-daily`
- GitHub Action `Sync Cards` (giornaliero 03:00 UTC): aggiorna SOLO il catalogo `cards`, non i prezzi
- Debug: tabella `api_call_log` contiene status + body errore di ogni chiamata

## Env Vars

```
VITE_SUPABASE_URL         → supabase project URL
VITE_SUPABASE_ANON_KEY    → chiave pubblica supabase
SUPABASE_SERVICE_KEY      → chiave service (solo backend)
EBAY_CLIENT_ID            → eBay OAuth (opzionale, Vercel only)
EBAY_CLIENT_SECRET        → eBay OAuth (opzionale, Vercel only)
```

## Auth

- Magic link via Supabase (no password)
- `detectSessionInUrl: true` → redirect automatico dopo auth

## Link operativi (usare SEMPRE questi)

- **App live**: https://dragold.org (principale) | https://dragold.vercel.app
- **GitHub repo**: https://github.com/dragold/DraGold (user: dragold)
- **Upload file GitHub**: https://github.com/dragold/DraGold/upload/main/{cartella}
- **Modifica file GitHub**: https://github.com/dragold/DraGold/edit/main/{file}
- **Vercel dashboard**: https://vercel.com/dra-gold-s-projects (NON /dragold → 404)
- **Supabase dashboard**: https://supabase.com/dashboard/project/pimwkmwrduqkaydyvxqz
- **Supabase SQL**: https://supabase.com/dashboard/project/pimwkmwrduqkaydyvxqz/editor
- **Supabase Functions**: https://supabase.com/dashboard/project/pimwkmwrduqkaydyvxqz/functions
- **Resend**: https://resend.com/emails
- **eBay Dev**: https://developer.ebay.com/my/keys

## Deploy (regola fissa)

1. Modifiche file → GitHub web (upload o edit)
2. Commit su main → Vercel auto-deploya
3. Zero file .bat, zero terminali locali

## PWA Assets (aggiunto 2026-06-02)

Tutti i file sono in `public/` e `dist/`:
- `favicon.png` 32×32
- `logo192.png` 192×192
- `logo512.png` 512×512
- `apple-touch-icon.png` 180×180
- `manifest.webmanifest` (aggiornato con nuovi icon paths)
- `dist/index.html` aggiornato con link favicon PNG + manifest

## Regole fondamentali

- NON splittare DraGold.jsx (ancora sotto 4000 righe)
- NON aggiungere build tools oltre a Vite
- NON usare Redux/Zustand — useState scala bene ora
- NON TypeScript finché non c'è product-market fit
- NON refactor estetico — solo bug fix
