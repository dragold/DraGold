# DraGold Scalabilità — Piano d'Azione

**Data:** 2026-09-20  
**Analista:** assistente AI (su richiesta di Ermal)  
**Stato app:** main@5afc4c2, build ✅, test 41/41 ✅, 0 modifiche in volo

---

## Executive Summary

DraGold è un prodotto funzionante con architettura solida (React + Supabase + Vercel + Edge Functions), ma con colli di bottiglia critici che limitano la scalabilità verso più utenti, più TCGs e più funzionalità. Il piano è organizzato in 5 fasi, ordinate per impatto/costo.

---

## Fase 0: Metriche e Monitoring (BASE — prima di tutto)

**Perché:** Non puoi migliorare ciò che non misuri. Oggi DraGold non ha monitoring della performance reale.

**Azioni:**
1. **Vitals monitoring** — aggiungi monitoring di LCP, FID, CLS, TTFB via `@vercel/analytics` (già in deps) + eventuale aggiunta di una libreria come `web-vitals`
2. **Error tracking** — integrazione Sentry gratuito (o alternativa) per catturare errori in produzione, specialmente WebGL fallimenti e fetch errori
3. **Performance budget** — definisci budget: LCP < 2.5s, primo byte < 500ms, bundle JS iniziale < 500KB

**Impatto:** permette di prioritizzare basandosi su dati reali invece di assunzioni.

**Rischio:** nessuno — solo aggiunta di librerie di reporting.

---

## Fase 1: Performance Front-end (ALTA — 2-3 giorni)

### 1.1 Code Splitting + Lazy Loading

**Problema:** AtlasCanvas è 819KB (richetta tre.js, @react-three/fiber, @react-three/drei, gsap). Oggi è già lazy-loaded nella home page (confermato: `HomePage.jsx` riga 14: `const AtlasCanvas = lazy(...)`). Il problema è che **quando** si carica, blocca la home. Non è stratum-conditional.

**Azioni:**
- [x] Verificato: AtlasCanvas è già lazy-loaded (riga 14 HomePage.jsx)
- [ ] **WebGLBoundary** — migliorare il fallback quando WebGL fail (oggi requestIdleCallback-based, va bene ma potrebbe essere più robusto)
- [ ] **Preload condizionale** — non premere AtlasCanvas se tier===0 (device non supporta WebGL). Attualmente tier viene detectato ma il preload fase non è conditional.

**Impatto:** Nessun cambiamento necessario su AtlasCanvas lazy — è già fatto. Il miglioramento è nel fallback e nella condizionalità.

### 1.2 Font Preload

**Stato:** [x] GIA' FATTO — `index.html` righe 28-30:
```html
<link rel="preload" href="/fonts/fraunces.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/fonts/jakarta.woff2" as="font" type="font/woff2" crossorigin />
```

**Azione aggiuntiva:**
- [ ] Aggiungere preload per Space Mono se usato critical (verificare dove è usato spazio mono — sembra usato solo per numeri/metadati, non critico)
- [ ] Considerare `font-display: swap` già in atto, verificare che non causi layout shift

**Impatto:** già fatto. Minore lavoro residuo.

### 1.3 Split del bundle principale (DraGold.jsx — 176KB)

**Problema:** DraGold.jsx è il bundle principale a 176KB con tutta la logica di routing, auth, ricerca, ecc.

**Opzioni:**
- [ ] **Route-based code splitting** — usare React.lazy per le pagine meno visiting (es. Academy, TCG page, Portfolio) così non bloccano il bundle iniziale
- [ ] **Extract vendor chunks** — Vite già fa questo parzialmente, ma si può migliorare con `build.rollupOptions.output.manualChunks` per separare three.js, gsap, react-three in chunk separati

**Impatto:** riduce il bundle iniziale a scapito di un po' di lazy loading per le pagine meno visited.

---

## Fase 2: Architettura Prezzi (CRITICO — il collo di bottiglia principale)

### 2.1 Il problema attuale

**Stato verificato:**
- `card_prices` — 172k righe (collezione storica)
- `card_prices_latest` — vista che restituisce l'ultima price per (card_id, source)
- `market_observations` — verità storica append-only (creata ma probabilmente non popolata massicciamente ancora)
- `market_valuations` — layer di valutazione creato (vedi migration `20260902181000_market_valuations.sql`) ma probabilmente non completamente popolato

**Provider attualmente usati:**
- `sync-sets/index.ts` — usa TCG_LOOKUP_API_KEY per sync set catalog (non prezzi)
- `refresh-prices/index.ts` — refresh prezzi esistenti, dagli snippet sembra usi eBay + possibly TCGLookup
- `fetch-ebay-prices/index.ts` — eBay browse API per price spot-check
- `compute-hot-picks/index.ts` — calcola hot picks da prezzi esistenti

**Gap principale:**
1. **Price coverage:** solo ~501 cards univoche con prezzi (0.2% di 209k cards). Questo è il problema più grande.
2. **Nessun provider per Pokemon EN/JA prices** — PokéWallet free tier esiste ma non è chiaramente integrato come fonte primaria di prezzi (solo come opzione image audit)
3. **TCGdex ha Cardmarket EUR + TCGPlayer USD gratis** — documentato in `docs/data-sources.md` ma non integrato nei prezzi (usato solo per catalog)
4. **One Piece:** BerryWallet esiste come fonte ma copertura limitata

### 2.2 Piano di miglioramento

**Step 1: Integrazione TCGdex prezzi (gratis)**
- TCGdex fornisce Cardmarket EUR e TCGPlayer USD gratis (documentato)
- Aggiungere un'edge function `sync-pokemon-prices` che usa TCGdex per fetchare prezzi Pokemon
- Popolare `card_prices` con questi prezzi
- **Impatto stimato:** da 0.2% a ~10-20% coverage (dipende da quanti cards Pokemon ci sono nel DB)

**Step 2: BerryWallet per One Piece**
- BerryWallet free tier per One Piece prices
- Aggiungere edge function `sync-onepiece-prices`
- **Impatto:** coveraggio OP attualmente molto basso, questo migliora significativamente

**Step 3: PokéWallet per Pokemon (se TCGdex non basta)**
- PokéWallet free tier per pricing unified
- Alternativa/integrazione con TCGdex

**Step 4: fallback chain robusto**
- Oggi la chain è: TCG Lookup → Pokemon TCG API → eBay RSS
- Migliorare: TCGdex (EUR+USD) → PokéWallet/TCGPlayer → eBay come fallback
- Ogni fonte con rate limiting, retry, degraazione non-fatale

**Step 5: market_valuations popolamento**
- La tabella `market_valuations` è creata (migration 20260902181000) ma probabilmente non è pienamente popolata
- Scrivere script di computed/valuations che popola da market_observations o da card_prices_latest
- Questo è il layer che alimenta la "fair market value" nel Portfolio

**Impatto:** passare da 0.2% a 30-60% coverage (stimato, dipende da implementazione). Questo è il miglioramento più critico per il prodotto.

**Rischio:** dipendenze da providers esterni con rate limits. Necessario implementation robusto con retry, cache, e degraazione.

---

## Fase 3: Pipeline Immagini (MEDIA — 1-2 settimane)

### 3.1 Stato attuale
- `card_image_cache` — tabella per tracciare stato cache (pending/ready/error)
- `api/cache-image` — endpoint Vercel per fetch + convert + upload
- `api/img` — proxy read-only per WebGL textures (già fatto, con CORS e cache)
- 5k+ entries in cache, 994 "ready"

### 3.2 Problemi
1. **Coverage immagini:** 0.5% delle cards ha image_url (circa 1k cards su 209k). Questo è accettabile per MVP ma limita l'esperienza utente.
2. **Hotlink protection:** alcune fonti (es. One Piece optcg) bloccano il hotlinking. Il proxy `api/img` risolve parzialmente il problema CORS ma non il hotlink protection server-side.
3. **No automazione di bulk cache:** oggi la cache è on-demand (quando un utente visita una card). Per migliorare si potrebbe fare prefetching batch per le cards più popolari.

### 3.3 Miglioramenti

**Step 1: Image source resilience**
- [x] Già presente: `api/img` proxy con CORS permissive e cache long-lived
- [ ] Mappare quali fonti sono effettivamente accessibili vs bloccate (già in parte documentato)
- [ ] Aggiungere fallback chain per image fetch: tenta fonte A, se fallisce prova fonte B, ecc.

**Step 2: Bulk image cache per le cards più popolari**
- Identificare le cards più cercate/visitate (hot picks, search frequency)
- Creare un'edge function/worker che fa bulk cache di queste cards
- Riduce il времya di caricamento per le cards più volute

**Step 3: One Piece image source migliore**
- Oggi si usa optcgapi.com e onepiece-cardgame.com
- Verificare se ci sono altre fonti con minor hotlink protection
- Valutare la creazione di una pipeline dedicata che scarica dalle fonti ufficiali e le serve via storage privato

**Impatto:** migliore esperienza utente, più carte con immagini, meno errori di visualizzazione.

**Rischio:** problemi di copyright/termini di servizio con le fonti immagini. Da valutare attentamente.

---

## Fase 4: Robustezza e Scalabilità Backend (MEDIA — 1-2 settimane)

### 4.1 Rate Limiting
- [ ] Implementare rate limiting sugli API routes pubblici (`/api/img`, `/api/ebay-search`, `/api/live-market`)
- [ ] Rate limiting sugli Edge Functions critici (sync, price refresh)
- [ ] Documentare i limiti nei commenti degli endpoint (già parzialmente fatto in `docs/api-routes.md` ma con "Da investigare" per molti)

### 4.2 Caching
- [ ] Cache layer per le risposte API frequenti (es. set list, card search results)
- [ ] Usare le edge function cache di Supabase o Vercel per ridurre chiamate DB/esterne
- [ ] TTL appropriati per dati diversi (prezzi: breve, catalog: lungo)

### 4.3 Database Performance
- [ ] Verificare indici su tabelle critiche (cards, collection, card_prices, canonical_cards)
- [ ] Ottimizzare query frequenti (es. search_cards funzione, set page query)
- [ ] Considerare partizionamento per tabelle grandi (card_prices potrebbe crescere molto)

### 4.4 Observability
- [ ] Aggiungere logging strutturato negli Edge Functions (oggi c'è `fetch-with-log.ts` parzialmente)
- [ ] Metriche su: tempi di risposta, error rate, rate limit hits, cache hit/miss ratio
- [ ] Allert su errori critici (es. fallimento edge function, DB connection issues)

### 4.5 Scalabilità calcolo
- [ ] Valutare spostare calcoli pesanti (valuations, hot picks, price refresh) da Edge Functions a Batch Jobs/Jobs pianificati (Supabase Edge Functions hanno limiti di tempo/temp)
- [ ] Considerare uso di Supabase pg_cron o GitHub Actions per task pianificati invece di Edge Functions per lunghi calcoli

**Impatto:** migliore affidabilità, minor rischio di outage sotto carico, meglio preparazione per crescita.

**Rischio:** complessità aggiuntiva. Da introdurre gradualmente, non tutto insieme.

---

## Fase 5: Esperienza Utente e Funzionalità (BASSA-MA — 2-4 settimane)

### 5.1 Copertura lingui
- [ ] Reperire copertura JA per più TCGs (oggi OP ha JA, Pokemon JP-only esiste ma maybe non coperto bene)
- [ ] Migliorare EN/JA variant clarity — oggi ci sono variantTag ma potrebbero essere più prominenti

### 5.2 Set completion experience
- [ ] Il core loop è "PICK SET → SEE OWNED/MISSING → KNOW WHAT TO BUY NEXT"
- [ ] Valutare: migliorare la view "missing cards" con prezzi, punteggiatura, fonte d'acquisto
- [ ] Esportazione lista missing per acquisto

### 5.3 Bulk operations
- [ ] CSV import già presente (documentato)
- [ ] Valutare: bulk edit (quantity, condition), bulk price refresh per collection

### 5.4 Mobile experience
- [ ] Valutare responsive design delle pagine critiche (set page, card page, search)
- [ ] AtlasCanvas è WebGL-heavy, probabilmente non performante su mobile. Già escluso in home per tier=0.

---

## Riepilogo Priorità (Ermal, da valutare)

| Fase | Priorità | Tempo stimato | Impatto | Rischio |
|------|----------|---------------|---------|---------|
| 0. Monitoring + metrics | Alta | 1-2 giorni | Base per decisioni | Basso |
| 1. Performance FE (code split, fonts) | Media | 2-3 giorni | 500KB+ riduzione bundle | Basso |
| 2. Architettura prezzi (TCGdex, BerryWallet, fallback chain) | **CRITICA** | 1-2 settimane | Da 0.2% a 30-60% coverage | Medio |
| 3. Pipeline immagini (resilience, bulk cache) | Media | 1-2 settimane | Più carte con immagini | Medio (copyright) |
| 4. Robustezza backend (rate limit, caching, observability) | Media | 1-2 settimane | Affidabilità sotto carico | Medio |
| 5. UX/functionalità | Bassa | 2-4 settimane | Esperienza utente | Basso |

---

## Cosa NON è priorizzato per scalabilità (ma potrebbe essere futuro)

- **Academy/Quiz/XP** — fuori scope per il Community Core
- **Ask DraGold AI** — fuori scope per il Community Core
- **Social features** — fuori scope
- **Character/Illustrator/Series pages** — fuori scope
- **Full image cache** — fuori scope per il Community Core (on-demand cache è il limite intenzionale)
- **Mobile app nativa** — non in scope, il prodotto è web-based

---

## Prossimi passi (su decisione di Ermal)

1. **Decidere su quale fase iniziare** — la Fase 2 (prezzi) è il collo di bottiglia più critico, la Fase 0 (monitoring) è la base per misurare tutto
2. **Per ogni fase, definire scope specifico** — quali provider esattamente, quali tabelle, quali edge functions
3. **Implementazione incrementale** — una feature alla volta, testata, deployata
4. **Misurare l'impatto** — dopo ogni fase, verificare che i metrici migliorino

---

*Documento creato su richiesta di Ermal. Da usare come base per decisioni di priorità e pianificazione.*
