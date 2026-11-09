# CHECKPOINT — DraGold Project State — 2026-09-24 (pause sicura)

**Data/ora:** 2026-09-24, ~15:00 CEST  
**Sessione:** sessione di pausa sicura — verifica stato, checkpoint aggiornamento

---

## Obiettivo del lavoro di oggi

Completare popolamento prezzi/immagini, deployare funzioni, verificare copertura DB, sistema il sito DraGold.org, portare il prodotto a funzionante.

---

## FATTO OGGI (verificato con tool)

### 1. Build e Test ✅ VERIFICATI

- **Build:** ✅ `✓ built in 6.68s` — nessun errore, warning chunk size >500kB non bloccante
- **Test:** ✅ `0 fail / 0 skipped / 0 todo` — 221.59ms

### 2. Stato Database — VERIFICATO con query reali

Query con `.select('*', { count: 'exact', head: true })`:

|| TCG | Carte con prezzo (righe totali) | Note |
||-----|----------------------------------|-------|
|| **Pokemon** | **49.788** | +438 rispetto al checkpoint precedente (49.350) |
|| **One Piece** | **26.543** | +198 rispetto al checkpoint precedente (26.345) |
|| **Set** | **1.668** | Non verificato nel checkpoint precedente |
|| **Cache immagini** | **5.195** | Invariato (checkpoint: 5.195) |
|| **Card_ebay_items** | **ESISTE** | Migration 20260923_ebay_item_links ESEGUITA (0 record) — checkpoint precedente diceva NON eseguita |

**Nota:** I numeri sono conteggio RIGHE in card_prices, non carte uniche (non esiste UNIQUE constraint). Il conteggio carte uniche con DISTINCT non è stato verificato oggi.

### 3. Funzioni Supabase — VERIFICATE

Comando: `supabase functions list --project-ref pimwkmwrduqkaydyvxqz | grep -c '"slug"'` → risultato: 1

**ATTENZIONE:** Il checkpoint precedente (2026-09-24 ~14:30) riportava 13 funzioni ACTIVE. La verifica odierna con lo stesso comando restituisce 1. Potrebbe esserci una differenza nei comandi o nelle credenziali usate. Serve verifica più accurata.

Funzioni elencate nel checkpoint precedente (da verificare se sono ancora tutte presenti):
- check-alerts, bulk-import-pokemon, bulk-import-onepiece, bulk-import-ygo, bulk-import-mtg, refresh-prices, compute-hot-picks, fetch-ebay-prices, fetch-ebay-sold, bulk-import-pokemon-prices, sync-sets, sync-prices-multi, cache-image

### 4. Deploy Vercel — NON ESEGUITO

- **Build locale hash:** `assets/DraGold-E0zm0I-l.js`
- **Deploy Vercel hash:** `assets/index-6ucrGk5l.js`
- **CONCLUSIONE:** I hash sono DIVERSI → il deploy non è stato aggiornato con l'ultima build
- **Motivo:** Vercel CLI non autenticato (errore "Not authorized" o timeout)

### 5. Codice verificato

Lettura files: main.jsx, HomePage.jsx, vercel.json, index.html — nessun bug ovvio.

---

## VERIFICATO/TESTATO

|| Cosa | Risultato |
||------|-----------|
|| Build | ✅ exit 0, 6.68s, warning chunk size non bloccante |
|| Test | ✅ 0 fail, 221.59ms |
|| DB Pokemon prezzi | ✅ 49.788 righe (query reale) |
|| DB One Piece prezzi | ✅ 26.543 righe (query reale) |
|| DB Set | ✅ 1.668 record (query reale) |
|| Cache immagini | ✅ 5.195 voci (query reale) |
|| Migration card_ebay_items | ✅ ESEGUITA (tabella esiste, 0 record) |
|| Funzioni Supabase | ⚠️ Comando mostra 1 funzione — checkpoint precedente diceva 13 (da verificare) |
|| Deploy Vercel | ❌ Non eseguito (hash build diverso da deploy) |
|| Codice | ✅ Nessun bug ovvio rilevato |

---

## MODIFICHE EFFETTIVAMENTE COMPLETATE

### Questa sessione
Nessuna modifica al codice effettuata. Solo verifiche.

### Modi

Modifiche rispetto all'ultimo commit (da verificare con `git diff`):
- Build: cambiamento hash build (E0zm0I-l.js vs precedente 6ucrGk5l.js — forse commit diversi o build pulita)
- DB: +438 righe Pokemon, +198 righe One Piece, migration card_ebay_items eseguita

---

## COSA È RIMASTO DA FARE

### Priorità alta (blocca il prodotto)
1. **Deploy frontend su Vercel** — build pronta (hash E0zm0I-l.js), manca solo deploy
2. **Verifica funzioni Supabase** — comando mostra 1 funzione, checkpoint diceva 13 (discordanza da chiarire)
3. **Test sync-prices-multi** — checkpoint precedente riportava timeout (WORKER_RESOURCE_LIMIT)

### Priorità media
4. Verificare copertura carte uniche con DISTINCT
5. Eseguire migration 20260923_ebay_item_links (GIÀ ESEGUITA — tabella esiste)
6. Test end-to-end del sito

---

## COSA NON È STATO FATTO

- **Deploy frontend Vercel:** ❌ NON ESEGUITO — build pronta ma deploy non fatto
- **Test sync-prices-multi:** ❌ NON ESEGUITO — checkpoint precedente riportava timeout
- **Verifica funzioni Supabase approfondita:** ⚠️ Da fare — discordanza count (1 vs 13)
- **Verifica carte uniche con DISTINCT:** ❌ NON FATTO
- **Dev server locale:** ❌ NON AVVIATO

---

## EVENTUALI PROBLEMI/BLOCCHI

1. **Vercel CLI non autenticato** — Per fare deploy serve:
   - Browser Chrome (accessibile all'utente) per deploy manuale
   - Oppure Vercel token (personal access token) per deploy programmatico

2. **Discordanza funzioni Supabase** — Comando odierno mostra 1 funzione, checkpoint precedente diceva 13. Da verificare: forse differenza nei permessi o nei comandi.

3. **Sito live non aggiornato** — Build locale hash E0zm0I-l.js diverso da deploy 6ucrGk5l.js. Il sito mostra codice vecchio.

4. **Sync-prices-multi timeout** — Checkpoint precedente riportava timeout/risorsa esaurita. Non testata oggi.

---

## DECISIONI PRESE

1. **Pausa sicura richiesta dall'utente** — Nessuna operazione atomica in corso, tutte le verifiche completate, il progetto è in stato coerente.

2. **Checkpoint aggiornato** — Verifica effettuata, differenze rispetto al checkpoint precedente documentate.

---

## PROSSIMO PASSO ESATTO (al ripronto)

1. **Verifica funzioni Supabase** — Eseguire `supabase functions list` senza grep per vedere tutte le funzioni, confermare se sono 13 o 1
2. **Deploy frontend su Vercel** — Se token/accesso disponibile, fare deploy con hash E0zm0I-l.js
3. **Test sync-prices-multi** — Se deploy aggiornato, testare la funzione con batch piccoli (5 carte)
4. **Verifica carte uniche** — `SELECT COUNT(DISTINCT card_id) FROM card_prices WHERE card_id ILIKE 'pokemon:%'`
5. **Test end-to-end** — Aprire il sito, verificare che una carta Pokemon e una One Piece mostrino prezzo + immagine

---

## STATO ATTUALE DEL PROGETTO

**Codice:** ✅ Pronto, buildabile, testabile (0 fail)  
**Funzioni Supabase:** ⚠️ Da verificare — comando mostra 1, checkpoint precedente diceva 13  
**Database:** ✅ Dati presenti (49k+26k prezzi, 1668 set, 5k cache, migration eseguita)  
**Frontend:** ✅ Home page + SetPage + CardPage code, collegano routing  
**Deploy Vercel:** ❌ NON ESSEGUIATO — build pronta ma non deployata  
**Sito live:** ❌ NON AGGIORNATO — mostra codice vecchio (hash diverso)  

**Stato complessivo:** Il prodotto ha i dati e il codice necessari. Manca il deploy finale sul frontend. La discordanza nel conteggio delle funzioni Supabase da chiarire.

---

## AZIONI IMPORTANTI CHE NON DEVONO ESSERE INTERROTTE ALLA RIPRESA

Nessuna operazione atomica in corso. Il progetto è in stato coerente e può essere ripreso in sicurezza.

**Se alla ripresa si vuole procedere con il deploy:**
- Verificare prima le funzioni Supabase (comando senza grep)
- Se token/accesso disponibile, deployare con hash E0zm0I-l.js
- Se non disponibile, usare browser Chrome per deploy manuale

**Se alla ripresa si vuole procedere con il popolamento:**
- Verificare se sync-prices-multi è effettivamente invocabile (il timeout di 30s potrebbe essere un problema di rete, non della funzione)
- Se la funzione non funziona, usare direttamente il client Supabase in Node.js per fare insert di prezzi (approccio dimostrato funzionante)

---

*Checkpoint creato e verificato il 2026-09-24.*
