# DraGold — Implementation Plan (Phase 0 closure + pre-approval package)
### CARD ENTITY → PRINT/VARIANT → PRODUCTS → COLLECTION/GRADING

Data: 12 agosto 2026, stessa sessione di `MASTER_DATA_MODEL_AUDIT.md`. **Nessuna modifica a codice, schema,
dati. Nessuna migration, nessun backfill, nessun sync, nessun commit, nessun push.** Questo documento chiude
Phase 0 (A, B, C) e produce l'output richiesto per approvazione. **Mi fermo qui, come richiesto — nessuna
implementazione fino a tua approvazione esplicita.**

---

## FASE A — Come viene popolato `canonical_cards`/`canonical_card_id`

**VERIFIED, non più solo inferred.**

- Nessun trigger Postgres su `cards`/`canonical_cards` (`information_schema.triggers` interrogata
  direttamente, risultato vuoto).
- Nessuna funzione/procedura Postgres referenzia `canonical_cards` (`information_schema.routines`
  interrogata: gli unici match per "canonical" sono `int4range_canonical`/`int8range_canonical`/
  `daterange_canonical`, funzioni built-in Postgres non correlate).
- Nessuno script in `scripts/` scrive su `canonical_cards`.
- Nessuna Edge Function scrive su `canonical_cards` (ho letto per intero `bulk-import-pokemon`; le altre
  Edge Function per nome — `refresh-prices`, `compute-hot-picks`, `sync-sets`, `bulk-import-*`, `check-alerts`,
  `fetch-ebay-*` — non hanno un ruolo plausibile di canonicalizzazione dato cosa fanno; `bulk-import-onepiece`
  non è stato leggibile per un errore del tool MCP Supabase, "Failed to retrieve function bundle", **ripetuto
  due volte** — segnalo come gap tecnico, non come conferma di assenza).
- **Prova diretta e decisiva**: `canonical_cards.created_at` va da `2026-08-05 17:26:25` a
  `2026-08-05 17:40:08` — **14 minuti, un'unica finestra**, per tutte le 87.189 righe. Non è un processo
  continuo, è stato un **batch one-shot**.
- **Conferma ulteriore**: le righe `cards` create **dopo** il 5 agosto hanno `canonical_card_id` sistematicamente
  nullo (0% di copertura per la settimana del 10 agosto, 100% nullo), mentre le righe create prima del 5 agosto
  hanno una copertura quasi completa (il batch ha coperto retroattivamente anche lo storico esistente a quel
  momento). **Oggi, 12 agosto, 8.257 righe `cards` non hanno alcun gruppo canonico** (era 8.137 il 9 agosto —
  il gap cresce di qualche decina/centinaia di righe a ogni sync, come atteso da un processo che non gira più).

**Conclusione Fase A**: `canonical_cards` non è un processo vivo, è stato un **backfill manuale una tantum**
eseguito il 5 agosto 2026 (con ogni probabilità via SQL Editor Supabase, coerente con quanto già osservato il
9 agosto sull'assenza di migration tracciate). **Ogni carta sincronizzata dopo quella data è orfana di
canonical group.** Questo è un gap operativo reale e prioritario: qualunque lavoro sul livello PRINT costruito
sopra `canonical_cards` erediterebbe lo stesso problema se non si ripristina prima un meccanismo che tenga
`canonical_cards` aggiornato ad ogni sync (non necessariamente un trigger — anche un passo esplicito a fine di
ogni script di sync andrebbe bene, ma **deve esistere**).

---

## FASE B — `set_id = 'tk'`: causa confermata, non più solo ipotesi

**VERIFIED al 100%, root cause trovata nel codice, non serve più un fetch esterno a TCGdex per chiuderla.**

Ho trovato ed è stato possibile leggere per intero una **terza pipeline di sync non documentata nei report
precedenti**: le Supabase **Edge Functions** (`bulk-import-pokemon`, `bulk-import-onepiece`,
`bulk-import-ygo`, `bulk-import-mtg`, più `refresh-prices`, `compute-hot-picks`, `sync-sets`,
`bulk-import-pokemon-prices`, `check-alerts`, `fetch-ebay-prices`, `fetch-ebay-sold`) — completamente separate
dagli script Node in `scripts/`, scritte in Deno/TypeScript, non presenti come file nel repository locale (solo
recuperabili via l'API Supabase). Nessuno dei report precedenti le aveva individuate perché tutti si erano
concentrati su `scripts/*.js`.

**La riga di codice esatta in `bulk-import-pokemon/index.ts`**:
```ts
const res = await loggedFetch(supabase, 'tcgdex', `https://api.tcgdex.net/v2/${lang}/cards`, ...)
// ...
const chunk = cards.slice(i, i + 500).map((c) => ({
  id:           `pokemon:tcgdex:${c.id}:${lang}`,
  source:       'tcgdex',
  source_id:    c.id,
  set_id:       (c.id || '').split('-')[0] || null,   // ← BUG
  card_number:  c.localId || null,
  rarity:       null,                                  // ← hardcoded null, non c.rarity
  set_name:     null,                                  // ← hardcoded null
  metadata:     c,                                      // ← intero oggetto TCGdex grezzo, incluso variants!
  ...
}))
```
Questa funzione usa l'endpoint TCGdex **flat** `/v2/{lang}/cards` (lista di tutte le carte, non per-set), dove
il campo `c.id` di TCGdex è già una stringa composta (es. `tk-xy-su-4` per un Trainer Kit). Il codice fa
`.split('-')[0]` per "estrarre il set" — ma questo funziona solo se l'id ha **un solo trattino**. Per gli id
compositi (Trainer Kit, alcune promo) tronca tutto dopo il primo trattino.

**Prova incrociata diretta nel database**: esistono contemporaneamente, per lo stesso mini-mazzo:
- righe con `set_id = 'tk'` (1.020 righe, scritte da questa Edge Function) — **sbagliate**
- righe con `set_id = 'tk-xy-su'`, `'tk-xy-w'`, `'tk-bw-e'`, ecc. (30 righe ciascuna, corrette) — scritte
  dagli script `scripts/sync-full.js`/`sync-cards.js`, che usano invece l'endpoint `/v2/{lang}/sets` (lista
  set) dove TCGdex restituisce l'id set già separato correttamente.

**Sono la stessa carta fisica scritta due volte da due pipeline diverse, con due `id` di riga diversi** (quindi
l'upsert non se ne accorge, entrambe le versioni coesistono). Non è più necessario un fetch esterno a TCGdex
per confermarlo: **il bug è deterministico e riproducibile leggendo solo il codice DraGold**.

**Portata più ampia del previsto**: lo stesso pattern `(c.id || '').split('-')[0]` colpisce **ogni** id TCGdex
con più di un trattino, non solo `tk`. Trovati con la stessa firma in questa sessione: `set_id = 'P'` (311
righe, id reali tipo `P-A-001` → dovrebbe essere `P-A`), `set_id = 'SV'` (95 righe, id tipo `SV-P-001`),
`set_id = 'M-P'` (83 righe, id tipo `M-P-001`). Per questi tre **non ho trovato in questa sessione una riga
"corretta" gemella** come per `tk` (potrebbe non esistere ancora, o TCGdex potrebbe non esporli anche
nell'endpoint `/sets` — **UNKNOWN**, da verificare prima di correggere). `2018sm`/`2019sm` (con suffisso
`-fr-N`) **non li tratto come bug**: qui non ho evidenza che il "vero" set id TCGdex sia diverso da `2018sm` —
è plausibile che `fr-N` sia davvero un localId composito (numerazione francese), nel qual caso il codice attuale
è corretto per questi. Non lo affermo con certezza, lo marco **UNKNOWN**, non lo includo nella stima di righe
da correggere.

**Riepilogo righe coinvolte, verificato con query dirette**: 1.020 (`tk`, causa confermata) + 311 (`P`) + 95
(`SV`) + 83 (`M-P`) = **1.509 righe con alta probabilità della stessa causa**, di cui solo le 1.020 `tk` hanno
oggi una controparte corretta verificabile nel database per confronto diretto.

---

## FASE C — One Piece: Parallel / Special / Super Parallel, e chiusura "Simple"

**Parallel**: confermato di nuovo in questa sessione (fetch diretto OP-06, 23/128 righe con suffisso `_p1`) e
nella sessione precedente — riconfermo, non ripeto la query. **Nuovo dato di questa sessione**: esistono già
**4 righe** in `cards` (tcg=onepiece) il cui `source_id` contiene un pattern `_p` — quindi il filtro
`/_p\d+$/` non ha bloccato *tutto*, sempre; **UNKNOWN il motivo esatto** di queste 4 eccezioni (possibile
pipeline diversa, possibile filtro applicato solo in alcuni run) — da ispezionare prima di attivare la
rimozione del filtro, per capire se trattarle come "già corrette" o se vanno riconciliate.

**Super Parallel/Special Card**: nessuna riga con suffisso `_p2`/`_p3` trovata nei campioni fetchati finora
(solo OP-06 verificato con fetch diretto in questa e nella sessione precedente) — **UNKNOWN** se esistano nel
resto del catalogo, il regex del codice (`_p\d+$`) è comunque già scritto per gestirli se/quando compaiono.

**"Simple"**: nessuna nuova evidenza trovata in questa sessione (non ho ripetuto tutte le query già fatte per
non duplicare lavoro). **Resta UNKNOWN, non introdotto nel modello**, come da istruzione esplicita. Ribadisco:
se hai una fonte precisa (screenshot, URL, nome del tool/marketplace) lo verifico mirato.

---

## OUTPUT RICHIESTO

### 1. Stato attuale verificato (numeri di oggi, 12 agosto, non quelli di 3 giorni fa)

| Metrica | Valore | Fonte |
|---|---|---|
| Righe `cards` totali | 201.059 | query diretta |
| — Pokémon | 154.017 | query diretta |
| — One Piece | 5.195 | query diretta |
| `cards.print_variant` popolato | 0 | query diretta |
| Righe `canonical_cards` | 87.189 | query diretta, invariato dal 5 agosto |
| Righe `cards` senza `canonical_card_id` | 8.257 (in crescita, era 8.137 il 9 agosto) | query diretta |
| Righe `collection` | 49 (in crescita, era 24 il 9 agosto) | query diretta |
| Righe One Piece con pattern `_p` già presenti | 4 | query diretta, causa UNKNOWN |
| Righe `set_id='tk'` (bug confermato) | 1.020 | query diretta |
| Righe `set_id` con probabile stesso bug (`P`, `SV`, `M-P`) | 1.509 totali incluso `tk` | query diretta, causa non confermata quanto `tk` |

### 2. Cosa è già corretto (non toccare)

- `canonical_cards` come livello CARD ENTITY concettualmente (unique key, FK, uso da ricerca/pagina carta) —
  **corretto nel design**, solo **fermo nel tempo** (Fase A).
- `groupByCanonical` (`src/lib/search.js`) e `cardPageData.js` — raggruppamento per `canonical_card_id`
  rigoroso, nessuna euristica fragile, **non li tocco**.
- `scripts/sync-full.js`, `scripts/sync-cards.js`, `scripts/sync-pokemon-ja.js` — derivano `set_id` in modo
  corretto (dall'endpoint `/sets`, non dall'endpoint flat `/cards`). **Non è la fonte del bug `tk`.**
- Il filtro regex `/_p\d+$/` in `sync-full.js` è scritto correttamente per quello che doveva fare (bloccare
  intenzionalmente i Parallel) — è una scelta di design da invertire, non un bug di implementazione.

### 3. Cosa è realmente rotto

- **`canonical_cards` non è più alimentato da nulla** dal 5 agosto — priorità più alta di qualunque lavoro
  sul livello PRINT, perché costruire PRINT sopra un'entità che smette di crescere significa che ogni nuova
  carta sincronizzata resta invisibile al livello CARD ENTITY.
- **`bulk-import-pokemon` Edge Function** scrive `set_id` sbagliato per id TCGdex compositi (1.020 righe
  confermate `tk`, altre 489 probabili `P`/`SV`/`M-P`), **e** scrive `rarity`/`set_name` sempre `null` per
  tutte le righe che processa (non solo per i casi con trattino) — quindi **oltre al bug set_id, questa
  pipeline degrada la qualità dati anche per le carte con set_id corretto**, sovrascrivendo potenzialmente
  dati migliori scritti in precedenza da `scripts/sync-full.js` per la stessa carta se gira dopo (dipende
  dall'`id` di riga: se coincide c'è overwrite, se no crea un duplicato — non ho verificato quale dei due casi
  sia più comune, **UNKNOWN**, da chiarire prima di decidere se disattivare questa Edge Function o solo
  correggerla).
- Portfolio: `addToCollection()` sovrascrive invece di accumulare copie — confermato di nuovo, invariato.
- One Piece Parallel: scartate per design, confermato di nuovo.

### 4. Gap di conoscenza ancora aperti (onestamente, non risolti in questa sessione)

- Perché esistono **due pipeline di sync parallele e non coordinate** per Pokémon (`scripts/*.js` via
  GitHub Actions presumibilmente, ed Edge Functions via Supabase) — quale delle due è quella "attiva"/
  programmata oggi, quale è legacy? Non verificabile dal solo codice, serve controllare i cron/schedule
  reali (GitHub Actions workflow file esistono in `.github/workflows/` — visti nell'elenco file ma non letti
  in dettaglio in questa sessione; gli schedule delle Edge Function non sono visibili dagli strumenti usati
  qui).
- Perché `bulk-import-onepiece` non è leggibile (errore tool ripetuto) — potrebbe contenere un'altra versione
  del filtro Parallel, diversa da quella in `scripts/sync-full.js`, che spiegherebbe le 4 righe `_p` già
  presenti.
- Se `P`/`SV`/`M-P` sono davvero lo stesso bug di `tk` o un caso diverso — non ho una controparte "corretta"
  da confrontare come per `tk`.
- Il meccanismo esatto di scheduling GitHub Actions vs Edge Functions non è stato mappato in questa sessione
  (fuori perimetro "audit dati", servirebbe leggere `.github/workflows/*.yml` per esteso — non fatto qui per
  restare dentro lo scope Phase 0 richiesto).

### 5. Schema target (riproposto da `MASTER_DATA_MODEL_AUDIT.md`, invariato — nessuna nuova idea, solo conferma che regge dopo Fase A/B/C)

```
canonical_cards (esistente)          ← CARD ENTITY, richiede fix Fase A prima di build sopra
  cards (esistente, da estendere)     ← diventa il livello PRINT via print_variant popolato
    print_variant (esistente, 0%)     ← finish/artwork
    lang (esistente)                  ← language
    source/source_id (esistenti)      ← provenance, + nuovo campo is_primary
products (nuova tabella)
  product_contents (nuova tabella)
collection (esistente, da estendere)  ← + card_print_id, nuova unique key, quantity davvero usato
```

### 6. Migration plan (solo additivo, nessun DROP)

1. Nessuna migration per Fase A — è un problema di **processo mancante**, non di schema. Richiede decidere
   *come* far ripartire l'alimentazione di `canonical_cards` (opzione minima: uno script `sync-canonical.js`
   che gira dopo ogni sync e fa upsert su `canonical_cards` per le combinazioni `(tcg,set_id,card_number)`
   non ancora presenti — additivo, zero rischio sulle righe esistenti).
2. `ALTER TABLE cards ADD COLUMN IF NOT EXISTS is_primary boolean DEFAULT false` — per Fase F (source
   priority), colonna nuova, default sicuro.
3. `CREATE TABLE products (...)`, `CREATE TABLE product_contents (...)` — additive, zero impatto su tabelle
   esistenti.
4. `ALTER TABLE collection ADD COLUMN IF NOT EXISTS card_print_id text` (nullable) — additiva, le 49 righe
   esistenti restano valide con `card_print_id = NULL` finché non backfillate.
5. Cambio della unique key `collection` da `(user_id, card_api_id)` a qualcosa che includa condition/grading —
   **questa è l'unica modifica di questa lista che cambia un comportamento esistente**, va fatta per ultima e
   testata a parte (§9).

### 7. Backfill plan

- `print_variant` Pokémon: backfill incrementale per lingua (EN prima, come da priorità CLAUDE.md), leggendo
  `variants` da TCGdex per le carte già in `cards` — **stima 154.017 righe potenzialmente coinvolte**, ma
  realisticamente eseguibile in fasi da poche migliaia per rispettare i rate limit già usati da
  `enrich-cards.js` (stesso pattern di "coda autoconsumante" già scritto e funzionante, riusabile).
- `canonical_cards`: backfill delle 8.257 righe oggi orfane, con la stessa logica del batch del 5 agosto
  (upsert su `(tcg,set_id,card_number)`), **poi** attivare il processo continuo di Fase A.
- `set_id='tk'`/`P`/`SV`/`M-P`: **non backfill diretto senza prima decidere la strategia** — dato che esistono
  già righe corrette gemelle per `tk` (con `id` diverso), l'opzione più sicura è marcare le 1.020 righe `tk`
  come deprecate/da ignorare (es. un flag, non una `DELETE`) piuttosto che aggiornarle in place, per evitare
  di creare collisioni di unique key con le righe già corrette se in futuro `canonical_cards` viene
  ricalcolato. Decisione da confermare con te prima di procedere.
- `collection.card_print_id`: backfill delle 49 righe esistenti da `card_api_id` (mapping diretto, basso
  rischio dato il volume).

### 8. Sync plan

- Disattivare (o correggere) `bulk-import-pokemon` Edge Function prima di continuare a farla girare, per non
  continuare a produrre nuove righe con lo stesso bug — **decisione tua**: preferisci che la corregga
  (stesso comportamento di `scripts/sync-full.js`, cioè leggere da `/sets` invece che da `/cards` flat) o che
  proponga di disattivarla se `scripts/*.js` la rende ridondante? Non lo decido da solo, serve sapere se è
  schedulata attivamente (gap aperto §4).
- Nuovo script/step `sync-canonical` da eseguire dopo ogni sync carte (Fase A).
- Rimozione filtro `_p\d+$` in `sync-full.js`, poi un run mirato sui set con Parallel noti prima di un run
  completo (rollout graduale, coerente con `--set` già supportato dagli script).

### 9. Test plan

- Dry-run (`--dry-run`, già supportato da più script) per ogni backfill prima di scriverlo.
- Dopo ogni fase: conteggio righe prima/dopo, confronto con i numeri di questo documento come baseline.
- Per `collection`: testare `addToCollection()` con la nuova unique key su un utente di test (o le 49 righe
  reali in staging, se esiste un ambiente separato — **UNKNOWN se DraGold ha un progetto Supabase di
  staging**, da chiarire prima di testare su dati reali).
- Per `set_id='tk'` e affini: query di verifica pre/post che confermi che nessuna riga "corretta" esistente
  viene sovrascritta o duplicata dalla correzione.

### 10. Rischi (ordinati)

1. Continuare a costruire sopra `canonical_cards` senza prima risolvere Fase A — rischio più alto, silenzioso.
2. Correggere `bulk-import-pokemon` senza sapere se è ancora schedulata attivamente — rischio di lavorare su
   codice morto, o viceversa di lasciare attivo un bug che continua a scrivere righe cattive nel frattempo.
3. Cambiare la unique key di `collection` senza coordinare `PortfolioModal.jsx` nello stesso rilascio —
   rischio di rompere silenziosamente l'aggiunta al portfolio (già segnalato nell'audit precedente, confermato
   ancora valido).
4. Correggere `P`/`SV`/`M-P` come se fossero certamente lo stesso bug di `tk` senza una controparte corretta
   da confrontare — rischio di "correggere" qualcosa che in realtà era già giusto.

### 11. Ordine esatto (ripreso dal tuo ordine obbligatorio, confermato valido dopo la verifica)

FASE A (chiusa qui, azione consigliata: script `sync-canonical.js`) → FASE B (causa chiusa qui, azione
consigliata: decidere su `bulk-import-pokemon` prima di correggere le righe) → FASE C (Parallel confermato,
Simple resta fuori) → D (print_variant) → E (Parallel One Piece) → F (source priority) → G (products) →
H (product_contents) → I (collection/card_print/quantity) → J (grading) → K (UI/search).

### 12. Stima righe coinvolte per operazione

| Operazione | Righe stimate |
|---|---|
| Backfill `canonical_cards` (Fase A) | 8.257 |
| Popolamento `print_variant` Pokémon (Fase D) | fino a 154.017, in fasi |
| Correzione `set_id` compositi (Fase B) | 1.020 confermate (`tk`) + 489 da confermare (`P`/`SV`/`M-P`) |
| Nuove righe Parallel One Piece (Fase E) | stima centinaia (18% di 2.641 EN ≈ 400-500, non un conteggio esatto) |
| Backfill `collection.card_print_id` (Fase I) | 49 |
| Nuove tabelle `products`/`product_contents` (Fase G/H) | 0 righe esistenti coinvolte, tabelle nuove vuote |

---

## Mi fermo qui

Come richiesto: nessuna modifica eseguita. In attesa della tua approvazione esplicita su quale fase iniziare
per prima e sulle decisioni aperte segnalate sopra (in particolare: cosa fare di `bulk-import-pokemon`, e come
trattare le 1.020 righe `tk` — deprecare vs correggere in place).
