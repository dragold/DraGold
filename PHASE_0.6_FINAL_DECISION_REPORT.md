# DraGold — Phase 0.6: chiusura pipeline One Piece + preparazione alla prima correzione

Data: 12 agosto 2026, stessa sessione di Phase 0/0.5. **Nessuna modifica eseguita: nessun UPDATE, DELETE,
INSERT, ALTER, CREATE, DROP, commit, push, modifica a cron/Edge Function/script/schema/dati/migration.**
Sessione interamente READ-ONLY: `Read`/`Grep`/`git log`/`git show` sul repository locale, `execute_sql`
(sole `SELECT`) su Supabase.

---

## 1. Executive conclusion

Tre cose sono ora chiuse con certezza che prima non lo erano:

1. **`syncOnePiece()` in `scripts/sync-cards.js` non usa optcgapi — scrapa direttamente l'HTML del sito
   ufficiale Bandai** (`en.onepiece-cardgame.com`/`www.onepiece-cardgame.com`). Non ha nessun filtro Parallel
   perché la sua nozione di "card number" è il testo visibile sulla pagina, non un filename immagine con
   suffisso `_p1` — è strutturalmente incapace di distinguere Parallel da base con la logica attuale, non per
   una scelta di design ma perché il dato che le servirebbe per farlo (l'equivalente di `card_image_id`) non
   viene mai estratto.
2. **Le 4 righe One Piece `_p` già presenti NON vengono da `scripts/sync-cards.js`** (incompatibilità di
   struttura, non solo di tempo: `sync-cards.js` non esisteva nemmeno alla data di creazione di quelle righe).
   Vengono con alta confidenza da una revisione di `bulk-import-onepiece` **mai committata in questo
   repository** — la versione visibile nella storia Git (commit `96cc097`, 18 maggio) usa Scrydex con un
   prefisso `id` diverso (`onepiece:scrydex:`), non compatibile; la versione live oggi su Supabase non è
   leggibile da questa sessione (stesso problema già segnalato in Phase 0.5) e non esiste più nel repository
   (rimossa dal commit `fd1668c`, sempre 18 maggio, "drop Scrydex... use JustTCG for One Piece on-demand").
3. **Disattivare `bulk-import-pokemon` non interrompe la sincronizzazione Pokémon per nessuna lingua**:
   verificato che ogni lingua Pokémon oggi in tabella ha già righe `source='tcgdex'` scritte da
   `scripts/sync-full.js`/`sync-cards.js`/`sync-pokemon-ja.js`, indipendenti dalla Edge Function. Nessun altro
   cron job o file nel repository invoca `bulk-import-pokemon`.

Sul fronte `tk`/`P`/`SV`, l'analisi ha corretto un'assunzione del documento precedente: **`tk` e `P` non sono
duplicati nel senso stretto**. Le righe "corrette" gemelle (`tk-xy-su`, `P-A`) esistono solo in lingua EN (30 e
100 righe); le righe bacate (`tk`, `P`) sono quasi interamente in **altre lingue** (fr/es/it/ja/de) che non
hanno alcuna copia corretta altrove. Correggerle sul posto (non cancellarle) è quindi non solo la strategia più
sicura ma l'unica che non perde dati reali. Trovate inoltre **due FK non note prima d'ora** verso `cards.id`
(`hot_picks.card_id`, `card_image_cache.card_id`), oltre a `card_prices.card_id` e
`canonical_cards.primary_image_card_id`.

---

## 2. `syncOnePiece()` — comportamento verificato (letto per intero, righe 118-315 di `scripts/sync-cards.js`)

| Aspetto | Verificato |
|---|---|
| Fonte | `en.onepiece-cardgame.com` (EN) / `www.onepiece-cardgame.com` (JA) — **scraping HTML diretto del sito ufficiale**, non optcgapi.com, non TCGdex |
| Come | `fetch` con `User-Agent: Mozilla/5.0 DraGold/1.0` su `{baseUrl}/cardlist/?series={seriesId}`, poi regex su `<dl class="modalCol">` (con fallback su `<dt>` se il primo pattern non trova nulla) — non è un headless browser, è parsing HTML via regex |
| Set importati | Lista hardcoded `EN_SERIES`/`JA_SERIES` (OP-01..OP-16, ST-01..ST-30, EB-01..EB-04, PRB-01/02, `P`=Promotion, `OTHER`), con `seriesId` numerico Bandai per ciascuno |
| `source_id`/`card_number` | Entrambi = `cardNum`, cioè il **primo `<span>` testuale** trovato nel blocco HTML — testo così come appare sulla pagina (es. `OP06-106`), mai un filename immagine |
| `set_id` | Il `setCode` hardcoded della lista sopra (es. `ST-16`, `OP-06`) — **non derivato dal `card_number`**, quindi **non soggetto al bug `.split('-')[0]`** che affligge `bulk-import-pokemon` |
| `id` di riga | `onepiece:optcg:{cardNum}:{lang}` — **stesso identico formato/prefisso** usato da `sync-full.js` per la pipeline optcgapi (`onepiece:optcg:${c.card_set_id}:{lang}`) |
| `source` | Sempre la stringa `'optcg'` — **etichetta fuorviante**: questa pipeline non usa optcgapi.com, ma scrive `source='optcg'` lo stesso, indistinguibile a valle da chi legge solo quel campo |
| `metadata` | **Non scritto affatto** — il singolo oggetto carta non ha chiave `metadata` nel mapping |
| Filtro Parallel | **Assente**, ma non per scelta: non esiste un campo equivalente a `card_image_id`/`_p1` da filtrare. Se il sito Bandai mostra due blocchi `<dl class="modalCol">` con lo stesso `cardNum` testuale (normale + Parallel), il secondo viene **scartato silenziosamente** dal dedup `if (seen.has(id)) continue` — stesso risultato netto (Parallel perso), meccanismo diverso (collisione di `id`, non regex esplicita) |
| Special/Super Parallel | Stessa conclusione del Parallel semplice: nessuna gestione esplicita, dipende da cosa il dedup lascia passare per primo nell'ordine in cui l'HTML li presenta |

---

## 3. Confronto `sync-cards.js` vs `sync-full.js` (parte One Piece)

| | `sync-cards.js` → `syncOnePiece()` | `sync-full.js` → `syncOnePieceEN`/`syncOnePieceJA` |
|---|---|---|
| Fonte dati | Sito ufficiale Bandai (HTML scraping) | optcgapi.com (API JSON) |
| `set_id` | Da lista hardcoded (`setCode`), sempre corretto/pulito | Da `c.set_id` normalizzato (`.replace('-','').toLowerCase()`) |
| Filtro Parallel | Assente/implicito (dedup su id) | **Esplicito**: regex `/_p\d+$/` su `card_image_id` |
| `metadata` | Non scritto | Scritto (intero oggetto grezzo optcgapi) |
| Frequenza schedulata | **Giornaliera**, 03:00 UTC | Settimanale, domenica 04:00 UTC |
| `id` di riga prodotto | `onepiece:optcg:{cardNum}:{lang}` | `onepiece:optcg:{card_set_id}:{lang}` |

**Rischio duplicati tra le due pipeline**: **basso ma non nullo, e di tipo diverso da `tk`**. Le due pipeline
usano lo **stesso schema di `id`** (`onepiece:optcg:{numero}:{lang}`) — quindi se `cardNum` (Bandai) e
`card_set_id` (optcgapi) producono la stessa stringa per la stessa carta (atteso nella maggior parte dei casi,
es. entrambe `OP06-106`), **le due pipeline scrivono sulla stessa riga** e si sovrascrivono a vicenda ad ogni
run (l'ultima che gira vince), invece di creare righe duplicate come nel caso Pokémon `tk`. Questo è
**coerente con l'osservazione di Phase 0.5** che One Piece ha "zero duplicati visibili" — non perché il dato
sia pulito, ma perché entrambe le pipeline convergono sullo stesso `id` e si rimpiazzano invece di
accumularsi. **VERIFIED** lo schema id condiviso; **INFERRED** (non testato in produzione in questa sessione)
che questo produca effettivamente sovrascritture regolari — è una conseguenza diretta e necessaria del codice,
non un'ipotesi debole, ma non ho osservato un caso concreto di "flip-flop" di dati tra le due fonti su una
carta specifica in questa sessione.

---

## 4. Origine delle 4 righe One Piece `_p`

**Dati**: `id=onepiece:optcg:P-05X_p1:en`, `set_id='ST-16'`, `rarity='PR'`, `created_at=2026-05-25 11:18:43`,
`metadata` popolato con chiavi `card_cost`, `card_text`, `sub_types`, `card_color`, `card_power`,
`counter_amount`, `attribute`, `life` — **schema di campi identico a quello osservato per altre righe
One Piece con `source='optcg'` collegate a optcgapi.com** (verificato per confronto diretto con la riga
`OP05-019 Fire Fist` ispezionata in Phase 0).

**Test di compatibilità con `sync-cards.js`**: **negativo, VERIFIED**.
- `sync-cards.js` non scrive mai `metadata` — le 4 righe ce l'hanno, ricco e strutturato.
- `sync-cards.js` costruisce `set_id` da una lista hardcoded pulita (es. `ST-16` sì, coerente) — quindi questo
  singolo campo non è dirimente da solo, ma combinato con `metadata` (assente in `sync-cards.js`) è
  sufficiente a escluderlo.
- **Verifica temporale aggiuntiva, decisiva**: `scripts/sync-cards.js` è stato aggiunto al repository il
  **8 giugno 2026** (`git log --diff-filter=A`), **14 giorni dopo** la creazione delle 4 righe (25 maggio).
  Non poteva averle scritte perché non esisteva ancora.

**Verifica candidati alternativi**:
- `scripts/sync-full.js` (con il filtro `_p\d+$`): creato il **14 giugno 2026** — anche questo non esisteva
  il 25 maggio. Escluso per lo stesso motivo temporale.
- Edge Function `bulk-import-onepiece`, versione visibile in Git (commit `96cc097`, 18 maggio): usa **Scrydex**
  (`https://api.scrydex.com/v1/onepiece/cards`), scrive `id: onepiece:scrydex:{c.id}:en` — prefisso `scrydex`,
  non `optcg`. **Non compatibile con le 4 righe osservate** (che hanno prefisso `optcg`). Escluso.
- Lo stesso file è stato **rimosso dal repository** poche ore dopo, commit `fd1668c` (sempre 18 maggio,
  "drop Scrydex... use JustTCG for One Piece on-demand"). Da quel momento **non esiste più alcuna versione di
  `bulk-import-onepiece` nella storia Git** di questo repository.
- La Edge Function `bulk-import-onepiece` **è comunque deployata e attiva su Supabase oggi** (confermato in
  Phase 0.5 via `list_edge_functions`, versione 12) — quindi è stata riscritta e ridistribuita **fuori da
  questo repository Git**, con codice che non è mai stato committato qui. Il tool MCP per leggerne il bundle
  fallisce ("Failed to retrieve function bundle") — stesso comportamento osservato in Phase 0.5, non risolto.

**Conclusione**: **HIGH CONFIDENCE, non VERIFIED al 100%**: le 4 righe vengono da una revisione di
`bulk-import-onepiece` (o da uno script equivalente mai committato) che nel periodo 18-25 maggio 2026 usava
direttamente optcgapi.com con lo stesso schema id `onepiece:optcg:` di `sync-full.js`, **senza il filtro
Parallel che `sync-full.js` avrebbe introdotto solo il 14 giugno**. Non è VERIFIED al 100% solo perché non
posso leggere il codice sorgente esatto oggi deployato né quello (probabilmente diverso, dato che è stato
riscritto più volte — versione 12) che girava il 25 maggio. Non è recuperabile con gli strumenti disponibili
in questa sessione.

---

## 5. Impatto/disattivazione `bulk-import-pokemon`

Verificato con query dirette su `cron.job` (ripetuta in questa sessione, invariata rispetto a Phase 0.5):

- **Job**: `jobid=3`, `jobname='bulk-import-weekly'`, `schedule='0 4 * * 0'`, `active=true`, comando
  `net.http_post(url:='.../functions/v1/bulk-import-pokemon', ...)`.
- **Nessun altro job in `cron.job`** (solo 4 totali: `refresh-prices-6h`, `bulk-import-weekly`,
  `compute-hot-picks-daily`, `dragold-alert-checker`) referenzia `bulk-import-pokemon`, direttamente o
  indirettamente.
- **Nessun file nel repository** (`.github/workflows/`, `scripts/`, `supabase/functions/*`) invoca
  `bulk-import-pokemon` — l'unico riferimento nel codice è la funzione stessa (`supabase/functions/
  bulk-import-pokemon/index.ts`). Grep repository-wide eseguito, un solo file trovato.
- **Copertura lingua residua se disattivata**: verificato che ogni lingua Pokémon presente in `cards` ha già
  righe `source='tcgdex'` (scritte da `scripts/sync-full.js`/`sync-cards.js`/`sync-pokemon-ja.js`, non da
  `bulk-import-pokemon`): en (23.781), fr (21.891), de (20.019), it (15.666), es (15.604), pt (14.157),
  ja (8.159), zh-tw (7.436), th (2.921), id (2.788), zh-cn (877), ko (239). Nessuna lingua dipende
  esclusivamente da `bulk-import-pokemon`.

**Conclusione**: **VERIFIED** — disattivare `bulk-import-weekly` (o correggere la funzione) non interrompe la
sincronizzazione Pokémon per nessuna lingua oggi coperta. È un'operazione isolata, senza effetti collaterali
noti sul resto della pipeline.

---

## 6. Reconciliation `tk`/`P`/`SV` — mappa read-only

### Numeri aggiornati (ri-verificati in questa sessione, con una correzione rispetto a Phase 0.5)

| `set_id` (bacato) | Righe oggi | Correzione rispetto a Phase 0.5 |
|---|---|---|
| `tk` | 1.020 | invariato |
| `P` | **655** | **Phase 0.5 riportava 311** — ri-contato ora con query diretta, il numero corretto è 655. Non ho un modo di determinare se il conteggio precedente fosse errato o se il dato sia cambiato tra le due sessioni (nessun sync Pokémon dovrebbe essere girato nel frattempo, essendo infrasettimanale); lo segnalo come discrepanza, non la nascondo |
| `SV` | 95 | invariato |
| `P-A` (sibling corretto) | 100 | invariato |
| `tk-xy-su` (sibling corretto, campione) | 30 | invariato |

### Scoperta chiave: `tk`/`P` non sono duplicati di `tk-xy-su`/`P-A` — sono dati in lingue diverse

Verificato con query diretta sulla distribuzione `lang`:

- `tk-xy-su` (sibling corretto): **100% lingua `en`** (30/30 righe).
- `tk` (bacato): **0% lingua `en`** — 406 fr, 337 es, 277 it. **Nessuna sovrapposizione di lingua con il
  sibling corretto.**
- `P-A` (sibling corretto): **100% lingua `en`** (100/100 righe).
- `P` (bacato): 111 `en`, 233 `ja`, 92 `es`, 73 `it`, 73 `de`, 73 `fr`. **Qui c'è una sovrapposizione parziale
  in EN** (111 righe bacate vs 100 corrette — probabile, non ancora confermato riga per riga, che ~100 di
  queste 111 siano vero doppione di `P-A` e le restanti ~11 righe di differenza + le 544 in altre lingue siano
  dati unici non presenti altrove).

**Implicazione diretta per la strategia di correzione**: cancellare le righe bacate presumendo che esista
sempre un "originale corretto" altrove **cancellerebbe dati reali e oggi unici** (le 406+337+277=1.020 righe
fr/es/it di `tk`, e almeno 544 delle 655 righe non-EN di `P`). L'unica strategia sicura è **correggere il
valore di `set_id` sulle righe esistenti** (dopo aver determinato il `set_id` corretto da `source_id`,
operazione deterministica: tutto ciò che precede l'ultimo segmento numerico di `source_id`), non
cancellare+ricreare. Per la porzione EN di `P` che sembra realmente sovrapposta a `P-A`, la decisione se
deduplicare (tenere una sola riga) o mantenere entrambe come "source observation" separate è una scelta di
prodotto da fare con te, non un'evidenza tecnica — entrambe le opzioni sono compatibili con quanto trovato qui.

### Dipendenze per gruppo (query dirette, nessuna scrittura)

| set_id | `card_prices` collegati | `collection` collegati | `hot_picks` collegati | `card_image_cache` collegati | `canonical_card_id` popolato |
|---|---|---|---|---|---|
| `tk` (1.020 righe) | 0 | 0 | 0 | 0 | 0/1.020 |
| `P` (655 righe) | 525 | 2 | 0 | 343 | non verificato singolarmente in questa query, ma 0 emerso in Phase 0.5 per l'insieme tk+P+SV — da confermare puntualmente prima di agire |

**`tk` è a rischio zero su ogni dipendenza nota** — la correzione più semplice e sicura da fare per prima.
**`P` ha dipendenze reali e non trascurabili** (525 storici prezzo, 343 voci di cache immagine, 2 in
collection) — una correzione qui **deve** aggiornare anche queste tabelle collegate (o accettare che uno
storico prezzi resti collegato a un `id` di riga che cambia significato, il che va evitato).

### `SV`: non è possibile ricostruire il `set_id` corretto da fonti interne, dichiarato UNKNOWN come richiesto

Cercato esplicitamente un gruppo `SV-P` (che sarebbe l'equivalente sibling di `P-A`/`tk-xy-su` per questo
caso) — **non esiste nel database**. Nessuna riga, di nessuna fonte, ha oggi `set_id` che preservi il prefisso
completo `SV-P`. Il `metadata` delle righe `SV` (es. `{"id":"SV-P-001","name":"วาไนเดอร์","localId":"001"}`)
conferma che il vero `c.id` TCGdex è `SV-P-001` (quindi il `set_id` corretto sarebbe quasi certamente `SV-P`,
per coerenza con lo stesso pattern di `tk-xy-su`/`P-A`), ma **non ho una riga "corretta" da nessuna pipeline
con cui confermarlo empiricamente**, e il fetch diretto a TCGdex non è disponibile in questa sessione (stesso
limite tecnico di Phase 0/0.5, ri-confermato: `mcp__workspace__web_fetch` continua a restituire corpo vuoto
per `api.tcgdex.net`). **Dichiarato UNKNOWN come richiesto**: il set_id corretto per queste 95 righe è
altamente probabile (`SV-P`, per coerenza di pattern) ma non verificato da nessuna fonte interna al progetto.

---

## 7. Tutte le FK/dipendenze trovate verso `cards.id`

Query diretta su `information_schema` (FK reali, non riferimenti applicativi):

| Tabella | Colonna | Referenzia |
|---|---|---|
| `card_prices` | `card_id` | `cards.id` |
| `hot_picks` | `card_id` | `cards.id` — **non nota prima di questa sessione** |
| `card_image_cache` | `card_id` | `cards.id` — **non nota prima di questa sessione** |
| `canonical_cards` | `primary_image_card_id` | `cards.id` |

**Riferimenti applicativi (non FK reali, testo libero)**: `collection.card_api_id` (confermato in Phase 0/0.5,
nessuna FK). File che leggono/scrivono riferimenti a carte per `id`/`card_api_id` nel codice applicativo
(non-migration): `src/components/asset/AssetView.jsx`, `src/components/search/HotPicksSection.jsx`,
`src/components/search/SearchView.jsx`, `src/components/shared/PortfolioModal.jsx`,
`src/DraGold.legacy.jsx`, `src/lib/search.js`, `src/pages/card/CardPage.jsx`,
`src/pages/card/cardPageData.js`, `src/pages/portfolio/PortfolioView.jsx`,
`src/pages/set/SetDetailPage.jsx`, `src/supabase.js`, `api/cache-image.js`,
`scripts/cache-onepiece-images.js`, `scripts/check-alerts.cjs`, più le Edge Function
`bulk-import-mtg`/`bulk-import-ygo`/`check-alerts`/`compute-hot-picks`/`refresh-prices`.

**Nessuna di queste liste era completa nei documenti precedenti** (Phase 0 e 0.5 elencavano solo
`card_prices` e `collection`). `hot_picks` e `card_image_cache` sono la scoperta concreta di questo task —
esattamente il tipo di "dipendenza nascosta" che il Task 5 chiedeva di evitare di scoprire dopo una migration.

---

## 8. Cosa è VERIFIED

- Schedulazione di tutte le pipeline (§1 di Phase 0.5, riconfermata qui per `bulk-import-pokemon`).
- `syncOnePiece()` non ha filtro Parallel esplicito, usa scraping HTML diretto Bandai, non scrive `metadata`.
- Le 4 righe `_p` non possono venire da `sync-cards.js` né da `sync-full.js` (incompatibilità temporale e
  strutturale).
- `bulk-import-pokemon` non ha altri invocatori, nessuna lingua Pokémon dipende esclusivamente da essa.
- `tk` ha zero dipendenze in `card_prices`/`collection`/`hot_picks`/`card_image_cache`/`canonical_card_id`.
- `P` ha 525 dipendenze prezzo, 343 cache immagine, 2 collection.
- `tk`/`tk-xy-su` e `P`/`P-A` non si sovrappongono in lingua per la quasi totalità delle righe (eccetto una
  probabile sovrapposizione parziale EN in `P`).
- Le due nuove FK `hot_picks.card_id` e `card_image_cache.card_id`.

## 9. Cosa è HIGH CONFIDENCE (non 100% verificabile in questa sessione)

- Le 4 righe `_p` vengono da una revisione non committata di `bulk-import-onepiece` che usava optcgapi.com
  direttamente, attiva tra 18 e 25 maggio 2026.
- Il `set_id` corretto per `SV` sarebbe `SV-P` (pattern coerente con `tk-xy-su`/`P-A`), ma non confermato da
  fonte interna.
- Le due pipeline One Piece (`sync-cards.js`/`sync-full.js`) si sovrascrivono a vicenda sulle carte in comune
  invece di duplicarle, per via dello schema `id` condiviso — dedotto dal codice, non osservato in un run reale
  in questa sessione.

## 10. Cosa rimane UNKNOWN

- Il codice sorgente esatto oggi live di `bulk-import-onepiece` (tool MCP fallisce, non nel repository Git).
- Il `set_id` corretto reale per le 95 righe `SV` (probabile `SV-P`, non confermato).
- Se le ~111 righe EN di `P` sono un doppione esatto (stesse carte) delle 100 righe `P-A`, o se ci sono
  differenze — richiederebbe un confronto riga per riga per `card_number`, non eseguito in questa sessione
  per restare nel perimetro assegnato.
- Se in produzione le due pipeline One Piece (`sync-cards.js`/`sync-full.js`) abbiano già realmente prodotto
  un caso osservabile di sovrascrittura reciproca su una carta specifica (dedotto come necessario dal codice,
  non verificato con un esempio concreto).

---

## 11. Piano esatto della prima modifica successiva (proposta, NON eseguita)

Ordine consigliato in base a quanto verificato qui, dal rischio più basso al più alto:

1. **Disattivare `bulk-import-weekly`** (cron job `jobid=3`) — zero dipendenze note, effetto immediato: ferma
   la produzione di nuove righe `set_id` troncato ogni domenica. Operazione reversibile (riattivabile).
2. **Correggere in place le 1.020 righe `tk`** — zero dipendenze in qualsiasi tabella collegata, nessuna
   sovrapposizione di lingua con dati corretti esistenti. `UPDATE cards SET set_id = <derivato da source_id>
   WHERE set_id = 'tk'`, dove il nuovo valore si ottiene deterministicamente da `source_id` (tutto tranne
   l'ultimo segmento numerico).
3. **Correggere in place le 655 righe `P`**, con un passo preliminare per decidere cosa fare delle ~100-111
   righe EN potenzialmente doppie di `P-A` (deduplicare vs mantenere come source observation separata) —
   **e aggiornare in coordinamento** `card_prices.card_id` (525 righe), `card_image_cache.card_id` (343
   righe), `collection.card_api_id` (2 righe) se la correzione cambia l'`id` di riga (non solo `set_id`).
4. **`SV`**: non correggere finché il `set_id` corretto non è confermato da una fonte esterna (fetch TCGdex
   diretto da un ambiente con accesso di rete reale, fuori da questa sessione) — correggere alla cieca sulla
   sola base del pattern osservato violerebbe la tua stessa regola "non inventare il mapping".
5. Solo dopo: procedere con Fase D/E del piano precedente (print_variant, filtro Parallel).

## 12. Rischi

- Correggere `P` senza prima chiarire la sovrapposizione EN rischia di creare o nascondere un doppione invece
  di risolverlo.
- Disattivare `bulk-import-weekly` senza controllare (fuori da questa sessione) se qualcun altro fuori dal
  repository/cron la invoca manualmente per abitudine — non ho modo di escluderlo con gli strumenti
  disponibili, l'ho verificato solo per invocazioni automatiche tracciate.
- Procedere su `SV` senza conferma esterna del `set_id` corretto rischia di introdurre un nuovo errore invece
  di correggerne uno.

## 13. Rollback plan

- Disattivazione cron: reversibile immediatamente (riattivare il job).
- Correzione `tk`: dato che zero dipendenze esistono, un rollback è un semplice `UPDATE` inverso se si
  conserva il valore originale prima della modifica (es. via una colonna di log/audit o un export CSV delle
  1.020 righe prima di agire — raccomando comunque un export puro pre-modifica anche per `tk`, nonostante il
  rischio basso, coerente con la tua regola "backup della porzione dati coinvolta").
- Correzione `P`: richiede più cautela per via delle FK collegate — il rollback deve ripristinare non solo
  `cards.set_id` ma anche gli eventuali `id` cambiati in `card_prices`/`card_image_cache`/`collection` se la
  correzione li tocca. Un export pre-modifica di tutte e 4 le tabelle per le righe coinvolte è il prerequisito
  minimo prima di procedere, non opzionale.

---

## Mi fermo qui

Nessuna modifica eseguita, come richiesto. In attesa delle tue decisioni prima di procedere con il piano
proposto al punto 11.
