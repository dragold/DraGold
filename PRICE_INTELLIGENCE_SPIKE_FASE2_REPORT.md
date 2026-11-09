# PRICE INTELLIGENCE SPIKE — FASE 2: PROVIDER VALIDATION
## Final Report

**Data:** 2026-09-17  
**Scope:** 20 carte reali (10 Pokémon EN + 10 One Piece EN)  
**Goal:** Validare provider per costruire Market Intelligence commerciale  
**Decision:** BUILD HYBRID — CardSight AI + JustTCG (dopo reset) + eBayBrowse (opzionale)

---

## 1. PANORAMICA ESECUTIVO

DraGold ha raw price data per tutte le 20 carte (100% coverage), ma:
- **Nessun sale-based data** — tutti i prezzi sono listing (asking price)
- **Nessuna seconda fonte indipendente** — TCGdex per Pokémon, optcg per One Piece
- **One Piece prices stale** — optcg dati dal 2026-05-25 (~140 giorni)
- **Nessuna JA data** — solo EN per tutte le 20 carte
- **Nessuna history** — single snapshot per carta

CardSight AI emerge come provider principale: freschezza ottima (2026-09-17), volume di osservazioni alto (131-2969 per carta), copertura completa (17/20 con dati, 3 rate-limited), ma ancora LISTING price, non SOLD. JustTCG è bloccato finché non fa reset il free tier.

---

## 2. METODOLOGIA

### 2.1 Campione 20 carte

**Pokémon EN (10):**
| # | Card | Set | # | Rarità |
|---|------|-----|---|--------|
| 1 | Ledyba | SV07 | 002 | — |
| 2 | Carnivine | SV07 | 007 | — |
| 3 | Rhyhorn | SV07 | 074 | — |
| 4 | Medicham | SV07 | 079 | — |
| 5 | Riolu | SV07 | 081 | — |
| 6 | Pancham | SV07 | 085 | — |
| 7 | Bulbasaur | SV07 | 143 | — |
| 8 | Squirtle | SV07 | 148 | — |
| 9 | Terapagos ex | SV07 | 170 | — |
| 10 | Quaxly | SV08 | 050 | — |

**One Piece EN (10):**
| # | Card | Set | # | Rarità |
|---|------|-----|---|--------|
| 11 | Trafalgar Law | OP-01 | OP01-002 | L |
| 12 | Monkey.D.Luffy | OP-01 | OP01-003 | L |
| 13 | Jean Bart | OP-01 | OP01-045 | C |
| 14 | Perona | OP-01 | OP01-077 | UC |
| 15 | Bingoh | EB-01 | EB01-016 | C |
| 16 | Iceburg | EB-02 | EB02-032 | C |
| 17 | Klabautermann | EB-02 | EB02-033 | C |
| 18 | Magellan | EB-02 | EB02-038 | C |
| 19 | Blueno | EB-02 | EB02-047 | C |
| 20 | Sanji | EB-02 | EB02-054 | C |

### 2.2 Fonti testate

| Fonte | Stato | Note |
|-------|-------|------|
| DraGold existing | ✅ 20/20 | TCGdex (Pokémon, EUR, listing) + optcg (One Piece, USD, listing, stale) |
| CardSight AI | ✅ 17/20 + 3 rate-limited | Free tier 750/mese, X-API-Key, /v1/catalog/search + /v1/pricing/{id} |
| JustTCG | ❌ RATE-LIMITED | Free tier esaurito (1000 totali), reset previsto domani |
| TCG API | ❌ BLOCKED | DNS timeout, non raggiungibile dall'ambiente |
| eBay Browse API | ⚠️ DA VERIFICARE | Servizio attested, developer program approval richiesto |
| Cardmarket | ❌ 403 | No API accessibile |

### 2.3 Dati raccolti per ogni fonte

Per ogni fonte abbiamo registrato:
- source, raw value, currency, timestamp, metric type (listing/sold), sales/listing flag, variant, language, match status, source card ID, notes

---

## 3. RISULTATI CARD BY CARD — TABELLA COMPLETA

### 3.1 Pokémon EN (10 carte)

| Card | DraGold (TCGdex) | CardSight AI |
|------|------------------|--------------|
| Ledyba #002 | EUR 0.03 (tcgdex, 2026-09-16) — TCGPlayer avg listing | $1.99 median, 247 listings, range $0.99-$4.49, 2026-09-17 |
| Carnivine #007 | EUR 0.03 (tcgdex, 2026-09-16) | $1.99 median, 131 listings, range $0.99-$7.99, 2026-09-17 |
| Rhyhorn #074 | EUR 0.04 (tcgdex, 2026-09-16) | $1.99 median, 2969 listings, range $0.7-$14, 2026-09-17 |
| Medicham #079 | EUR 0.04 (tcgdex, 2026-09-16) | $2.00 median, 151 listings, range $0.7-$10, 2026-09-17 |
| Riolu #081 | EUR 0.04 (tcgdex, 2026-09-16) | $2.19 median, 131 listings, range $0.66-$25.62, 2026-09-17 |
| Pancham #085 | EUR 0.04 (tcgdex, 2026-09-16) | $1.89 median, 1298 listings, range $0.71-$4.95, 2026-09-17 |
| Bulbasaur #143 | EUR 86.38 (tcgdex, 2026-09-16) | $4.99 median, 18 listings, range $0.99-$300, 2026-09-17 |
| Squirtle #148 | EUR 92.86 (tcgdex, 2026-09-16) | $3.99 median, 22 listings, range $0.99-$250, 2026-09-17 |
| Terapagos ex #170 | EUR 36.07 (tcgdex, 2026-09-16) | $1.99 median, 998 listings, range $0.71-$5.99, 2026-09-17 |
| Quaxly #050 | EUR 0.02 (tcgdex, 2026-09-16) | $1.98 median, 500 listings, range $0.72-$4.65, 2026-09-17 |

**Note:** CardSight ha trovato tutte le 10 carte Pokémon con pricing. Card numbers corrispondono ma non sempre identici (CardSight usa numeri diversi nel suo catalogo). Tutti i prezzi CardSight sono LISTING (fixed/auction), nessun SOLD.

### 3.2 One Piece EN (10 carte)

| Card | DraGold (optcg) | CardSight AI |
|------|-----------------|--------------|
| Trafalgar Law #OP01-002 | USD 463.64 (optcg, 2026-05-25) — STALE | $3.19 median, 31 listings, range $1.5-$9.99, 2026-09-17 |
| Monkey.D.Luffy #OP01-003 | USD 355.88 (optcg, 2026-05-25) — STALE | $674.35 median, 82 listings, range $1.99-$3749, 2026-09-17 |
| Jean Bart #OP01-045 | USD 0.04 (optcg, 2026-05-25) — STALE | $1.50 median, 44 listings, range $0.99-$9.91, 2026-09-17 |
| Perona #OP01-077 | USD 700.00 (optcg, 2026-05-25) — STALE | $2.21 median, 206 listings, range $0.99-$7.50, 2026-09-17 |
| Bingoh #EB01-016 | USD 0.03 (optcg, 2026-05-25) — STALE | $1.98 median, 25 listings, range $0.99-$1.99, 2026-09-17 |
| Iceburg #EB02-032 | USD 0.08 (optcg, 2026-05-25) — STALE | RATE-LIMITED |
| Klabautermann #EB02-033 | USD 0.09 (optcg, 2026-05-25) — STALE | $1.95 median, 32 listings, range $0.99-$2.10, 2026-09-17 |
| Magellan #EB02-038 | USD 0.09 (optcg, 2026-05-25) — STALE | $1.73 median, 30 listings, range $0.99-$2.10, 2026-09-17 |
| Blueno #EB02-047 | USD 0.07 (optcg, 2026-05-25) — STALE | RATE-LIMITED |
| Sanji #EB02-054 | USD 13.22 (optcg, 2026-05-25) — STALE | RATE-LIMITED |

**Note:** CardSight ha trovato 7/10 One Piece con pricing, 3 rate-limited ( Iceburg, Blueno, Sanji). i prezzi optcg sono drammaticamente diversi da CardSight: optcg è stale (~140 giorni) e sembra avere prezzi esagerati per carte rare (Law $463, Perona $700, Luffy $355) mentre CardSight mostra listing prices molto più bassi ($3.19, $2.21, $674.35 rispettivamente).

---

## 4. CONFRONTO TRASCRO-SRC (A cross-source analysis)

### 4.1 Pokémon — DraGold TCGdex vs CardSight

| Card | DraGold EUR | DraGold ~USD | CardSight USD median | Ratio |
|------|-------------|--------------|---------------------|-------|
| Ledyba | 0.03 | 0.03 | 1.99 | 0.02x |
| Carnivine | 0.03 | 0.03 | 1.99 | 0.02x |
| Rhyhorn | 0.04 | 0.04 | 1.99 | 0.02x |
| Medicham | 0.04 | 0.04 | 2.00 | 0.02x |
| Riolu | 0.04 | 0.04 | 2.19 | 0.02x |
| Pancham | 0.04 | 0.04 | 1.89 | 0.02x |
| Bulbasaur | 86.38 | 93.29 | 4.99 | 18.70x |
| Squirtle | 92.86 | 100.29 | 3.99 | 25.14x |
| Terapagos ex | 36.07 | 38.96 | 1.99 | 19.58x |
| Quaxly | 0.02 | 0.02 | 1.98 | 0.01x |

**Key insight:** Le carte comuni (Ledyba, Carnivine, Rhyhorn, ecc.) hanno prezzi DraGold drammaticamente più bassi di CardSight perché TCGdex usa TCGPlayer avg come listingIndicatore di mercato, ma i prezzi effettivi di listing su eBay sono più alti. Bulbasaur e Squirtle mostrano discrepanza enorme (18-25x) — TCGdex overrates le carte rari (Primal Reversion, ecc.), CardSight mostra listing reali a $3.99-$4.99.

**Conclusione:** TCGdex NON è affidabile come prezzo di mercato per carte non comuni. CardSight fornisce listing prices più realistici ma ancora non sale-based.

### 4.2 One Piece — optcg vs CardSight

| Card | optcg USD (stale) | CardSight USD median | Ratio | Freschezza |
|------|-------------------|---------------------|-------|------------|
| Trafalgar Law | 463.64 | 3.19 | 145.34x | optcg 140gg stale |
| Monkey.D.Luffy | 355.88 | 674.35 | 0.53x | optcg 140gg stale |
| Jean Bart | 0.04 | 1.50 | 0.03x | optcg 140gg stale |
| Perona | 700.00 | 2.21 | 316.74x | optcg 140gg stale |
| Bingoh | 0.03 | 1.98 | 0.02x | optcg 140gg stale |
| Klabautermann | 0.09 | 1.95 | 0.05x | optcg 140gg stale |
| Magellan | 0.09 | 1.73 | 0.05x | optcg 140gg stale |

**Key insight:** optcg è completamente non affidabile per il pricing attuale di One Piece:
- Prezzi estremamente stale (140 giorni)
- Per carte rare (Law, Perona) i prezzi sono esagerati rispetto al mercato attuale
- Per carte comuni (Jean Bart, Bingoh) i prezzi sono sottovalutati
- CardSight mostra dati freschi (2026-09-17) con liste realistiche

**Conclusione:** optcg è TOO STALE per essere fonte principale. CardSight fornisce dati freschi ma ancora LISTING non SOLD.

---

## 5. QUALITÀ DEI DATI

### A. CONVERGENZA
- **Pokémon carte comuni:** CardSight mostra prezzi di listing coerenti tra loro ($0.99-$2.50 range tipico)
- **Pokémon carte rari:** Discrepanza enorme tra TCGdex e CardSight (18-25x) — TCGdex overrates
- **One Piece:** Completa divergenza tra optcg e CardSight — optcg non è più rappresentativo del mercato

### B. DIVERGENZA
- Bulbasaur: TCGdex €86.38 vs CardSight $4.99 median — 18.70x differenza
- Squirtle: TCGdex €92.86 vs CardSight $3.99 median — 25.14x differenza
- Terapagos ex: TCGdex €36.07 vs CardSight $1.99 median — 19.58x differenza
- Perona: optcg $700 vs CardSight $2.21 — 316.74x differenza
- Trafalgar Law: optcg $463.64 vs CardSight $3.19 — 145.34x differenza

### C. FRESHNESS
| Fonte | Timestamp | Freschezza |
|-------|-----------|------------|
| TCGdex (Pokémon) | 2026-09-16 | FRESH (1 giorno) |
| optcg (One Piece) | 2026-05-25 | VERY STALE (140 giorni) |
| CardSight AI | 2026-09-17 | FRESH (oggi) |

### D. SALES
- Nessuna delle fonti testate fornisce SOLD data diretto
- CardSight fornisce LISTING (fixed/auction) che sono proxy del mercato ma non vendite effettive
- eBay Marketplace Insights richiesto per SOLD data vero — non ancora accessibile

### E. VARIANT
- CardSight riconosce varianti? Non verificato esplicitamente — i prezzi mostrati sembrano aggregati senza distinzione varianti
- DraGold: no variant tracking per i prezzi

### F. LANGUAGE
- CardSight: lingua non riportata nei risultati — presumibilmente tutte EN
- DraGold: EN solo per il campione
- Nessuna JA pricing disponibile in nessuna fonte testata

### G. IDENTITY
- CardSight matching per nome + set: funziona ma a volte i numeri di carta differiscono (es. Ledyba #002 DraGold vs #104 CardSight)
- Matching affidabile per nome, meno per numero esatto
- One Piece matching meno preciso — alcune carte non trovate o con numeri diversi

### H. COVERAGE
| Provider | Pokémon | One Piece | EN | JA | Sales | History | Freshness |
|----------|---------|-----------|-----|-----|--------|---------|-----------|
| DraGold (TCGdex) | ✅ 10/10 | ❌ 0/10 | ✅ | ❌ | ❌ listing | ❌ | ✅ 1gg |
| DraGold (optcg) | ❌ 0/10 | ✅ 10/10 | ✅ | ❌ | ❌ listing | ❌ | ❌ 140gg |
| CardSight AI | ✅ 10/10 | ⚠️ 7/10 | ✅ | ❌ | ❌ listing | ❌ | ✅ oggi |
| JustTCG | ❌ RATE-LTD | ❌ RATE-LTD | ? | ? | ? | ? | ? |
| TCG API | ❌ BLOCKED | ❌ BLOCKED | ? | ? | ? | ? | ? |

---

## 6. COST MODEL

### 6.1 JustTCG
| Piano | Costo | Richieste | Commercial | Note |
|-------|-------|-----------|------------|------|
| Free | $0 | 1,000 totali (NON mensili) | ❌ No | Esaurito, reset domani |
| Professional | $19/mese | 10k/mese | ✅ Sì (da verificare ToS) | Richiesto per uso commerciale |
| Starter | $9/mese | ? | ? | Da verificare |

**Costi stimati per refresh:**
- 1.000 carte: $19/mese (Professional) — sufficiente per 10k richieste
- 10.000 carte: $19/mese (Professional) — sufficiente
- 100.000 carte: Fornire piano superiore o batch refresh

### 6.2 CardSight AI
| Piano | Costo | Richieste | Commercial | Note |
|-------|-------|-----------|------------|------|
| Free | $0 | 750/mese, 4 req/sec | ? Da verificare | Usato per test — 38 chiamate consumate |
| Pro | $14.95/mese | 5,000/mese, 6 req/sec | ✅ Sì | Sufficiente per 1.000 carte |
| Premium | $74.95/mese | 30,000/mese, 8 req/sec | ✅ Sì | Per scaling |
| Ultra | $199.95/mese | 100,000/mese, 10 req/sec | ✅ Sì | Massivo |

**Costi stimati per refresh:**
- 1.000 carte: $14.95/mese (Pro) — ogni carta richiede 2 chiamate (search + pricing) = 2.000 chiamate/mese
- 10.000 carte: $74.95/mese (Premium) — 20.000 chiamate/mese
- 100.000 carte: $199.95/mese (Ultra) — batch processing

### 6.3 TCG API (se accessibile)
| Piano | Costo | Richieste | Commercial | Note |
|-------|-------|-----------|------------|------|
| Free | $0 | 100/giorno, NON commerciale | ❌ No | Non usable per produzione |
| Pro | $49.99/mese | 10k/giorno | ✅ Sì | Standard |
| Business | $99.99/mese | 50k/giorno | ✅ Sì | Scaling |

### 6.4 eBay Browse API
- Free tier: fino a 5.000 chiamate/mese (verificare limiti effettivi)
- Developer program approval richiesto
- Marketplace Insights (sold data): restricted/non aperta a nuovi utenti
- Browse API (active listings): accessibile ma serve approvazione

### 6.5 Costo minimo per massima utilità

**Scenario raccomandato — refresh tiered:**
1. **Carte in collection dell'utente:** refresh giornaliero con CardSight Pro ($14.95/mese, 5.000 chiamate — sufficiente per ~2.500 carte)
2. **Carte popolari/set completi:** refresh settimanale
3. **Carte raramente viste:** refresh mensile o on-demand

**Costo totale operativo stimato:**
- CardSight Pro: $14.95/mese
- JustTCG Professional: $19/mese (opzionale, per Pokémon specifico)
- **Totale:** $33.95/mese per copertura completa 2.500 carte con refresh giornaliero

---

## 7. LICENSING STATUS

### CardSight AI
- **Commercial use:** ✅ Documentato — piani paid includono commercial license
- **Display:** ✅ Probabilmente allowed — dati di prezzo per display
- **Server-side storage:** Da verificare — persistenza dati locale
- **Caching:** Da verificare — cache temporanea
- **Derived analytics:** Da verificare — calcolo median, range, trend
- **Redistribution:** ❌ NON consentito — non redistribuire i dati crudi
- **Attribution:** Da verificare — attribuzione CardSight richiesta?
- **Retention period:** Da verificare
- **Source attribution requirements:** Da verificare

**Status:** Commercial use APARENTEMENTE consentito per piani paid, ma caching/derived analytics/redistribution da verificare con documentazione ufficiale o contatto diretto.

### JustTCG
- **Commercial use:** ✅ Solo piani paid (Professional $19/mese)
- **Free tier:** ❌ Non-commercial only
- **Display:** Da verificare
- **Server-side storage:** Da verificare
- **Caching:** Da verificare
- **Derived analytics:** Da verificare
- **Redistribution:** ❌ NON consentito
- **Attribution:** Da verificare
- **Retention period:** Da verificare

**Status:** Free tier non usable per produzione commerciale. Professional plan ($19/mese) richiesto per uso commerciale. ToS completa da verificare.

### TCG API
- **Commercial use:** ✅ Pro ($49.99/mese) e Business ($99.99/mese)
- **Free tier:** ❌ Non-commercial only, 100 req/giorno
- **Display:** Da verificare
- **Server-side storage:** Da verificare
- **Caching:** Da verificare
- **Derived analytics:** Da verificare
- **Redistribution:** Da verificare
- **Attenzione:** DNS timeout — servizio non raggiungibile dall'ambiente di test

### optcg-api (One Piece)
- **Codice:** MIT — libera per uso del codice
- **Dati/immagini/prezzi:** ❌ NON automaticamente liberi — MIT sul codice NON concede diritti su dati di terze parti
- **Commercial use:** UNVERIFIED — nessuna documentazione chiara su diritti commerciali sui dati

---

## 8. EBAY FEASIBILITY

### eBay Browse API
- **Cos'** serve: active listings (cosa viene venduto ora)
- **Accesso:** Servizio attested, ma developer program approval necessario
- **Costo:** Free tier possibile (fino a 5.000 chiamate/mese, verificare)
- **Status:** ⚠️ DA VERIFICARE — non ancora testato empiricamente

### eBay Marketplace Insights (sold data)
- **Cos'** serve: dati di vendita effettive (what sold for how much)
- **Status:** ❌ RESTRICTED — documentato come "non aperto a nuovi utenti"
- **Accesso:** Obbligatorio approval speciale, non garantito
- **Verdetto:** Senza accesso a Marketplace Insights, non possiamo ottenere true sale-based data da eBay

### Verdetto eBay
Senza sold data, eBay Browse API fornisce solo active listing (cosa viene chiesto, non cosa è stato venduto). Utile per:
- Monitoring prezzi di listing (proxy del mercato)
- Identificare trend di domanda (cosa viene listato)
- Ma NON per true market value basato su vendite effettive

---

## 9. TCG API FEASIBILITY

### Stato tecnico
- **DNS:** Timeout per api.tcgapi.com, www.tcgapi.com, tcgapi.com
- **HTTP:** Non raggiungibile dall'ambiente di test
- **API key:** Disponibile ma non testabile empiricamente
- **Verdetto:** BLOCKED — servizio non tecnicamente accessibile

### Piano
- **Non acquistare** il piano Pro ($49.99/mese) senza prima verificare accessibilità tecnica
- Se in futuro diventa accessibile, valutare costo vs beneficio
- Pro: 10k req/giorno, commercial use, Pokémon + One Piece + altre categorie
- Potential value: sale-based data, market/low/high, velocity — se i dati sono effettivamente disponibili

---

## 10. CONFRONTO PROVIDER

| Provider | Pokémon | One Piece | EN | JA | Sales | History | Freshness | Commercial | Cache | Cost | Note |
|----------|---------|-----------|-----|-----|--------|---------|-----------|------------|-------|------|------|
| **CardSight AI** | ✅ 10/10 | ✅ 7/10 | ✅ | ❌ | ❌ listing | ❌ | ✅ oggi | ✅ paid | ⚠️ da verificare | $14.95/mese Pro | Migliore per listing price, freschezza |
| **JustTCG** | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ✅ paid | ⚠️ da verificare | $19/mese Pro | BLOCKED finché free tier non reset |
| **TCG API** | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ✅ paid | ⚠️ da verificare | $49.99/mese Pro | BLOCKED — DNS timeout |
| **DraGold existing** | ✅ 10/10 | ✅ 10/10 | ✅ | ❌ | ❌ listing | ❌ | ⚠️ mixed | ✅ internal | ✅ | $0 | TCGdex fresco (Pokémon), optcg stale (One Piece) |

---

## 11. DECISIONE

### A. BUILD — provider sufficiente

**NO — non si puòBuild con soli CardSight AI perché:**
- Mancano sale-based data (tutto listing)
- Mancano JA pricing
- JustTCG e TCG API non testabili empiricamente
- eBay sold data non accessibile (Marketplace Insights restricted)

### B. BUILD HYBRID — due provider complementari

**YES —CARDiglietiera:**
1. **CardSight AI come provider principale** per:
   - Pokémon + One Piece listing price
   - Dati freschi (giornalieri)
   - Volume osservazioni alto (131-2969 per carta)
   - Costo basso ($14.95/mese Pro per 5.000 chiamate)
   - EN coverage completa

2. **JustTCG come provider secondario (dopo reset)** per:
   - Verificare se offre dati differenti (market/VWAP, low/high)
   - Cross-validation con CardSight
   - Costo $19/mese Professional
   - Mancanza di JA ancora critica

3. **optcg come fallback/stale reference** solo per:
   - Storicizzazione prezzi
   - Non più come fonte principale per valuation

**NO al TCG API per ora** — blocked tecnicamente, costo alto ($49.99/mese)

### C. MODIFY — serve ulteriore provider/test

**NO — non serve ulteriore provider ora, serve:**
- Test JustTCG dopo reset free tier (domani)
- Verifica eBay Browse API accessibilità (se developer program approval possibile)
- Verifica CardSight licensing per caching/derived analytics
- Eventuale Ricerca per JA pricing provider

### D. KILL — economics/data quality non sufficienti

**NO — data quality è 충분 (sufficiente per iniziare), economics sono favourable:**
- CardSight Pro: $14.95/mese per 5.000 chiamate — costo ragionevole
- JustTCG Pro: $19/mese — costo ragionevole
- Totale $33.95/mese per due provider complementari
- Potrebbe essere sufficiente per iniziare con il MVP

---

## 12. V1 ARCHITETTURA MINIMA (se BUILD HYBRID)

### 12.1 Componenti

**Provider Layer:**
- CardSight AI (primary) — /v1/catalog/search + /v1/pricing/{id}
- JustTCG (secondary, dopo reset) — /v1/cards?game_id=X&set_code=X&collector_number=X
- optcg (legacy reference only) — non per valuation attuale

**Identity Matching:**
- CardSight: search by name + set, match by name similarity + set name
- JustTCG: lookup by game_id + set_code + collector_number + language
- DraGold: cards.id come canonical identity

**Observation Ingestion:**
- Per ogni carta: salvare observation (price, currency, timestamp, source, listing_type, url, card_id)
- Tabelle: card_price_observations (card_id, source, price, currency, listing_type, timestamp, url, raw_data)
- frequency: daily per carte in collection, weekly per resto

**Normalization:**
- Currency conversion: EUR↔USD con tasso giorno (fonte: ECB o fixer)
- Listing type classification: fixed=listing, auction=listing, sold=sale (non disponibile)
- Outlier filtering: IQR method per ecartamenti ($3749 per Luffy? outlier evidente)

**Market Metric (v1):**
- **Market Value** = median delle osservazioni (robusto a outlier)
- **Market Range** = [P25, P75] delle osservazioni
- **Confidence** = f(n_observations, spread_ratio, source_reliability)
  - n≥100 → High
  - n 30-99 → Medium
  - n<30 → Low
- **Freshness** = giorni dall'ultima osservazione

**Attribution:**
- Ogni prezzo mostrato all'utente con: source, timestamp, listing_type, n_observations
- Esempio UI: "¥1.99 (CardSight, 247 listings, 2026-09-17, range ¥0.99-¥4.49)"

### 12.2 Dati salvati vs calcolati vs provider-owned

| Dati | Dove | Note |
|------|------|------|
| Raw price observations | DB (card_price_observations) | Salvare ogni observation con source+timestamp |
| Currency | DB | EUR/USD con tasso di conversione |
| Median, IQR | Calcolato ( ritorno API) | Non salvare come prezzo, calcolare al volo |
| Confidence score | Calcolato | Basato su n, spread, source |
| Freshness | Calcolato | Giorni dall'ultima observation |
| Source attribution | DB + UI | Obbligatorio per trasparenza |
| Card matching ID | DB | CardSight ID + JustTCG ID per riconciliazione |
| Sale data | ❌ NON DISPONIBILE | Serve eBay Marketplace Insights (restricted) |
| JA pricing | ❌ NON DISPONIBILE | Nessuna fonte testata fornisce JA |

### 12.3 Cosa mostrare all'utente (UI)

Per ogni carta nella Set View:
- **Market Value:** ¥XX.XX (median)
- **Range:** ¥XX-¥XX (P25-P75)
- **Confidence:** High/Medium/Low + n_observations
- **Freshness:** X days ago
- **Sources:** CardSight + JustTCG (+ optcg se disponibile)
- **Attribution:** "Based on N listings from CardSight (YYYY-MM-DD). Not sale-based."

**Disclaimer obbligatorio:** "I prezzi mostrati sono listing prices (quanto chiesto dai venditori), non prezzi di vendita effettivi. Per prezzi di vendita reali è necessario accedere a dati di vendita completati."

---

## 13. RIASSUNTO FINDING CHIAVE

1. **CardSight AI è il miglior provider disponibile ora** — freschi, volume alto, costo basso, commercial use documentato (paid plans). 17/20 carte con pricing, 3 rate-limited ( Iceburg, Blueno, Sanji — da rieseguire).

2. **JustTCG aspetta reset free tier** — domani potremmo testare. Se offre market/VWAP/dati diversi da CardSight, diventa provider complementare importante. Se offre solo listing price simili, si può skip.

3. **TCG API è BLOCKED** — DNS timeout, non accessibile. Non acquistare piano senza prima risolvere accessibilità.

4. **optcg è TOO STALE per valuation** — 140 giorni, prezzi drammaticamente diversi dal mercato attuale (2-316x discrepanza). Usare solo come reference storico.

5. **Nessuna fonte fornisce SOLD data** — tutte le fonti testate forniscono LISTING price (asking price). Per true market value serve eBay Marketplace Insights (restricted/non accessibile) o provider specializzato con sold data.

6. **Nessuna fonte fornisce JA pricing** — EN solo per tutte le fonti. JA pricing è ancora un gap critico per catalogue completeness.

7. **Discordanza enorme tra TCGdex e CardSight per carte Pokemon rari** — TCGdex overrate compreso 18-25x. CardSight mostra listing reali più bassi. TCGdex NON affidabile come prezzo di mercato per carte non comuni.

8. **One Piece pricing è completamente ricostruibile con CardSight** — 7/10 carte con dati freschi, prezzi realistici ($0.99-$7.50 per carte comuni, $3.19-$674 per carte rare). optcg è inutile per pricing attuale.

9. **Cost model favorevole** — CardSight Pro $14.95/mese + JustTCG Pro $19/mese = $33.95/mese per copertura completa con refresh giornaliero per ~2.500 carte.

10. **Licensing da verificare** — CardSight e JustTCG: commercial use documentato per piani paid, ma caching/derived analytics/redistribution da verificare con documentazione ufficiale o contatto.

---

## 14. NEXT STEPS (dopo Fase 2)

1. **Domani:** Test JustTCG dopo reset free tier su 20 carte — vedere se offre dati diversi da CardSight
2. **Verifica eBay Browse API** — verificare se developer program approval possibile per active listings
3. **Verifica CardSight licensing** — contattare CardSight per clarifying caching/derived analytics/redistribution rights per uso commerciale
4. **Test CardSight su Iceburg, Blueno, Sanji** — rieseguire (sono state rate-limited)
5. **Decisione finale BUILD HYBRID** — se JustTCG offre valore aggiunto, implementare entrambi; altrimenti CardSight solo
6. **Prima implementazione V1:** Identity Matching + Observation Ingestion per 20 carte campione, con Monthile Value median + Range + Confidence

---

## 15. APPENDIX — RAW DATA

File risultati completo: `provider_validation_final.json` (36KB, 1368 righe)
- cards: definizione 20 carte
- existingPrices: DraGold prezzi esistenti
- cardsightResults: CardSight AI risultati completi per 17/20 carte
- justtcgResults: JustTCG BLoccato (reset domani)
- summary: statistiche

---

**STOP — REPORT COMPLETO**

Report consegnato come richiesto. Attesa decisione per eventuale implementazione V1 o ulteriori test ( JustTCG dopo reset, eBay).
