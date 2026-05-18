# DraGold Backend: setup data architecture

## Cosa è incluso

```
supabase/
├── migrations/
│   └── 002_data_architecture.sql    # Schema: cards, card_prices, price_sources, api_call_log
├── functions/
│   ├── _shared/fetch-with-log.ts   # Helper: logged fetch + fallback chain
│   ├── bulk-import-pokemon/        # Import da TCGdex (multi-lingua)

│   ├── bulk-import-mtg/            # Import da Scryfall bulk
│   ├── bulk-import-ygo/            # Import da YGOPRODeck
│   ├── refresh-prices/             # Refresh prezzi con fallback chain
│   └── check-alerts/               # (esistente) Email alerts orari
```

## Setup in 6 step

### 1. Esegui la migration

Supabase Dashboard → SQL Editor → New query → incolla il contenuto di `migrations/002_data_architecture.sql` → Run.

### 2. (Opzionale) Crea account su servizi prezzi

| Servizio | Free tier | Quando serve |
|---|---|---|
| **TCG Price Lookup** | 10.000 req/mese | Fallback universale prezzi |
| **JustTCG** | gratis (20 risultati/call) | Pokémon prezzi primari |


Aggiungi le API key come Edge Function secrets:
- `TCGLOOKUP_API_KEY` = `xxx`
- `JUSTTCG_API_KEY` = `xxx`
- `SCRYDEX_API_KEY` = `xxx`

Senza queste chiavi le funzioni cadono al fallback successivo (eBay scrape, mock data).

### 3. Deploy delle Edge Functions

Opzione A (UI, una alla volta):
- Supabase Dashboard → Edge Functions → Deploy a new function
- Nome: `bulk-import-pokemon`
- Incolla il contenuto di `functions/bulk-import-pokemon/index.ts`
- Disattiva "Verify JWT" (così possiamo invocarla via cron)
- Ripeti per ogni cartella in `functions/`

Opzione B (CLI):
```bash
npm install -g supabase
supabase login
supabase link --project-ref pimwkmwrduqkaydyvxqz
supabase functions deploy bulk-import-pokemon
supabase functions deploy bulk-import-onepiece
supabase functions deploy bulk-import-mtg
supabase functions deploy bulk-import-ygo
supabase functions deploy refresh-prices
```

### 4. Esegui i bulk import (una tantum)

Da terminale (o via Postman/curl):

```bash
# Pokémon (tutte le lingue - ci mette 5-10 min)
curl -X POST https://pimwkmwrduqkaydyvxqz.supabase.co/functions/v1/bulk-import-pokemon \
  -H "Content-Type: application/json" \
  -d '{"langs":["en","ja","ko","fr","de","it","es","pt"]}'

# One Piece (richiede SCRYDEX_API_KEY)
curl -X POST https://pimwkmwrduqkaydyvxqz.supabase.co/functions/v1/bulk-import-onepiece

# Yu-Gi-Oh! (gratis, no auth)
curl -X POST https://pimwkmwrduqkaydyvxqz.supabase.co/functions/v1/bulk-import-ygo

# Magic (può richiedere 10+ min: scarica 340 MB)
curl -X POST https://pimwkmwrduqkaydyvxqz.supabase.co/functions/v1/bulk-import-mtg
```

Verifica con: `SELECT tcg, lang, count(*) FROM cards GROUP BY tcg, lang ORDER BY count desc;`

### 5. Schedule del refresh prezzi (cron)

Supabase Dashboard → Integrations → Cron → Create job:
- Name: `refresh-prices-6h`
- Schedule: `0 */6 * * *` (ogni 6 ore)
- Type: Supabase Edge Function → `refresh-prices`

E un job settimanale per nuove carte:
- Name: `bulk-import-weekly`
- Schedule: `0 4 * * 0` (domenica alle 4 AM)
- Type: Edge Function → `bulk-import-pokemon`

### 6. Aggiorna il frontend per usare il catalogo Supabase

In `src/DraGold.jsx`, sostituire la `doSearch` con:

```js
const { data, error } = await supabase.rpc('search_cards', {
  q: query.trim(), tcg_filter: tcg, lang_filter: clang, limit_n: 50
})
```

Questa query gira sul DB locale = millisecondi, niente rate limit, sempre disponibile, multi-lingua reale.

## Catena di fallback dei prezzi (implementata in refresh-prices)

| TCG | Catena (in ordine) |
|---|---|
| **Pokémon** | JustTCG → Pokémon TCG API → TCG Price Lookup |
| **One Piece** | JustTCG on-demand → TCG Price Lookup |
| **Magic** | Scryfall daily bulk → TCG Price Lookup |
| **Yu-Gi-Oh!** | YGOPRODeck (CM + TCGP + eBay) → TCG Price Lookup |

Ogni chiamata è loggata in `api_call_log` con status, durata, errore. Query di monitoraggio:

```sql
-- Tassi di successo per fonte ultimo 7 giorni
SELECT source,
  count(*) FILTER (WHERE status >= 200 AND status < 300) AS ok,
  count(*) FILTER (WHERE status >= 400) AS errors,
  avg(duration_ms)::int AS avg_ms
FROM api_call_log
WHERE called_at > now() - interval '7 days'
GROUP BY source ORDER BY ok DESC;
```

## Stima quote (1000 utenti, 30% Pro)

- Bulk import (settimanale): 4 chiamate/settimana → 16/mese, trascurabile
- Refresh prices: ~500 carte uniche con alert/portfolio × 4 chiamate/giorno × 30 = 60.000/mese
  - Distribuite via fallback: 40% JustTCG (24k), 40% Pokémon TCG (24k, gratis), 20% TCGLookup (12k vs limit 10k = oltre ma rarissimo)
- Frontend search: query Supabase locale → **zero API esterne**

**Conclusione: con caching aggressivo (24h sui non-alert), restiamo nei free tier fino a ~3000 utenti attivi.**

## Quando passare a paid

| Trigger | Action |
|---|---|
| 1000+ alert attivi | TCG Price Lookup $25/mese (50k req) |
| 5000+ utenti | JustTCG Pro $49/mese |
| 100+ Pro paganti | Cardmarket Partner API €100/mese |

## Future TCG (quando vuoi aggiungerli)

- **Lorcana**: Lorcast API (gratis, https://lorcast.com/api) — copia bulk-import-onepiece e adatta
- **Flesh and Blood**: FaB-API community (gratis, https://api.fabdb.net)
- **Digimon**: Digimon Card API (https://digimoncard.io/api-docs)

Tutti seguono lo stesso pattern: GET /cards → upsert → cards table. 30-60 minuti per TCG.
