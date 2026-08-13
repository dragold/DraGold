# DraGold — Knowledge Graph: proposta architetturale (bozza per approvazione)

Data: 2026-08-09. Stato: **da approvare**, nessuna migration creata, nessun dato toccato.
Verifica basata su: `supabase/migrations/*.sql` (versionate), `scripts/sync-cards.js`, `scripts/enrich-cards.js`,
`src/pages/card/cardPageData.js`, `api/sitemap-cards.js`, `supabase/functions/sync-sets/index.ts`,
`src/DraGold.legacy.jsx`, `PRODUCT_SPEC.md`. Non è stato eseguito nessun accesso diretto a Supabase in questo
task — dove indicato "da verificare su Supabase", il dato non è disponibile da repository/migration.

---

## A. Decisioni già valide (si mantengono)

- **`cards` come tabella universale multi-TCG/multi-lingua** (una riga per lingua+stampa) è un pattern valido e
  comune anche nei progetti open source analizzati (TCGdex, pokemon-tcg-data). Non va ripensato da zero.
- **`canonical_card_id` come meccanismo di raggruppamento** delle varianti/lingue della stessa carta è la
  direzione giusta (confermato anche da PRODUCT_SPEC §1) — va solo formalizzato in migration versionata.
- **CardPage + lavoro SEO tecnico già fatto** (canonical tag, OG/Twitter, JSON-LD, sitemap dinamica via
  `canonical_cards`) resta valido e va riusato come pattern per le altre pagine di entità.
- **`card_prices` come tabella di snapshot storici, separata dal catalogo** — corretto, i prezzi restano un
  attributo opzionale della carta, non il centro del modello.
- **`metadata jsonb` su `cards`** per campi extra non ancora modellati (dexId, hp, types, stage) è un pattern
  sano per assorbire varietà tra TCG senza esplodere lo schema — va mantenuto per attributi realmente
  variabili, non come scorciatoia per entità che meritano una tabella propria (illustrator, rarity).
- **RLS pubblica in lettura, scrittura solo service_role** — pattern corretto, da mantenere su tutte le nuove
  tabelle del grafo.

## B. Problemi da risolvere

Solo quelli rilevanti per il Knowledge Graph (non un audit generale).

1. **Schema drift codice↔migration.** `cards.canonical_card_id`, `cards.illustrator`, `cards.evolves_from`,
   `cards.series_id`, `cards.series_name`, `cards.print_variant` sono letti/scritti dal codice
   (`cardPageData.js`, `sync-cards.js`, `enrich-cards.js`, `CardPage.jsx`) ma **non esistono in nessuna
   migration versionata**. Lo stesso vale per due tabelle intere: `canonical_cards` (usata da
   `cardPageData.js` e `api/sitemap-cards.js` per la sitemap pubblica) e `rarities` (usata da
   `cardPageData.js`). Anche `card_prices.price_median` e `card_prices.timeframe`, letti in
   `cardPageData.js`, non sono nella migration 002 che ha creato la tabella. Questo è un rischio reale: lo
   schema in produzione non è riproducibile da questo repository. Prima priorità operativa (task successivo,
   vedi §J) è congelare lo schema reale in migration, non solo progettare quello nuovo.
2. **`cards.set_id` e `sets.id` sono due spazi di ID scollegati.** `scripts/sync-cards.js` scrive
   `set_id` con l'ID di **TCGdex** (es. `sv3pt5`). `supabase/functions/sync-sets/index.ts` popola la tabella
   `sets` con l'ID di **TCG Price Lookup** (un altro provider, commento "UUID v7"). Nessuna colonna comune.
   Conferma in `src/DraGold.legacy.jsx` (righe ~3603-3629): per collegare una carta al suo set nella tabella
   `sets` il codice fa **fallback su `ilike('name', ...)`** (match testuale sul nome), non su una chiave
   stabile. Questo è il blocco reale dietro le future Set/Series pages e il completamento-set: senza una
   chiave di join affidabile, ogni pagina Set aggregata è costruita su un match fuzzy.
3. **Canonicalizzazione multi-lingua non formalizzata.** `canonical_card_id` esiste ed è popolato (PRODUCT_SPEC
   conferma: "popolato su tutte le righe controllate" nell'audit del 2026-08-05), ma non c'è una tabella
   `canonical_cards` versionata né una regola scritta su cosa rende due righe la "stessa carta canonica"
   (stesso set+numero+artwork attraverso le lingue? anche attraverso le ristampe?). Va deciso esplicitamente
   (§F).
4. **`illustrator` e `series` sono colonne testuali libere, non entità.** Non c'è deduplicazione (typo,
   varianti di scrittura del nome), non c'è pagina possibile senza normalizzazione, non c'è modo di contare
   "quante carte ha illustrato X" in modo affidabile.
5. **`character` non esiste.** Nessuna colonna, nessuna tabella. Serve una decisione esplicita se e come
   introdurla (§D) — PRODUCT_SPEC la elenca come priorità SEO (dopo Set) ma la lascia aperta.
6. **`rarity` è testo libero per-fonte (`cards.rarity`) più un tentativo di normalizzazione (`rarities`, non
   versionata)** — la relazione tra il valore grezzo per TCG (es. "Rare Holo VMAX" vs "Holo Rare VMAX") e una
   rarità canonica/ordinabile non è in nessuna migration.
7. **Lock-in verso le fonti correnti.** `cards.id` è già prefissato per fonte (`pokemon:tcgdex:...`), il che è
   positivo, ma `sets.id` è letteralmente l'ID esterno di TCG Price Lookup usato come primary key — se quella
   fonte cambia o si sostituisce, ogni riferimento a `sets.id` si rompe. Va introdotta una separazione tra
   identità DraGold e identificatore di fonte (§G).

## C. Confronto delle soluzioni esistenti

Solo le idee architetturali utili alle decisioni aperte, non un elenco generico.

| Progetto | Cosa risolve bene | Idea riusabile per DraGold | Licenza dati/codice | Stato |
|---|---|---|---|---|
| **TCGdex / cards-database** | Identità carta **indipendente dalla lingua**: `id` = `set + localId` (es. `swsh3-136`); la lingua è un parametro di richiesta, non parte dell'identità. `variants` (normal/holo/reverse/firstEdition/jumbo/wPromo) modella le stampe fisiche **separatamente** dalla lingua. `illustrator` è un campo stringa sul card, nessuna entità character. `serie → set` gerarchia esplicita. | La separazione "identità concettuale (set+numero) → variante fisica (holo/reverse/1st ed.) → lingua (solo testo/immagine cambia)" è esattamente il problema del punto F. Adottiamo il principio, non lo schema letterale (DraGold materializza una riga per lingua, TCGdex no). | Codice **MIT**. Dati (community-maintained) senza licenza dati separata esplicita nel repo — immagini escluse/gestite a parte. Uso commerciale non vietato esplicitamente ma da trattare con attenzione (community data, marchi Pokémon di terzi). | Attivo, ben mantenuto, già usato da DraGold come fonte. |
| **PokemonTCG/pokemon-tcg-data** | Stessa idea di `set.series` come raggruppamento (es. "Scarlet & Violet"). Schema set con `id, name, series, printedTotal, total, releaseDate`. | Conferma che `series` è un'entità a sé (non solo testo su `set`) anche nella fonte più popolare del settore — rafforza la decisione di normalizzarla. | **Nessun file LICENSE nel repository** (verificato: richiesta diretta restituisce vuoto) — trattare come "fan content", non assumere diritti di riuso ampio senza verifica separata. | Manutenzione incerta (V1 già dismessa in passato); non usare come unica fonte critica. |
| **collection.cards** | Progetto community per "browse, catalog, showcase cards and sets" — obiettivo di prodotto molto vicino a DraGold Explore. | Codice **MIT**, ma dichiara esplicitamente: immagini/artwork/loghi/trademark **non coperti** dalla licenza MIT. Utile promemoria per la separazione dati-vs-asset quando DraGold costruirà la pipeline immagini proprietaria (già in roadmap PRODUCT_SPEC). | Codice MIT; dati/immagini esclusi. | Community, minore adozione dei precedenti. |
| **One Piece (apitcg, optcgapi, opbindr/optcg-api, dotgg)** | Nessuna fonte "ufficiale aperta" paragonabile a TCGdex per Pokémon: sono tutti scraper/aggregatori sopra il sito Bandai ufficiale. `optcg-api` è esplicito: codice MIT, ma **i dati derivano da scraping di Bandai/TCGPlayer/dotgg/eBay e non sono ri-licenziati** dalla licenza del codice. | Nessun modello dati da copiare 1:1 con fiducia — conferma che per One Piece **DraGold deve trattare la fonte come sostituibile per definizione** (rischio di rottura/legale più alto che per Pokémon), rafforzando la necessità della separazione Source↔Canonical (§G). | Nessuna licenza dati chiara/uniforme tra i progetti. | Frammentato, nessuno standard de facto. |

Conclusione del confronto: nessun progetto esterno va adottato come dipendenza diretta di schema. Il valore
sta nei **principi** (identità carta indipendente da lingua/variante, `series` come entità, separazione
dati/immagini), non nel copiare uno schema che comunque risolve un problema più semplice del nostro
(loro non hanno Collection utente, Academy, né multi-TCG con priorità EN/JA come DraGold).

## D. Modello concettuale DraGold

| Entità | Perché esiste | Tabella indipendente o attributo? | Cosa evita |
|---|---|---|---|
| **Canonical Card** | Rappresenta "la carta" come concetto riconoscibile da un umano (es. "Charizard ex — 151, 199/165"), indipendentemente da lingua e piccole varianti di stampa. È il target degli URL SEO `/pokemon/carta/...`. | **Tabella** (`canonical_cards`, già esiste informalmente). Necessaria: è l'ancora di tutte le pagine aggregate e della Collection "possiedo questa carta". | Trattare EN e JA come due carte scollegate; pagine SEO duplicate per la stessa carta. |
| **Card Printing / Language Variant** | La riga concreta con dati verificabili di una fonte: lingua, immagine, set, numero, rarità grezza, prezzo collegabile. È l'unità che il sync effettivamente scrive. | **Tabella** (`cards`, esiste già). Non separare "printing" e "language variant" in due tabelle distinte: nella pratica DraGold materializza sempre entrambe insieme (una riga = una lingua + una stampa), e la fonte primaria (TCGdex) già fornisce i due assi indipendenti come attributi (`lang`, `variants`), non come entità separate. Separarle oggi sarebbe over-engineering senza un caso d'uso che lo richieda (es. tracciare 1st edition vs unlimited come oggetti di collezione distinti — possibile in futuro, non ora). | Duplicare l'intero grafo di attributi (nome, immagine, testo) per ogni variante fisica quando cambia solo un flag. |
| **Set** | Raggruppamento carte per espansione. Base di `/pokemon/sets/...` e del completamento-set in Collection. | **Tabella** (esiste, va corretta — vedi §B.2). | Ricalcolare "quante carte ha questo set" da `cards` ogni volta (fragile, dipende dalla fonte). |
| **Series** | Raggruppamento di set per blocco/era (es. "Scarlet & Violet"), confermato entità propria anche dalle fonti esterne (§C). Base di `/pokemon/series/...`. | **Tabella nuova** (`series`). Oggi è testo libero (`cards.series_name`) — non basta per una pagina Series pulita né per evitare duplicati ("Scarlet & Violet" vs "Scarlet and Violet"). | Pagine Series duplicate/sporche; impossibilità di contare set per serie in modo affidabile. |
| **Illustrator** | Persona che ha illustrato la carta. Base di `/pokemon/illustrators/...`, esplicitamente in roadmap PRODUCT_SPEC. | **Tabella nuova** (`illustrators`), con `cards.illustrator_id` FK. Il testo libero attuale (`cards.illustrator`) diventa il valore grezzo da normalizzare in fase di import, non la fonte di verità per la pagina pubblica. | Pagine "tutte le carte di X" sporche per typo/varianti di scrittura; conteggi sbagliati. |
| **Character** | Personaggio raffigurato (Charizard, Monkey D. Luffy). Priorità SEO esplicita in PRODUCT_SPEC, oggi assente. | **Tabella nuova** (`characters`) + relazione **molti-a-molti** con `canonical_cards` (non con `cards`: il personaggio raffigurato non cambia per lingua/stampa). M:N perché esistono carte con più personaggi (tag team, carte doppie in One Piece). | Modellare "character" come singola colonna su `cards` e poi scoprire che non regge le carte multi-personaggio. |
| **Rarity** | Rarità della carta, con bisogno sia del valore grezzo per-TCG (per fedeltà al dato fonte) sia di un livello canonico ordinabile (per UI/filtri/pagine "cos'è una rarità"). | **Tabella nuova** (`rarities`), FK da `cards` sul valore grezzo. Non serve tabella su `canonical_cards`: la rarità può variare tra stampe della stessa carta canonica (es. promo vs base). | Confrontare rarità testualmente tra TCG diversi; pagine Rarity impossibili da costruire in modo pulito. |
| **Product** | Prodotto fisico venduto (box, bustina, ETB) — rilevante quando Collection dovrà distinguere "possiedo carte sciolte" da "possiedo prodotti sigillati". | **Tabella nuova, ma fuori scope immediato** (Future, non bloccante per il Knowledge Graph). La includo nel modello per non dover ridisegnare Collection più avanti (§H), non per implementarla ora. | Dover reintrodurre Collection da zero quando si aggiungerà l'inventario sigillato. |

## E. Modello PostgreSQL proposto (target — nessuna migration creata)

Convenzioni: `uuid` con `gen_random_uuid()` per le nuove entità normalizzate; `text` per gli ID già in uso
verso fonti esterne (compatibilità con `cards.id` esistente); tutte le tabelle nuove con RLS pubblica in
lettura, scrittura solo `service_role`, come da pattern già in uso.

### `series` (nuova)
- `id uuid primary key default gen_random_uuid()`
- `tcg text not null`
- `slug text not null`
- `name text not null`
- `source_refs jsonb default '{}'` — mappa `{ "tcgdex": "sv", "pokemontcgio": "swsh" }` per evitare lock-in (§G)
- `created_at timestamptz default now()`, `updated_at timestamptz default now()`
- **unique** `(tcg, slug)`
- indice: `series_tcg_idx (tcg)`

### `sets` (da correggere — oggi popolata da fonte incompatibile con `cards.set_id`)
- `id uuid primary key default gen_random_uuid()` — **nuova** chiave interna DraGold (l'attuale `sets.id`
  testuale di TCG Price Lookup diventa un valore in `source_refs`, non la PK)
- `tcg text not null` (rinomina concettuale di `game`)
- `slug text not null`
- `name text not null`
- `series_id uuid references series(id)`
- `card_count integer`
- `released_at date`
- `source_refs jsonb default '{}'` — es. `{ "tcgdex": "sv3pt5", "tcgpricelookup": "<id originale>" }`
- `synced_at timestamptz default now()`
- **unique** `(tcg, slug)`
- indice: `sets_series_idx (series_id)`, `sets_released_idx (released_at desc nulls last)`
- **Nota critica**: questa è la tabella che risolve il problema §B.2. La chiave di join verso `cards` non
  sarà più un nome fuzzy, ma `cards.set_ref_id → sets.id` (nuova colonna, vedi sotto) risolta in fase di
  import tramite `source_refs->>'tcgdex' = cards.set_id`.

### `illustrators` (nuova)
- `id uuid primary key default gen_random_uuid()`
- `slug text not null unique`
- `name text not null`
- `bio text`
- `created_at timestamptz default now()`, `updated_at timestamptz default now()`
- indice: `illustrators_name_trgm_idx` (gin trgm, per dedup fuzzy in fase di normalizzazione)

### `characters` (nuova)
- `id uuid primary key default gen_random_uuid()`
- `tcg text not null` — un personaggio è specifico del franchise/gioco (Charizard ≠ concetto cross-TCG)
- `slug text not null`
- `name text not null`
- `dex_id integer` — solo Pokémon, nullable
- `description text`
- **unique** `(tcg, slug)`

### `card_characters` (nuova, join M:N)
- `canonical_card_id uuid references canonical_cards(id) on delete cascade`
- `character_id uuid references characters(id) on delete cascade`
- **primary key** `(canonical_card_id, character_id)`
- indice: `card_characters_character_idx (character_id)`

### `rarities` (da formalizzare — oggi usata dal codice ma non versionata)
- `id uuid primary key default gen_random_uuid()`
- `tcg text not null`
- `raw_value text not null` — il valore grezzo così come arriva dalla fonte (es. "Rare Holo VMAX")
- `slug text not null`
- `label_en text not null`
- `tier integer` — livello ordinabile per UI/filtri (non un ranking di valore economico)
- **unique** `(tcg, raw_value)`
- indice: `rarities_tcg_idx (tcg)`

### `canonical_cards` (da formalizzare — oggi usata dal codice ma non versionata)
- `id uuid primary key default gen_random_uuid()`
- `tcg text not null`
- `slug text not null unique` — target di `/carta/{slug}` (già in produzione via `api/sitemap-cards.js`)
- `primary_image_card_id text references cards(id)` — quale riga `cards` fornisce l'immagine/nome di default
- `name_en text` — denormalizzato per liste/ricerca senza join
- `created_at timestamptz default now()`, `updated_at timestamptz default now()`
- indice: `canonical_cards_tcg_idx (tcg)`, `canonical_cards_updated_idx (updated_at desc)` (già sfruttato dalla sitemap)

### `cards` (esistente — estensione, non riscrittura)
Colonne da **formalizzare in migration** perché già scritte/lette dal codice ma assenti dallo schema
versionato: `canonical_card_id text references canonical_cards(id)`, `illustrator text` (mantenuto come
valore grezzo/fallback), `illustrator_id uuid references illustrators(id)` (nuovo, popolato in normalizzazione),
`evolves_from text`, `series_id text`, `series_name text` (mantenuti come valori grezzi legacy),
`print_variant text default 'standard'`.
Colonna nuova per risolvere §B.2: `set_ref_id uuid references sets(id)` (popolata in import, non sostituisce
`set_id`/`set_name` che restano il valore grezzo di fonte).
- indice aggiuntivo: `cards_canonical_idx (canonical_card_id)`, `cards_set_ref_idx (set_ref_id)`,
  `cards_illustrator_idx (illustrator_id)`

### `card_prices` (esistente — formalizzare colonne mancanti)
`price_median numeric(10,2)`, `timeframe text` risultano lette da `cardPageData.js` ma assenti dalla
migration 002: da verificare direttamente su Supabase e aggiungere in migration se confermate.

### `external_card_import` (nuova — landing zone, vedi §G)
- `id bigserial primary key`
- `source text not null`
- `source_id text not null`
- `lang text not null`
- `tcg text not null`
- `payload jsonb not null`
- `fetched_at timestamptz default now()`
- `processed_at timestamptz`
- **unique** `(source, source_id, lang)`
- indice: `external_import_unprocessed_idx (source) where processed_at is null`

### `collection` (esistente — estensione minima)
Aggiungere `canonical_card_id text` (denormalizzato, senza FK per coerenza con la scelta già fatta in
006_collection_denormalized.sql di non avere FK rigide su questa tabella) per poter rispondere a "possiedo
questa carta in una qualsiasi versione" senza join su `cards`. Non tocca la logica esistente
(`card_id` continua a puntare alla stampa/lingua specifica posseduta).

## F. Canonical identity: Card vs Printing vs Language

Distinzione concettuale:

- **Carta canonica** = l'oggetto riconoscibile da un collezionista: stesso artwork, stesso set, stesso
  numero. "Charizard ex 199/165" è una carta canonica, indipendentemente dal fatto che la possieda in
  inglese o giapponese.
- **Stampa/variante** = differenza fisica reale all'interno della stessa carta canonica: holo vs reverse vs
  1st edition vs promo stamp. Cambia l'oggetto fisico ma non l'identità concettuale.
- **Lingua** = cambia solo testo e (di solito) immagine. Non è una "variante" nel senso collezionistico, è
  una traduzione della stessa stampa.

Modello scelto (adattato da TCGdex, non copiato): **`canonical_cards` → `cards`**, a due livelli, non tre.
Motivazione: separare "stampa" e "lingua" in due tabelle distinte (three-tier `canonical_card → card_printing →
language`) sarebbe corretto in astratto ma oggi non ha un caso d'uso che lo giustifichi — DraGold non ha
ancora bisogno di elencare "questa stampa esiste in 6 lingue, questa in 2" come entità propria; le ha
sempre e solo materializzate insieme, una riga `cards` per (canonical_card, lingua, print_variant). Aggiungere
un livello intermedio ora significherebbe una tabella `card_printings` con quasi le stesse colonne di
`cards` meno `lang`, senza query reali che la sfruttino: è la definizione di over-engineering che il task
chiede di evitare.

Il compromesso concreto: `print_variant` resta un **attributo testuale su `cards`** (già esiste, va solo
vincolato a un set di valori noti — normal/holo/reverse/1st-edition/promo, coerente con l'enum `VariantType`
di TCGdex) invece di una tabella propria. Se in futuro servirà tracciare la variante come oggetto di
collezione indipendente dalla lingua (es. per il pricing, che spesso varia per variante più che per lingua),
si potrà normalizzare `print_variant` in una tabella `printing_variants` senza rompere `canonical_cards`,
perché il livello superiore non cambia.

Regola di raggruppamento in `canonical_cards`: due righe `cards` condividono lo stesso `canonical_card_id`
se e solo se hanno stesso `tcg`, stesso artwork/identità di stampa (in pratica: stesso `set_ref_id` + stesso
`card_number`), indipendentemente da `lang` e `print_variant`. Le **ristampe in set diversi non condividono
`canonical_card_id`** (sono carte canoniche distinte, anche se raffigurano lo stesso personaggio con arte
simile) — altrimenti "canonical" finirebbe per significare "stesso personaggio", che è già il ruolo di
`characters`. Questa regola va confermata da Ermal (§I).

## G. Strategia di importazione: Source vs Canonical

Sì, separare esplicitamente. Pipeline proposta:

`fonte esterna (TCGdex/TCG Price Lookup/altro)` → **`external_card_import`** (payload grezzo, jsonb,
per-fonte, mai modificato) → **job di normalizzazione** (dedup illustrator per nome, risoluzione
`set_ref_id` tramite `source_refs`, assegnazione/creazione `canonical_card_id`) → **`cards` /
`canonical_cards` / `sets` / `illustrators` / `series` / `rarities`** (dati canonici DraGold).

Perché: oggi il "raw" e il "canonico" sono nella stessa riga (`cards` contiene sia il dato as-is da TCGdex
sia, in prospettiva, il collegamento canonico). Se TCGdex cambiasse formato o DraGold aggiungesse una
seconda fonte per Pokémon (es. pokemontcg.io come fallback, già presente come dipendenza fragile secondo
PRODUCT_SPEC), il job di normalizzazione ha un solo punto di responsabilità: leggere `external_card_import`,
scrivere entità canoniche. Le tabelle canoniche non sanno più da quale fonte viene un dato — lo sanno solo
tramite `source_refs`/`source`+`source_id`, che restano per audit e per capire cosa manca, non per pilotare
la UI pubblica.

Non è necessario migrare subito tutta la pipeline esistente su questo schema a due fasi: `sync-cards.js` può
continuare a scrivere `cards` direttamente come oggi (riduce rischio, non blocca), mentre nuove fonti o
fonti da sostituire (es. One Piece, dove — §C — nessuna fonte è stabile) passano dal nuovo pattern fin da
subito.

## H. Impatto SEO / Collection / Academy

**SEO.** Il modello sostiene tutte le URL previste: `canonical_cards.slug` → pagina carta (già in
produzione); `sets.slug` (+ `tcg`) → pagina set; `series.slug` → pagina serie; `illustrators.slug` → pagina
illustratore; `characters.slug` → pagina personaggio; `rarities.slug` → pagina rarità. Tutte le entità hanno
uno slug univoco per `tcg`, coerente con URL del tipo `/pokemon/sets/...`, `/one-piece/illustrators/...`.
Nessuna pagina aggregata richiede più di un join diretto (niente `ilike` su nomi, a differenza di oggi).

**Collection.** Con `collection.canonical_card_id` (denormalizzato, §E) si può rispondere sia a "possiedo
questa carta" (query su `canonical_card_id`) sia a "possiedo questa stampa/lingua specifica" (query su
`card_id` esistente) senza ridisegnare la tabella. Il completamento-set diventa un conteggio su
`sets.card_count` vs carte possedute con lo stesso `set_ref_id` — niente più match sul nome.

**Academy.** Nessuna tabella Academy proposta qui (fuori scope, §10 del task). Il modello lo permette in
futuro con un pattern uniforme: una tabella `academy_content` con colonne di collegamento opzionali
(`canonical_card_id`, `set_id`, `series_id`, `illustrator_id`, `character_id`, `rarity_id`, `tcg`) — ogni
entità del grafo è già una tabella con `id` referenziabile, quindi collegare contenuti educativi non richiede
cambi allo schema qui proposto.

## I. Decisioni da approvare

1. **Formalizzare prima lo schema attuale reale in migration** (colonne/tabelle già in uso ma non
   versionate: `canonical_cards`, `rarities`, `cards.canonical_card_id/illustrator/evolves_from/series_id/
   series_name/print_variant`, `card_prices.price_median/timeframe`) — prima di aggiungere qualunque tabella
   nuova, per chiudere il gap segnalato in CLAUDE.md §9. Richiede una verifica diretta su Supabase (tipi di
   colonna reali, constraint esistenti) non disponibile da questo repository.
2. **Regola di raggruppamento canonico**: stesso `set_ref_id` + `card_number` = stessa carta canonica,
   indipendente da lingua/print_variant; ristampe in set diversi restano carte canoniche separate (§F). Da
   confermare — è la decisione più importante del documento.
3. **Modello a due livelli (`canonical_cards → cards`)** invece di tre livelli
   (`canonical_card → card_printing → language`) — confermare che non serve ancora tracciare la stampa come
   entità indipendente dalla lingua.
4. **Character come M:N su `canonical_cards`**, non su `cards` — confermare (impatta come si scrivono le
   query per le pagine personaggio).
5. **Sostituire `sets.id` (oggi = ID esterno di TCG Price Lookup) con una chiave interna DraGold**, spostando
   l'ID esterno in `source_refs` — è un cambio di primary key su una tabella già in produzione, va pianificato
   come migrazione dedicata con downtime/compatibilità da valutare, non un semplice `alter table`.
6. **Introdurre `external_card_import` come landing zone** per nuove fonti (a partire da One Piece, dove la
   fonte è instabile per definizione) — o continuare a scrivere direttamente in `cards` come oggi e rimandare
   la separazione a quando cambierà davvero la fonte.
7. **Priorità di normalizzazione**: Illustrator prima di Character (Illustrator ha già dati popolati via
   `enrich-cards.js`, Character parte da zero) — confermare l'ordine implicito di PRODUCT_SPEC §2
   (Set → Character → Illustrator → Rarity → Series) o allinearlo alla disponibilità dati reale.

## J. Prossimo task

**Verifica diretta su Supabase dello schema reale** (task tecnico, non di design): connettersi al progetto
Supabase (`pimwkmwrduqkaydyvxqz`) ed estrarre lo schema effettivo di `cards`, `canonical_cards`, `rarities`,
`card_prices` (tipi colonna, constraint, indici esistenti), poi scrivere le migration versionate che
congelano lo stato reale — **prima** di scrivere qualunque migration per le tabelle nuove proposte in questo
documento (§E). Senza questo passaggio, ogni nuova migration rischia di collidere con colonne/tipi già
esistenti ma non documentati.
