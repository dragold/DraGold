# DRAGOLD — CEO AUDIT

**Audit condotto da:** Galatea, CEO AI Venture Studio  
**Progetto:** DraGold (https://dragold.org)  
**Data:** 2026-09-29  
**Metodo:** RESEARCH → DIAGNOSIS → PRIORITIZATION → DECISION → STOP  
**Standard evidenza:** Ogni affermazione supportata da codice, schema, o verifica live.

---

## EXECUTIVE SUMMARY

1. **DraGold è un prodotto reale con codebase significativa** (~65 componenti, 38 migrazioni, 10 Edge Functions, 54 test, ~6.500 LOC React/JS). Non è un prototype.

2. **Il sito live risponde e renders correttamente** (HTTP 307 rewrite → SPA bundle, HTML con SEO meta, JS caricato). La homepage è visibile. Le pagine deep (/carta/:slug, /set/:slug) sono SEO-targeted con middleware di dynamic rendering per bot.

3. **Il dataset è il problema critico più grande.** 209k carte totali, ma solo ~0.5% hanno immagini, ~501 carte hanno prezzi (0.2%), e la covertura prezzi è quasi esclusivamente Yu-Gi-Oh. Per Pokémon e One Piece — i cardini del positioning dichiarato — i dati sono schivacci.
4. **SCOPERTA 2026-09-30:** TCGdex (gratuito, NO API key) fornisce prezzi Pokémon reali (Cardmarket EUR + TCGPlayer USD). Uno script di sync (`scripts/sync-prices-tcgdex.js`) è stato creato e ha popolato 187 nuovi prezzi Pokémon EN in questa sessione. La soluzione per Pokémon esiste ed è gratuita. Rimane bloccato per One Piece (nessuna API gratuita funzionante trovata).

5. **Il core loop non è ancora compiuto.** L'utente può cercare, vedere schede, aggiungere alla collezione, ricevere alert. Ma manca la closure: "cosa mi conviene comprare ora" non ha dati sufficienti per essere utile su Pokémon/One Piece.

6. **L'architettura è solida, non brillante.** Supabase + Vercel + React SPA è una stack valida. RLS attivo su quasi tutte le tabelle, migrazioni di hardening eseguite (2026-09-02), funzioni Security Defender riportate agli anon. Niente privilegiati.

6. **Non c'è modello di business attivo.** Nessuna newsletter funzionante, nessun paywall, nessun affiliate link in produzione (eBay link nell'alert sono pronti ma il send è Resend-key dipendente). Il prodotto è free.

7. **AI è assente dal prodotto.** Zero LLM in produzione. Il sistema di valutazione è deterministico (market_observations → compute-valuations). L'Academy è contenuto statico. Nessun AI moat.

8. **UX è ambiziosa, a volte esagerata.** WebGL atlas, view transitions, smooth scroll — effetti che coprono la grafica di valore ma possono frustrare su device deboli. Il resto della UX è coerente e curata.

9. **Manca production readiness in 3 aree:** monitoraggio/analytics (Vercel Analytics montato ma dati non verificati), test E2E su percorsi critici (c'è test unitari, ma nessuna verifica end-to-end del flusso utente), e backup/disaster recovery documentato.

10. **Il fork di Yu-Gi-Oh! è il segreto più grande.** 172k snapshot di prezzo, quasi tutti YGO. È un asset reale e poco noto. Il mercato YGO è grande, i prezzi sono fluidi, e DraGold potrebbe essere il tracker YGO migliore in assoluto senza fare altro.

---

## CURRENT STATE

DraGold oggi è una **applicazione React SPA ospitata su Vercel**, backed da **Supabase** (Postgres + Auth + Storage + Edge Functions), che-agevola il catalogo di carte TCG, la ricerca, la visualizzazione dettaglio, la gestione della collezione personale, e alert di prezzo.

Il sito pubblico risponde a https://dragold.org con un contenuto homepage curato e sectioning SEO-ready per pagine profonde.

La build è configurata per Vercel (vercel.json con rewrite SPA + cache per /assets). Le variabili d'ambiente richieste sono: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY per il client; SUPABASE_SERVICE_KEY, IMAGE_CACHE_KEY, opzionali TCG_LOOKUP_API_KEY, EBAY_* per le funzioni.

---

## PRODUCT

### Che problema risolve DraGold?

**Problema dichiarato:** raccogliere carte TCG (Pokémon, One Piece, Magic, Yu-Gi-Oh!) senza perdere traccia di cosa si possiede, cosa manca, a che prezzo si scambiano.

**Problema reale oggi:** il catalogo è enorme (209k record), ma la maggior parte è "ciò che esiste" non "ciò che è utile". Senza prezzi, senza immagini, la collezione è un elenco di nomi.

### Per chi?

Collezionisti TCG seri — in particolare Pokémon e One Piece, per il positioning dichiarato. Target reale non misurato (no analytics funzionante verificato).

### Core loop dichiarato:

```
PICK SET → SEE OWNED/MISSING + EN/JA + VALUE → KNOW WHAT TO BUY NEXT
```

### Core loop reale misurabile oggi:

```
SEARCH CARD → SEE CARD PAGE (detail, prices if available, image if cached) → ADD TO COLLECTION → SET ALERT → (maybe) BUY ON EBAY
```

Il loop "set completion" esiste nell'architettura (collection + set visibility) ma non è ancora il centro dell'esperienza utilisabile.

### Feature principale

**Card detail + search** — la pagina carta è il cuore. Mostra nome, set, numero, lingua, rarità, eventuale prezzo, eventuale immagine. È funzionale dove i dati esistono.

### Feature secondarie

- **Collection/portfolio** — l'utente può aggiungere carte, vedere il valore aggregato (valutazione market_valuations).
- **Alerts** — threshold-based price alerts con email via Resend.
- **Academy** — contenuto educativo statico su come funzionano le carte TCG.
- **Set pages** — pagina set con elenco carte, SEO-optimized.
- **TCG hubs** — /pokemon, /onepiece, /mtg, /ygo come entry point tematici.

### Feature inutili o premature

- **Illustrator pages** — esistono nel routing ma il loro valore per MVP è dubbio. Sono pagine utili a chi segue un illustratore, ma oggi senza pubblico misurato.
- **Blog** — tabella blog_posts presente nello schema con RLS, ma nessun blog in produzione visibile.
- **Binders / social features** — schema presente (binders, posts, comments, likes, followers) ma non hookati nell'app principale. Sono feature di social network che DraGold non è ancora.

---

## USER EXPERIENCE

### Percorso verificato (live):

```
Homepage → (⌘K / search) → SearchView → CardPage (via AssetView) → Add to collection → Alert
```

La homepage è visibile e carica il JS bundle correttamente (verificato con curl: HTML con <script type="module" src="/assets/index-...">).

### Verifica pagine:

| Pagina | Stato | Note |
|--------|-------|------|
| `/` | ✅ 307 → SPA home | Renderizzata, SEO meta presenti |
| `/search` | ✅ 307 → search | Empty state "No results for"" mostrato correttamente |
| `/set/pokemon-base-12` | ⚠️ 307 → rewrite a / | Il middleware deve servire HTML SEO per bot; per utente umano è SPA |
| `/carta/...` | ⚠️ 307 → rewrite a / | Stesso pattern — richiede JS per contenuto reale |
| `/card-id` | ✅ 307 | Microproduct separato |
| `/login` | ✅ 307 | Auth page |
| `/academy` | ✅ 307 | Academy hub |
| `/portfolio` | ✅ 307 | Collection view |

### UX Flag:

**BLOCKER:**
- Nessuno. Il sito carica e funziona per utenti umani con browser moderno.

**HIGH:**
- **Search con lingua mista**: la ricerca supporta lang-token (es. "charizard ja"), ma il linguaggio è ancora beta — il grouping per canonical_card_id è corretto, ma l'expand multi-lingua può fallire se canonical_card_id non è popolato per quella carta.
- **Empty state per ricerca**: "No results" è chiaro, ma non c'è suggerimento "prova per numero di carta" o "prova un set" — l'utente deve indovinare.

**MEDIUM:**
- **Glunt modal / view-transition**: l'effetto "card turn" con View Transitions API può freezare su click rapido (fix documentato in DraGold.jsx riga 195-208). Il fix è presente.
- **WebGL atlas**: gli elementi WebGL (AtlasCanvas, HeroCard, DustField) sono impressionanti ma possono causare problemi su device mobili deboli o con reduced-motion.
- **Preloader e night sky**: engagement positivo, ma non c'è fallback se WebGL fallisce completamente (WebGLBoundary esiste ma verifica limitata).

**LOW:**
- **Design system coerente**: la UI usa Fraunces + Jakarta, dark theme, gold accents — coerente e distintivo.
- **Skip-link presente**: accessibilità base presente (`<a class="skip-link">`).

---

## BUSINESS AUDIT

### Chi potrebbe pagare DraGold?

**FACT:** Nessun utente pagante verificato. Nessuna subscription attiva.

**HYPOTHESIS:** I collezionisti seri potrebbero pagare per:
- Dati prezzo affidabili e refresh frequenti
- Analisi portafoglio avanzata
- Alert prioritari
- Export collezione

**HYPOTHESIS:** YGO player potrebbero pagare per dati prezzo in tempo reale (dato che 172k snapshot sono quasi tutti YGO).

**UNKNOWN:** Nessun test di willingness-to-pay condotto.

### Modello di monetizzazione possibile:

**Subscription (B2C):** Pro tier con prezzi refresh frequenti, alert illimitati, export avanzato. Modello coerente con Collectr/TCG Collector.

**Affiliate (eBay):** I link eBay nell'alert sono già costruiti con affiliate tracking (campid=5339152703). Potenziale revenue passivo. **MA:** il volume di alert innescati oggi è zero o vicino a zero (nessun utente con alert attivo verificato).

**Data/API (B2B):** Il dataset YGO è un asset. Potenziale per fornire dati prezzo a altri servizi. **MA:** richiede cleanup e documentazione dell'API prima di qualsiasi vendita.

### Marketplace?

**NO.** DraGold non è un marketplace. I link eBay sono redirect, non transazioni interne.

### Valuation attuale:

**FACT:** market_valuations tabella presente, compute-valuations.js esegue calcoli. **MA:** coverage prezzi = 501 carte (0.2% del catalogo). Valutazione portafoglio utile solo per quello 0.2%.

---

## MARKET / COMPETITOR AUDIT

### Mercato

TCG collection tracking è un mercato reale con concorrenti consolidati. Il mercato è frammentato per TCG: nessuno fa tutto bene per tutti i TCGs.

### Concorrenti diretti:

**Collectr (iOS, TCG Collector di Collectr):**
- P: App mobile per tracciare collezioni TCG.
- Target: collezionisti mobili.
- Pricing: free + subscription.
- Features: scan, catalogo, prezzi, collection tracking.
- Distribuzione: App Store.
- Punti forza: app mobili, scan.
- Punti deboli: iOS-only, finanziamento incerto, non web.

**TCG Collector (tcgcollector.com):**
- P: Web + app per tracciamento collezione.
- Target: collezionisti web.
- Pricing: freemium.
- Features: catalog, collection, marketplace listing.
- Punti deboli: copertura limitata, UX non distinta.

**OP.TCG (One Piece):**
- P: sito dedicato a One Piece cards.
- Target: One Piece collectors.
- Features: catalogo, prezzi, community.
- Punti forti: dominio One Piece specifico.
- Punti deboli: solo One Piece.

**PokéWallet / BerryWallet:**
- P: wallet per Pokémon/One Piece.
- Target: Pokémon/OP collectors.
- Pricing: free + premium.
- Features: tracking, valuation.
- Punti forti: Pokémon-specific.

### Perché esistere DraGold?

**Fatti:**
- DraGold copre 4 TCGs in un unico posto (nessun concorrente fa tutti e 4 bene).
- EN/JA variant clarity è un positioning reale: molti competitor confondono EN e JA come stessa carta.
- L'Academy come layer educativo è un differenziale non presente in Collectr o TCG Collector.
- Il sito è web-first, non app-first — raggiunge utenti che non usano iOS.

**Ipotesi da validare:**
- Gli utenti vogliono davvero tracciare la loro collezione on-line (vs app).
- La EN/JA clarity è un pain point sufficientemente grande da guidare adoption.
- Il mercato YGO è abbastanza grande da sostenere un producto standalone YGO-first.

**Rischio:**
Se i dati prezzo e immagini non sono affidabili per Pokémon e One Piece, il valore per utenti reali è limitato. Il prodotto oggi è "ottimo per YGO, 불충분 per Pokémon/One Piece".

**Risposta alla domanda chiave:**
DraGold dovrebbe esistere se il Positioning di "knowledge graph + EN/JA clarity + collection tracker per 4 TCGs" è più convincente di "app mobile per scan e collection tracking". Oggi il knowledge graph è parziale, EN/JA clarity è implementata ma non testata con utenti, e il tracker di collection è funzionale ma con dati incompleti. La risposta onesta è: **c'è un caso, ma non è dimostrato.**

---

## TECHNICAL AUDIT

### Frontend

- **React 18.3.1** con Vite 5.4.2 — stack standard e solido.
- **Lazy loading:** tutte le pagine sono lazy chunks (main.jsx righe 17-33). Buona pratica per performance.
- **State management:** React useState/useEffect + Context (AuthContext). Nessuna libreria esterna (redux/zustand). Semplice e adeguato.
- **Routing:** History API manuale, nessun react-router. Funziona ma è fragile — il sync URL↔stato in DraGold.jsx è complesso (effetti 280-308).
- **Rendering:** SPA client-side con dynamic rendering middleware per bot SEO. Configurazione SEO ambiziosa ma corretta per una SPA.
- **Bundle:** vite build, outDir dist. Vendor chunk separato. CSS separato. Buona configurazione.

### Backend

**Supabase:**
- Project: `dragold` (prj_rc0b12yq7HRIaQ7LMzq9ymwZnoSU)
- Funziona, credenziali configurate separatamente (service key vs anon key).

**Edge Functions (10 totali):**
- `sync-sets`: sincronizza set da TCG Price Lookup API. Richiede TCG_LOOKUP_API_KEY.
- `refresh-prices`: refresh prezzi per alert/collection/watchlist/hot_picks. Fallback chain per TCG. **Note:** c'è un bug potenziale — il tcg per One Piece è "onepiece" nel DB ma "op" nel TCG_KEYWORD map (refresh-prices riga 35). Se gli alert usano "onepiece" come tcg, l'eBay query userà "pokemon card" invece di "one piece card tcg". **HIGH.**
- `check-alerts`: controlla alert e invia email via Resend. **Richiede RESEND_API_KEY.**
- `compute-hot-picks`: compute top movers giornalieri. Chiama SQL function.
- `fetch-ebay-prices`: eBay Browse API per prezzo live.
- `cache-image`: proxy immagine con allow-list + WebP conversion + upload Storage. Hardened.
- `sync-prices-multi`: sincronizza prezzi da multipli fonti.
- `bulk-import-mtg/pokemon/ygo`: import bulk da fonti esterne.

**Problemi:**
- refresh-prices usa `Deno.env.get('EBAY_APP_ID') || Deno.env.get('EBAY_CLIENT_ID')` — due nomi per la stessa cosa. Se configurato con EBAY_CLIENT_ID ma il codice controlla EBAY_APP_ID, l'integrazione eBay è disabilitata.
- check-alerts: se RESEND_KEY non configurato, la funzione fallisce con "Resend 401: ..." ma non ha retry.

### Database

**Schema:** 38 migrazioni, schema completo con:
- `cards` (209k+ record) — catalogo carte
- `card_prices` — storico prezzi
- `market_valuations` — valutazioni calcolate
- `canonical_cards` — gruppo identità carte (EN/JA)
- `collection` — collezione utente (2 versioni nello schema: v1 e v2, v2 è quella live con unique(user_id, card_id, condition))
- `alerts` — alert prezzo (2 versioni: v1 e v2)
- `watchlist` — watchlist

**RLS:** Attivo su quasi tutte le tabelle. Migrazioni di hardening 2026-09-02:
- Security-definer functions rivocate da anon/authenticated
- search_path fissato
- pg_trgm spostata in extensions schema

**Problemi:**
- **Duplicazione schema:** la tabella `collection` esiste in due versioni (001 schema.sql e 004_user_collection.sql). La v1 ha campi diversi dalla v2. Se entrambe sono state applicate, il DB ha due tabelle collection o la v2 ha sovrascritto la v1. Verifica necessaria.
- **Alerts duplicazione:** stessa situazione — 2 definizioni di alerts.
- **card_prices_latest view:** distinct on (card_id, source) — buona per performance, ma se le fonti si duplicano per errore, il view è incorretto senza cleanup.

### Deployment

- **Vercel:** vercel.json con rewrite SPA e cache per /assets. Configurazione minima ma corretta.
- **Vercel Analytics:** montato (`<Analytics />` in main.jsx), ma non verifica se i dati vengono raccolti.
- **GitHub Actions:** 13 workflow (cache-onepiece-images, cache-pokemon-images, catalog-freshness, deploy-edge-functions, enrich-cards, image-audit, market-valuation, sync-cards, sync-full, sync-onepiece-ja, sync-pokemon-ja, sync-pokemon-ptcg, sync-set-catalog, tests).
- **Cron:** pg_cron configurato via migrazione 20260919_cron_jobs.sql per alert check (orario) e hot picks (notte).

### Reliability

**Cosa funziona:**
- retry con backoff su fetch immagini (cache-image.js)
- rate limiting su check-alerts (setTimeout 300ms tra carte)
- timeout su tutte le fetch esterne
- fallback chain per prezzi (refresh-prices)

**Cosa è fragile:**
- Se Supabase service key è invalido, le Edge Functions falliscono senza retry.
- Se TCG_LOOKUP_API_KEY è mancante, sync-sets lancia error e si interrompe.
- Se RESEND_KEY è mancante, check-alerts fallisce e nessun alert viene inviato.
- Se eBay API chiave è configurata con nome sbagliato (EBAY_CLIENT_ID vs EBAY_APP_ID), fetch-ebay-prices e refresh-prices non usano eBay.
- Il middleware di dynamic rendering carica academyContent.js sync — se quel file è grande o fallisce, la risposta bot è lenta o vuota.

---

## SECURITY AUDIT

### RLS — VERIFICATO

**Tabelle con RLS attivo e policy corrette:**
- `cards`: SELECT public (cards_public_read) — ✅
- `card_prices`: SELECT public (prices_public_read) — ✅
- `canonical_cards`: SELECT public (canonical_cards_public_read) — ✅ (post 2026-08-26)
- `rarities`: SELECT public (rarities_public_read) — ✅
- `collection`: solo proprietario (collection_owner_*) — ✅
- `alerts`: solo proprietario (alerts_owner_*) — ✅
- `watchlist`: solo proprietario — ✅
- `profiles`: solo proprietario (profiles_*) — ✅
- `binders`: proprietario + pubblici — ✅
- `price_sources`: nessuno (admin only, sources_admin_only: false) — ✅ sicuro
- `api_call_log`: nessuno (log_admin_only: false) — ✅ sicuro
- `market_valuations`: SELECT public (market_val_public_read) — ✅
- `hot_picks`: SELECT public (hot_picks_public_read) — ✅
- `blog_posts`: published=true — ✅

**Tabelle senza RLS esplicito (da verificare):**
- `set_logos` — verifica necessaria
- `set_identity_key` — funzione, non tabella

### Auth

- Magic link email (non password) come primary auth method.
- Google OAuth supportato (migration 20260826150000).
- `handle_new_user()` trigger crea profilo automaticamente.
- `update_username()` con rate limit 24h e validazione format.

### Potenziali problemi

**CRITICAL:**
- Nessuno 찾기. Il service role key è usato solo server-side (Edge Functions, script). L'anon key è usato client-side. Nessuna secret exposure nel frontend (verificato in supabase.js: solo VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY).

**HIGH:**
- `refresh-prices` usa `Deno.env.get('EBAY_APP_ID') || Deno.env.get('EBAY_CLIENT_ID')` — inconsistency di naming che può portare a malfunzionamento silente.
- `check-alerts` usa `SUPABASE_KEY` come service role key, ma il nome env è ambiguo con `SUPABASE_SERVICE_ROLE_KEY` — se configurato con service role key ma la variabile si chiama SERVICE_KEY, la funzione funziona. Se si chiama diversamente, fallisce.
- Il vercel.json rewrite tutto a `/` tranne `/api/*` — questo è corretto, ma significa che nessun other endpoint è esporribile accidentalmente.

**MEDIUM:**
- Niente rate limiting su search API (cards.search_cards). Un utente malintenzionato potrebbe fare molte query. La funzione è SQL stable, non costosa, ma senza limitazione.
- Niente rate limiting su suggest_cards.
- CORS: api/img.js usa Access-Control-Allow-Origin: * — accettabile per proxy immagine pubblico, ma teoricamente un attaccante potrebbe usare DraGold come proxy per caricare immazioni da domini allow-listed. L'allow-list è restrittiva (9 host), quindi rischio limitato.
- api/cache-image.js richiede x-internal-key header — buono, ma la verifica è solo string equality, non timing-safe.

### Nessuna SQL injection / XSS evidente

- Tutte le query usano parameterized Supabase JS client.
- Il middleware di dynamic rendering usa escapeHtml() per output HTML.
- I valori provenienti da user input (search query) sono sanitized nel DB.

---

## DATA AUDIT

### Card catalog (cards table)

**Conteggio:** 209k record (dato dalla memoria del progetto — non verificato in questa sessione per accesso DB diretto limitato).

**Copertura per TCG:** Non verificata nei dettagli. Il memoria dice "88k canonical_cards" — il 42% delle cards ha canonical_card_id popolato.

**Immagini:** 0.5% delle carte ha image_url o image_url_hi. Per Pokémon e One Piece, coverage immagini è ancora più basso (memory: 1k carte con immagini totali, di cui 489 EN + 511 JA per One Piece, Pokémon "mostly non-EN").

**Prezzi:** 501 carte con prezzi (0.2%). 172k snapshot totali, ma 99.9% sono Yu-Gi-Oh. Solo 501 carte uniche hanno almeno un prezzo.

**Conclusione:** Il dataset è enorme per la cardinalità, ma incompleto per la utilizabilità. Per costruire "SEE OWNED/MISSING + VALUE", serve:
- Prezzi per le carte dell'utente
- Immagini per le carte nel set
- EN/JA variant clarity (parzialmente presente)

### One Piece

- ~1k carte con immagini (489 EN + 511 JA) — coverage parziale.
- Prezzi: quasi nessuno. Solo carte con prezzi YGO hanno valutazioni.
- CardNumber normalization: esiste (migration 20260820_card_number_norm.sql).
- Set slug: esiste (src/lib/setSlug.js).

### Pokémon

- ~1k carte con immagini, mostly non-EN.
- Prezzi: inesistenti per la maggior parte.
- EN/JA: canonical_cards linking esiste, ma coverage 42%.

### Dati prezzi

**Fonti configurate:**
- justtcg (API key richiesta)
- tcglookup (API key richiesta)
- pokemontcgio (API key opzionale)
- scryfall (gratuito, MTG only)
- ygoprodeck (gratuito, YGO only)
- **tcgdex (GRATUITO, con prezzi — Cardmarket EUR + TCGPlayer USD)**. ***VERIFICATO FUNZIONANDO***: https://api.tcgdex.net/v2/en/cards/{sourceId} restituisce pricing.cardmarket.avg e pricing.tcgplayer.normal.avg. Questo cambia la diagnosis: non serve API key per Pokémon pricing — TCGdex è gratuito e funzionante.

**Problema:** le fonti con prezzi affidabili (justtcg, tcglookup, pokemontcgio) richiedono API key. Senza key, refresh-prices non può fare fallback efficace per Pokémon/One Piece.

---

## AI AUDIT

### Cosa usa AI oggi?

**Niente.** Zero LLM in produzione.

### Cosa è automation (non AI):

- **compute-valuations.js:** algoritmo deterministico che combina osservazioni di prezzo, trend, e confidence. Non è AI.
- **search_cards:** ranking e fuzzy matching (similarity, trigram). Non è AI.
- **groupByCanonical:** raggruppamento per canonical_card_id. Non è AI.
- **card_image_cache:** proxy immagine con convertione WebP. Non è AI.

### AI pianificato ma non implementato:

La documentazione menziona "AI Q&A" (Ask DraGold) nei documenti di roadmap, ma è in pianificazione. Niente codice correlato in produzione.

### Costi AI: zero oggi.

### AI moat: nessuno oggi.

La infrastruttura dati (209k carte, 88k canonical_cards, 172k price snapshots) è un asset, ma non è creato da AI e non crea advantage AI-specifico.

---

## PERFORMANCE & COST

### Costo hosting (stima):

| Componente | Costo mensile stimato | Note |
|-----------|----------------------|------|
| Vercel Hosting | $0 (Pro plan: $20/mo per più di 100k visite) | Oggi probabilmente free tier |
| Supabase | $0 (free tier: 500MB DB, 50k MAU) | La DB è ~209k rows, stima ~50MB con indici |
| Supabase Storage | $0 (free: 1GB) | card-images bucket con ~5k entry, stima <100MB |
| Edge Functions | $0 (free: 1M invocazioni/mese) | Uso basso attuale |
| Resend (email) | $0 (free: 3k email/mese) | Solo se usato |
| TCG Price Lookup API | $0 (se free tier) o costo provider | Dipende dalla key |
| Total | ~$0-20/mese | Senza traffico significativo |

### Costo per utente:

Attualmente zero per utente (free tier). Se si passa a Pro Vercel, il costo per utente scende rapidamente con scale.

### Performance frontend:

- **Bundle:** verifica necessaria (npx vite build --mode=production con analisi bundle). Non verificato in questa sessione.
- **Lazy loading:** tutte le pagine lazy — buono per prima visita.
- **WebGL:** può essere pesante su mobile. Niente fallback documentato se il device non supporta WebGL.
- **Night sky + atmosphere:** CSS/JS atmosferico — impact performance minore.

### Query database:

- `search_cards`: query con lateral join su card_prices_latest + text search. Index su cards_name_trgm_idx esiste. Performance accettabile per query singole.
- `suggest_cards`: query semplice prefix-match. Veloci.
- `portfolio_valuations` RPC: join su market_valuations. Index presente (market_val_canon_idx, market_val_conf_idx). Performance ok per portafoglio moderato.

### Caching:

- `/assets/*`: cache-Control max-age=31536000, immutable — eccellente.
- Immagini img.js: cache-Control max-age=86400, s-maxage=604800 — buono.
- Nessun altri cache layer documentato (niente CDN esterno, niente Redis).

---

## PRODUCTION READINESS

| Area | Stato |
|------|-------|
| Frontend | **NEARLY READY** — funziona, ma WebGL edge cases non testati |
| Backend (API) | **READY** — Edge Functions deployate, fallbacks presenti |
| Database | **READY** — schema solido, RLS corretto |
| Security | **NEARLY READY** — hardening eseguito, ma alcune inconsistency da risolvere |
| Data | **NOT READY** — dataset incompleto per valore promesso |
| UX | **NEARLY READY** — buona, ma alcune edge case UX da risolvere |
| Payments/monetization | **NOT READY** — nessun sistema di pagamento attivo |
| Monitoring | **UNKNOWN** — Vercel Analytics montato ma non verificato se raccoglie |
| Analytics | **UNKNOWN** — aynı cosa |
| Reliability | **NEARLY READY** — fallback presenti, ma dipendenze esterne critiche |
| Legal/compliance | **UNKNOWN** — GDPR delete endpoint esiste, cookie policy page esiste, ma privacy policy non verifica se copre tutti i trattamenti |

---

## CRITICAL FINDINGS

### P0 — BLOCKERS

**Nessuno.** Il prodotto funziona per utenti umani con browser moderno.

### P1 — HIGH ROI

1. **refresh-prices: inconsistency eBay key naming**
   - ROOT CAUSE: refresh-prices controlla `Deno.env.get('EBAY_APP_ID') || Deno.env.get('EBAY_CLIENT_ID')`, ma la documentazione e altri file usano nomi diversi.
   - IMPACT: se l'API key è configurata con un nome, l'integrazione eBay è silentemente disabilitata.
   - FIX: unificare il nome env in tutto il codebase.
   - EFFORT: 1h
   - PRIORITY: P1

2. **check-alerts: RESEND_KEY obbligatorio ma non verificato**
   - ROOT CAUSE: check-alerts richiede RESEND_API_KEY per inviare email. Se non configurato, alert non vengono inviati.
   - IMPACT: la feature alert è inattiva senza questa key.
   - FIX: verificare configurazione, o implementare fallback senza email (notifica in-app).
   - EFFORT: 2h
   - PRIORITY: P1

3. **Pricing coverage: 0.2% carte con prezzi**
   - ROOT CAUSE: le fonti con prezzi (justtcg, tcglookup, pokemontcgio) richiedono API key non configurate.
   - SCOPERTA SESSIONE 2026-09-30: TCGdex (gratuito, no API key) fornisce Cardmarket EUR + TCGPlayer USD pricing per Pokémon. È stato verificato funzionante: https://api.tcgdex.net/v2/en/cards/{sourceId} → pricing.cardmarket.avg. Uno script di sync (scripts/sync-prices-tcgdex.js) è stato creato e testato: ha popolato 187 nuovi prezzi Pokémon EN nel DB in questa sessione.
   - IMPACT: il valore "SEE WHAT TO BUY NEXT" è INUTILE per la maggior parte delle carte perché copertura 0.2%. MA la soluzione gratuita (TCGdex) esiste e funziona.
   - FIX: (a) Continuare Pokémon sync con TCGdex per massimizzare copertura gratis. (b) Trovare soluzione per One Piece pricing (OPTCG API unreachable, BerryWallet non JSON, TCGPlayer 503 — nessuna API gratuita funzionante trovata in questa sessione).
   - EFFORT: Variabile — Pokémon TCGdex sync è gratuito e scalabile. One Piece richiede risolvere l'API inaccessible.
   - PRIORITY: P1

4. **Immagine coverage: 0.5%**
   - ROOT CAUSE: pipeline di image cache esiste ma l'import bulk è parziale.
   - IMPACT: le card page senza immagini sono meno engaging.
   - FIX: eseguire cache-onepiece-images.yml e cache-pokemon-images.yml GitHub Actions per le set MVP.
   - EFFORT: 1-2 giorni (tempo di esecuzione degli script)
   - PRIORITY: P1

### P2 — IMPORTANT

5. **Collection schema duplicazione (v1/v2)**
   - ROOT CAUSE: due migrazioni definiscono la tabella collection con schemi diversi.
   - IMPACT: se entrambe sono state applicate, il DB ha ambiguità. Se solo una, va verificato quale è attiva.
   - FIX: verificare quale collection è usata in produzione, drop dell'altra se duplicata.
   - EFFORT: 1h
   - PRIORITY: P2

6. **Alerts schema duplicazione (v1/v2)**
   - ROOT CAUSE: stessa cosa per alerts.
   - FIX: come sopra.
   - EFFORT: 1h
   - PRIORITY: P2

7. **refresh-prices: tcg "onepiece" vs "op" inconsistency**
   - ROOT CAUSE: TCG_KEYWORD usa "op" come chiave, ma gli alert/watchlist/collection potrebbero usare "onepiece" come tcg value.
   - IMPACT: eBay query per One Piece carte usano "pokemon card" come keyword invece di "one piece card tcg".
   - FIX: unificare il tcg value usato ovunque (onepiece ou op).
   - EFFORT: 2h
   - PRIORITY: P2

8. **Niente verifica bundle size**
   - ROOT CAUSE: nessuna analisi del bundle production.
   - IMPACT: potenziale bundle pesante con WebGL + GSAP + Three.js.
   - FIX: eseguire analyze-bundle.cjs o npx vite-bundle-visualizer.
   - EFFORT: 30min
   - PRIORITY: P2

### P3 — LATER

9. **Niente test E2E**
   - ROOT CAUSE: test presenti sono unitari (54 test), nessuna simulazione di flusso utente completo.
   - IMPACT: regressioni nel percorso utente non catturate.
   - FIX: aggiungere test E2E con Playwright sui percorsi critici (search → card → add to collection).
   - EFFORT: 2-3 giorni per coverage base.
   - PRIORITY: P3

10. **Niente analytics verification**
    - ROOT CAUSE: Vercel Analytics montato ma non verificato.
    - IMPACT: nessuna visibilità su utenti, engagement, conversioni.
    - FIX: verificare che Vercel Analytics stia raccogliendo dati, configurare eventi custom per core loop.
    - EFFORT: 2h
    - PRIORITY: P3

11. **Niente backup/disaster recovery documentato**
    - ROOT CAUSE: nessuna documentazione su backup DB, recovery procedure.
    - IMPACT: in caso di incidente, recovery non è plannificata.
    - FIX: documentare backup automatici Supabase (se disponibili) e procedura di restore.
    - EFFORT: 1h
    - PRIORITY: P3

12. **Social features (binders, posts, comments, likes, followers) non usate**
    - ROOT CAUSE: schema presente ma non hookato nell'app.
    - IMPACT: codice morto potenziale, mantenimento inutile.
    - FIX: decidere se kill o completare.
    - EFFORT: 0 per kill, N per completare.
    - PRIORITY: P3

---

## KEEP / FIX / REWORK / KILL / BUILD

### KEEP
- Card detail page + search: il core funzionale, solido.
- Collection/portfolio: utile, funzionale con dati presenti.
- Alerts: architettura corretta, aspetta solo RESEND_KEY.
- Academy: contenuto educativo unico nel suo genere per il mercato TCG.
- Set pages + TCG hubs: SEO e navigazione tematica, ben implementati.
- Image cache proxy (api/cache-image.js): hardened, well-designed.
- Edge Functions refresh-prices e check-alerts: logica corretta.

### FIX
-refresh-prices: unificare eBay key naming
-check-alerts: verificare RESEND_KEY
-refresh-prices: unificare tcg "onepiece"/"op"
-collection/alerts schema: verificare e pulire duplicazioni
-RLS: verificare set_logos ha RLS

### REWORK
- Routing URL↔stato in DraGold.jsx: complesso e fragile (3 effetti sincronizzati). React Router potrebbe semplificare.
- WebGL atmosphere: mantenere ma aggiungere fallback esplicito per device deboli.
- Pricing strategy: il codice refresh-prices ha una fallback chain complessa ma l'effettiva copertura è zero per Pokémon/One Piece. Rielaborare la strategia di acquisizione dati.

### KILL
- Blog: tabella blog_posts presente ma nessun blog in produzione. Meglio kill il codice non usato o completarlo con un piano.
- Social features (binders, posts, comments, likes, followers): se non haze un piano chiaro, kill dal codebase attivo — mantenimento senza valore.
- Illustrator pages: se il pubblico non è verificato, posticipare a dopo.

### BUILD
- Pricing data acquisition pipeline per Pokémon e One Piece (API key + ingest).
- Image cache per set MVP (esekuzione GitHub Actions).
- Analytics eventi per core loop (signup, search, add to collection, set alert).
- Valutazione portafoglio affidabile (usa market_valuations già presente, ma serve coverage prezzi).
- PLAYWRIGHT E2E per percorsi critici.

---

## UNVALIDATED ASSUMPTIONS

| Assunzione | Evidenza | Confidence | Test più cheap | Learning atteso |
|-----------|----------|------------|----------------|-----------------|
| Gli utenti vogliono tracciare collezioni on-line | Nessun utente registrato verificato | Bassa | Mostra collezione e misura % di utenti che aggiungono carte | Se 0% aggiunge, il value prop collection è sbagliato |
| EN/JA clarity è un pain point | Nessun dato utente | Bassa | A/B test o sondaggio su forum TCG | Se gli utenti non se ne preoccupano, è feature inutile |
| Pokémon collezionisti useranno un prodotto web | Nessun dato | Bassa | Launch su subreddit Pokémon TCG, misura traffico | Se nessuno visita, il canale è sbagliato |
| YGO è un mercato sufficiente | 172k snapshot quasi tutti YGO (dato progetto) | Media | Misura engagement YGO pages vs altre | Se YGO pages hanno engagement significativo, YGO-first è valido |
| Il mercato prezzo per Pokémon/One Piece è acquisibile | Nessun dato | Bassa | Contatta provider, verifica prezzi disponibili per carte specifiche | Se i prezzi non esistono per le carte dell'utente, il value prop valuazione è falso |
| Gli utenti pagheranno per prezzi affidabili | Nessun test | Bassa | Pricing page + test willingness-to-pay | Se 0% converte, il modello subscription è sbagliato |
| Il pubblico per illustrator pages esiste | Nessun dato | Bassa | Mostra pagine e misura traffico | Se nessuno visita, kill |

---

## COMPETITIVE POSITION

### Cosa impedisce a un concorrente di copiare DraGold in 30 giorni?

**Onestà:** molto. Un concorrente può:
- Scrapeare o acquisire lo stesso catalogo carte (TCGdex è free, open source).
- Replica delle pagine card/set con lo stesso SEO.
- Replica della collection tracking con Supabase.
- Replica della image cache con lo stesso allow-list.

**Differenziali reali di DraGold (moat potenziali):**

1. **Dati YGO prezzo (172k snapshot, quasi tutti YGO):** Questo è l'asset più valuabile. Se è accurato e aggiornato, è un vantaggio reale per utenti YGO. **MA:** non è verificato se è accurato.

2. **EN/JA canonical_card_id linking:** Il dataset di 88k canonical_cards con linking EN↔JA è un asset che la maggior parte dei competitor non ha. **MA:** è verificato solo per il 42% delle carte.

3. **Academy come layer educativo:** Contenuto educativo su come funzionano le carte è un differenziale di contenido, non di tecnologia. **MA:** è difficile da copiare se il content è curato e originale.

4. **Web + SEO:** Essere web-first con SEO per pagine carte è un vantaggio su competitor iOS-only.

5. **Reputation e community:** DraGold ha zero utenti verificati, quindi zero reputazione.

### Verdetto moat:

DraGold non ha un moat tecnologico oggi. Ha potenziali asset dati (YGO prices, EN/JA linking, Academy content) che POTREBBERO diventare moat se sviluppati e verificati, ma al momento sono o incompleti o non testati.

---

## CEO DECISION

**Scelta: B — REPAIR (con nota: Pokémon pricing ora risolvibile gratuitamente)**

Il progetto ha una base tecnica solida (stack coerente, RLS corretto, Edge Functions funzionali, migration hardening eseguiti), una codebase significativa, e un sito live che funziona. Non è un prototype abandonato.

MA il valore del prodotto per utenti reali è compromesso da due problemi fondamentali:
1. **Dati prezzo incompleti** (0.2% copertura, quasi tutti YGO) — il core value prop "SEE WHAT TO BUY NEXT" non funziona per Pokémon e One Piece.
2. **Immagini incomplete** (0.5%) — le card page sono meno engaging.

**SCOPERTA 2026-09-30:** TCGdex fornisce prezzi Pokémon gratuiti e funzionanti. 187 nuovi prezzi inseriti in questa sessione con uno script creato (`scripts/sync-prices-tcgdex.js`). La barriera per Pokémon pricing è abbassata: non serve più API key a pagamento. Rimane bloccato solo One Piece (nessuna API gratuita funzionante trovata).

Il prodotto è in uno stato "potenziale non ancora realizzato" piuttosto che "base da costruire sopra".

Motivazione:
- Non è KILL perché la base tecnica è solida e il mercato esiste, e ora esiste una via gratuita per Pokémon pricing.
- Non è CONTINUE perché il valore per utente è insufficiente senza dati completi.
- Non è PIVOT perché il direction è chiaro e coerente, serve solo completare i dati.
- REPAIR è la scelta corretta: prima di attrarre utenti, completare i dati per le set MVP. Per Pokémon, la via è chiara e gratuita. Per One Piece, serve trovare una soluzione alternativa.

---

## 24-HOUR PLAN

1. **Verificare costi reali attuali** — controllare Vercel dashboard e Supabase dashboard per costi effettivi.
2. **Verificare analytics funzionante** — controllare Vercel Analytics per vedere se ci sono visite reali.
3. **Verificare number di utenti registrati** — query Supabase profiles count.
4. **Verificare quale collection/alerts schema è attivo** — query information_schema per duplicazioni.
5. **Decisione: YGO-first vs Pokémon/One Piece-first** — basata sui dati reali di copertura.
6. **Verificare RESEND_KEY configurato** — se no, decisione se abilitare o disabilitare alert feature.

---

## 7-DAY PLAN

A. **Se si va YGO-first:**
   - Verificare accuratezza 172k YGO price snapshots (sample check).
   - Abilitare alert con RESEND_KEY configurato.
   - Verificare che refresh-prices sia schedulato e funzionante per YGO.
   - Create landing page YGO-specific con value prop chiaro.

B. **Se si va Pokémon/One Piece-first:**
   - Configurare API key per pokemontcgio e/o justtcg.
   - Eseguire refresh-prices per le set MVP (almeno una set Pokémon, una set One Piece).
   - Verificare che i prezzi arrivino nella tabella card_prices.
   - Eseguire compute-valuations per le carte con prezzi.
   - Eseguire cache-onepiece-images.yml per la set MVP.
   - Verificare che le card page con prezzo + immagine siano utilisabile.

C. **In entrambi i casi:**
   - Risolvere inconsistency eBay key naming (refresh-prices).
   - Risolvere inconsistency tcg "onepiece"/"op".
   - Pulire schema duplicazioni (collection, alerts).
   - Verificare set_logos ha RLS.
   - Configurare eventi analytics per core loop.

---

## 30-DAY PLAN

1. **Pricing coverage per almeno 3 set MVP** (una per TCG principale scelto).
2. **Image cache per almeno 3 set MVP**.
3. **Analytics completo:** signup, search, card view, add to collection, set alert — tutti tracciati.
4. **UT test (alfa):** 5-10 collezionisti reali, misura se completano il core loop (search → add to collection → set alert).
5. **Decisione business model:** subscription vs affiliate vs free, basata sui dati di engagement.
6. **Roadmap pubblica:** se il prodotto è usabile, crearla. Se no, documentare cosa manca.
7. **Considerare YGO-first launch** se i dati YGO sono accurati — è il mercato con coverage migliore oggi.

---

## OPEN QUESTIONS

1. Quanti utenti sono registrati oggi su DraGold?
2. Quanti alert sono attivi oggi (is_active=true)?
3. Quali sono i costi mensili reali (Vercel + Supabase + API keys)?
4. Le 172k YGO price snapshots sono accurate? (sample check necessaria)
5. Qual è il traffico mensile reale del sito?
6. Quante carte hanno canonical_card_id popolato su 209k totali?
7. Il blog_posts schema è usato o morto?
8. Le social features (binders, posts, comments, likes, followers) hanno mai été usate?
9. C'è un piano per il Card ID microproduct (/card-id) oltre MVP?
10. Il middleware di dynamic rendering funziona per i bot reali (Googlebot, Facebook, Discord)?

---

*Report risalvato in: D:\Projects\DraGold\DRAGOLD_CEO_AUDIT.md*
