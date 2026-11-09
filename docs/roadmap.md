# DraGold Roadmap — Product & Technical Evolution

**Ultimo aggiornamento:** 2026-09-20  
**Stato:** Documentazione strategica (da usare come base per decisioni)  
**Fonte:** analisi codebase, stato attuale, gì servono per scalare

---

## Vision

DraGold è la piattaforma di intelligence per collezionisti TCG seri. Il core loop è:

> **PICK SET → SEE OWNED/MISSING + EN/JA + VALUE → KNOW WHAT TO BUY NEXT**

Scalabilità significa: più carte con prezzi, più lingue, più collezionisti, più affidabilità, migliore esperienza.

---

## Fase 0: Metriche e Monitoring (1-2 giorni) — PRIMA di tutto

**Perché:** non puoi migliorare ciò che non misuri. DraGold oggi non ha monitoring della performance reale.

### Azioni
- [ ] Integrazione Web Vitals (LCP, FID, CLS, TTFB) via `@vercel/analytics` (già in deps)
- [ ] Error tracking: Sentry (gratuito) o alternativa per catturare errori produzione
- [ ] Logging strutturato negli Edge Functions (miglioramento di `fetch-with-log.ts`)
- [ ] Dashboard metriche base: tempi risposta, error rate, cache hit ratio

### Metriche target
| Metrica | Target |
|---------|--------|
| LCP | < 2.5s |
| TTFB | < 500ms |
| Error rate | < 1% |
| Cache hit ratio (API img) | > 80% |

---

## Fase 1: Performance Front-end (2-3 giorni)

### Stato attuale (già fatto)
- [x] AtlasCanvas lazy-loaded (HomePage.jsx riga 14)
- [x] Font preload (index.html righe 28-30: Fraunces + Jakarta)
- [x] Vite config con manualChunks (three-webgl 943KB, animation 89KB, separate dal main bundle)

### Da fare
- [ ] Aggiungere preload per Space Mono se critical (verificare usage)
- [ ] Valutare route-based code splitting per pagine meno visited (Academy, TCG page, Portfolio)
- [ ] Migliorare WebGL fallback quando tier=0 o WebGL fallisce
- [ ] Preload condizionale AtlasCanvas: non premere se tier===0

### Risultato atteso
- Bundle iniziale ridotto ulteriormente
- Performance percepita migliore su device medio

---

## Fase 2: Pricing Infrastructure (1-2 settimane) — CRITICA

### Perché critica
Oggi solo 0.2% delle carte ha prezzi. Senza prezzi, il prodotto non scala.

### Azioni
- [ ] Validare provider: TCGdex (EUR+USD gratis), BerryWallet (OP), PokéWallet (Pokemon), eBay (fallback)
- [ ] Implementare edge function `sync-prices-multi` con fallback chain
- [ ] Popolare `card_prices` con batch di cards (~209k)
- [ ] Implementare `compute-valuations` per popolare `market_valuations`
- [ ] Aggiungere metriche coverage %

### Fallback chain proposta
```
TCGdex (EUR+USD gratis) → PokéWallet/BerryWallet (TCG-specific) → eBay (fallback)
```

### Risultato atteso
- Coverage da 0.2% → 30-60% (stima, da validare con test live)

---

## Fase 3: Image Pipeline Resilience (1-2 settimane)

### Stato attuale
- `api/img` proxy con CORS + cache (OK)
- `api/cache-image` per fetch + convert + upload (OK)
- 5k+ entries cache, 994 ready

### Da fare
- [ ] Mappare fonti image effettivamente accessibili vs bloccate
- [ ] Implementare fallback chain per image fetch (fonte A → fonte B)
- [ ] Bulk cache per cards più popolari (hot picks, search frequency)
- [ ] Valutare fonti One Piece images alternative (hotlink protection attuale)

### Risultato atteso
- Più carte con immagini
- Meno errori di visualizzazione
- Esperienza utente più coerente

---

## Fase 4: Backend Robustness (1-2 settimane)

### Da fare
- [ ] Rate limiting sugli API routes pubblici (`/api/img`, `/api/ebay-search`, `/api/live-market`)
- [ ] Rate limiting sugli Edge Functions critici
- [ ] Cache layer per risposte API frequenti (set list, search results)
- [ ] TTL appropriati per diversi dati (prezzi: breve, catalog: lungo)
- [ ] Database indexing: verificare indici su tabelle critiche
- [ ] Ottimizzare query frequenti (search_cards funzione, set page query)
- [ ] Logging strutturato completato negli Edge Functions

### Risultato atteso
- Maggiore affidabilità sotto carico
- Minore rischio outage
- Migliore preparazione per crescita

---

## Fase 5: UX & Functionalità (2-4 settimane)

### Da fare (priorità MCU)
- [ ] Migliorare set completion experience: view missing cards con prezzi, fonte acquisto
- [ ] Esportazione lista missing per acquisto (CSV, PDF)
- [ ] Bulk operations: bulk edit quantity/condition, bulk price refresh per collection
- [ ] EN/JA variant clarity: rendere più prominenti i variantTag
- [ ] Reperire copertura JA per più TCGs

### Da fare (future, lower priority)
- [ ] Mobile experience improvement (responsive design)
- [ ] Collection analytics: trend, valore nel tempo
- [ ] Market movers: alert su variazioni prezzo significative

### Da NON fare (fuori scope Community Core)
- Academy/Quiz/XP
- Ask DraGold AI
- Social features
- Character/Illustrator/Series pages
- Full image cache (on-demand è il limite intenzionale)

---

## Fase 6: Community & Ecosystem (ongoing)

### Da fare
- [ ] Migliorare README con screenshot/demo
- [ ] Creare prima release tag (al momento nessuna)
- [ ] Abilitare Discussions per community building
- [ ] Aggiungere topic GitHub rilevanti (tcg, pokemon, onepiece, card-tracking)
- [ ] Documentare meglio il processo di contribuzione per prezzi/immagini
- [ ] Valutare bounties per feature specifiche (es. provider integration)

### Risultato atteso
- Maggiore visibilità del repo
- Possibili contributor esterni
- Community intorno al prodotto

---

## Roadmap temporale (stimato)

| Fase | Priorità | Tempo | Dipendenze |
|------|----------|-------|------------|
| 0. Monitoring | Alta | 1-2 gg | Nessuna |
| 1. Performance FE | Media | 2-3 gg | Nessuna (già parte fatta) |
| 2. Pricing Infrastructure | **CRITICA** | 1-2 sett | Fase 0 (metrics) |
| 3. Image Pipeline | Media | 1-2 sett | Fase 0 |
| 4. Backend Robustness | Media | 1-2 sett | Fase 0 |
| 5. UX & Functionalità | Bassa | 2-4 sett | Fase 2 (prezzi) |
| 6. Community | Bassa | ongoing | Nessuna |

---

## Dipendenze critiche

1. **Fase 2 (prezzi)** è prerequisito per Fase 5 (UX funzionalità) — senza prezzi, le funzionalità di collection intelligence sono limitate
2. **Fase 0 (monitoring)** è prerequisito per tutte le fasi — serve per misurare l'impatto
3. **Fase 3 (immagini)** può procedere in parallelo con Fase 2

---

## Rischi

| Rischio | Mitigazione |
|---------|-------------|
| Provider external change/remove API | Fallback chain, monitoraggio, diversificazione |
| Rate limits più stretti del previsto | Batch piccoli, cache, retry intelligente |
| Qualità dati variabile | Confidence level, validation, multiple fonti |
| Budget infrastruttura cresce | Monitoraggio costi, ottimizzazione, caching |
| Complessità codebase cresce | Code splitting, documentazione, test |

---

*Documento creato come base per decisioni di priorità. Da ratificare con Ermal e aggiornare dopo ogni fase.*
