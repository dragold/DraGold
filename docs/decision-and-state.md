# DraGold — Stato e Decisione — 2026-09-20

## Riepilogo esecutivo (30 secondi)

DraGold ha un backend solido con 12 funzioni Supabase deployate e attive, 8 variabili d'ambiente impostate (eBay, JustTCG, TCGLookup, Pokemon TCG API, RESEND, SERVICE_ROLE_KEY), e un frontend funzionante (build ✅, test 41/41 ✅).

**Il gap principale:** i prezzi. Solo 0.2% delle carte ha price data nel DB. La funzione `sync-prices-multi` è scritta in locale per usare TCGdex (gratis) + optcg-api (gratis) come fonti primarie, ma NON è deployata. Serve il PAT Supabase per il deploy.

**Il prodotto è abbastanza per essere testato:** SetPage con language tabs EN/JA + value summary + completion metric + badge copertura prezzi. Manca solo il popolamento prezzi per renderlo utile.

---

## Cosa ho fatto (sessione odierna)

### Analisi bug (2026-09-20)
- ✅ SetPage.jsx (595 righe) — nessun bug critico
- ✅ setPageData.js (194 righe) — nessun bug critico
- ✅ setSlug.js (46 righe) — nessun bug critico
- ✅ tcgConfig.js (27 righe) — nessun bug critico
- ✅ supabase.js (489 righe) — nessun leak di sicurezza
- ✅ schema.sql + migration — RLS corretti, nessun injection risk
- ✅ RPC collection — fix già applicato per ambiguous quantity
- ✅ Migration 20260916 (canonical slugs) — idempotente, safe
- ✅ Migration 20260917 (MVP set logos) — idempotente, safe
- ✅ Vista card_prices_latest — esiste (002_data_architecture.sql)

### Risultato bug analysis
- **Bug di sicurezza:** 0
- **Bug di logica:** 0
- **Bug di performance:** 0 critici
- **Bug di UX:** 1 (race condition filtro collection, low priority)
- **Conclusione:** Il codebase è solido. Nessun bug bloccante.

### Modifiche effettuate
- `src/pages/set/SetPage.jsx` — badge copertura prezzi (value summary + completion box)
- `vite.config.js` — code splitting manual chunks

### Documentazione creata
- `docs/idea-to-today-report.md` — report completo + validazione mercato con ricerca LIVE
- `docs/scalability-plan.md` — piano scalabilità 5 fasi
- `docs/pricing-provider-strategy.md` — strategy provider prezzi + fallback chain
- `docs/roadmap.md` — roadmap 6 fasi
- `docs/sync-prices-multi-implementation.md` — implementazione edge function
- `supabase/functions/sync-prices-multi/index.ts` — edge function (non deployata)
- `supabase/functions/sync-prices-multi/README.md`
- `supabase/migrations/20260916_normalize_canonical_slugs.sql`
- `supabase/migrations/20260917_mvp_set_logos_and_counts.sql`

---

## Cosa c'è già (non mio, verificato)

| Cosa | Stato |
|------|-------|
| 12 funzioni Supabase deployate | ✅ active, used |
| 8 variabili d'ambiente | ✅ impostate (eBay, JustTCG, TCGLookup, Pokemon TCG API, RESEND, SERVICE_ROLE_KEY) |
| Build | ✅ exit 0, 10.88s |
| Test | ✅ 41/41 pass |
| DB | 209k cards, 88k canonical_cards, 172k price snapshots, 5k image cache |
| SetPage | tabs lingua EN/JA + value summary + completion + badge prezzi |
| 6 set MVP con logos + card_count | ✅ |

---

## Cosa manca (gap)

### Prezzi (CRITICO)
- `sync-prices-multi` scritta, NON deployata — serve PAT Supabase
- 0.2% carte con price (501 su 209k)
- bulk-import-pokemon-prices torna HTTP 502 (API esterno down?)

### Immagini
- 0.5% carte con image_url (1k su 209k)
- Pipeline esistente, non scalata

### Monitoring
- Nessun Sentry, nessun Web Vitals tracking, nessun logging centralizzato

### Set logos
- Solo 6 set MVP (OP-01, OP-02, SV07, SV08, EB-01, EB-02)
- OP-03+ mancanti

### Acquisizione
- 0 utenti (20260918: 0 visite su GitHub)
- 0 channel attivo

### Monetizzazione
- 0 revenue

---

## Cosa farei se fossi in te

### Priorità 1: Deploy sync-prices-multi (1-2 ore)
**Perché:** È la feature che più direttamente aggiunge valore al prodotto. Senza prezzi, il value summary è "Price data not available for this set" e il prodotto non ha un hook chiaro.

**Come:**
1. Genera PAT dalla dashboard Supabase (Account settings → API → Access tokens → Generate)
2. `supabase login --token <PAT>`
3. `supabase functions deploy sync-prices-multi`
4. `POST /functions/v1/sync-prices-multi` con `{ "tcg": "pokemon", "limit": 100, "offset": 0 }`
5. Ripeti con offset crescente fino a copertura completa
6. Verifica: quanti prezzi aggiunti? che coverage %?

**Risultato atteso:** da 0.2% a forse 30-60% coverage per i set MVP. Il value summary diventa utile.

### Priorità 2: Validazione utenti (2-4 ore, prima di costruire altro)
**Perché:** non costruire feature per utenti che potrebbero non arrivare.

**Come:**
- 5-10 conversazioni con collezionisti (Reddit, Discord, conoscenti)
- Domande: come tracciano la collezione oggi? cosa ti manca? quanto vorresti sapere il valore?
- Misura: quanti dicono "mi serve"?

### Priorità 3: Prima acquisizione (ongoing)
**Perché:** il prodotto deve essere visibile prima di poter validare.

**Come:**
- Post su Reddit (r/PokemonTCG, r/OnePieceTCG) con valore reale
- "Ecco come completare SV12 con prezzi EN+JA aggiornati"
- Misura: traffico, engagement, seguiti

### Non farei (ora)
- **AI agent con memoria:** ideale ma non prima di avere dati buoni e utenti
- **Database sempre aggiornato:** è il problema centrale, non risolvibile con un'agente AI — risolvibile con sync-prices-multi deployata + scheduler
- **Feature expansion:** non prima di validazione utenti

---

## Il problema del database non aggiornato

Hai ragione: è il nodo centrale. Le cause:
1. **Prezzi:** 0.2% coverage, refresh sporadico
2. **Immagini:** 0.5% coverage, cache parziale
3. **Nuove carte:** import batches manuali o sporadici

**Soluzione:** pipeline automatizzata. Il primo passo è `sync-prices-multi` deployata + schedulata (cron). Il secondo passo è capire se le altre funzioni (bulk-import-*) stanno funzionando o se hanno problemi (es. il 502 su bulk-import-pokemon-prices).

---

## Richiesta tua

Cosa vuoi fare:
1. **Procedo con il deploy di sync-prices-multi?** (ti serve il PAT)
2. **Investigo il 502 su bulk-import-pokemon-prices?** (forse l'API è down temporaneamente)
3. **Faccio la validazione utenti prima?**
4. **Fermo qui?**

Dimmi e procedo. Non continuo senza tua decisione.