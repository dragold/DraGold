# Pricing Provider Strategy — DraGold

**Ultimo aggiornamento:** 2026-09-20  
**Stato:** Documentazione + piano implementazione  
**Autori:** Ermal + assistente AI

---

## 1. Panoramica attuale

### Cosa esiste oggi

| Componente | Stato | Dettagli |
|-----------|-------|----------|
| `card_prices` | Tabella esistente | Storico prezzi per (card_id, source, captured_at) |
| `card_prices_latest` | Vista esistente | Ultima price per (card_id, source), usata dal frontend |
| `market_observations` | Tabella creata | Verità storica append-only (in migrazione, da popolare) |
| `market_valuations` | Tabella creata | Layer di valutazione (in migrazione, da popolare) |
| `sync-sets/index.ts` | Edge Function esistente | Sync set catalog (usa TCG_LOOKUP_API_KEY, non prezzi) |
| `refresh-prices/index.ts` | Edge Function esistente | Refresh prezzi esistenti |
| `fetch-ebay-prices/index.ts` | Edge Function esistente | eBay spot-check prices |
| `compute-hot-picks/index.ts` | Edge Function esistente | Calcola hot picks da prezzi esistenti |

### Coverage attuale (stimato)
- **cards totali in DB:** ~209k
- **cards con price_market:** ~501 (0.2%)
- **prezzi per TCG:** prevalentemente Yu-Gi-Oh (dati storici), Pokemon e One Piece con copertura molto limitata

---

## 2. Provider disponibili (con dati verificati da docs/data-sources.md)

### 2.1 TCGdex (GRATIS — primaria raccomandata)

**Cosa fornisce:**
- Catalog card, set lists, metadata (già usato da DraGold)
- **Cardmarket EUR prices** — incluso nei dati TCGdex
- **TCGPlayer USD prices** — incluso nei dati TCGdex

**Accesso:**
- API gratuita, no key required per uso base
- Documentato in `docs/data-sources.md`: "Includes Cardmarket EUR and TCGPlayer USD pricing data"

**Limiti:**
- Rate limits non documentate esplicitamente nel codice (da verificare in produzione)
- Qualità dati: aggregazione di Cardmarket + TCGPlayer, generalmente reliable

**Uso raccomandato:**
- Fonte primaria per Pokemon EN + JA prices
- Fonte primaria per MTG (se aggiunto in futuro)
- Integrazione via edge function `sync-pokemon-prices`

### 2.2 PokéWallet (FREE TIER — per Pokemon)

**Cosa fornisce:**
- Unified pricing across markets per Pokemon cards

**Accesso:**
- Free tier disponibile (documentato)
- Dettagli API non esplorati in profondità in questo repo

**Uso raccomandato:**
- Fonte secondaria per Pokemon quando TCGdex non ha prezzo
- O integrazione alternativa se TCGdex prezzi non sono sufficienti

### 2.3 BerryWallet (per One Piece)

**Cosa fornisce:**
- One Piece-specific pricing

**Accesso:**
- Documentato in `docs/data-sources.md` come fonte per One Piece

**Uso raccomandato:**
- Fonte primaria per One Piece prices
- Integrazione via edge function `sync-onepiece-prices`

### 2.4 TCG Price Lookup (CON API KEY — per set catalog)

**Cosa fornisce:**
- Set catalog (lista di set per gioco)
- Non fornisce card-level prices direttamente

**Accesso:**
- API key richiesta (`TCG_LOOKUP_API_KEY`)
- Rate limited ~200 req/day
- Usato da `sync-sets/index.ts` per popolare `sets` table

**Uso raccomandato:**
- Mantiene sync set catalog
- Non usare per card prices (non forniti)

### 2.5 eBay Browse API (GRATIS — per fallback)

**Cosa fornisce:**
- eBay sold listings per price spot-check
- Usato da `fetch-ebay-prices/index.ts`

**Accesso:**
- API key eBay (gestita come secret)
- Rate limits eBay standard

**Uso raccomandato:**
- Fallback finale quando altre fonti non hanno prezzo
- Spot-check, non font primaria (latenza, variabilità)

### 2.6 Altre fonti documentate ma non ancora integrate

| Source | Game | Stato | Note |
|--------|------|-------|------|
| Scryfall | MTG | Non integrato | Bulk data disponibile, da valutare se MTG viene aggiunto |
| YGOPRODeck | YGO | Non integrato per prezzi | Già usato per catalog, prezzi da valutare |
| Lorcast | Lorcana | Non integrato | Se Lorcana viene aggiunto al prodotto |
| FaB Card API | FAB | Non integrato | Se FAB viene aggiunto |

---

## 3. Fallback chain proposta

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    REQUEST: card X price                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                  ┌─────────────────────┐
                  │  cache hit? (Redis/  │
                  │  edge function cache)│
                  └──────────┬──────────┘
                             │ yes
                             ▼
                  ┌─────────────────────┐
                  │  return cached      │
                  └─────────────────────┘
                             │ no
                             ▼
        ┌─────────────────────────────────────────────┐
        │  Try fonte A (TCGdex — EUR + USD gratis)    │
        │  - rate limit: ~N req/s (da verificare)     │
        │  - retry: 3 con backoff esponenziale        │
        │  - se success → cache + return              │
        └────────────────────┬────────────────────────┘
                             │ fail/timeout
                             ▼
        ┌─────────────────────────────────────────────┐
        │  Try fonte B (PokéWallet per Pokemon        │
        │   oppure BerryWallet per One Piece)         │
        │  - rate limit: free tier limits             │
        │  - retry: 2 con backoff                     │
        └────────────────────┬────────────────────────┘
                             │ fail/timeout
                             ▼
        ┌─────────────────────────────────────────────┐
        │  Try fonte C (eBay Browse API spot-check)   │
        │  - rate limit: eBay standard                │
        │  - solo se carte rare/expensive             │
        └────────────────────┬────────────────────────┘
                             │ fail
                             ▼
        ┌─────────────────────────────────────────────┐
        │  Return null + log + update cache (miss)   │
        │  - card_prices_latest resta null            │
        │  - card_image_cache status = 'error'        │
        └─────────────────────────────────────────────┘
```

### Regole fallback chain

1. **Priorità:** TCGdex > PokéWallet/BerryWallet (TCG-specific) > eBay
2. **Nessun fallback silenzioso:** se tutte le fonti falliscono, restituire null esplicito, non inventare un prezzo
3. **Retry con backoff:** ogni fonte ha max 2-3 retry con exponential backoff (es. 100ms, 200ms, 400ms)
4. **Timeout:** massimo 5 secondi per fonte, 15 secondi totali per request
5. **Cache:** risultati positivi cached per 24 ore, risultati negativi (null) cached per 1 ora (per non ripetere le stesse chiamate fallite)
6. **Rate limit rispettato:** ogni fonte ha i suoi limiti, rispettarli per non fare ban

### Implementazione edge function

**Nuovo file:** `supabase/functions/sync-prices-multi/index.ts`

**Responsibilities:**
- Ricevere lista card_ids da priceare
- Per ogni card, tentare fallback chain
- Scrivere risultati in `card_prices` (storico)
- Aggiornare `card_prices_latest` (vista, scritta in `card_prices`)
- Loggare risultati (success/fail per fonte)

**Input:** lista di card_ids (batch di max 50 per request per rate limit)

**Output:**
- `card_prices` rows aggiunti/updati
- Log di quali fonti hanno funzionato per quali cards

**Security:**
- Richiede SERVICE_ROLE_KEY (non anonimo) per scrivere in `card_prices`
- Può essere triggerato da: admin action, GitHub Actions cron, o una edge function schedulata

---

## 4. Popolamento market_valuations

### Stato attuale
- `market_valuations` tabella creata (migration `20260902181000_market_valuations.sql`)
- Probabilmente non completamente popolata

### Schema (da migration)
```
card_id            text NOT NULL REFERENCES cards(id)
canonical_card_id  uuid
tcg                text NOT NULL
...
```

### Azione raccomandata
1. Verificare schema esatto di `market_valuations` nella migration
2. Scrivere edge function `compute-valuations` che:
   - Legge da `card_prices_latest` (prezzi disponibili)
   - Applica logica di valutazione (avg, median, confidence)
   - Scrive in `market_valuations`
3. Pianificare run periodico (giornaliero o su demanda)

**Nota:** il calcolo di valuations dovrebbe essere idempotenti e re-runnable.

---

## 5. Provider validation (da fare PRIMA di integrare)

Prima di integrare qualsiasi provider, validare:

1. **TCGdex prezzi:**
   - [ ] Verificare che i prezzi EUR/USD sono effettivamente presenti nei dati TCGdex
   - [ ] Testare rate limits effettivi
   - [ ] Verificare qualità dati (confronto con Cardmarket/TCGPlayer diretto per un campione)

2. **BerryWallet:**
   - [ ] Verificare accesso API
   - [ ] Testare copertura carte (quante OP cards hanno prezzo)
   - [ ] Verificare rate limits

3. **PokéWallet:**
   - [ ] Verificare free tier accesso
   - [ ] Testare copertura Pokemon cards
   - [ ] Verificare qualità dati

4. **eBay Browse API:**
   - [ ] Verificare che l'API key sia configurata
   - [ ] Testare rate limits
   - [ ] Verificare che i prezzi restituiti siano comparable con altre fonti

**Importante:** NON integrare un provider senza prima validare che fornisce dati di qualità e che i termini di servizio lo permettono.

---

## 6. Priorità implementazione

### Fase A: Validazione provider (1-2 giorni)
1. Validare TCGdex prezzi (quantità, qualità, rate limits)
2. Validare BerryWallet per One Piece
3. Validare PokéWallet per Pokemon

### Fase B: Edge function sync-prices-multi (3-5 giorni)
1. Implementare fallback chain come descritto
2. Testare con campione di cards (es. 100 Pokemon, 50 One Piece)
3. Verificare che scrive correttamente in `card_prices`

### Fase C: Popolamento iniziale (1-2 giorni)
1. Eseguire sync su tutte le cards disponibili nel DB (~209k)
2. Monitorare tempi di esecuzione e rate limits
3. Verificare coverage risultante

### Fase D: market_valuations (2-3 giorni)
1. Implementare compute-valuations
2. Popolare valutazioni
3. Verificare che Portfolio consumi correttamente le valutazioni

### Fase E: Monitoraggio e mantenimento (ongoing)
1. Aggiungere metriche: coverage %, tempi sync, error rate per fonte
2. Pianificare sync periodico (giornaliero o su trigger)
3. Alert su fallimenti provider

---

## 7. Rischi e mitigazioni

| Rischio | Probabilità | Impatto | Mitigazione |
|---------|-------------|---------|-------------|
| TCGdex change API o terms | Media | Alta | Avere fallback chain, monitorare 변경i |
| Rate limits troppo stretti | Alta | Media | Batch ridotto, cache, retry intelligente |
| Qualità dati variabile | Media | Media | Confidence level, multiple fonti, validation |
| Provider chiude/sposta | Bassa | Alta | Diversificazione fonti, monitoraggio |
| Copyright/Terms immagini | Media | Alta | Usare solo fonti documentate, rispettare termini |

---

## 8. Metriche di successo

Dopo l'implementazione, target:

| Metrica | Before | After (target) |
|---------|--------|----------------|
| Cards con prezzo | 501 (0.2%) | 60k+ (30%+) |
| Pokemon cards con prezzo | <100 | 10k+ |
| One Piece cards con prezzo | <100 | 1k+ |
| Time per sync 1000 cards | N/A (nessun sync) | < 5 minuti |
| Error rate per fonte | N/A | < 5% |

---

*Documento creato come base per implementazione. Da validare con test live sui provider prima di integrare.*
