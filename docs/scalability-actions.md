# DraGold — Azioni Concrete per Scalabilità

**Data:** 2026-09-20  
**Stato:** Documentazione + primo round di azioni completate

---

## Azioni completate in questa sessione

### 1. Vite Config — Code Splitting Migliorato ✅
**File modificato:** `vite.config.js`

**Prima:**
- AtlasCanvas: 819KB (single chunk, warning >500KB)
- index chunk: 382KB
- DraGold main: 176KB

**Dopo:**
- three-webgl: 943KB (three + fiber + drei, chunk separato)
- animation: 89KB (gsap + @gsap/react + lenis, chunk separato)
- AtlasCanvas: 17KB (lazy-loaded, dependencies nei chunk separati)
- index: 242KB (vendor chunk ridotto)
- DraGold main: 176KB

**Build:** ✅ exit 0, warning >500KB risolto

**Nota:** AtlasCanvas era già lazy-loaded in HomePage.jsx (riga 14). Il miglioramento è stato nel code splitting delle dependencies pesanti (three, gsap) in chunk separati, riducendo il vendor chunk da 382KB a 242KB.

---

### 2. Documentazione Pricing Provider Strategy ✅
**File creato:** `docs/pricing-provider-strategy.md` (12.6KB)

**Contenuto:**
- Analisi completa di tutti i provider disponibili (TCGdex, PokéWallet, BerryWallet, TCG Price Lookup, eBay, Scryfall, YGOPRODeck, Lorcast, FaB)
- Fallback chain proposta: TCGdex (EUR+USD gratis) → PokéWallet/BerryWallet → eBay
- Architettura edge function `sync-prices-multi` proposta
- Piano di popolamento `market_valuations`
- Guida di provider validation prima di integrare
- Metriche di successo target

### 3. Roadmap Documentata ✅
**File creato:** `docs/roadmap.md` (6.8KB)

**Contenuto:**
- Vision del prodotto
- 6 fasi priorizzate con tempi stimati
- Dipendenze tra fasi
- Rischi e mitigazioni
- Da NON fare (fuori scope Community Core)

---

## Azioni che POSSO fare subito (senza deployment live)

### 4. Migliorare CONTRIBUTING per pricing/immagini
**Stato:** da fare
**Action:** Aggiornare CONTRIBUTING.md con sezione su come contribuire alle integrazioni provider

### 5. Migliorare API routes documentation (rate limiting, cache)
**Stato:** partialmente fatto in `docs/api-routes.md` ma con "Da investigare" in molti punti
**Action:** Completare la documentation con raccomandazioni specifiche

### 6. Aggiungere test per funzioni critiche
**Stato:** 41 test, ma copertura limitata
**Action:** Identificare funzioni critiche senza test e aggiungere test

### 7. Migliorare gestione errori negli Edge Functions
**Stato:** parzialmente fatto (`fetch-with-log.ts`)
**Action:** Standardizzare error handling across tutte le edge functions

---

## Azioni che REQUISITANO deployment live (da fare su decisione)

### 8. Nuovi Edge Functions
- `supabase/functions/sync-prices-multi/index.ts` — fallback chain pricing
- `supabase/functions/compute-valuations/index.ts` — popolamento market_valuations
- `supabase/functions/bulk-cache-images/index.ts` — bulk image caching

**Richiede:** accesso Supabase project, deployment, testing live

### 9. Database Migrations
- Popolamento iniziale `market_valuations`
- Eventuali indici aggiuntivi su tabelle critiche

**Richiede:** accesso database, ejecuzione migration, verifica

### 10. Rate Limiting Implementazione
- Implementazione effettiva di rate limiting sugli API routes
- Configurazione rate limits appropriati

**Richiede:** modifica API routes, deploy, test

---

## Priorità per la prossima sessione

Se decidi di procedere, consiglio questo ordine:

1. **Completare CONTRIBUTING + API docs** (azioni 4-5, 1-2 ore, senza deployment)
2. **Validare provider TCGdex prezzi** (azione 5 in pricing-provider-strategy, richiede chiamate API live — puoi farlo tu o io con browser tool)
3. **Implementare edge function sync-prices-multi** (azione 8, richiede deployment)
4. **Eseguire popolamento iniziale** (azione 9, richiede deployment + database access)

---

*Documento aggiornato con stato azioni. Da usare come tracker per progressione.*
