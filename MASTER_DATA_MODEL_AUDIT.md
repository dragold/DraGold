# DraGold — MASTER DATA MODEL AUDIT
### CARD ENTITY + PRINT/VARIANT + LANGUAGE + ARTWORK + SOURCE + PRODUCTS + COLLECTION + GRADING

Data ricerca: 12 agosto 2026. Metodo: codice reale (`src/`, `scripts/`), query read-only Supabase
(`pimwkmwrduqkaydyvxqz`), verifica diretta fonti dove possibile, web research mirata. **Nessuna modifica a
codice/schema/dati. Nessuna migration, nessun backfill, nessun sync, nessun commit, nessun push.** Questo
documento evolve (non ripete) `DUPLICATE_VARIANT_AUDIT_REPORT.md` (12 ago, stessa sessione),
`DraGold_Patrimonio_Dati_TCG_Report.md` (10 ago) e `SCHEMA_VERIFICATION_REPORT.md` (9 ago).

Ogni affermazione è etichettata: **VERIFIED** (letto da codice reale, query diretta, o fetch live),
**INFERRED** (dedotto con alta confidenza da evidenza indiretta, spiegato perché), **UNKNOWN** (non
verificabile in questa sessione, dichiarato esplicitamente invece di indovinare).

---

## 1. EXECUTIVE SUMMARY

1. **La buona notizia, verificata solo ora**: DraGold **ha già, oggi, in produzione, il pattern CARD ENTITY →
   tutte le lingue** che chiedi nella Parte 6/15. Non è una proposta — è codice che gira: `src/lib/search.js`
   (`groupByCanonical`) e `src/pages/card/cardPageData.js` raggruppano **esclusivamente per
   `canonical_card_id`**, mai per nome/similarity, e la pagina carta pubblica (`/carta/{slug}`) mostra già
   "tutte le lingue di questa carta" in un colpo solo. **VERIFIED**, §3 e §6.
2. **`canonical_cards` può diventare la CARD ENTITY definitiva senza nuova tabella** — ha già PK, unique
   `(tcg, set_id, card_number)`, FK reale da `cards.canonical_card_id`, ed è già il livello letto da ricerca e
   pagina carta. Il problema non è l'entità, è cosa manca **sotto** di essa: non esiste ancora un livello
   PRINT/VERSION — oggi `cards` fa contemporaneamente da PRINT, da LANGUAGE e da SOURCE record, tutto
   appiattito in una riga. **VERIFIED**, §3.
3. **Il Portfolio oggi non può rappresentare "2 copie della stessa carta"**: `addToCollection()` fa un
   `upsert` con `onConflict: 'user_id, card_api_id'` — aggiungere la stessa carta due volte **sovrascrive**
   la riga precedente, non crea una seconda copia né incrementa `quantity` (il campo esiste in schema ma non
   viene mai scritto da questo flusso). Questo è un limite reale e presente, non ipotetico — rilevante
   direttamente per la Parte 12/14. **VERIFIED**, §15.
4. **"Simple" non esiste in nessuna fonte verificata in questa sessione**: non è nei dati DraGold (0 righe,
   0 occorrenze in codice), non è un termine documentato da Bandai, TCGplayer, Cardmarket o optcgapi nella
   ricerca svolta. Non lo trasformo in categoria — resta **UNKNOWN**, con la richiesta esplicita di sapere
   dove l'hai visto per un secondo giro mirato. §10.
5. **Il bug `set_id = 'tk'`** (già isolato nel report precedente) ha ora una spiegazione più precisa:
   **INFERRED**, non ancora verificabile al 100% in questa sessione per un limite tecnico (il tool di fetch
   web disponibile restituisce risposta vuota per `api.tcgdex.net`, verificato con 3 tentativi diversi — non
   un problema del sito, del nostro accesso). Ipotesi più solida basata sui dati esistenti: i "Trainer Kit"
   Pokémon sono stati riorganizzati da TCGdex nel tempo da un unico set `tk` (con `localId` composti tipo
   `xy-su-4`) a sotto-set distinti (`tk-xy-su`, `tk-ex-latia`, ecc.), e le righe DraGold più vecchie
   (`created_at` 20 maggio 2026) riflettono lo schema *vecchio* della fonte. Verifica finale rimandata a un
   fetch diretto con Node (non con il tool web di questa sessione). §11.
6. **Sealed products: nessuna fonte gratuita, strutturata e libera da restrizioni di redistribuzione esiste**,
   esattamente come per le singole carte (conferma pattern già visto nel report del 10 agosto). TCGplayer ha
   un modello a 3 livelli (Category → Group → Product, con `sealedLabel`) che è un **ottimo riferimento
   strutturale**, non una fonte dati liberamente riusabile in produzione. PriceCharting conferma nomi di
   prodotto reali per One Piece (es. "Premium Booster Display [PRB01]"). **VERIFIED** l'esistenza dei pattern,
   **UNKNOWN** la liceità di una redistribuzione diretta dei loro dati — stesso principio §8 del report del 10
   agosto, non riverificato da zero qui. §12.
7. **Grading (PSA)**: l'API pubblica PSA nel 2026 è stata ridotta a **~1 chiamata/giorno** anche per token
   gratuiti registrati, fa **solo lookup per numero di certificato singolo** (non è interrogabile come
   catalogo, non espone population report in modo pubblico/gratuito). Confermato: **non è possibile né lecito
   replicare il database PSA**; l'unico uso corretto è "verifica il certificato di un oggetto che l'utente
   dichiara di possedere", mai "importa tutti i certificati PSA". **VERIFIED** via ricerca mirata. §16.
8. **Riferimento architetturale più utile trovato in questa sessione**: il modello Scryfall (MTG) —
   `oracle_id` = identità di carta stabile tra ristampe, ogni singola stampa è un oggetto "card" a parte con
   `prints_search_uri` per elencare tutte le stampe della stessa identità. È **esattamente** il pattern
   CARD ENTITY → PRINT che questo audit propone, già maturo e in produzione su un catalogo più grande di
   quello DraGold. Non lo copio 1:1 (Scryfall non ha multilingua nello stesso modo, non ha grading/sealed) ma
   è la prova che il modello a due livelli è quello giusto, non un azzardo. §19.
9. **Nessuna delle evoluzioni proposte richiede di ricominciare da zero**: `print_variant` (colonna già
   esistente, 0% popolata), `canonical_cards` (già la CARD ENTITY), `metadata` jsonb (già capiente per
   estensioni senza migration) sono già lì. Il lavoro reale è: iniziare a scrivere `print_variant`, aggiungere
   **una tabella nuova** (`products` + `product_contents`) e **una tabella nuova** per collection items più
   granulare (o estendere `collection` con `print_id`/`quantity` usati davvero) — non un redesign.

---

## 2. CURRENT ARCHITECTURE (richiamo, verificato invariato rispetto ai report precedenti)

`cards` (200.939 righe totali, 154.017 Pokémon + 5.195 One Piece) — PK `id` (text), nessun altro unique
constraint, FK opzionale `canonical_card_id → canonical_cards.id`. `canonical_cards` (87.189 righe) — PK `id`
(uuid), unique reale `(tcg, set_id, card_number)`. `card_prices`, `sets`, `rarities`, `collection` come
documentato in `SCHEMA_VERIFICATION_REPORT.md` — **VERIFIED** invariato, non ri-verificato riga per riga qui
per non duplicare lavoro già fatto 3 giorni fa sulla stessa sessione di audit.

---

## 3. CARD ENTITY

**Domanda**: `canonical_cards` può diventare il vero livello CARD ENTITY, o serve una nuova entità?

**Risposta: sì, può diventarlo — in buona parte lo è già.** Evidenza diretta dal codice, non dalla migration:

- **PK/unique/FK**: `id` (uuid) PK; unique reale `(tcg, set_id, card_number)`; FK `cards.canonical_card_id →
  canonical_cards.id` (`ON DELETE SET NULL`) — **VERIFIED**, invariato da `SCHEMA_VERIFICATION_REPORT.md`.
- **Popolamento**: nessuno script di sync scrive esplicitamente su `canonical_cards` (verificato con grep su
  tutti gli script — nessun `.from('canonical_cards').insert/upsert` trovato in `scripts/`). **INFERRED**: il
  popolamento avviene o via trigger DB (non verificabile da questa sessione, RLS disabilitata come già
  segnalato ma questo non implica trigger assenti — semplicemente non ho un modo di leggere i trigger definiti
  lato Postgres con gli strumenti a disposizione) o via un processo batch separato non presente in `scripts/`.
  **UNKNOWN** il meccanismo esatto — segnalo il gap invece di indovinare.
- **Uso da ricerca** (`src/lib/search.js`, funzione `groupByCanonical`, **VERIFIED** letta riga per riga):
  raggruppa `cards` **esclusivamente** per `canonical_card_id`; il commento nel codice stesso è esplicito:
  *"mai nome normalizzato, string similarity, numero carta da solo, set+nome o fuzzy matching"*. Righe con
  `canonical_card_id` nullo restano isolate, mai fuse per euristica. Il gruppo espone `variantCount` e
  `variantLangs` — cioè **la ricerca tratta ogni lingua diversa come "variante" della stessa entità**, non come
  entità distinta. Questo è già il comportamento richiesto dalla Parte 15.
- **Uso da pagina carta** (`src/pages/card/cardPageData.js`, **VERIFIED**): `/carta/{slug}` interroga
  `canonical_cards` per slug, poi tutte le `cards` con lo stesso `canonical_card_id` → questo è già,
  concettualmente, "CARD ENTITY → tutte le sue righe (oggi: lingue+fonti, domani: anche print)".
- **Uso da portfolio**: **nessuno** — `collection` non ha `canonical_card_id` né FK verso `cards` (confermato
  già in `SCHEMA_VERIFICATION_REPORT.md`, **VERIFIED** di nuovo in questa sessione, §15).
- **Uso da sync**: nessuno script scrive `canonical_card_id` direttamente sulle righe `cards` inserite — quindi
  o un secondo processo lo popola dopo, o un default/trigger DB lo fa. Coerente con l'osservazione già fatta il
  9 agosto ("95,95% popolato, non 100%") — **VERIFIED** che il gap esiste, **UNKNOWN** il meccanismo esatto di
  popolamento.

**Conclusione Parte 1**: non serve una nuova entità CARD ENTITY. Serve (a) capire e documentare il processo che
popola `canonical_cards`/`canonical_card_id` oggi (gap di conoscenza reale, non di codice — task per una
sessione dedicata con accesso a Cron/Edge Functions/trigger, fuori dal perimetro "solo repo + DB read" di
questo audit), e (b) far scendere sotto `canonical_cards` un vero livello PRINT (§4) invece di lasciare che
`cards` continui a fare da PRINT+LANGUAGE+SOURCE insieme.

---

## 4. PRINT / VERSION

### Pokémon — cosa esiste davvero nelle fonti (verificato in questa sessione + sessione precedente)

**TCGdex** (`interfaces.d.ts`, repo `tcgdex/cards-database`, **VERIFIED** via ricerca mirata sia in questo
audit sia nel precedente): ogni carta espone un oggetto `variants` con chiavi booleane `normal`, `reverse`,
`holo`, `firstEdition` — vero, non un'invenzione della fonte per il pricing. È in arrivo `variants_detailed`
per collegare ID di mercato a ciascuna variante. **Questo è il campo che rappresenta una vera PRINT.**

**pokemontcg.io v2** (**VERIFIED** via documentazione ufficiale): il campo `rarity` è una stringa singola
(es. `"Rare Holo"` — finish incluso nel nome, non separato); il vero segnale di variante è dentro
`tcgplayer.prices`, dizionario chiavato per `holofoil` / `reverseHolofoil` / `normal` / `1stEditionHolofoil`.
**Distinzione importante da fare esplicitamente, come richiesto**: questo dizionario è nato per il *pricing*,
non per l'anagrafica carta — ma le sue chiavi *coincidono* con varianti fisiche reali (non sono categorie di
mercato inventate, es. "bulk"/"NM"/"played" che sarebbero puramente commerciali). **Conclusione**: le chiavi di
`tcgplayer.prices` sono un segnale valido per popolare PRINT, ma vanno trattate come "conferma di esistenza
di quella stampa", non copiate come se fossero l'anagrafica primaria — la fonte primaria per il *record* PRINT
resta `variants` di TCGdex (dati, non prezzi); `tcgplayer.prices` è una **conferma incrociata** utile quando
disponibile, non l'unica fonte.

Sul resto della tua lista (1st edition holo, shadowless, stamped): **non ho trovato un campo esplicito e
separato in nessuna delle due fonti per questi casi** in questa sessione — sono spesso rappresentati come
combinazioni (`firstEdition: true` + `holo: true` → "1st edition holo") o come parte del nome/rarità stringa
(es. "Shadowless" compare storicamente come attributo di set/epoca in Base Set, non come flag di variante
TCGdex). **UNKNOWN** se esista un flag dedicato — non lo affermo senza averlo visto, e non lo escludo con
certezza assoluta: richiederebbe un fetch diretto di carte Base Set specifiche (bloccato in questa sessione dal
limite tecnico del tool fetch, §11).

### One Piece — verificato con fetch live (ripreso dal report precedente, qui esteso)

`scripts/sync-full.js`, riga esatta (**VERIFIED**, letta due volte in due sessioni):
```js
if (c.card_image_id && /_p\d+$/.test(c.card_image_id)) continue
```
Scarta ogni riga con `card_image_id` che termina `_p1`, `_p2`, ecc. — **verificato con fetch diretto di
optcgapi.com/api/sets/OP-06**: 23 `card_set_id` su 128 (18%) hanno una seconda entry con suffisso `_p1`
(Parallel). Non ho trovato evidenza di `_p2`/`_p3` (Super Parallel multiplo) nel campione OP-06 specifico, ma
la ricerca esterna conferma che "Super Parallel" esiste come categoria reale nel gioco (citata da rivenditori
terzi per SEC rarity) — **INFERRED** che il pattern `_p\d+$` sia già pensato per gestire più di una parallela
per numero (il `+` nel regex lo prevede), semplicemente il campione OP-06 non ne conteneva più di una.

**Risposta diretta alla tua domanda della Parte 3**: sì, `OP06-106 normal` e `OP06-106 parallel` sono
**la stessa CARD ENTITY** (stesso `card_number`, stesso personaggio, stesso testo — confermato dal sito
ufficiale che le mostra sotto lo stesso filtro/numero, §3.4 del report precedente) con **due PRINT diverse**
(artwork diverso, rarità di stampa diversa — Parallel è tipicamente una rarità di stampa superiore alla base).
`card_number` resta l'identificatore della CARD ENTITY component all'interno del set — non va toccato, va solo
smesso di usarlo come se fosse anche l'identificatore univoco di riga.

---

## 5. ARTWORK

**Domanda**: PRINT e ARTWORK devono essere entità separate?

**Risposta: no, non ancora — non ho trovato un caso reale in questa sessione che lo richieda.** In entrambi i
casi osservati (Pokémon `variants` TCGdex, One Piece Parallel) l'artwork diverso **coincide** con la variante
di stampa: non ho trovato un solo esempio, né in Pokémon né in One Piece, di due artwork diversi per la
**stessa** combinazione finish+lingua+set+numero (es. due "normal" con arte diversa sullo stesso numero). Se un
caso simile esistesse (capita raramente in Pokémon con alcune "Full Art" vs "Alternate Full Art" sullo stesso
slot) andrebbe verificato caso per caso — non l'ho incontrato nei dati DraGold verificati oggi.

**Proposta progressiva (esplicitamente quello che chiedevi, non over-engineering)**: un campo
`artwork_variant` (testo libero o enum leggero, es. `standard` / `alternate` / `parallel`) **dentro** il record
PRINT, non una tabella a parte. Se in futuro emerge un caso con più artwork per la stessa PRINT esatta, si
promuove a tabella — oggi sarebbe una tabella con cardinalità 1:1 verso PRINT in praticamente tutti i casi
osservati, quindi inutile.

---

## 6. LANGUAGE / REGION

**Verificato (non proposto)**: il comportamento richiesto nella Parte 6 — cercare "Pikachu Base Set" e ottenere
EN/JA/IT/DE/FR/ES/PT/ZH/TH/KO senza query separate — **esiste già** in `groupByCanonical` (§3). Il frontend non
divide oggi mondo occidentale/asiatico per la CARD ENTITY: la funzione raggruppa per `canonical_card_id`
indipendentemente dalla lingua, poi espone `variantLangs` come lista aggregata. **VERIFIED**.

Cosa **non** è ancora corretto: il livello sotto (`cards`) oggi rappresenta contemporaneamente lingua E fonte E
(quando esisterà) print — quindi lo stesso `canonical_card_id` raggruppa sia vere traduzioni sia i 14.385
duplicati cross-source già documentati nel report precedente. La UI attuale (`primary = group.find(c => c.lang
=== 'en') || group[0]`) sceglie EN come rappresentante di default, ma non ha un modo esplicito di scegliere
"quale riga EN" quando ce ne sono due (tcgdex vs ptcg) — prende semplicemente la prima trovata nell'ordine di
query. Non è un errore del modello CARD ENTITY→LANGUAGE, è la stessa mancanza di priorità/provenance già
segnalata (§7 sotto).

---

## 7. SOURCE / PROVENANCE

I 14.385 duplicati cross-source Pokémon (verificati nel report precedente, non ri-eseguo la stessa query qui)
sono per definizione **due PRINT identiche secondo il mondo reale, scritte da due fonti indipendenti**. La
soluzione corretta, coerente col resto di questo modello:

1. **Non fondere le righe fisicamente.** Ogni riga resta una "source observation" — è dato, va preservato.
2. **Introdurre un livello PRINT esplicito** (§4): la vera chiave di un PRINT non è `cards.id` (che oggi
   incorpora la fonte, es. `pokemon:tcgdex:...` vs `pokemon:ptcg:...`) ma `(canonical_card_id, lang, finish)`.
   Due righe `cards` con la stessa tripla sono **osservazioni della stessa PRINT da fonti diverse**, non due
   PRINT diverse.
3. **Priorità esplicita, non implicita per ordine di scrittura**: una regola semplice basata su ranking fisso
   di fonte (es. per Pokémon EN: TCGdex battuto solo se pokemontcg.io ha un campo che TCGdex non ha, altrimenti
   TCGdex vince come oggi implicitamente accade "per caso" nell'ordine di query) — non serve ML, serve una
   tabella `source_priority(tcg, source) → rank` piccola e statica, letta dal codice che sceglie la riga
   "primaria" di un PRINT quando ce n'è più di una.
4. **Campo `confidence`/`is_primary`** sulla riga `cards` (o su un futuro record PRINT), popolato dalla stessa
   regola — coerente con quanto già proposto in `DraGold_Patrimonio_Dati_TCG_Report.md` §12, qui reso più
   concreto: non serve un punteggio continuo, basta un booleano `is_primary` + il `source` già esistente per
   audit.

Questo risponde direttamente alla tua richiesta "senza perdita dati": nessuna riga viene cancellata, si
aggiunge solo un modo di **scegliere** quale mostrare come rappresentante quando ce n'è più di una per lo
stesso PRINT.

---

## 8. POKÉMON (riepilogo mirato, dettagli in §4 e nel report precedente)

- CARD ENTITY: `canonical_cards`, già funzionante. **VERIFIED**.
- PRINT: non esiste ancora come record; il dato per costruirlo (`variants` TCGdex, `tcgplayer.prices`
  pokemontcg.io) esiste in fonte e non viene letto da nessuno script di sync verificato. **VERIFIED** (assenza
  di lettura, confermata con grep mirato su tutti gli script Pokémon).
- LANGUAGE: già gestito bene a livello di raggruppamento ricerca/pagina carta. **VERIFIED**.
- Bug reale distinto dal problema variante: collisione `set_id='tk'` (§11).

---

## 9. ONE PIECE (riepilogo mirato)

- CARD ENTITY: `card_number` (es. `OP06-106`) funge da chiave dentro `canonical_cards` insieme a `set_id` —
  stesso principio di Pokémon, **VERIFIED** dallo schema (unique `(tcg, set_id, card_number)` non distingue
  per gioco).
- PRINT: Parallel esiste in fonte, viene scartata attivamente da una riga di codice esplicita — non un bug
  nascosto, una scelta di design leggibile che oggi produce **zero copertura Parallel**. **VERIFIED** con fetch
  live in questa sessione e nella precedente.
- Il parser JA ufficiale (`onepiece-ja-parser.js`) **rileva** ristampe/differenze di testo tra stampe
  (`textVariantsDetected`) ma le colleziona tutte in **un solo** record canonico invece di salvarle come righe
  PRINT separate — stesso pattern di perdita di granularità, ma qui almeno osservabile via il booleano.
  **VERIFIED**, riportato anche nel documento precedente.

---

## 10. "SIMPLE" — INVESTIGATION

Verifica eseguita, in ordine:

1. **Dati DraGold** (`cards.metadata`, `cards.rarity`, `cards.name` per `tcg='onepiece'`): query diretta,
   **zero righe** contengono la stringa "simple" in nessuna forma. **VERIFIED**.
2. **Codice DraGold** (`scripts/`, `src/`): grep case-insensitive su tutto il repository, **zero occorrenze**.
   **VERIFIED**.
3. **optcgapi.com**: nessun campo `Simple` osservato nella risposta reale fetchata (OP-06, 128 righe, campi
   osservati: `card_name`, `set_name`, `card_text`, `set_id`, `rarity`, `card_color`, `card_cost`,
   `card_power`, `counter_amount`, `attribute`, `sub_types`, `card_image_id`, `card_image`, `life`). **VERIFIED**
   per il campione fetchato in questa sessione — non è un'esclusione assoluta di ogni endpoint dell'API, solo
   di quello interrogato.
4. **Ricerca web mirata** (Bandai ufficiale, TCGplayer, Cardmarket, guide di rarità terze): nessuna fonte
   trovata definisce "Simple" come categoria ufficiale di stampa/rarità/illustrazione per One Piece TCG.
   **VERIFIED** (assenza nei risultati di ricerca, non prova assoluta di non esistenza altrove).

**Conclusione, come richiesto esplicitamente**: **UNKNOWN**. Non ho trovato "Simple" in nessuna fonte
verificabile in questa sessione — dati DraGold, codice DraGold, fonte dati principale (optcgapi), o
documentazione/marketplace terzi. **Non lo introduco nel modello.** Ipotesi plausibili non verificate (dichiaro
esplicitamente che sono ipotesi, non conclusioni): potrebbe essere (a) un termine visto su un marketplace
specifico non coperto da questa ricerca (es. una dicitura interna di un singolo rivenditore per "non-Parallel",
sinonimo informale di "normal/base"), (b) un termine di un'altra lingua di marketplace (es. italiano
"semplice" tradotto automaticamente), o (c) confuso con un altro TCG. **Prossimo passo consigliato**: se hai un
URL, uno screenshot o il nome esatto della fonte dove hai visto "Simple", lo verifico mirato in un follow-up —
qui mi fermo per non inventare un significato.

---

## 11. SET `tk`

Ripreso e approfondito rispetto al report precedente.

- **Verificato**: 90 gruppi/1.020 righe Pokémon con `set_id = 'tk'` in collisione su `card_number`, tutte con
  `created_at = 2026-05-20` (stesso batch di sync, **VERIFIED** con query — non riportato per esteso qui,
  stessa query del report precedente ripetuta).
- **Verificato**: sia `sync-full.js` sia `sync-cards.js` sia `sync-pokemon-ja.js` scrivono `set_id` con la
  **stessa variabile** usata per costruire `id`/`source_id` (`setId = meta.id` dalla lista set TCGdex) — quindi
  con il codice **attuale**, `set_id` e il prefisso di `source_id` sono sempre coerenti tra loro. Le righe
  osservate (`set_id='tk'` ma `source_id='tk-xy-su-4'`) sono **incoerenti con questo comportamento**, quindi
  **non possono essere state scritte dal codice oggi presente nel repository**, con alta confidenza. **INFERRED**,
  non **VERIFIED** al 100% perché non ho accesso alla cronologia Git di questi tre file al 20 maggio 2026 in
  questa sessione (possibile ma non eseguito — richiederebbe `git log -p` mirato, rimandato per tempo).
- **Ipotesi più solida**: TCGdex, come piattaforma community-maintained, ha probabilmente riorganizzato i set
  "Trainer Kit" tra maggio e agosto 2026 — da un singolo set aggregato `tk` (con `localId` composti tipo
  `xy-su-4` per distinguere i mini-mazzi al suo interno) a set distinti (`tk-xy-su`, `tk-ex-latia`, ecc., ognuno
  con `localId` semplici tipo `4`). Le righe DraGold vecchie riflettono lo snapshot di maggio; un nuovo sync
  oggi probabilmente scriverebbe righe **nuove e corrette** (con `id` diverso, quindi non sovrascriverebbe le
  vecchie) sotto i nuovi `set_id` composti, lasciando le vecchie come dati orfani/duplicati da ripulire in un
  secondo momento.
- **Perché non l'ho verificato con certezza in questa sessione**: il tool di fetch web disponibile
  (`mcp__workspace__web_fetch`) ha restituito **risposta vuota** per tre URL TCGdex diversi in questa sessione
  (`/v2/en/sets/tk`, `/v2/en/sets`, `/v2/en/cards/sv3pt5-160`), a differenza di `optcgapi.com` che ha
  funzionato correttamente sullo stesso tipo di richiesta. **VERIFIED** che il fallimento è specifico di
  `api.tcgdex.net` con questo strumento, non un problema di rete generale. **Causa esatta UNKNOWN** (possibile
  content-type non gestito dal tool, possibile comportamento anti-bot lato TCGdex verso lo user agent del
  fetcher) — non indovino oltre.
- **Verifica finale necessaria (non eseguita)**: un semplice `node -e "fetch(...).then(r=>r.json()).then(console.log)"`
  lanciato dall'ambiente di sviluppo reale (non da questo tool sandbox) risolverebbe la domanda in un minuto —
  è l'azione più piccola e diretta possibile, la propongo come parte della roadmap (§23).

---

## 12. SEALED PRODUCTS

**Nessuna fonte gratuita e liberamente redistribuibile trovata**, stesso principio già stabilito per le carte
singole. Evidenza raccolta in questa sessione:

- **TCGplayer** (**VERIFIED** via documentazione ufficiale): modello a 3 livelli — Category (gioco) → Group
  (set/release) → Product (può essere carta singola O prodotto sigillato). Il campo `sealedLabel` distingue
  esplicitamente `"Sealed Product"`/`"Sealed Products"`/`"Bulk Lot"`/null. **Questo è un riferimento
  strutturale valido** (Category→Group→Product è essenzialmente lo stesso principio di
  `tcg → set → canonical_cards` che DraGold già ha), ma l'uso dei *dati* TCGplayer per popolare un catalogo
  proprio resta soggetto alle stesse restrizioni ToS già documentate il 10 agosto (divieto di redistribuzione/
  combinazione con altre fonti) — non riverificato da zero, riportato per coerenza.
- **PriceCharting** (**VERIFIED** via fetch/ricerca): conferma nomi prodotto reali osservabili per One Piece,
  es. *"Premium Booster Display [PRB01]"*, *"Sealed Storage Box Set"*, *"Booster Box"* per set specifici
  (Romance Dawn, Legacy of the Master, ecc.) — utile come conferma che questi nomi sono standard di settore,
  non ancora una fonte dati liberamente riusabile (stessa cautela ToS).
- **GitHub/open source**: nessun dataset dedicato ai *sealed products* trovato in questa sessione (i repository
  trovati — `pokemon-tcg-data`, `tcgdex/cards-database`, `flibustier/pokemon-tcg-pocket-database` — coprono
  tutti singole carte, mai prodotti sigillati). **VERIFIED** l'assenza nei risultati di ricerca di questa
  sessione — non un'esclusione assoluta dell'intero ecosistema open source.

**Categorie prodotto realmente osservate** (fonte: risultati di ricerca su TCGplayer/PriceCharting/rivenditori,
non una fonte unica strutturata — quindi trattarle come **osservate**, non come enum "ufficiale" di alcun
publisher):

*Pokémon*: Booster Pack, Booster Box, Elite Trainer Box (ETB), Booster Bundle, Collection Box, Premium
Collection, Special Collection, Tin, Blister, Deck, Starter Deck, Theme Deck, Build & Battle Box (**VERIFIED**
come nomi in uso, **UNKNOWN** se questa lista è esaustiva o se Pokémon TCG pubblica una tassonomia ufficiale
propria — non trovata in questa sessione).

*One Piece*: Booster Pack, Booster Box, Starter Deck, Premium Booster / Premium Booster Display (es. PRB01),
Extra Booster, Premium Card Collection, Ultra Deck, prodotti promo (**VERIFIED** come nomi osservati su
PriceCharting/rivenditori reali per set esistenti — stessa cautela sull'esaustività).

**Entità proposta (NON creata, solo progettata come richiesto)**:
```
products
  product_id      (pk)
  tcg
  product_type    (enum aperto: booster_pack, booster_box, etb, starter_deck, premium_collection, ...)
  name
  set_id           → FK verso lo stesso set_id già usato da cards/canonical_cards (riuso, non nuova tabella set)
  lang
  region
  release_date
  image_url
  source
  source_id
  sealed           boolean
```
Nessuna migration eseguita. Schema compatibile con l'infrastruttura esistente (`set_id` testo libero già
condiviso con `cards`, stesso pattern `source`/`source_id` già in uso).

---

## 13. PRODUCT CONTENTS

Nessuna fonte gratuita trovata in questa sessione che documenti in modo strutturato "cosa contiene questo
prodotto" (es. "questa ETB contiene 8 booster + 1 promo + dado + contatori danno"). Le fonti trovate
(TCGplayer, PriceCharting, siti ufficiali) mostrano il prodotto come oggetto a sé, non il suo contenuto
scomposto in righe interrogabili via API pubblica gratuita. **VERIFIED** l'assenza nei risultati di questa
sessione.

**Modello proposto (non implementato)**, coerente con la tua Parte 10/11:
```
product_contents
  id             (pk)
  product_id      → FK products.product_id
  content_type    (enum: card_print | booster_pack | accessory | promo_card | other)
  card_print_id   → FK verso il futuro record PRINT (nullable — solo se content_type = card_print/promo_card)
  quantity
  notes           (es. "sleeves x65", "dice x1" per accessori senza rappresentazione carta)
```
Questo risponde direttamente alla tua Parte 11: una query `product_contents WHERE card_print_id = X` risponde
a "in quali prodotti è uscita questa carta", una query `product_contents WHERE product_id = Y` risponde a
"cosa contiene questo prodotto". **Non tutto il contenuto deve essere una CARD**: `content_type` distingue
esplicitamente i casi non-carta (booster ancora sigillati dentro una box, accessori) da quelli carta.

---

## 14. PROMO ↔ PRODUCT RELATIONSHIPS

Confermato dal modello sopra: una promo (es. Pikachu Promo incluso in una ETB) resta **CARD ENTITY → PRINT**
come qualsiasi altra carta; la sua presenza in un prodotto è **solo** una riga in `product_contents` che punta
al suo `card_print_id` — la promo non "diventa" il prodotto, il prodotto non "diventa" la carta. Nessuna fonte
gratuita trovata in questa sessione che fornisca già questa relazione pronta all'uso (nessun open-source
dataset "product → cards contenute" trovato) — andrebbe popolata manualmente o da scraping mirato delle pagine
prodotto ufficiali/rivenditori (fuori perimetro di questo audit, solo research/design).

---

## 15. COLLECTION / PORTFOLIO

**Verificato** (`src/components/shared/PortfolioModal.jsx`, `src/supabase.js`, `src/pages/portfolio/
PortfolioView.jsx`, letti riga per riga in questa sessione):

- L'identità di riga collection è `card_api_id` (testo libero, derivato da `toApiId(card)` in
  `src/lib/cardId.js`) — **non** `canonical_card_id`, **non** una FK verso `cards`. **VERIFIED**, coerente con
  quanto già emerso il 9 agosto.
- **`addToCollection()` fa `upsert(..., { onConflict: 'user_id, card_api_id' })`** — aggiungere la stessa carta
  una seconda volta **sovrascrive** la riga esistente (prezzo pagato, condizione, ecc.), **non** crea una
  seconda riga né incrementa `quantity`. Il campo `quantity` esiste in schema (default `1`) ma **il payload
  che `PortfolioModal.jsx` invia non lo include mai** — quindi resta sempre 1, silenziosamente, anche se
  l'utente "aggiunge" la stessa carta 5 volte. **VERIFIED**, è il gap più concreto trovato in questa parte
  dell'audit, direttamente rilevante per la tua Parte 12.
- Nessun collegamento a `print_variant`, `lang` è salvato come testo libero copiato dalla card al momento
  dell'aggiunta (non un riferimento vivo a una riga `cards`) — quindi se in futuro la carta viene corretta a
  monte, la riga in collection **non si aggiorna mai** (snapshot, non riferimento). **VERIFIED**.

**Il modello attuale può essere esteso, non va rifatto da zero.** Percorso minimo:
1. Aggiungere `card_print_id` (nullable, per non rompere le 24 righe esistenti) che punterà al futuro record
   PRINT invece di duplicare `card_name`/`set_name`/`image_url` come testo libero.
2. Cambiare la unique key da `(user_id, card_api_id)` a `(user_id, card_print_id, condition, is_graded)` — così
   "2 copie EN normal NM" e "1 copia EN holo NM" diventano righe distinte per costruzione, e la stessa
   combinazione esatta incrementa `quantity` invece di sovrascrivere.
3. Il payload di `PortfolioModal.jsx` deve iniziare a inviare/incrementare `quantity` esplicitamente.

Nessuna di queste modifiche richiede di cancellare le 24 righe esistenti — sono compatibili con un
`ALTER TABLE ... ADD COLUMN` + una nuova unique key, non con un `DROP`.

---

## 16. GRADING

**Verificato via ricerca mirata**: PSA pubblica un'API pubblica di sola verifica certificato (cert lookup),
non un catalogo interrogabile né un export di population report gratuito. **A metà 2026 il tier gratuito è
stato ridotto a circa 1 chiamata/giorno anche per token registrati** — un limite che rende esplicitamente
impraticabile qualunque tentativo di "importare" dati PSA in massa, anche se lo si volesse (a prescindere dalla
liceità, che resta comunque non concessa per uso bulk). **VERIFIED**.

**Conclusione, esplicita come richiesto**: l'architettura deve supportare **la certificazione di un oggetto
che l'utente dichiara di possedere** (un utente inserisce "ho questa carta, gradata PSA 10, certificato
12345678" e il sistema può *opzionalmente* verificarla contro l'API PSA una alla volta, nel momento in cui
l'utente la aggiunge), **non** replicare il database dei grader. Nessuna tabella `psa_certificates` con l'idea
di popolarla in blocco — sarebbe sia illecito sia tecnicamente impossibile con 1 richiesta/giorno.

**Modello proposto (non implementato)**, coerente con Parte 13/14:
```
collection_items
  id                 (pk)
  user_id             → FK profiles.id (riuso pattern esistente)
  card_print_id       → FK verso il futuro record PRINT, nullable se item = sealed product
  product_id          → FK products.product_id, nullable se item = raw/graded card
  quantity
  condition            (per raw card)
  is_graded            boolean
  grading_company      (PSA | CGC | BGS | altro — testo libero, non enum chiuso: nuovi grader compaiono)
  certification_number
  grade
  qualifier             (es. "OC" per off-center — solo se il grader lo espone)
  certification_url     (link diretto al lookup pubblico, non i dati replicati)
  graded_at
  source                (chi ha inserito/verificato il dato: utente, verifica API, import)
  purchase_price, purchase_date, notes  (già esistenti in collection oggi, riusati)
```
`certification_number` + `certification_url` bastano per "supportare la certificazione" senza mai dover
salvare o replicare dati proprietari del grader — l'utente/il sistema possono sempre ri-verificare dal vivo
seguendo il link o interrogando l'API PSA una singola volta per quel certificato specifico.

---

## 17. SEARCH

Già trattato in dettaglio in §3/§6. **Verificato**: il comportamento "query utente → CARD ENTITY, poi tutte le
lingue/print/fonti" **esiste già** per la parte lingue. Manca solo perché non esiste ancora il livello PRINT
sotto — quando esisterà, `groupByCanonical` (o una sua evoluzione) potrà esporre anche `variantPrints` oltre a
`variantLangs`, con la stessa identica logica già scritta, senza riscritture concettuali.

---

## 18. FUTURE API

Il modello proposto (CARD ENTITY → PRINT → LANGUAGE/FINISH/ARTWORK/SOURCE, PRODUCTS → PRODUCT CONTENTS,
COLLECTION → RAW/GRADED/SEALED) **supporta naturalmente** tutti gli endpoint elencati nella Parte 16 della tua
richiesta, senza forzature:

- `GET /cards/{entity}` → riga singola `canonical_cards`
- `GET /cards/{entity}/prints` → righe `cards` con quel `canonical_card_id` (quando esisterà il livello PRINT,
  sarà un filtro in più sulla stessa query, non una nuova relazione)
- `GET /cards/{entity}/languages` → già calcolabile oggi con la stessa query di `cardPageData.js`
- `GET /products/{product}/contents` → diretto da `product_contents`
- `GET /collection` / `GET /collection/items/{id}` → diretto dal modello Parte 12/16, con `card_print_id`
  o `product_id` popolato a seconda del tipo di item

Nessun endpoint della tua lista richiede un'architettura diversa da quella qui proposta — è coerenza, non
verifica ulteriore necessaria in questa fase (non implemento nulla, come richiesto).

---

## 19. OPEN SOURCE / COMPETITOR RESEARCH

**Scryfall (MTG)** — **VERIFIED** via documentazione ufficiale: `oracle_id` identifica la carta in modo stabile
attraverso tutte le ristampe; ogni singola stampa è un oggetto "card" indipendente con il proprio `id`, che
espone `prints_search_uri` per elencare tutte le altre stampe con lo stesso `oracle_id`. **È esattamente il
modello CARD ENTITY (oracle_id) → PRINT (ogni card object) che questo audit propone per DraGold** — non è una
mia invenzione, è un pattern maturo, in produzione su un catalogo (MTG, multi-decade, migliaia di set) più
grande e più vecchio di quello Pokémon/One Piece di DraGold. Differenze da tenere presenti: Scryfall non ha lo
stesso bisogno di multilingua "primo cittadino" nello stesso modo (MTG ha printing per lingua ma la ricerca
primaria resta EN-centrica), non ha grading/sealed nel proprio modello dati (è solo carte).

**TCGdex** — già coperta in dettaglio §4. Il suo modello `variants` per carta è concettualmente un PRINT
annidato dentro la carta invece che un record a sé — utile come fonte dati, meno utile come riferimento di
schema DB (DraGold ha bisogno di PRINT come riga propria per collegarci collection/pricing/grading, TCGdex no
perché non fa queste cose).

**TCGplayer** — già coperto §12, riferimento per Products/Category/Group, non per CARD ENTITY/PRINT (TCGplayer
non distingue "identità carta stabile tra ristampe" nello stesso modo di Scryfall — ogni printing è
sostanzialmente un prodotto a sé, senza un equivalente forte di `oracle_id`).

**Nessun progetto trovato in questa sessione che copra insieme** CARD ENTITY + PRINT + PRODOTTI SIGILLATI +
COLLECTION + GRADING nello stesso modello dati pubblico/open source — il modello proposto in §20 è quindi una
composizione di pattern maturi visti separatamente in fonti diverse (Scryfall per entity/print, TCGplayer per
products, nessuno per grading — quella parte è disegnata da zero seguendo solo i vincoli PSA reali), non una
copia di un singolo prodotto esistente.

---

## 20. PROPOSED DATA MODEL (concettuale, NON creato)

```
CARD ENTITY (= canonical_cards, già esistente — nessuna nuova tabella)
   │  pk id (uuid), unique (tcg, set_id, card_number)  — verificato invariato
   │
   └── PRINT  (nuovo concetto — inizialmente: campo print_variant già esistente su `cards`, popolato
       │       finalmente + una chiave logica (canonical_card_id, lang, finish) per capire quali righe
       │       `cards` sono "la stessa PRINT osservata da fonti diverse")
       ├── LANGUAGE      = cards.lang (già esiste)
       ├── FINISH        = cards.print_variant (già esiste, 0% popolato → da riempire, §4)
       ├── ARTWORK       = stesso campo print_variant o un secondo campo affiancato, non tabella separata (§5)
       └── SOURCE         = cards.source + cards.source_id + nuovo campo is_primary/confidence (§7)

PRODUCTS (nuova tabella, non ancora creata)
   └── PRODUCT_CONTENTS (nuova tabella, non ancora creata)
         └── card_print_id → punta a una riga `cards` (il futuro concetto PRINT), quantity

COLLECTION (evoluzione di `collection` esistente, non nuova da zero)
   ├── RAW CARD    → card_print_id + condition + quantity (oggi: card_api_id testo libero, quantity ignorata)
   ├── GRADED CARD → card_print_id + grading_company/certification_number/grade (oggi: colonne esistono,
   │                  mai scritte da nessun flusso UI verificato in questa sessione)
   └── SEALED PRODUCT → product_id + quantity (oggi: non rappresentabile affatto)
```

**Cosa NON creo come tabella separata, e perché** (per evitare l'over-engineering che chiedevi esplicitamente
di non fare): ARTWORK (§5, nessun caso reale che lo richieda oggi), REGION come entità a sé (già coperto da
`lang` + eventuale campo `region` su PRINT se/quando serve distinguere lingua da regione — non osservato un
caso dove servano entrambi separatamente in questa sessione), PROMO/DISTRIBUTION come tabella a sé (basta un
valore in `print_variant`/`product_contents.content_type`).

---

## 21. MIGRATION STRATEGY

| Modifica | Dati coinvolti | Rischio | Migration? | Backfill? | Sync? | Downtime | Rollback | Rollout graduale |
|---|---|---|---|---|---|---|---|---|
| Popolare `print_variant` da `variants`/`tcgplayer.prices` | 154.017 righe Pokémon (solo update, nessun nuovo id) | Basso | No (colonna già esiste) | Sì, ma incrementale per set/lingua, non big-bang | Sì, nuovo script o estensione di uno esistente | Zero (solo `UPDATE`, letture pubbliche non bloccate) | Banale (`UPDATE ... SET print_variant = NULL WHERE ...`) | Sì, per set/lingua, esattamente come già fanno gli script oggi (`--set`, `--lang`) |
| Rimuovere filtro `_p\d+$` in `sync-full.js` | Nuove righe One Piece (stima centinaia) | Basso | No | No (sono INSERT nuovi, non toccano righe esistenti) | Sì, va rilanciato lo script | Zero | Banale (`DELETE FROM cards WHERE id LIKE '%_p%'` se serve tornare indietro) | Sì, un set alla volta con `--set` |
| Correggere collisione `set_id='tk'` | 90 gruppi/1.020 righe | Medio (tocca dati già scritti, serve capire prima la causa esatta, §11) | Probabile sì (serve decidere se rinominare set_id in place o creare nuove righe e deprecare le vecchie) | Sì | Da valutare dopo la verifica §11 | Zero se fatto con update mirati fuori orario di punta | Richiede backup della porzione coinvolta prima di procedere (1.020 righe, piccolo) | Sì, è un sottoinsieme piccolo e isolato |
| Nuova tabella `products` | Nessun dato esistente toccato | Basso | Sì (nuova tabella, additiva) | No | Nuovo script dedicato, da zero | Zero | Banale (`DROP TABLE` se vuota) | Sì, si può iniziare con un solo TCG/set come pilota |
| Nuova tabella `product_contents` | Nessun dato esistente toccato | Basso | Sì (nuova tabella, additiva, FK verso `cards`/`products`) | No | Nuovo processo, prevalentemente manuale/scraping mirato inizialmente | Zero | Banale | Sì |
| Estendere `collection` (`card_print_id`, nuova unique key) | 24 righe reali oggi | Medio (cambiare la unique key è un cambio di comportamento applicativo, non solo schema — va coordinato con `addToCollection()`) | Sì | Sì, minimo (24 righe, popolare `card_print_id` da `card_api_id` esistente dove possibile) | No | Zero (tabella piccola) | Semplice dato il volume (24 righe) | Sì, si può far coesistere `card_api_id` e `card_print_id` per un periodo transitorio |
| `collection_items` con grading | 24 righe esistenti + nuovi campi mai popolati oggi | Basso (additivo, campi già esistono per grading — `is_graded` ecc. sono già in schema e inutilizzati) | Minima (i campi grading esistono già secondo `SCHEMA_VERIFICATION_REPORT.md` — verificare se completare lo schema o solo iniziare a scriverli dal frontend) | No | No | Zero | Banale | Sì |

**Nessuna proposta qui richiede un rewrite distruttivo delle ~154k + ~5k righe esistenti.** Ogni passo è
additivo (nuova colonna, nuova tabella, nuovo valore in colonna già esistente) tranne la correzione `tk`, che
è comunque isolata a 1.020 righe su oltre 200.000.

---

## 22. RISKS

1. **Rischio più alto identificato in questa sessione, non tecnico**: il meccanismo che popola
   `canonical_card_id`/`canonical_cards` oggi non è visibile nel repository (§3) — prima di costruire sopra
   "PRINT" bisogna sapere con certezza *come* e *quando* viene creato un nuovo gruppo canonico, altrimenti si
   rischia di introdurre PRINT che puntano a `canonical_card_id` che poi cambiano sotto i piedi per un processo
   non documentato.
2. **RLS disabilitata su `canonical_cards`/`rarities`** — già segnalato come rischio critico il 9 agosto, non
   risolto, resta valido e più urgente man mano che queste tabelle diventano più centrali nel modello (più ci
   si costruisce sopra, più costa lasciarle scrivibili da chiunque).
3. **Cambiare la unique key di `collection`** (§15/§21) è un cambio di comportamento applicativo osservabile
   dall'utente (oggi "riaggiungere" una carta la sovrascrive silenziosamente; dopo, andrebbe a incrementare
   quantity) — va comunicato/testato, non è un rischio di perdita dati ma di comportamento diverso da quello
   a cui gli utenti attuali (pochi: 24 righe) sono abituati.
4. **Fonti sealed products**: nessuna fonte gratuita affidabile trovata — il rischio più concreto per questa
   parte del modello non è tecnico, è "da dove arrivano davvero i dati prodotto", non risolto da questa
   ricerca (§12).
5. **Grading**: rischio di tentare, in futuro, di "arricchire automaticamente" le collection item con dati PSA
   in bulk per comodità — esplicitamente da evitare (limite 1 richiesta/giorno, oltre alla liceità non
   concessa), va ribadito nel §"WHAT NOT TO DO".

---

## 23. IMPLEMENTATION ORDER (solo ordine proposto, nessuna implementazione eseguita)

1. Chiarire il meccanismo reale di popolamento `canonical_cards`/`canonical_card_id` (rischio #1, §22) —
   prerequisito di conoscenza, non di codice, prima di tutto il resto.
2. Popolare `print_variant` per Pokémon da `variants` TCGdex (dato già disponibile, additivo, basso rischio).
3. Rimuovere il filtro `_p\d+$` per One Piece (stesso principio, dato già disponibile in fonte già integrata).
4. Investigare `set_id='tk'` con un fetch diretto (Node, non il tool di questa sessione) per chiudere l'ipotesi
   §11 con certezza, poi decidere la correzione.
5. Introdurre `source_priority`/`is_primary` per i 14.385 duplicati cross-source già noti.
6. Progettare (poi creare) `products`/`product_contents` partendo da un solo set pilota, non da tutto il
   catalogo insieme.
7. Estendere `collection` con `card_print_id` e nuova unique key, coordinato con `PortfolioModal.jsx`.
8. Only allora: esporre grading nel frontend, usando i campi già esistenti nello schema.

---

## CTO VERDICT

Se fossi il CTO di DraGold adotterei **esattamente il modello a due livelli già dimostrato da Scryfall**
(entity stabile + print come riga a sé), **innestato su `canonical_cards` che DraGold ha già e che già
funziona bene** per ricerca e pagina carta — non lo sostituirei, lo completerei. La priorità non è
l'architettura (il disegno concettuale corretto è chiaro e a basso rischio da implementare in modo additivo),
è **la disciplina di sequenza**: primo capire come si popola oggi `canonical_cards` (rischio #1), poi popolare
i campi che già esistono e sono vuoti (`print_variant`) prima di costruirci sopra nuove tabelle, poi solo alla
fine affrontare prodotti sigillati e grading — che sono le parti con meno fonti dati affidabili e quindi meno
urgenti rispetto a chiudere i buchi già noti su singole carte. Costruire prodotti/grading prima di aver
sistemato le fondamenta (priorità fonte, print_variant, il bug `tk`) sposterebbe sforzo su superficie nuova
mentre il nucleo (identità carta) resta ancora parzialmente incompleto.

## WHAT NOT TO DO

- Non creare una nuova entità "CARD ENTITY" da zero: `canonical_cards` esiste, funziona, è già usata da
  ricerca e pagina carta — sostituirla sarebbe lavoro sprecato.
- Non trasformare ogni chiave di `tcgplayer.prices` automaticamente in un record PRINT senza verificarne il
  significato fisico (§4) — sono segnali di pricing, non sempre 1:1 con una stampa fisica distinta.
- Non introdurre "Simple" nel modello senza aver trovato la fonte che lo definisce (§10).
- Non tentare di replicare/scaricare in blocco il database PSA — tecnicamente impossibile oggi (1
  richiesta/giorno) oltre che non concesso (§16).
- Non creare tabelle ARTWORK/REGION/PROMO separate finché non emerge un caso reale che lo richiede (§5) —
  l'over-engineering che la richiesta stessa metteva in guardia.
- Non cancellare i 14.385 duplicati cross-source né le 1.020 righe `tk` prima di aver capito la causa e senza
  backup — restano dati, non errori da eliminare a vista.
- Non cambiare la unique key/comportamento di `collection` senza coordinare il cambiamento con
  `PortfolioModal.jsx`/`addToCollection()` nello stesso rilascio — altrimenti si rompe silenziosamente
  l'aggiunta al portfolio.

## NEXT SINGLE ACTION

**Verificare con un fetch diretto (Node, fuori da questa sessione) la struttura reale di
`GET https://api.tcgdex.net/v2/en/sets/tk` e `GET https://api.tcgdex.net/v2/en/sets` per confermare o
smentire l'ipotesi §11** — è la singola domanda più piccola, più veloce da chiudere, e sblocca la decisione
corretta su come correggere le 1.020 righe in collisione senza rischiare un fix basato su un'ipotesi non
confermata.
