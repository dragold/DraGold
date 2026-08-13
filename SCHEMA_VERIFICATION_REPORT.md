# DraGold — Verifica reale schema Supabase (`pimwkmwrduqkaydyvxqz`)

Data verifica: 2026-08-09. Metodo: query read-only via MCP Supabase (`list_tables`, `execute_sql` con sole
`SELECT`/catalog queries, `list_extensions`, `list_migrations`, `get_advisors`). **Nessuna scrittura, nessuna
migration, nessuna modifica a dati/codice/schema.** Postgres 17.6, progetto "dragold", regione eu-west-1.

Fonte di verità per questo report: Supabase reale → codice reale → `supabase/migrations/*.sql`. Dove il
documento architetturale precedente (`KNOWLEDGE_GRAPH_PROPOSAL.md`) o l'audit PRODUCT_SPEC del 2026-08-05
divergono da quanto verificato qui, è segnalato esplicitamente in **D** e nelle note a fondo tabella.

---

## A. Schema reale Supabase

### `cards` (200.939 righe)

| Colonna | Tipo | Null | Default | Note |
|---|---|---|---|---|
| `id` | text | NOT NULL | — | **PK** |
| `tcg` | text | NOT NULL | — | |
| `source` | text | NOT NULL | — | |
| `source_id` | text | NOT NULL | — | |
| `lang` | text | NOT NULL | `'en'` | |
| `name` | text | NOT NULL | — | |
| `set_id` | text | nullable | — | |
| `set_name` | text | nullable | — | |
| `card_number` | text | nullable | — | |
| `rarity` | text | nullable | — | valore grezzo, nessuna FK verso `rarities` |
| `supertype` | text | nullable | — | |
| `image_url` | text | nullable | — | |
| `image_url_hi` | text | nullable | — | |
| `metadata` | jsonb | nullable | `'{}'` | |
| `created_at` | timestamptz | nullable | `now()` | |
| `updated_at` | timestamptz | nullable | `now()` | |
| `name_en` | text | nullable | — | **non in migration**, usata da `DraGold.jsx`, `SearchView.jsx`, `src/lib/search.js`, `scripts/sync-pokemon-ptcg.js` |
| `canonical_card_id` | **uuid** | nullable | — | **FK reale** → `canonical_cards.id` on delete set null |
| `print_variant` | text | nullable | — | esiste ma 0 righe popolate |
| `illustrator` | text | nullable | — | |
| `evolves_from` | text | nullable | — | |
| `series_id` | text | nullable | — | esiste ma 0 righe popolate |
| `series_name` | text | nullable | — | |

PK: `cards_pkey (id)`. FK: `cards_canonical_card_id_fkey (canonical_card_id → canonical_cards.id, ON DELETE SET NULL)`.
Nessun unique constraint oltre alla PK. Indici: `cards_tcg_lang_idx`, `cards_name_trgm_idx` (gin trgm),
`cards_set_idx`, `cards_number_idx`, `cards_card_number_trgm_idx` (gin trgm), `cards_set_name_trgm_idx` (gin
trgm), `cards_rarity_trgm_idx` (gin trgm), `cards_lang_idx`, `cards_canonical_card_idx`,
`cards_illustrator_idx` (parziale, `WHERE illustrator IS NOT NULL`), `cards_series_idx` (parziale, `WHERE
series_id IS NOT NULL`, su `(tcg, series_id)`). RLS **enabled**, 1 policy: `cards_public_read` (SELECT,
`true`, tutti). Nessun trigger.

### `canonical_cards` (87.189 righe)

| Colonna | Tipo | Null | Default | Note |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | **PK** |
| `tcg` | text | NOT NULL | — | |
| `base_name` | text | NOT NULL | — | **non `name_en` come ipotizzato nel documento precedente** |
| `set_id` | text | nullable | — | |
| `card_number` | text | nullable | — | |
| `slug` | text | nullable | — | target `/carta/{slug}` — **nullable, non unique** |
| `primary_image_card_id` | text | nullable | — | FK → `cards.id` |
| `created_at` | timestamptz | nullable | `now()` | |
| `updated_at` | timestamptz | nullable | `now()` | |

PK: `canonical_cards_pkey (id)`. FK: `canonical_cards_primary_image_card_id_fkey (primary_image_card_id →
cards.id, ON DELETE SET NULL)`. **Unique reale: `canonical_cards_group_uk` su `(tcg, set_id, card_number)`**
— questa è la regola di raggruppamento canonico effettivamente in vigore in produzione, non solo proposta.
Indice aggiuntivo non-unique identico `canonical_cards_group_idx` (ridondante con lo unique index, verificare
se voluto). **Nessun unique/index su `slug`.**
**RLS: DISABLED. Zero policy.** Vedi rischio critico in §D.

### `rarities` (87 righe)

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `tcg` | text | NOT NULL | — |
| `raw_value` | text | NOT NULL | — |
| `slug` | text | NOT NULL | — |
| `label_en` | text | NOT NULL | — |
| `tier` | integer | NOT NULL | `0` |
| `created_at` | timestamptz | nullable | `now()` |

PK: `rarities_pkey (id)`. **Unique: `rarities_tcg_raw_value_key (tcg, raw_value)`** — esiste realmente,
coerente con la query in `cardPageData.js`. Nessuna FK da `cards` verso questa tabella: il collegamento
avviene solo a runtime nel codice (`cards.rarity = rarities.raw_value` filtrato per `tcg`), non è imposto
dal DB. **RLS: DISABLED. Zero policy.** Vedi rischio critico in §D.

### `card_prices` (163.369 righe)

| Colonna | Tipo | Null | Default | Note |
|---|---|---|---|---|
| `id` | bigint | NOT NULL | `nextval(...)` | **PK** |
| `card_id` | text | nullable | — | FK → `cards.id` on delete cascade; 100% popolato (163.369/163.369) nonostante nullable |
| `source` | text | NOT NULL | — | |
| `currency` | text | NOT NULL | `'USD'` | |
| `price_market` | numeric | nullable | — | |
| `price_low` | numeric | nullable | — | |
| `price_high` | numeric | nullable | — | |
| `raw_response` | jsonb | nullable | — | |
| `captured_at` | timestamptz | nullable | `now()` | |
| `timeframe` | text | nullable | — | **non in migration 002**, commento DB: "Sold-price window: 7d, 30d, 90d (eBay Finding API). NULL = spot price" |
| `price_median` | numeric | nullable | — | **non in migration 002**, commento DB: "Median sold price... più robusto della media per mercati sottili" |

PK: `card_prices_pkey`. FK: `card_prices_card_id_fkey`. Indici: `prices_card_idx (card_id, captured_at desc)`,
`prices_source_idx (source, captured_at desc)`, `idx_card_prices_tf (card_id, source, timeframe, captured_at
desc) WHERE timeframe IS NOT NULL`. RLS enabled, 1 policy: `prices_public_read` (SELECT, `true`).

### `sets` (1.668 righe)

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| `id` | text | NOT NULL | — |
| `slug` | text | NOT NULL | — |
| `game` | text | NOT NULL | — |
| `name` | text | NOT NULL | — |
| `card_count` | integer | nullable | — |
| `released_at` | date | nullable | — |
| `synced_at` | timestamptz | nullable | `now()` |

Identico alla migration `20260608_sets_table.sql`, nessun drift qui. PK: `sets_pkey (id)`. Nessuna FK (né in
entrata né in uscita — **`cards` non referenzia `sets` in alcun modo**). Nessun unique su `slug` o `game`.
Indici: `sets_game_idx (game)`, `sets_released_idx (released_at desc nulls last, id desc)`. RLS enabled, 1
policy: `sets_public_read`. Campione righe: `id` è un UUID (es. `019e6be1-eac0-770e-b8c1-8a497282c488`),
confermando la fonte "TCG Price Lookup"; `slug` è del tipo `pokemon--aquapolis`.

**Verifica incrocio `cards.set_id` ↔ `sets`**: 200.430 righe di `cards` hanno `set_id` non nullo (1.210
valori distinti, es. `sv3pt5`, formato TCGdex). Join `cards.set_id = sets.id` → **0 corrispondenze**. Join
`cards.set_id = sets.slug` → **0 corrispondenze**. Confermato con query dirette: **nessuna riga di `cards` è
oggi collegabile a `sets` tramite alcuna colonna esistente.** L'unico collegamento nel codice è un `ilike`
su `name` (`DraGold.legacy.jsx`), fuzzy e non garantito.

### `collection` (24 righe)

| Colonna | Tipo | Null | Default | Note |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `uuid_generate_v4()` | **PK** |
| `user_id` | uuid | nullable | — | FK → `profiles.id` on delete cascade (non `auth.users` direttamente) |
| `binder_id` | uuid | nullable | — | FK → `binders.id` on delete set null |
| `tcg` | text | NOT NULL | — | |
| `card_api_id` | text | NOT NULL | — | **identificatore reale della carta posseduta — non `card_id`** |
| `card_name` | text | nullable | — | |
| `set_name` | text | nullable | — | |
| `card_number` | text | nullable | — | |
| `rarity` | text | nullable | — | |
| `image_url` | text | nullable | — | |
| `language` | text | nullable | `'EN'` | |
| `condition` | text | nullable | `'NM'` | |
| `is_graded` | boolean | nullable | `false` | |
| `grade_company` | text | nullable | — | |
| `grade_value` | text | nullable | — | |
| `purchase_price` | numeric | nullable | — | |
| `purchase_date` | date | nullable | — | |
| `fmv_snapshot` | numeric | nullable | — | |
| `fmv_currency` | text | nullable | `'EUR'` | |
| `notes` | text | nullable | — | |
| `added_at` | timestamptz | nullable | `now()` | |
| `quantity` | integer | NOT NULL | `1` | |

PK: `collection_pkey (id)`. FK: `collection_user_id_fkey`, `collection_binder_id_fkey`. **Unique reale:
`collection_user_id_card_api_id_key (user_id, card_api_id)`** — non `(user_id, card_id, condition)` come
nelle migration. **Nessuna colonna `card_id`, nessuna colonna `canonical_card_id`, nessuna FK verso
`cards`** — `card_api_id` è testo libero, non vincolato al catalogo. Indici: `collection_user_idx (user_id)`,
`collection_binder_idx (binder_id)`. RLS enabled, 1 policy: `collection_own` (comando `ALL`, `auth.uid() =
user_id`) — una sola policy onnicomprensiva, non 4 policy separate per select/insert/update/delete come
descritto nelle migration.

## B. Drift migration ↔ produzione

| Tabella | Presente in migration ma NON in produzione | Presente in produzione ma NON in migration | Tipo diverso | Constraint/indice solo da un lato |
|---|---|---|---|---|
| `cards` | — | `name_en`, `canonical_card_id`, `print_variant`, `illustrator`, `evolves_from`, `series_id`, `series_name` (tutte da migration 002, mai aggiunte lì) | — | Indici trgm su `card_number`, `set_name`, `rarity`, indice parziale `illustrator`/`series_id`, indice `canonical_card_id` — nessuno di questi in migration |
| `canonical_cards` | Tabella intera assente da ogni migration | Tabella intera (id, tcg, base_name, set_id, card_number, slug, primary_image_card_id, created_at, updated_at) | — | Unique `(tcg, set_id, card_number)` non documentato altrove |
| `rarities` | Tabella intera assente da ogni migration | Tabella intera | — | Unique `(tcg, raw_value)` non documentato altrove |
| `card_prices` | — | `timeframe`, `price_median` | — | Indice `idx_card_prices_tf` non in migration |
| `sets` | — | — | — | Nessun drift: coincide con `20260608_sets_table.sql` |
| `collection` | Schema intero descritto in `004_user_collection.sql`/`006_collection_denormalized.sql` (`card_id`, `paid_eur`, `paid_usd`, `card_set`, `card_img`, `card_lang`, unique `(user_id, card_id, condition)`, 4 policy separate) | Schema reale completamente diverso: `card_api_id`, `binder_id`, `is_graded`, `grade_company`, `grade_value`, `purchase_price`, `purchase_date`, `fmv_snapshot`, `fmv_currency`, unique `(user_id, card_api_id)`, 1 policy `ALL` | `id`: migration = `bigserial`, reale = `uuid default uuid_generate_v4()` | FK verso `profiles`/`binders` (non in nessuna migration); nessuna FK verso `cards` in nessuno dei due |

Nota generale: `list_migrations` (storico ufficiale delle migration applicate via Supabase) restituisce
**zero risultati**. Questo significa che nessuna delle migration in `supabase/migrations/*.sql` risulta
applicata tramite il meccanismo di migration tracciato da Supabase — sono con altissima probabilità state
eseguite a mano via SQL Editor (o comunque non tramite CLI/migration flow), il che spiega perché lo schema
reale ha continuato a evolvere (nuove colonne, nuove tabelle, `collection` riscritta da zero) senza lasciare
traccia in questo repository. Il repository di migration oggi **documenta un'intenzione passata, non lo
stato storico reale**.

## C. Drift codice ↔ produzione

Buona notizia: **nessuna tabella o colonna usata dal codice risulta assente in produzione** tra quelle
verificate. `canonical_cards`, `rarities`, `cards.canonical_card_id/illustrator/evolves_from/series_id/
series_name/print_variant`, `card_prices.timeframe/price_median` esistono davvero — il gap è
solo "codice+DB vs. migration versionate" (§B), non "codice vs. DB reale".

Uniche osservazioni:
- `cards.name_en` è usata da `DraGold.jsx`, `SearchView.jsx`, `src/lib/search.js`,
  `scripts/sync-pokemon-ptcg.js` — non era stata rilevata nel giro di verifica del documento architetturale
  precedente (che si era concentrato su `cardPageData.js`/`sync-cards.js`/`enrich-cards.js`). Esiste
  davvero, popolata su 112.570/200.939 righe (56%).
- `collection` nel codice **legacy** (`src/DraGold.legacy.jsx`) e negli edge functions più vecchi
  probabilmente assume ancora la forma `card_id`/`paid_eur` — da verificare in una prossima analisi statica
  se questo codice legacy è ancora eseguito in produzione o è dead code, perché lo schema reale non ha più
  quelle colonne.
- Nessun FK reale da `cards.rarity` a `rarities` — il join è interamente applicativo (query separata in
  `cardPageData.js`), quindi un valore di `rarity` senza corrispondente riga in `rarities` non genera errore,
  semplicemente la card page non mostra il blocco rarità.

## D. Rischi (ordinati per gravità)

1. **CRITICO — `canonical_cards` e `rarities` hanno Row Level Security disabilitata**, confermato anche
   dall'advisor di sicurezza di Supabase (livello `ERROR`, categoria `rls_disabled_in_public`). Sono tabelle
   pubbliche in schema `public`, esposte via PostgREST: senza RLS attiva, **qualsiasi chiamata con la chiave
   anon può leggere E scrivere/modificare/cancellare righe** in queste due tabelle (a differenza di `cards`,
   `card_prices`, `sets` che hanno RLS attiva con policy di sola lettura pubblica). Oggi probabilmente non
   sfruttato perché nessuno lo sa, ma è un'esposizione reale: chiunque potrebbe alterare
   `canonical_cards.slug` o `primary_image_card_id` (rompendo le pagine SEO pubbliche) o inserire righe
   arbitrarie in `rarities`. **Non ho applicato la remediation** (richiede policy scritte apposta, abilitare
   RLS senza policy bloccherebbe anche le letture legittime che il codice fa oggi) — segnalo soltanto,
   decisione tua.
2. **ALTO — nessuna migration risulta applicata secondo il tracking di Supabase** (`list_migrations` vuoto).
   Lo schema reale ha continuato a evolvere fuori da questo processo (nuove colonne su `cards`, tabelle
   intere come `canonical_cards`/`rarities`, riscrittura totale di `collection`) senza lasciare traccia
   versionata. Il rischio non è teorico: è già successo che `collection` sia stata ridisegnata senza che il
   repository lo registrasse.
3. **ALTO — `canonical_cards.slug` non è unique e ha 280 valori duplicati su 87.189 righe** (verificato:
   `slug` sempre non-null, ma `count(distinct slug) = 86.909` contro `count(slug) = 87.189`). Esempio:
   `pokemon-sv10-064` compare 2 volte. Impatto diretto: `cardPageData.js` fa
   `.eq('slug', slug).limit(1).maybeSingle()` — per questi 280 slug, una delle due carte canoniche è
   silenziosamente irraggiungibile dalla sua pagina pubblica (l'altra vince per ordine di scan). Rischio SEO
   concreto, non ipotetico.
4. **MEDIO-ALTO — nessun collegamento reale tra `cards` e `sets`**, confermato con query diretta: 0 match su
   `cards.set_id = sets.id`, 0 match su `cards.set_id = sets.slug`, su 200.430 righe con `set_id` popolato.
   Confirma quanto emerso nel documento precedente, ora con dati esatti. Blocca qualunque pagina Set/Series
   affidabile e il completamento-set preciso.
5. **MEDIO — `cards.canonical_card_id` è popolato solo sul 95,95% delle righe** (192.802/200.939), **non sul
   100%** come riportato nell'audit PRODUCT_SPEC del 2026-08-05 ("canonical_card_id popolato su tutte le
   righe controllate"). **Contraddizione da segnalare esplicitamente**: l'audit probabilmente ha controllato
   un campione (non l'intera tabella) o è stato eseguito prima che venissero importate le 8.137 righe oggi
   senza gruppo canonico. 8.137 carte oggi non hanno una pagina canonica raggiungibile.
6. **MEDIO — `cards.series_id` e `cards.print_variant` sono al 0% di copertura** (0 righe su 200.939),
   nonostante `scripts/sync-cards.js` scriva `series_id`/`series_name` a ogni upsert Pokémon. Spiegazione
   plausibile: la logica di sync salta i set già "completi" (`countInDb >= totalCards`) prima di controllare
   se le colonne più recenti sono popolate, quindi le righe storiche non vengono mai ri-scritte con i campi
   aggiunti dopo la loro creazione. Da verificare in un task dedicato, non qui.
7. **BASSO-MEDIO — `collection` ha solo 24 righe reali e uno schema (grading, binder, fmv) molto più ricco e
   diverso da quanto assunto nel documento architetturale precedente**, che ipotizzava di aggiungere
   `canonical_card_id` alla tabella descritta dalle migration 004/006 — quella tabella, così com'è descritta
   lì, **non è quella in produzione**. Qualunque lavoro su Collection deve partire dallo schema reale
   documentato in §A, non da quello delle migration.
8. **BASSO — `pg_trgm` installata nello schema `public`** invece che in `extensions` (segnalato anche
   dall'advisor Supabase come best-practice, non specifico al Knowledge Graph — lo noto solo perché tocca
   direttamente gli indici trgm di `cards`).

## E. Piano di migration (solo proposta — non implementato)

Obiettivo: passare da "le migration descrivono un'intenzione passata" a "le migration sono la fonte di
verità dello schema", senza rompere nulla che oggi funziona.

1. **Congelare lo stato attuale con `apply_migration`** (non ancora eseguito): una singola migration
   "baseline" che usa `create table if not exists` + `alter table ... add column if not exists` per
   ciascuna delle differenze elencate in §B — scritta per essere no-op se rieseguita, così da poter essere
   applicata in sicurezza anche se qualcosa è già presente. Ordine: prima le tabelle mancanti
   (`canonical_cards`, `rarities` con lo schema esatto verificato in §A, incluso l'unique
   `(tcg, set_id, card_number)` e `(tcg, raw_value)`), poi le colonne mancanti su `cards` e `card_prices`.
   **Non tocca `sets`** (già in linea) né riscrive `collection` (schema troppo divergente per un semplice
   `add column if not exists` — merita una migration dedicata separata, vedi punto 4.
2. **Attivare `list_migrations`/CLI come processo standard da qui in avanti**: dopo la baseline, ogni nuovo
   cambio di schema passa da `apply_migration` (che Supabase traccia), non più da SQL Editor manuale. Questo
   è un cambio di processo, non di schema — va deciso da Ermal, non imposto.
3. **Prima di correggere il drift `cards.set_id`/`sets`**: non è una `alter table`, richiede una migrazione
   dati (risolvere ogni `cards.set_id` verso il `sets.id` corretto tramite un mapping esterno, es. nome+game,
   oppure ripopolare `sets` da TCGdex invece che da TCG Price Lookup) — task separato dal semplice freeze
   dello schema, perché comporta scrittura/backfill, non solo DDL.
4. **`collection`**: la migration "baseline" registra lo schema reale (quello di §A) così com'è, senza
   modificarlo. Qualunque evoluzione (aggiungere `canonical_card_id`, collegare a `cards`) è un task
   separato successivo, da valutare insieme all'uso reale del layer binder/grading/fmv che oggi non è
   documentato in nessun punto del repository che ho verificato.
5. **RLS su `canonical_cards`/`rarities`**: non è parte del freeze schema — è un fix di sicurezza a parte,
   da discutere con policy esplicite prima di attivare RLS (per non rompere le letture pubbliche che
   `cardPageData.js` fa oggi senza autenticazione).
6. **Deduplicazione `canonical_cards.slug`**: prima di aggiungere un unique constraint su `slug`, va prodotta
   la lista dei 280 slug duplicati e decisa una regola di risoluzione (merge? rigenerazione slug?) — non è
   una migration DDL semplice, richiede una decisione di prodotto/dati.

## Contraddizioni rispetto all'audit precedente (PRODUCT_SPEC 2026-08-05 e documento architetturale)

- `canonical_card_id` **non** è popolato al 100%: è al 95,95% (192.802/200.939). L'audit precedente riportava
  copertura completa "su tutte le righe controllate" — probabilmente un campione, non l'intera tabella.
- Il campo denominato `name_en` in `canonical_cards` nel documento architetturale precedente non esiste: la
  colonna reale si chiama `base_name`.
- Il documento architetturale precedente proponeva `canonical_cards`/`rarities` come "tabelle da formalizzare,
  oggi senza FK verso `cards`" — in realtà **la FK `cards.canonical_card_id → canonical_cards.id` esiste ed è
  già imposta a livello DB** (ON DELETE SET NULL). Non esiste invece nessuna FK per `rarities` (confermato
  come ipotizzato).
- Non era stata rilevata l'esistenza di un intero layer social/collection (`profiles`, `binders`, `posts`,
  `comments`, `likes`, `followers`, `blog_posts`, `newsletter`, `price_history`, `ebay_clicks`,
  `alert_notifications`, `set_logos`) completamente assente da ogni file di migration — non era in scope del
  primo documento, ma è un segnale che il drift schema↔migration è un problema sistemico dell'intero
  progetto, non solo delle tabelle del Knowledge Graph.

## Possiamo procedere con sicurezza al task di formalizzazione delle migration?

**Sì, con perimetro ristretto.** Per `cards`, `card_prices`, `canonical_cards`, `rarities` lo schema reale è
ora completamente noto (colonne, tipi, constraint, indici) e sufficientemente stabile da poter scrivere una
migration "baseline" che lo congela senza sorprese — è un lavoro essenzialmente meccanico di trascrizione di
quanto verificato in §A.

**No, non ancora per `collection` e `sets`** nello stesso passaggio: `collection` ha uno schema reale troppo
diverso da qualunque cosa documentata finora per essere congelato "al volo" — merita di essere scritto come
migration a parte con revisione dedicata (anche solo perché nessuno dei due wireframe precedenti lo
descriveva correttamente). `sets` è tecnicamente pronto da congelare (coincide con la migration esistente),
ma non ha senso farlo isolato dal problema del collegamento a `cards`, che è un task di dati, non di schema.

Suggerimento concreto: procedere con la baseline su `cards` + `card_prices` + `canonical_cards` + `rarities`
come primo task, e trattare `collection` e il fix `sets`↔`cards` come due task successivi separati.
