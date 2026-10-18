# REPORT AUDIT E VERIFICA OPERATIVA — DRAGOLD.ORG

**Data:** 18 Ottobre 2026  
**Repository verificato:** `D:\Projects\DraGold`  
**Branch:** `main` | Commit: `a04c52a45f947a809f95c82dacef7bf8f661d527`  
**Valutazione Complessiva di Conformità:** VERIFICATO CON RISERVE (NON PASS GLOBALE finché non autorizzate verifiche esterne bloccate)

---

## 1. EXECUTIVE SUMMARY

1. **Catalogo Reale Verificato:** Il database Supabase in produzione ospita **211.563 carte complessive** distribuite su 4 giochi: Pokémon (163.207), Magic: The Gathering (27.517), Yu-Gi-Oh! (14.665) e One Piece (6.174). La copertura immagini è del **100% per MTG e YGO**, del **99.9% per One Piece** e dell'**85.0% per Pokémon**.
2. **Snapshot di Prezzo e Osservazioni:** La tabella `card_prices` conta **328.244 snapshot** (208.860 YGOPRODeck, 32.015 Scryfall, 18.607 Cardmarket, 18.231 eBay sold, 5.186 TCGCSV, 3.682 JustTCG, 639 TCGdex). Parallelamente, la pipeline di valutazione archivia **369.863 osservazioni** in `market_observations` e **8.997 valutazioni calcolate** in `market_valuations` (5.939 Pokémon e 3.058 One Piece). MTG e YGO hanno zero valutazioni calcolate in `market_valuations` benché abbiano centinaia di migliaia di snapshot in `card_prices`.
3. **Bug Critici Riprodotti e Risolti:**
   - **Postgres Error 42703 in `sync-prices-multi` e `api/sync-prices.js`:** Il codice interrogava `canonical_cards.name` che non esiste (la colonna è `base_name`). Inoltre, gli ID di `canonical_cards` sono UUID, mentre `card_prices.card_id` richiede l'ID composto della tabella `cards`. Questo provocava il fallimento del 100% delle sincronizzazioni.
   - **Incongruenza Chiave YGO:** Il codice cercava `tcg = 'yugioh'` mentre nel database l'identificatore reale è `'ygo'`.
   - **Esclusione di One Piece in `refresh-prices`:** La funzione controllava solo `tcg === 'op'`, ignorando tutti gli alert e collezioni salvati come `'onepiece'`.
   - **Host Whitelist Proxy:** `api/img.js` rifiutava le immagini di One Piece (`www.onepiece-cardgame.com` e `en.onepiece-cardgame.com`) con HTTP 403, impedendone il rendering WebGL.
4. **Test Suite:** **608 test eseguiti e superati al 100%** (41 test frontend unitari in `src/`, 567 test di pipeline e matching in `scripts/`). Build di produzione Vite completata con successo in 5.8s.
5. **Posizionamento Finanziario ("Bloomberg per le carte"):** La domanda di mercato si concentra sullo **spread transatlantico/Giappone** (Cardmarket EUR vs TCGplayer USD vs Mercari JPY) e sulla cronologia trasparente del prezzo di vendita concluso (*sold listings*) rispetto alle richieste d'offerta (*asking price*). La raccomandazione operativa prioritizzata è implementare **TradingView Lightweight Charts** nella scheda carta per esporre la serie storica reale invece di un valore statico.

---

## 2. STATO REALE DEL REPOSITORY

- **Percorso:** `D:\Projects\DraGold`
- **Branch:** `main`
- **Head Commit:** `a04c52a` (*fix: use direct CORS-safe URLs for Scryfall/TCGdex, fix /api/img User-Agent to resolve gray card in WebGL*)
- **Remoto Git:** `origin https://github.com/dragold/DraGold.git (fetch & push)`
- **Segreti e file `.env`:**
  - `.env.local` e `.env` sono esclusi da Git tramite `.gitignore` (confermato con `git check-ignore`).
  - Nessuna chiave o credenziale è stata esposta, copiata o tracciata.
- **Dipendenze e Vulnerabilità (da `npm audit`):**
  - Rilevate 6 vulnerabilità (3 moderate, 3 high): `esbuild <=0.24.2`, `sharp <=0.35.5-rc.1`, `source-map-js <=1.2.1`, `uuid <11.1.1` (transitiva via `@react-three/drei`). Non aggiornate forzatamente per evitare breaking changes non pianificate.

---

## 3. FATTI VERIFICATI E AFFERMAZIONI NON CONFERMATE

| Affermazione Precedente | Esito Verifica | Prova / Dettaglio |
|---|---|---|
| 211.563 carte nel catalogo | **PASS** | Conteggio esatto: 163.207 Pokémon, 27.517 MTG, 14.665 YGO, 6.174 One Piece. |
| 328.244 snapshot di prezzo | **PASS** | Conteggio esatto da `card_prices`: 208.860 YGO, 32.015 MTG, 18.607 Cardmarket, 18.231 eBay, 5.186 TCGCSV, 3.682 JustTCG, 639 TCGdex. |
| 8.997 valutazioni di mercato | **PASS** | Conteggio esatto da `market_valuations`: 5.939 Pokémon, 3.058 One Piece. (Zero per MTG e YGO). |
| 608 test superati | **PASS** | 41 unit test (`npm test`) + 567 test script (`npm run test:scripts`). Totale = 608 passati, 0 falliti. |
| Build Vite completata | **PASS** | `npm run build` genera bundle minificato in 5.8s senza errori. |
| TCGdex fornisce YGO | **FAIL (Smentito)** | TCGdex supporta solo Pokémon. Per YGO la fonte reale è YGOPRODeck. |
| `sync-prices-multi` funzionava | **FAIL (Smentito)** | Falliva con Postgres error 42703 (`column canonical_cards.name does not exist`). |
| One Piece prezzi in `refresh-prices` | **FAIL (Smentito)** | Ignorava One Piece perché cercava `tcg === 'op'` mentre il DB ha `'onepiece'`. |
| Resend funzionante in produzione | **NON VERIFICATO / BLOCCATO** | Richiede test di invio reale (vietato da mandato senza autorizzazione) e verifica DNS dominio su Resend. |

---

## 4. BUG RIPRODOTTI

### BUG-01: Postgres Error 42703 su `canonical_cards.name`
- **Gravità:** CRITICA
- **Riproduzione:**
  ```js
  await sb.from('canonical_cards').select('id, tcg, name, set_id, card_number').eq('tcg', 'pokemon');
  ```
- **Esito:** `Error: column canonical_cards.name does not exist (code: 42703)`.
- **Impatto:** Sincronizzazione prezzi `sync-prices-multi` e `api/sync-prices.js` completamente interrotte.
- **Risoluzione:** Reindirizzata la query alla tabella corretta `cards`, che contiene `id, tcg, name, lang, set_id, card_number`.

### BUG-02: Disallineamento TCG per Yu-Gi-Oh (`yugioh` vs `ygo`)
- **Gravità:** ALTA
- **Riproduzione:**
  ```js
  const { count } = await sb.from('cards').select('*', { count: 'exact', head: true }).eq('tcg', 'yugioh');
  // count = 0
  const { count: real } = await sb.from('cards').select('*', { count: 'exact', head: true }).eq('tcg', 'ygo');
  // count = 14665
  ```
- **Esito:** Cercare `'yugioh'` restituiva zero righe.
- **Risoluzione:** Gestito l'alias `ygo` e normalizzato `'yugioh'` in `'ygo'` nelle query.

### BUG-03: Esclusione delle carte One Piece in `refresh-prices`
- **Gravità:** ALTA
- **Riproduzione:** Nel file `refresh-prices/index.ts`, la riga 170 eseguiva `if (tcg === 'op')`. Negli alert e collezioni reali, `tcg` è `'onepiece'`.
- **Esito:** Nessun alert One Piece veniva mai inserito nella fallback chain dei prezzi.
- **Risoluzione:** Aggiornata la condizione a `if (tcg === 'op' || tcg === 'onepiece')`.

### BUG-04: Blocco 403 Immagini One Piece in `api/img.js`
- **Gravità:** MEDIA
- **Riproduzione:**
  `curl http://localhost:5173/api/img?u=https://www.onepiece-cardgame.com/images/cardlist/card/EB01-016.png`
- **Esito:** `HTTP 403 { "error": "host not allowed" }`.
- **Risoluzione:** Aggiunti `"www.onepiece-cardgame.com"` e `"en.onepiece-cardgame.com"` a `ALLOWED_HOSTS`.

---

## 5. CORREZIONI IMPLEMENTATE

1. **`supabase/functions/sync-prices-multi/index.ts`:**
   - Corretta la tabella di estrazione da `canonical_cards` a `cards`.
   - Inclusa la colonna `lang` e `source_id`.
   - Integrato il fetcher YGOPRODeck per Yu-Gi-Oh! su endpoint ufficiale `https://db.ygoprodeck.com/api/v7/cardinfo.php?id={sourceId}`.
   - Normalizzato `tcgFilter` da `yugioh` a `ygo`.
2. **`supabase/functions/refresh-prices/index.ts`:**
   - Aggiunti alias `onepiece` e `yugioh` in `TCG_KEYWORD`.
   - Aggiornate le condizioni del loop di refresh: `tcg === 'op' || tcg === 'onepiece'` e `tcg === 'ygo' || tcg === 'yugioh'`.
3. **`api/img.js`:**
   - Inseriti i domini ufficiali di One Piece in `ALLOWED_HOSTS`.
   - Rimossa la query string cache-busting per le richieste dirette a `cards.scryfall.io` per evitare rifiuti dai CDN Scryfall verso i nodi serverless.
4. **`api/sync-prices.js`:**
   - Corretta la query verso `cards`.
   - Inserito controllo esplicito per TCGdex (solo Pokémon).

---

## 6. TEST ESEGUITI E RISULTATI

### Test 1: Frontend Unit Test Suite
- **Comando:** `npm test` (`node --test "src/**/*.test.js"`)
- **Esito:** **PASS** (41 passati, 0 falliti, durata 190ms).
- **Aree testate:** Starfield deterministico, normalizzazione livelli di confidenza, derivazione insight portfolio, tokenizzazione e pattern matching, selezione lezioni Academy, layout WebGL.

### Test 2: Scripts & Pipeline Test Suite
- **Comando:** `npm run test:scripts` (`node --test "scripts/**/*.test.js"`)
- **Esito:** **PASS** (567 passati, 0 falliti, 21 suite, durata 17.0s).
- **Aree testate:** Normalizzazione codici set, matching bilingue EN/JA, dry-run discovery, gestione boundary gap, checkpoint persistenti, sniffing magic bytes per validazione immagini.

### Test 3: Produzione Build Bundle
- **Comando:** `npm run build` (`vite build`)
- **Esito:** **PASS** (796 moduli trasformati, dist compilata in 5.84s).

---

## 7. STATO E QUALITÀ DEI DATI

### Classificazione Obbligatoria delle Fonti di Prezzo

1. **Prezzo osservato da fonte identificata (Asking / Market Price):**
   - `ygoprodeck` (208.860 record): asking price Cardmarket/TCGplayer aggregato.
   - `scryfall` (32.015 record): MTG market price in USD.
   - `cardmarket` (18.607 record): prezzi d'offerta medi e trend sul mercato europeo.
   - `tcgcsv` (5.186 record): snapshot giornalieri TCGplayer market price.
   - `justtcg` (3.682 record): varianti e prezzi API.
   - `tcgdex-cardmarket` (639 record): prezzo medio Cardmarket via TCGdex.
2. **Prezzo di vendita concluso (Sold Listings):**
   - `ebay_sold` (18.231 record): transazioni realmente concluse su eBay (completate negli ultimi 90 giorni).
3. **Stima derivata da più osservazioni (Fair Value Computato):**
   - `market_valuations` (8.997 record): calcolato con algoritmo deterministico (mediana, scarto, punteggio di confidenza ed esclusione outlier).
4. **Valore storico:**
   - Serie temporali archiviate in `market_observations` (369.863 record).
5. **Dati anomali o non verificabili:**
   - 8.105 record in `card_prices` presentano `price_market IS NULL` (contengono solo intervalli `price_low`/`price_high` o payload raw incompleto).
   - `price_market <= 0`: 0 record (nessun prezzo negativo rilevato).

---

## 8. RISCHI TECNICI, SICUREZZA E DIPENDENZE ESTERNE

1. **Timeout Serverless su Vercel (Hobby Tier):** Le chiamate che superano 10-15 secondi vanno in timeout HTTP 504. Sincronizzazioni massive devono avvenire via script o batch ridotti (max 20-30 carte per chiamata).
2. **Resend Domain Verification:** Il mittente `alerts@dragold.org` richiede che i record SPF/DKIM/DMARC siano verificati nel pannello Resend. Se il dominio non è validato, Resend restituisce `403 Forbidden`.
3. **Mancanza di valutazioni per MTG e YGO:** Nonostante la presenza di oltre 240.000 snapshot di prezzo tra MTG e YGO, `market_valuations` ha 0 righe per questi due giochi perché `compute-valuations.js` legge solo da `market_observations` (popolata solo per One Piece e Pokémon da TCGCSV).

---

## 9. OPPORTUNITÀ DI PRODOTTO ("BLOOMBERG PER CARTE")

| Opportunità | Problema Risolto | Utente Target | Evidenza di Domanda | Complessità | Raccomandazione |
|---|---|---|---|---|---|
| **Serie Storica Interattiva (Candlestick)** | Gli utenti vedono un prezzo singolo statico senza capire se la carta sta salendo o scendendo. | Collezionisti e investitori | Presente su tutti i portali concorrenti (PriceCharting, TCGplayer). | Bassa (usando `lightweight-charts`) | **PRIORITÀ 1** |
| **Arbitrage Scanner (EUR vs USD)** | Chi acquista in Europa su Cardmarket e rivende negli USA su TCGplayer non ha uno strumento automatico di spread al netto di tasse/spedizioni. | Rivenditori professionali | Frequente discussione nelle community; nessun tool multi-TCG automatico. | Media (richiede formule di shipping e dazi doganali) | **FASE SUCCESSIVA** |
| **Order Book / Depth Chart** | Visualizzare la concentrazione di venditori per fascia di prezzo e condizione. | Trader high-end | Funzionalità core di Cardmarket, ma frammentata. | Alta (richiede scraping continuo di decine di listing per carta) | **POSTICIPATA** |

---

## 10. PROSSIMA INIZIATIVA RACCOMANDATA

### Iniziativa: Integrazione TradingView Lightweight Charts nella Scheda Carta
- **Perché:** È il componente che trasforma istantaneamente DraGold da semplice catalogo a strumento analitico finanziario.
- **Dati già presenti:** 328.244 snapshot di prezzo e 369.863 osservazioni storiche già disponibili nel DB Supabase.
- **Tecnologia:** `lightweight-charts` (Apache 2.0, open source, 40KB, zero costi di licenza).
- **Esperimento minimo:** Mostrare un grafico temporale dell'andamento dei prezzi (Cardmarket EUR vs eBay Sold USD) nella pagina `/carta/:slug`.

---

## 11. ATTIVITÀ BLOCCATE IN ATTESA DI AUTORIZZAZIONE

1. **Deploy Edge Functions su Supabase:** Bloccato in attesa di autorizzazione ad aggiornare i segreti di produzione e lanciare il workflow CI/CD.
2. **Verifica Invio Email Resend:** Bloccato in attesa di autorizzazione per eseguire un test di invio reale verso una casella email di test e verificare lo stato dei record DNS su `dragold.org`.
3. **Esecuzione Ingestion Massiva:** Bloccato in attesa di pianificazione per evitare saturazione delle quote Supabase gratuite.

---

## 12. COMANDI PER RIPRODURRE LE VERIFICHE

```bash
# 1. Verifica unit test frontend
npm test

# 2. Verifica script e pipeline
npm run test:scripts

# 3. Verifica compilazione bundle
npm run build

# 4. Verifica stato git
git status

# 5. Verifica esclusione segreti
git check-ignore .env .env.local
```
