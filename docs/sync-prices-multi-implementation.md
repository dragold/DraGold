# sync-prices-multi — Piano Implementazione

## Cosa fatto
- ✅ Edge function `supabase/functions/sync-prices-multi/index.ts` scritta
- ✅ README con specifiche endpoint, body, response, frequenza consigliata
- ✅ Supporta: Pokemon (TCGdex), One Piece (optcg-api), YGO (TCGdex), MTG (placeholder)

## Cosa NON fatto (richiede una decisione tua o azioni specifiche)

### 1. Variabili d'ambiente Supabase
La funzione usa `SYNC_PRICES_MULTI_SERVICE_KEY` come chiave di servizio per accedere al DB.
**Azione richiesta:** creare questa variabile nell'environment della funzione Supabase.
Non posso farlo senza accesso al dashboard Supabase.

### 2. Deploy della funzione
La funzione è scritta ma non deployata.
**Azione richiesta:** deployare con `supabase functions deploy sync-prices-multi` o via dashboard.
Non posso deployare senza configurazione Supabase locale o accesso API.

### 3. Schedule (opzionale)
Per automatizzare la sync, puoi aggiungere un cron job:
- Supabase cron (se abilitato) o
- Vercel cron / GitHub Actions / external scheduler

### 4. Testing locale
La funzione può essere testata con:
```
supabase functions serve sync-prices-multi
# poi POST a http://localhost:54321/functions/v1/sync-prices-multi
```
Ma richiede che le variabili d'ambiente siano impostate localmente.

### 5. Popolamento iniziale
Dopo il deploy, per popolare i prezzi iniziali:
```
POST /functions/v1/sync-prices-multi
Body: { "limit": 100, "offset": 0, "tcg": "pokemon" }
```
Poi ripeti con offset crescente finché next_offset è 0 o finché non hai coperto tutti i set MVP.

### 6. Limiti attesi
- TCGdex: gratuito, ma rate limit non specificato in documentazione — testare prima di lanciare bulk
- optcg-api: gratuito, 1000 req/giorno — sufficiente per One Piece (1k cards totali)
- Cardmarket/TCGPlayer pricing incluso in TCGdex gratis — copertura non garantita per tutte le carte

### 7. MTG
Attualmente placeholder (null). Da implementare con provider alternativo (bulk-import-mtg esistente o nuovo).

## Stato attuale
Function scritta, pronta per deploy dopo configurazione variabili d'ambiente.
Documentation completa in README.
Framework pronto per cron/automazione.
