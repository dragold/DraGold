CLAUDE.md — DraGold

Aggiornato: 2026-08-06

⚠️ Direzione strategica vincolante (leggere PRIMA di qualsiasi task)

DraGold = TCG Knowledge Graph + Academy + Collection Layer. Fonte di verità: PRODUCT_SPEC.md (riscritta il 2026-08-05).

NON è più: price tracker con portfolio finanziario come core. Quella versione di PRODUCT_SPEC.md (Markets/Portfolio/Alerts come le 4 schermate core, FMV come dato centrale) è superata e sostituita. Non riproporla come architettura, nemmeno se il codice attuale contiene ancora tracce di quell'impostazione.

Prezzi, alert, portfolio avanzato NON sono eliminati — esistono nel DB e nel codice, restano funzionanti, ma sono classificati "Archived/Future Modules" in PRODUCT_SPEC.md §6. Non sono un'area di sviluppo attivo finché non cambia la priorità.

Prima di iniziare qualsiasi nuovo task, chiedersi: "questo aumenta il valore del knowledge graph, dell'Academy, della Collection, o la capacità di scalare l'architettura?" Se la risposta è "migliora solo pricing/portfolio/alert avanzati", il task va rimandato — non proporlo come prossimo step senza che Ermal lo richieda esplicitamente.

Priorità TCG: Pokémon (massima) → One Piece (seconda) → MTG/Yu-Gi-Oh (solo architettura, zero lavoro attivo di audit/contenuti). Priorità lingue: EN, JA.

Stato Reale del Progetto
DraGold.jsx: ~2507 righe (verificato 2026-08-06, non ~3923 come riportato in precedenza)
Deploy: Vercel builda con Vite (Framework Preset "Vite", Build Command = default = `npm run build` → `vite build`). build-esbuild.mjs esiste nel repo ma è LEGACY/NON USATO in produzione — non è il build step reale, non affidarsi alla sua presenza per capire cosa gira su Vercel.
Git: non installato sul PC di Ermal → deploy via GitHub web (commit su main → Vercel auto-deploya).
Lingue card live: en, ja, it, es, pt, id (priorità di lavoro: solo en, ja)

Build & Deploy
# Dev locale
npm run dev # Vite dev server → localhost:5173

Deploy production (regola attuale):

Modifica file → commit su main via GitHub web (upload/edit, o github.dev per commit multi-file)
Vercel rileva il push e builda con Vite (`vite build`, preset rilevato automaticamente, nessun override di build command)
Production live su dragold.org in ~10-30s

NOTA (corretta 2026-08-06): il build step reale usato da Vercel è Vite (`vite build`), confermato da Vercel → Settings → Build and Deployment (Framework Preset: Vite, Build Command: default/non in override). build-esbuild.mjs è uno script alternativo rimasto nel repo (avviabile a mano con `npm run build:esbuild`) ma NON è quello che gira sui deploy reali. Le versioni precedenti di questo file affermavano il contrario: era un errore.

Struttura
src/
DraGold.jsx ← file UI + logica principale, in fase di modularizzazione (vedi sotto) — ~2507 righe
main.jsx ← Entry point
pages/card/CardPage.jsx + cardPageData.js ← PRECEDENTE GIÀ ESISTENTE di pagina separata fuori da DraGold.jsx (la card detail page SEO). Le nuove pagine di Fase 3 (Set, Character, Illustrator, Rarity, Series) devono seguire questa stessa convenzione: src/pages/<entità>/<Entità>Page.jsx (+ un file dati sibling se serve), non la cartella views/ generica.
DraGold.legacy.jsx ← file legacy, non toccare senza motivo esplicito
supabase.js ← Client Supabase + auth + query DB
styles.css ← NON esiste ancora (verificato 2026-08-06: nessun file styles.css in src/). Il design system è ancora tutto dentro il CSS-in-JS di DraGold.jsx. La Fase 1 Passo A crea questo file da zero, non lo estende.

build-esbuild.mjs ← script di build alternativo, LEGACY, non usato da Vercel (vedi Deploy sopra)
dist/ ← Output build (generata da Vercel via Vite)
public/ ← Asset statici (favicon, manifest, ecc.)
api/ ← Serverless functions Vercel (eBay search)

Config principali in DraGold.jsx
PLANS: Free / Collector / Pro (non gatekeepano nulla — modulo futuro, vedi PRODUCT_SPEC §6)
TCG_LIST: pokemon, mtg, ygo, op (One Piece) — priorità attiva: pokemon, op
BINDER_TYPES: formati binder fisici con griglie
CARD_LANGS: en🇺🇸 ja🇯🇵 it🇮🇹 es🇪🇸 pt🇧🇷 id🇮🇩 (live=true) + ko fr de (live=false) — priorità attiva: en, ja
CONDITIONS: NM, LP, MP, HP, DMG

DB Supabase (RLS attivo)
profiles: metadata utente, tier, country
collection: vault carte (card_id, condition, grade, purchase_price) — ora layer di engagement/progresso, non solo portfolio (vedi PRODUCT_SPEC §4)
alerts: soglie prezzo (tcg, card_api_id, card_name, threshold_price, direction, is_active) — Archived/Future Module
binders: binder virtuali
watchlist: carte tracciate (max 20 free tier)
cards: catalogo carte (~200.9k righe verificate 2026-08-05: Pokemon, MTG, YGO, One Piece). canonical_card_id popolato su tutte le righe controllate — usato per raggruppare varianti/lingue.
card_prices: snapshot prezzi (card_id, source, price_market, captured_at) ← tabella REALE dei prezzi
price_history: VUOTA, legacy — NON usare, lo schema attuale scrive su card_prices
api_call_log: log di ogni chiamata API esterna (source, endpoint, status, error_message, called_at)
price_sources: health delle fonti prezzo
newsletter: iscritti email

Entità del knowledge graph da consolidare (vedi PRODUCT_SPEC §1): set, character, illustrator, rarity, series, product, e le relazioni card→set/character/illustrator/rarity, set→series. Verificare nello schema attuale cosa esiste già come campo su cards e cosa va normalizzato in tabelle separate.

Pipeline prezzi (verificato 2026-06-11, dipendenze auditate 2026-08-05)
Edge Function refresh-prices gira via pg_cron ogni 6h (refresh-prices-6h) → prende card da alerts attivi + collection → chain di fonti per TCG → insert su card_prices
Cron attivi confermati: refresh-prices-6h, bulk-import-weekly, compute-hot-picks-daily, dragold-alert-checker
JustTCG: game slug One Piece = one-piece-card-game (NON one-piece → HTTP 400); il param q è ricerca testuale → si cerca il numero carta (es. OP05-119), non l'ID interno. Fonte stabile: 0% errori su 231 chiamate/7gg (audit 2026-08-05).
⚠️ pokemontcgio: fonte FRAGILE — 81% di chiamate fallite negli ultimi 7 giorni (audit 2026-08-05), soprattutto HTTP 500. Non costruire nuove feature che dipendono da questa fonte senza prima stabilizzarla o sostituirla. Obiettivo dichiarato: pipeline immagini proprietaria (storage nostro, niente hotlink) invece di dipendere da fonti esterne instabili.
⚠️ tcgdex: uso irregolare (poche chiamate/7gg, non quotidiane) — verificare se è nello scheduling corretto o solo on-demand.
⚠️ Immagini One Piece: URL presente e valido nel DB (100% coverage EN/JA), ma probabile hotlink/referrer protection lato onepiece-cardgame.com/optcgapi.com impedisce il rendering su dragold.org.
Altri cron: bulk-import-weekly, compute-hot-picks-daily
GitHub Action Sync Cards (giornaliero 03:00 UTC): aggiorna SOLO il catalogo cards, non i prezzi
Debug: tabella api_call_log contiene status + body errore di ogni chiamata

Env Vars
VITE_SUPABASE_URL → supabase project URL
VITE_SUPABASE_ANON_KEY → chiave pubblica supabase
SUPABASE_SERVICE_KEY → chiave service (solo backend)
EBAY_CLIENT_ID → eBay OAuth (opzionale, Vercel only)
EBAY_CLIENT_SECRET → eBay OAuth (opzionale, Vercel only)

Auth
Magic link via Supabase (no password)
detectSessionInUrl: true → redirect automatico dopo auth

Link operativi (usare SEMPRE questi)
App live: https://dragold.org (principale) | https://dragold.vercel.app
GitHub repo: https://github.com/dragold/DraGold (user: dragold)
Upload file GitHub: https://github.com/dragold/DraGold/upload/main/{cartella}
Modifica file GitHub: https://github.com/dragold/DraGold/edit/main/{file}
Editor multi-file (github.dev): premere "." sulla repo, oppure https://github.dev/dragold/DraGold — usare quando un task tocca più file in un commit solo
Vercel dashboard: https://vercel.com/dra-gold-s-projects (NON /dragold → 404)
Supabase dashboard: https://supabase.com/dashboard/project/pimwkmwrduqkaydyvxqz
Supabase SQL: https://supabase.com/dashboard/project/pimwkmwrduqkaydyvxqz/editor
Supabase Functions: https://supabase.com/dashboard/project/pimwkmwrduqkaydyvxqz/functions
Resend: https://resend.com/emails
eBay Dev: https://developer.ebay.com/my/keys

Deploy (regola fissa)
Modifiche file → GitHub web (upload/edit per singolo file, github.dev per commit multi-file)
Commit su main → Vercel auto-deploya con Vite
Per cambi rischiosi (es. modularizzazione, lazy loading): preferire un branch + Vercel preview deployment, verificare il preview, poi mergiare su main. Zero terminali locali, quindi il preview è l'unico modo per Ermal di verificare prima della produzione.
Zero file .bat, zero terminali locali

PWA Assets (aggiunto 2026-06-02)
Tutti i file sono in public/ e dist/:
favicon.png 32×32
logo192.png 192×192
logo512.png 512×512
apple-touch-icon.png 180×180
manifest.webmanifest (aggiornato con nuovi icon paths)
dist/index.html aggiornato con link favicon PNG + manifest

Decisioni architetturali — modularizzazione DraGold.jsx (approvate 2026-08-06)

Analisi tecnica condotta il 2026-08-06 ha corretto due assunzioni sbagliate di questo file: la dimensione reale di DraGold.jsx (~2507 righe, non ~3923) e il build tool reale in produzione (Vite, non build-esbuild.mjs). Sulla base dell'analisi, Ermal ha approvato la modularizzazione del file, sostituendo la vecchia regola "non splittare". Roadmap approvata, da seguire in ordine, senza saltare fasi:

Fase 1 — Pulizia a rischio minimo (nessun cambio di logica o UX)
Passo A — Estrarre il blocco CSS-in-JS (const CSS = `...`) da DraGold.jsx verso styles.css o un file dedicato del design system.
Passo B — Centralizzare le variabili module-level condivise (_savedSearch, _setsMap, _setsLoadP, ed eventuali altre trovate durante il lavoro) in un piccolo layer state.js/lib — senza introdurre Redux/Zustand.

Fase 2 — Modularizzazione progressiva per dominio (refactor incrementale, non big-bang)
components/: CardItem, Icon, modali (Sheet/PortfolioModal/AlertModal/AuthModal), Search, altra UI condivisa.
views/: MarketsView, PortfolioView, AlertsView, AssetView.
DraGold.jsx diventa gradualmente un orchestratore (stato globale, header/nav, composizione delle view), non il contenitore di tutta la logica.

Fase 3 — Nuove feature sempre fuori dal file principale
Le nuove pagine della roadmap (Set, Character, Illustrator, Rarity, Series, Academy) nascono direttamente come file separati in src/pages/<entità>/ — seguendo la convenzione già stabilita da src/pages/card/CardPage.jsx (vedi Struttura sopra), non una cartella views/ generica. Non vanno mai aggiunte dentro DraGold.jsx, nemmeno temporaneamente.

Fase 4 — Lazy loading (solo dopo la Fase 2/3, non prima)
Una volta che le view sono file separati, introdurre React.lazy + Suspense per le pagine SEO pesanti, Academy, Collection e dashboard utente. Vite fa code-splitting automatico sugli import() dinamici, zero config aggiuntiva su vite.config.js. Non implementare lazy loading prima di aver separato i file: su un file monolitico non porta nessun beneficio reale.

Vincoli da mantenere in ogni fase
NON TypeScript per ora
NON Redux/Zustand — useState scala bene
Mantenere React semplice, niente librerie nuove oltre a quelle già presenti
Mantenere il workflow GitHub web/github.dev + Vercel (preview deployment per cambi rischiosi, vedi sopra)
Nessuna settimana di puro refactor senza shippare anche nuove feature — la modularizzazione procede in parallelo al lavoro su roadmap, non al suo posto

Regole fondamentali
NON aggiungere build tools oltre a Vite
NON usare Redux/Zustand — useState scala bene ora
NON TypeScript finché non c'è product-market fit
NON refactor estetico — solo bug fix (eccetto la modularizzazione approvata sopra, che non è estetica: è struttura)
NON impostare nuovo lavoro attorno a pricing/portfolio/alert come se fossero il core — sono Archived/Future Modules (vedi sopra)
NON costruire nuove feature su pokemontcgio finché non è stabilizzata
