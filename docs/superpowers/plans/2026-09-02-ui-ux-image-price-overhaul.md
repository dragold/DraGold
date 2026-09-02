# UI/UX + Image/Price Architecture Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portare DraGold a un livello "WOW factor" su performance percepita di ricerca/catalogo, robustezza del fallback immagini/prezzi, motion system e copertura di test — senza introdurre regressioni sulla produzione live (dragold.org).

**Architettura:** Nessun cambio di stack. Si estende quanto già esiste (React 18 + Vite, GSAP già dipendenza, cascata immagini multi-sorgente già disegnata per attivazione via env var, pattern `CardObject`/`onError` già maturo) invece di introdurre nuove astrazioni. Unica nuova dipendenza proposta: `@tanstack/react-virtual` (vedi §F).

**Tech Stack:** React 18, Vite 5, JS (no TS), Supabase (Postgres 17 + PostgREST), GSAP 3 + `@gsap/react`, Lenis, Three.js/`@react-three/fiber`/`drei`, `node:test` per gli script.

**Spec:** Richiesta utente 2026-09-02 (questa conversazione) — audit full-stack DraGold, punto 3 (cascata immagini/prezzi) e punto 4 (UI/UX WOW factor), rivista con vincoli aggiuntivi: partire dallo stato reale di `main` post-merge (`36b5af8`), cascata prezzi attivabile via env/secrets senza modifiche architetturali, non toccare `feat/sealed-products`, verificare riuso prima di nuove librerie.

## Global Constraints

- JavaScript, non TypeScript (CLAUDE.md §5).
- Niente Redux/Zustand, niente nuovi build tool senza decisione esplicita (CLAUDE.md §5) — `@tanstack/react-virtual` è una utility di rendering runtime, non un build tool; da confermare esplicitamente in review (vedi §F).
- Nuove pagine → `src/pages/<entità>/`; nessuna nuova feature dentro `DraGold.jsx` (deve restare orchestratore) o dentro `DraGold.legacy.jsx` (non si tocca — confermato NON importato da nessun entry point attivo, vedi §Note).
- Stato condiviso persistente → `src/lib/state.js`; non spostare costanti per estetica.
- Animazioni/motion incoraggiate solo se migliorano comprensione/qualità percepita/scoperta — mai puramente decorative (CLAUDE.md §7). Ogni nuova animazione deve rispettare `prefers-reduced-motion` (pattern già presente in 5 punti di `styles.css`/`home.css`/`shell.css` — estenderlo, non reinventarlo).
- Build/verifica locale obbligatoria prima di ogni push; cambi rischiosi → branch dedicato → build/test locale → push → Vercel preview → merge (CLAUDE.md §2, §8).
- `feat/sealed-products` non va toccato, mergiato né rebasato in questo lavoro.
- Prima di ogni nuova libreria: verificato che non esista già nel repo un'utility equivalente (fatto per virtualizzazione, motion, test runner — vedi sezioni dedicate).

---

## Stato reale attuale (verificato 2026-09-02, post-merge `36b5af8` su `main`)

Verifica diretta via lettura file + query live su Supabase (`pimwkmwrduqkaydyvxqz`), non assunzioni pregresse.

### Cascata immagini/prezzi
- `scripts/lib/image-resolver.js` (usato dagli script di sync, path di produzione): TCGdex → Scrydex (skip se mancano `SCRYDEX_API_KEY`/`SCRYDEX_TEAM_ID`) → PokemonPriceTracker (skip se manca `POKEMONPRICETRACKER_API_KEY`) → `null`. Retry/backoff su 429/5xx già presente (righe 33-50). **Nessuno stage `pokemontcg.io`.**
- `scripts/image-audit/resolve-fallback.mjs` (tool di audit, read-only): TCGdex retry → Scrydex → **pokemontcg.io** (solo EN, funziona anche senza key) → PokemonPriceTracker. One Piece: TCGdex → optcgapi.com (solo EN, JA esplicitamente `skipped` — nessuno scraper collegato).
- Asimmetria confermata: il resolver di **produzione** non ha lo stage `pokemontcg.io` che il tool di **audit** invece ha — quindi oggi in produzione, senza le key a pagamento/free-tier di Scrydex/PPT, la cascata Pokémon si ferma a un solo stadio reale (TCGdex).
- `api/cache-image.js`: proxy di caching server-side con allow-list host, conversione WebP via `sharp`, retry con backoff — solido, nessuna azione richiesta.
- **Nessuna key Scrydex/PPT presente** in `.env`/`.env.local` oggi — entrambi gli stage sono codice pronto ma inerte.

### Ricerca (perf, verificato con `EXPLAIN ANALYZE` live)
- `src/lib/search.js#searchCards()`: fino a **3 round-trip Supabase sequenziali** (query base + eventuale lang-expand + eventuale canonical-id-expand), mai in `Promise.all`. Usa `.ilike()` via PostgREST → genera `ILIKE`, che **usa correttamente** gli indici GIN trigram esistenti (`cards_name_trgm_idx`, `cards_name_en_trgm_idx`, ecc.) — verificato: `name ILIKE '%charizard%' OR name_en ILIKE '%charizard%'` su 203.715 righe = **481ms** (bitmap index scan).
- `src/components/shell/CommandSearch.jsx`: debounce 180ms, poi chiama `searchCards()` — nessuna `AbortController`/cancellazione della richiesta di rete in volo quando l'utente digita ancora (solo `reqRef` scarta il risultato lato client dopo il round-trip, la richiesta HTTP parte comunque).
- Funzioni Postgres `search_cards`/`suggest_cards` (migration `005_search_lang_tolerant.sql`, colonne compatibili con lo schema attuale — verificato) sono **rotte a livello di performance**: usano `lower(name) LIKE '%q%'` (funzione su colonna → **bypassa** l'indice GIN, forza seq scan) e `similarity(name, q) > 0.3` (form non indicizzabile dall'operatore `%`). Verificato con `EXPLAIN ANALYZE select * from search_cards('charizard', null, 'en', 20)` → **6811ms**. Queste funzioni **non sono chiamate da nessun componente montato** (solo da `DraGold.legacy.jsx`, che non è importato da nessun entry point attivo — verificato via grep, zero import reali) — quindi zero impatto utenti oggi, ma sono un'esca pericolosa per chiunque le riusi in futuro pensando siano production-ready.

### Skeleton / error state immagine / GSAP / virtualizzazione (per componente)

| Componente | Skeleton | Fallback immagine | GSAP | Debounce | Virtualizzazione |
|---|---|---|---|---|---|
| `CommandSearch.jsx` | **No** (solo testo "Searching…") | n/a | No | 180ms, no abort | n/a (max 8 risultati) |
| `SearchView.jsx` + `SearchResults.jsx` | Sì | via `CardObject` | No | No (submit-based) | **No** — `visibleCount` incrementale, tutti i nodi restano nel DOM |
| `CardObject.jsx` (shared) | n/a | Sì — `onError` + prop `fallback` | No | — | — |
| `TcgPage.jsx` / `SetPage.jsx` / `SetsView.jsx` | Sì | Sì (via `CardObject`, con note di bug hotlink pre-esistenti) | No | — | No |
| `SetDetailPage.jsx` | No skeleton esplicito | Sì | No | — | **No** — liste set complete nel DOM (es. OP05 = 119 carte, i set Pokémon possono superare 250) |
| `CardPage.jsx` | Sì | Sì | No | — | n/a (pagina singola) |
| `PortfolioView.jsx` | Sì | Sì (fix appena mergiato per le rail card) | No | — | **No** — lista collezione completa nel DOM |
| `AlertsView.jsx` | Sì | Sì | No | No (hint testuale) | No |
| `CardSpecimen.jsx` (**hero home**, il primo elemento visibile su ogni caricamento) | n/a | **NO — bug confermato**: `<img>` senza `onError`, nessun fallback come nel resto del sito | — | — | — |
| `SpecimenTile.jsx` (rail Atlas) | n/a | Sì, via `CardObject` (falso negativo nel report precedente: delega correttamente) | — | — | — |
| `useAtlasChoreography.js` | — | — | **Sì** — unico uso reale di GSAP in tutto `src/` (ScrollTrigger sull'hero) | — | — |

`gsap`/`@gsap/react` sono dipendenze dichiarate ma usate in un solo file. `react-window`/`@tanstack/react-virtual`: **assenti**, nessun uso, nessuna dipendenza.

### Testing
- `npm test` = `node --test "src/**/*.test.js"` → copre **solo 2 file** (`homeData.pure.test.js`, `selectFeatured.test.js`), entrambi puri (nessun test di componente React).
- 25 file di test aggiuntivi esistono sotto `scripts/` (pipeline dati/sync) — buona copertura lato backend/script, **zero copertura lato componenti UI**.
- Nessuna libreria di component-testing installata (`@testing-library/react`, `vitest`, ecc. assenti da `package.json`).

### SEO / Accessibility (baseline già buona — non ripartire da zero)
- JSON-LD già presente su 7 pagine (`CardPage`, `TcgPage`, `SetPage`, Academy, `IllustratorPage`, ecc.).
- `robots.txt` e `sitemap.xml`/`sitemap-static.xml` già presenti in `public/`.
- OG/Twitter meta completi in `index.html`. `prefers-reduced-motion` già rispettato in 5 punti CSS.
- `CommandSearch.jsx` ha già `role="dialog"`, `aria-modal`, `aria-live="polite"`, focus trap, skip-link globale in `DraGold.jsx:294`. Pattern maturo da **estendere**, non reinventare.
- Gap noto: nessun audit automatizzato (axe/Lighthouse CI) in CI.

---

## A. Cascata immagini/prezzi — attivabile via env senza toccare l'architettura

**Stato:** l'architettura a stadi con guardia `if (!KEY) return null/skip` è già esattamente il pattern richiesto — attivare Scrydex/PPT in futuro richiederà **solo** impostare le env var (locali, GitHub Actions secrets, Vercel), zero modifiche al codice qui pianificate.

### A1 — Simmetria resolver produzione/audit (P1)
**File:** `scripts/lib/image-resolver.js`
**Problema:** manca lo stage `pokemontcg.io` che `resolve-fallback.mjs` già ha (righe 118-131 di quel file) — funziona anche senza key (rate limit più basso), quindi è "free" nel senso letterale della richiesta originale, e oggi il resolver di produzione perde questa copertura extra gratuita.
**Fix:** portare `resolveFromPokemonTcgIo(card, langCode)` in `image-resolver.js`, stessa firma/pattern delle altre due funzioni (`safeJsonFetch`, guardia su `lang !== 'en'`, nessuna key richiesta ma supporto opzionale `POKEMONTCG_API_KEY`), inserito nella cascata **tra** TCGdex e Scrydex (è gratuito senza key, ha senso prima degli stage a key).
**Dipendenze:** nessuna.
**Rischio:** basso — stesso pattern isolato già testato in `resolve-fallback.mjs`.
**Criteri di accettazione:** test unitario che verifica skip corretto per `lang==='ja'`, mock fetch con risposta valida → URL restituito; `resolveCardImage()` esistente continua a passare i suoi test attuali; nessun costo aggiuntivo per carte già risolte da TCGdex (lo stage non viene mai chiamato se `card.image` è già presente).

### A2 — One Piece giapponese: nuovo stage scraper (P2)
**File:** `scripts/image-audit/resolve-fallback.mjs` (nuovo `tryOnePieceJaScraper`), riuso della logica di estrazione già presente in `sync-cards.js#syncOnePiece` (bandai-onepiece-card.com).
**Problema:** oggi `tryOptcgOnePiece` ritorna sempre `skipped` per `lang==='ja'` — nessun fallback JA, mentre lo scraper HTML esiste già ma non è collegato alla cascata di recovery.
**Fix:** estrarre la funzione di scraping/parsing da `sync-cards.js` in un modulo condiviso `scripts/lib/reconcile/sources/fetch-onepiece-ja.js` (stesso pattern di `fetch-optcg.js`/`fetch-tcgdex.js`: funzione pura, `AbortController`, errori tipizzati), poi importarlo sia in `sync-cards.js` (sostituendo la logica inline, comportamento identico) sia nel nuovo stage di `resolve-fallback.mjs`.
**Dipendenze:** nessuna libreria nuova (`node-html-parser` già presente in `package.json`).
**Rischio:** medio — tocca la sync One Piece esistente (`sync-cards.js`), che è codice di produzione con cron GitHub Actions attivo; l'estrazione deve essere comportamentalmente identica (stesso output) o si rischia una regressione silenziosa sui dati One Piece JA.
**Criteri di accettazione:** `node --test scripts/lib/reconcile/sources/__tests__/fetch-onepiece-ja.test.js` verde con fixture HTML reale salvata; `sync-cards.js` produce lo stesso output prima/dopo su un campione di set JA noto (diff manuale su un dry-run); `resolve-fallback.mjs` con lang='ja' ora prova lo stage invece di `skipped` esplicito.

### A3 — Documentazione operativa attivazione key (P3, non-code)
Nessun file di codice. Quando l'utente fornirà `SCRYDEX_API_KEY`/`SCRYDEX_TEAM_ID`/`POKEMONPRICETRACKER_API_KEY`, vanno aggiunte come secrets in GitHub Actions (workflow `sync-*.yml`) e in Vercel env — zero modifiche di codice, per design. Da non fare ora (nessuna key disponibile).

---

## B. Search performance (P0)

### B1 — Parallelizzare gli expand + AbortController (P0)
**File:** `src/lib/search.js#searchCards()` (righe 182-279), `src/components/shell/CommandSearch.jsx` (righe 65-90)
**Problema:** gli expand lang/canonical sono sequenziali dietro un `await` anche quando indipendenti tra loro per `tcg`; `CommandSearch` non cancella la richiesta precedente quando l'utente digita ancora entro il debounce.
**Fix:**
- In `searchCards()`, sostituire i loop `for (const [tcgKey, numSet] of Object.entries(byTcg))` con `Promise.all(Object.entries(byTcg).map(...))` nei tre punti di expand (righe ~192-209, ~233-245) — stesso comportamento, esecuzione parallela per TCG diversi.
- Aggiungere un parametro opzionale `{ signal }` a `searchCards(rawQuery, { signal })`, passato a ogni chiamata Supabase come `.abortSignal(signal)` (supportato nativamente da `@supabase/supabase-js` v2, già in uso).
- In `CommandSearch.jsx`, creare un `AbortController` per ogni `run()`, abortire quello precedente prima di lanciarne uno nuovo.
**Dipendenze:** nessuna nuova libreria — `.abortSignal()` è già nel client Supabase installato.
**Rischio:** basso — cambio isolato e testabile, comportamento visibile identico (stessi risultati, meno round-trip in the air).
**Criteri di accettazione:** test su `searchCards` con mock che verifica chiamate parallele (non più di 1 round-trip "gap" sequenziale per gli expand multi-TCG); test manuale in `CommandSearch` — digitando rapidamente, la Network tab mostra le richieste precedenti in stato "canceled" invece che tutte completate.

### B2 — Skeleton nei risultati di `CommandSearch` (P1, collegato a §C)
**File:** `src/components/shell/CommandSearch.jsx` (righe 150-151), `src/components/shell/shell.css`
**Problema:** unico punto di ricerca "universale" del sito senza skeleton — mostra solo testo "Searching…".
**Fix:** riusare la stessa classe `.skel-card`/`.skel-line` già definita in `src/styles.css` (righe intorno a 281, shimmer keyframe esistente) invece di crearne una nuova — 2-3 righe skeleton al posto del testo, stesso shimmer del resto del sito.
**Dipendenze:** nessuna.
**Rischio:** basso.
**Criteri di accettazione:** visivamente coerente con lo skeleton già visto in `TcgPage`/`SetPage`; nessun CLS (cumulative layout shift) misurabile tra skeleton e risultati reali (altezza righe pre-riservata).

### B3 — Funzioni `search_cards`/`suggest_cards`: fix o rimozione esplicita (P3)
**File:** nuova migration `supabase/migrations/2026090X_fix_search_functions_or_deprecate.sql`
**Problema:** rotte a 6.8s (vedi audit), non usate da codice attivo, unico consumer è `DraGold.legacy.jsx` (non montato).
**Decisione richiesta all'utente** (non presa qui): (a) fix mirato (`lower(name) LIKE` → `name ILIKE`, `similarity(name,q)>0.3` → `name % q` con `set_limit(0.3)`) per tenerle pronte a un futuro consolidamento search lato DB, oppure (b) lasciarle come sono essendo dead code, oppure (c) rimuoverle insieme a `DraGold.legacy.jsx` in un task dedicato separato (CLAUDE.md: non si tocca `.legacy.jsx` senza motivo esplicito — la rimozione è un motivo esplicito ma va confermata dall'utente, non assunta qui).
**Rischio:** nullo se lasciate come sono (nessun consumer attivo); il fix (a) è a rischio basso ma richiede comunque una migration su prod.
**Criteri di accettazione:** se (a): `EXPLAIN ANALYZE select * from search_cards('charizard', null, 'en', 20)` scende sotto ~200ms.

---

## C. Skeleton / loading states (P1)

**File coinvolti:** `src/components/shell/CommandSearch.jsx` (vedi B2), `src/pages/set/SetDetailPage.jsx` (righe 190-200, manca skeleton esplicito durante il fetch delle carte del set — oggi probabile flash di lista vuota).
**Pattern da riusare:** classi `.skel-card`/`.skel-img`/`.skel-line` già definite in `src/styles.css`, già usate in `TcgPage`/`SetPage`/`SetsView`/`CardPage`/`PortfolioView`/`AlertsView` — nessuna nuova classe CSS, solo applicazione del pattern esistente ai due punti mancanti.
**Rischio:** basso.
**Criteri di accettazione:** nessun flash di contenuto vuoto/non stilizzato tra navigazione e dati pronti nei due componenti sopra; skeleton visivamente identico agli altri già in produzione.

---

## D. Image fallback / caching (P0 per D1, P2 per D2)

### D1 — Fix hero `CardSpecimen.jsx` senza fallback immagine (P0)
**File:** `src/pages/home/CardSpecimen.jsx` (righe 40-50), `src/pages/home/home.css`
**Problema:** confermato per lettura diretta — l'unico `<img>` del componente più visibile del sito (hero della home) non ha `onError`. Se `src` fallisce, browser mostra l'icona di immagine rotta invece del pattern usato ovunque nel resto del sito.
**Fix:** stesso pattern di `CardObject.jsx` — stato locale `imgFailed`, `onError={() => setImgFailed(true)}`, fallback visivo (placeholder con iniziale/colore, coerente con `.specimen-ph` già esistente in CSS per il caso `!src`, va solo esteso al caso "src presente ma fallita"). Non serve importare `CardObject` qui (il markup dell'hero è strutturalmente diverso, con i layer 3D `is-art`/`is-frame`/`is-holo`) — replicare la logica minima (10 righe), non l'intero componente.
**Dipendenze:** nessuna.
**Rischio:** basso, ma componente ad altissima visibilità — testare manualmente con un URL immagine rotto prima di mergiare.
**Criteri di accettazione:** con un `src` che risponde 404, l'hero mostra il placeholder invece dell'icona rotta del browser; nessuna regressione sul caso `src` valido (già coperto oggi).

### D2 — Audit onError sui componenti rimanenti (P2, verifica, non assunzione)
**File:** `SetDetailPage.jsx` righe 78/201/234/293 hanno già dei commenti che segnalano bug noti pre-esistenti su hotlink protection — leggerli e valutare se il fix rientra in questo piano o è un task a parte (dipende dal contenuto esatto del commento, da leggere al momento dell'implementazione, non assunto qui).
**Rischio:** da determinare in fase di lettura.

---

## E. GSAP motion system (P2)

**Stato:** GSAP è usato in un solo posto (`useAtlasChoreography.js`, hero home). Il resto del sito usa transizioni CSS pure (65 occorrenze `transition`/`@keyframes` in `styles.css`) + View Transitions API nativa per il "card turn" (`DraGold.jsx` righe 189-210, già con guardia `prefers-reduced-motion` e feature-detection corretta — **pattern di riferimento da replicare**, non un gap).

**Principio guida (CLAUDE.md §7):** motion solo se migliora comprensione/qualità percepita/scoperta/progressione — mai decorativo. Non serve "mettere GSAP ovunque"; serve identificare 2-3 punti dove manca feedback e dove GSAP (o CSS puro, se basta) aggiunge valore reale.

**Candidati concreti (da confermare con l'utente in review, non tutti P0):**
- **E1 (P2):** `SearchResultItem.jsx`/`SpecimenTile.jsx` — stagger di entrata quando arrivano nuovi risultati di ricerca (oggi appaiono istantaneamente in blocco), usando `@gsap/react`'s `useGSAP` + `gsap.from(...)` su `.sp-tile`/risultati, con `prefers-reduced-motion` come guardia (stesso pattern di `useAtlasChoreography.js`).
- **E2 (P2):** Skeleton → contenuto reale: crossfade invece di sostituzione istantanea del DOM (CSS `transition: opacity`, non serve GSAP).
- **E3 (P3):** micro-feedback su azioni utente (aggiungi a collezione, crea alert) — da valutare punto per punto, rischio di diventare decorativo se non ha uno scopo (es. conferma visiva di un'azione asincrona sì, un semplice hover bounce no).
**Dipendenze:** nessuna nuova libreria (`gsap`/`@gsap/react` già installati).
**Rischio:** basso tecnicamente, medio "di gusto" — ogni animazione va rivista con l'utente prima di considerarla finale (CLAUDE.md invita al motion ma è esplicito sul "mai decorativo").
**Criteri di accettazione per E1:** `prefers-reduced-motion: reduce` → nessuna animazione, contenuto appare istantaneo (stesso comportamento di oggi); animazione non blocca l'interattività (risultati cliccabili durante l'animazione).

---

## F. Virtualizzazione liste lunghe (P1)

**Verifica riuso (CLAUDE.md §4):** nessuna libreria di virtualizzazione nel repo. Confrontate `react-window` (~17KB, matura ma ferma, solo liste a dimensione fissa) e `@tanstack/react-virtual` (~5KB di logica, headless, manutenzione attiva, supporta grid via doppio asse, si integra con qualunque markup/CSS esistente senza imporre un componente di rendering proprio — compatibile con le classi grid CSS già in uso in `styles.css`). **Raccomandazione: `@tanstack/react-virtual`** — da confermare esplicitamente con l'utente in quanto nuova dipendenza (CLAUDE.md §5).

**File coinvolti:**
- `src/pages/set/SetDetailPage.jsx` — set con centinaia di carte (es. set Pokémon >250 carte) renderizzate tutte nel DOM oggi.
- `src/pages/portfolio/PortfolioView.jsx` — lista collezione utente, può crescere senza limite.
- `src/components/search/SearchView.jsx` — `visibleCount` incrementale, stesso problema per ricerche molto ampie.

**Approccio:** virtualizzazione per "riga di N colonne" (pattern standard con `useVirtualizer` a singolo asse verticale, dove ogni riga virtuale contiene le N card della griglia CSS corrente), con N ricalcolato via `ResizeObserver`/breakpoint esistenti (stessi breakpoint già in `styles.css`, nessun nuovo sistema di layout).
**Dipendenze:** nuova libreria `@tanstack/react-virtual` (da approvare).
**Rischio:** medio — tocca il rendering di 3 viste ad alto traffico; il rischio principale è la perdita di scroll-restore/deep-link (es. `/card/{id}` deep link apre `AssetView` sopra tutto, non dovrebbe essere impattato, ma va verificato) e comportamento SEO (contenuto non nel DOM iniziale per crawler — mitigabile mantenendo l'`overscan` alto o escludendo dalla virtualizzazione le pagine con JSON-LD/indicizzazione critica, es. `SetDetailPage` potrebbe voler restare non virtualizzato se importante per SEO — **decisione da confermare con l'utente**, non assunta).
**Criteri di accettazione:** con un set da 250+ carte, tempo di first paint della lista misurabilmente inferiore (DevTools Performance, nodi DOM ridotti da >250 a ~30-40 visibili); scroll fluido (60fps) su desktop e mobile reale; nessuna regressione su deep-link/paginazione esistente.

---

## G. Card detail (`CardPage.jsx`) (P2)

**File:** `src/pages/card/CardPage.jsx` (righe 380-388 skeleton, 577/716 onError — già a buon punto).
**Problema reale da verificare in review, non assunto:** nessun gap critico trovato nell'audit statico; possibili micro-miglioramenti (transizione E2 sopra, eventuale stagger E1 sulle carte correlate) sono coperti dalle sezioni E/F. Non pianificare lavoro extra qui senza un problema concreto — evitare over-engineering su una pagina già solida.

---

## H. Atlas / catalogo (home) (P0 per D1 già coperto sopra, P2 per il resto)

**Componenti:** `AtlasGrid.jsx` (wrapper layout, nessuna azione), `CardSpecimen.jsx` (fix D1), `SpecimenTile.jsx` (già a posto, falso positivo del report iniziale — nessuna azione), `DoorRail.jsx`/`Stratum.jsx` (da leggere in fase di implementazione se emergono problemi specifici — nessun gap trovato nell'audit statico).
**Nota:** l'home è già il pezzo più curato del sito (WebGL hero, GSAP choreography, View Transitions) — il lavoro principale qui è il fix D1, non un redesign.

---

## I. Mobile (P2 — richiede test su dispositivo reale, non solo statico)

**Stato:** 24+ media query distribuite su `styles.css`/`home.css`/`shell.css`, breakpoint coerenti (640/1024/1400px). Nessun problema strutturale trovato in audit statico.
**Piano:** non pianificabile file-by-file senza QA visivo reale. Fase dedicata: aprire l'app via `claude-in-chrome`/Playwright su viewport mobile (375×667, 390×844, 768×1024) sulle viste toccate dalle sezioni B/C/D/F sopra (ricerca, catalogo/set, home), catturare screenshot, correggere solo i problemi realmente osservati.
**Criteri di accettazione:** nessun overflow orizzontale, touch target ≥44px sulle nuove UI (skeleton `CommandSearch`, eventuali controlli di virtualizzazione), CLS accettabile su 3G simulato.

---

## J. SEO / Accessibility (P2/P3)

**Stato:** baseline già solida (vedi sopra) — non ripartire da zero.
**Task residui:**
- **J1 (P2):** integrare un check automatizzato (`axe-core` via script Node headless, o Lighthouse CI) in un workflow GitHub Actions dedicato, per prevenire regressioni sulle pagine toccate da questo piano — nuova dipendenza dev-only, basso rischio, da confermare con l'utente.
- **J2 (P3):** alt text: `CardSpecimen.jsx` ha `alt={card?.name ? ... : ""}` — verificare durante D1 che il fallback abbia comunque un alt sensato (oggi `aria-hidden` sui layer decorativi è corretto, va preservato).
**Rischio:** basso, lavoro additivo.

---

## K. Testing (trasversale — DoD di ogni fase sopra, più un item strutturale)

**Stato:** 0% coverage sui componenti React; `node:test` puro usato solo su funzioni pure.
**Decisione da confermare con l'utente (non presa qui):** introdurre `@testing-library/react` + un runner compatibile Vite (`vitest`, che riusa la config Vite esistente senza un build tool separato) per poter scrivere test di componente per B1/B2/C/D1/F — oppure restare su `node:test` + `happy-dom`/`jsdom` minimale per non introdurre un secondo runner accanto a `node --test`. **Raccomandazione: `vitest`** (si integra con `vite.config.js` esistente, community/manutenzione attiva, API quasi identica a `node:test` per i file già esistenti che non serve riscrivere) — ma è comunque una nuova dipendenza dev, da approvare esplicitamente vista la regola CLAUDE.md su nuovi tool.
**Task minimo per-fase (qualunque sia la decisione sopra):** ogni file toccato da B1 (nuova logica parallela), D1 (fallback hero) e F (virtualizzazione) riceve almeno un test mirato al comportamento nuovo — non una suite esaustiva ex-novo su codice non toccato.

---

## Ordine di implementazione, file coinvolti, effort, rischi, DoD

| Fase | Contenuto | Priorità | File principali | Effort | Rischio | Dipendenze | Definition of Done |
|---|---|---|---|---|---|---|---|
| **0. Decisioni preliminari** | Confermare con l'utente: (a) `@tanstack/react-virtual` sì/no, (b) `vitest` sì/no o `node:test`+jsdom, (c) `search_cards`/`suggest_cards`: fix/lascia/rimuovi, (d) virtualizzare anche `SetDetailPage` (SEO-sensibile) sì/no | — | — | 0 (conversazione) | — | Nessuna | Risposte esplicite alle 4 domande |
| **1. Fix critici visibili** | D1 (hero image fallback), B1 (parallelizzazione + abort ricerca) | P0 | `CardSpecimen.jsx`, `home.css`, `src/lib/search.js`, `CommandSearch.jsx` | 0.5–1 giorno | Basso | Nessuna | Build+test verdi; test manuale hero con URL rotto; Network tab mostra richieste cancellate durante digitazione rapida |
| **2. Skeleton + simmetria immagini** | B2, C, A1 | P1 | `CommandSearch.jsx`, `SetDetailPage.jsx`, `shell.css`, `image-resolver.js` + nuovo test | 1 giorno | Basso | Fase 1 (no, indipendente) | Nessun flash di contenuto vuoto; test unitario nuovo stage pokemontcg.io verde |
| **3. Virtualizzazione** *(se approvata in Fase 0)* | F | P1 | `SetDetailPage.jsx`, `PortfolioView.jsx`, `SearchView.jsx`, `package.json` (+dep) | 2–3 giorni | Medio | Fase 0.d | Nodi DOM ridotti misurabilmente su set grandi; nessuna regressione deep-link |
| **4. Motion system** | E1, E2 | P2 | `SearchResultItem.jsx`/`SpecimenTile.jsx`, CSS correlati | 1–2 giorni | Basso/medio (gusto) | Fase 1-3 (per non animare su layout instabile) | `prefers-reduced-motion` rispettato; review visiva con l'utente prima di considerarla definitiva |
| **5. One Piece JA fallback** | A2 | P2 | nuovo `fetch-onepiece-ja.js`, `sync-cards.js`, `resolve-fallback.mjs` | 2 giorni | Medio (tocca sync di produzione) | Nessuna | Test verdi con fixture reale; diff nullo su dry-run sync esistente |
| **6. Mobile QA reale** | I | P2 | dipende dai problemi trovati | 1 giorno (QA) + variabile (fix) | Basso-medio | Fasi 1-4 completate (si testa il risultato finale) | Screenshot prima/dopo su 3 viewport, zero overflow orizzontale |
| **7. SEO/A11y automation** | J1, J2 | P2/P3 | nuovo workflow CI, `CardSpecimen.jsx` (alt text, dentro D1) | 1 giorno | Basso | Nessuna | Workflow verde in CI su PR successive |
| **8. Cleanup dead code** | B3, valutazione `DraGold.legacy.jsx` | P3 | nuova migration, eventuale rimozione file | 0.5 giorno | Basso (nessun consumer attivo) — **richiede conferma esplicita utente prima di cancellare qualunque cosa** | Fase 0.c | Migration applicata e verificata con `EXPLAIN ANALYZE`, oppure decisione documentata di non intervenire |
| **9. Testing infra strutturale** | K | P3 (ma abilita test mirati nelle fasi precedenti, quindi va decisa in Fase 0) | `package.json`, `vite.config.js` o nuovo `vitest.config.js` | 1 giorno setup | Basso | Fase 0.b | `npm test` (o nuovo script) esegue anche test di componente; CI aggiornata se serve |

**Totale stimato:** ~10–14 giorni-persona equivalenti di lavoro agentico (esclusa Fase 0, che è una conversazione), eseguibile a fasi indipendenti con checkpoint di verifica/build/test dopo ognuna, come da CLAUDE.md §8.

**Rischio trasversale principale:** questo è codice che serve un'app in produzione reale (dragold.org) con traffico utente vero — ogni fase va verificata con build+test locali e, per le fasi 3/5 (rischio medio), con un branch dedicato + Vercel preview prima del merge, secondo il workflow già stabilito in CLAUDE.md §2 e già seguito in questa sessione per il merge di sicurezza.

**Cosa NON è in questo piano:** `feat/sealed-products` (esplicitamente escluso), l'attivazione reale delle key Scrydex/PPT (richiede che l'utente le fornisca), qualunque modifica a `DraGold.legacy.jsx` oltre a una decisione esplicita in Fase 0/8.
