# Cross-Language Identity Layer — Design Spec

> **Autore:** agente Principal Architect · **Data:** 2026-09-03
> **Stato:** DA APPROVARE. Nessun file/migration/DB toccato.
> **Approccio approvato:** A — `set_alias` + RPC `card_versions`, `canonical_card_id` invariato.
> **Verifica repo:** effettuata 2026-09-03 (RPC, tabelle, viste, indici, componenti, query reali — vedi §0).

---

## 0. Stato reale verificato (baseline)

**Il problema (misurato su produzione):**

| | valore |
|---|---|
| Gruppi `canonical_card_id` JA Pokémon | 7.828 |
| …con almeno una riga EN nello stesso gruppo | **14 (0,2%)** |
| Gruppi JA Pokémon senza nessuna riga EN | **7.814 (99,8%)** |
| One Piece: card_number con EN+JA che condividono il canonical | **2.553 / 2.554 (99,96%)** |
| `cards` senza `canonical_card_id` | 9.306 (Pokémon JA 931 · One Piece EN 499) |
| `name_en` popolato su righe JA | ~36% |

**Causa radice:** `canonical_cards` è unico su `(tcg, set_id, card_number)`. I set giapponesi Pokémon usano codici regionali propri (`SV2a`="ポケモンカード151", `M2a`="MEGAドリームex", `PCG1`, `E1`…) diversi da quelli EN (`sv03.5`, `sv03`…). Stessa carta fisica → `set_id` diverso → `canonical_card_id` diverso → EN e JA non si vedono in Search né in Card page. One Piece funziona perché Bandai usa codici condivisi EN/JA da OP-15.

`set_identity_key(raw)` (RPC + `scripts/lib/catalog/normalize-set-code.js`) già collassa `sv3pt5`≡`sv03.5`≡`sv08.5` (zero-padding + notazione `pt`↔`.`) ma **non** `SV2a`≡`sv03.5` — quello è un remap regionale, non algoritmico: serve una mappa curata.

**Infrastruttura esistente riusabile:**

| Elemento | Dove | Nota |
|---|---|---|
| `set_identity_key(text) → text` | RPC public + `normalize-set-code.js#setIdentityKey` | Normalizza spelling. Da comporre *dopo* il remap alias. |
| `card_number_norm` | colonna generata su `cards` (`20260820_card_number_norm.sql`) | lowercase, senza separatori. Chiave di match numero. |
| `groupByCanonical(cards)` | `src/lib/search.js` | Raggruppa per `canonical_card_id`, produce `variantEntries`/`variantLangs`. Da estendere a "concept". |
| `SearchResultItem.jsx` | rende `variantCount`, `variantLangs`, `variantEntries` (link reali `/carta/{slug}?lang=`) | UI già pronta per N versioni. |
| `CardPage.jsx` | `languagePills` + `crossLangBadge` ("🇯🇵 Japanese Edition →") su `variants`/`languages` | UI già pronta; oggi `variants` = solo righe con stesso `canonical_card_id`. |
| `cardPageData.js#getCardPageData(slug, lang)` | carica `variants` via `.eq('canonical_card_id', canonical.id)` | Punto di innesto lato Card page. |
| `searchCards(rawQuery, {signal})` | `src/lib/search.js`, riusato da `SearchView.jsx` e `CardIdPage.jsx` | Punto di innesto lato Search. |
| `card_prices_latest` (view), `market_valuations`, `portfolio_valuations` RPC | market layer | **Restano per-`card_id`. Il nuovo layer non li tocca.** |
| Migration pattern | `supabase/migrations/YYYYMMDDHHMMSS_name.sql` (+ `_down.sql`), applicate a mano via SQL Editor, file committato | |
| Seed data pattern | `data/<topic>/*.json` (es. `data/reconciliation/`) + script che fa upsert idempotente | |

**Indici `cards` esistenti rilevanti:** `cards_set_idx(set_id)`, `cards_number_idx(card_number)`, `cards_tcg_lang_idx(tcg,lang)`, `cards_canonical_card_idx(canonical_card_id)`, `cards_card_number_norm_trgm_idx` (gin). **Manca** un composito `(tcg, set_id, card_number_norm)` → lo aggiunge questa spec.

---

## 1. Concetti e vocabolario

Tre livelli di identità, **espliciti e separati**:

| Livello | Cosa raggruppa | Meccanismo | Chi lo possiede |
|---|---|---|---|
| **Print row** (`cards.id`) | Una stampa, una lingua, una fonte | — | fonte esterna |
| **Canonical card** (`cards.canonical_card_id` → `canonical_cards`) | Tutte le stampe (holo/reverse/promo) + le lingue **che condividono lo stesso `set_id`**, dentro una regione | unique `(tcg, set_id, card_number)` | DraGold (esistente, **invariato**) |
| **Card concept** (nuovo, *non* materializzato in v1) | La stessa carta fisica **attraverso le regioni** (EN 151 #006 ≡ JA 151 #006) | `xlang_key` = `(tcg, set_identity_key(resolve_set_alias(set_id)), resolve_number_alias(card_number))` calcolato da `set_alias` + `card_number_alias` | DraGold (nuovo) |

**Regola d'oro:** il "card concept" serve a **discovery e identità**. NON fonde mercato, prezzo, valuation, collection, canonical, slug. EN e JA restano `card_id` distinti, `canonical_card_id` distinti, `market_valuations` distinti, righe di collezione distinte.

**"Reference region":** per convenzione il `canonical_set_id` di una mappa è il codice **EN / TCGdex EN** (`sv03.5`, non `SV2a`, non `sv3pt5`). È il valore che appare in `cards.set_id` per le righe EN di riferimento. Se un concept non ha righe EN (es. set solo-JP mai uscito in EN), il `canonical_set_id` resta il codice JA e non c'è alias (nessun link da creare).

---

## 2. Schema DB

Due tabelle nuove, additive, RLS public-read / service_role-write. Nessuna modifica a tabelle esistenti tranne **un indice** su `cards`.

### 2.1 `set_alias` — mappa curata set regionale → set di riferimento

```sql
create table public.set_alias (
  id                bigint generated always as identity primary key,
  tcg               text not null,
  alias_set_id      text not null,   -- come appare in cards.set_id (es. 'SV2a'); tutte le righe con questo set_id
                                     -- vengono rimappate, a prescindere dalla lingua (SV2a è un codice regionale JP,
                                     -- le sue righe ja+id sono comunque la stessa carta della sv03.5 EN)
  canonical_set_id  text not null,   -- set_id di riferimento (es. 'sv03.5'); appare in cards.set_id per le righe EN
  relation          text not null default 'equivalent'
                    check (relation in ('equivalent','subset','superset','partial')),
  confidence        text not null default 'confirmed'
                    check (confidence in ('confirmed','candidate','rejected')),
  source            text not null default 'curated',   -- 'curated' | 'tcgdex-serie' | 'bulbapedia' | ...
  note              text,            -- evidenza umana leggibile (obbligatoria di fatto per 'confirmed')
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tcg, alias_set_id)
);

create index set_alias_lookup_idx on public.set_alias (tcg, alias_set_id) where confidence = 'confirmed';
create index set_alias_canon_idx  on public.set_alias (tcg, canonical_set_id) where confidence = 'confirmed';

alter table public.set_alias enable row level security;
create policy set_alias_public_read on public.set_alias for select using (true);
```

- **Solo `confidence = 'confirmed'` partecipa alla risoluzione.** `'candidate'` = registrato per revisione, inerte. `'rejected'` = coppia esaminata e scartata (memoria negativa, non riproporla).
- **`relation` gate (conservativo — vedi §2.5):** SOLO `relation = 'equivalent'` attiva l'auto-link per numero. `'subset'`/`'superset'`/`'partial'` sono registrati per KG e coverage (§7, §9) ma **NON alimentano `xlang_key`**: le loro carte si collegano *esclusivamente* tramite righe esplicite in `card_number_alias`. "I set si assomigliano" non basta per un link; serve "i set sono lo stesso set" oppure "questa carta è quella carta".
- Simmetria: la risoluzione tratta `canonical_set_id` come punto fisso (si risolve in sé stesso). Non serve una riga `sv03.5 → sv03.5`.
- **Niente `alias_lang` in v1** (YAGNI): un codice set regionale come `SV2a` è per costruzione della sola regione JP, quindi rimappare *tutte* le sue righe è corretto. Se in futuro emergesse un codice set genuinamente condiviso tra regioni con significato diverso, si aggiunge `alias_lang` come colonna additiva senza rompere nulla.
- **Un `set_id` non può essere sia `alias_set_id` sia `canonical_set_id`** per lo stesso `tcg` (un set è o un riferimento o un alias, mai entrambi). Validato dall'apply script (§3.4) e da un `CHECK`/trigger difensivo (§2.5).

### 2.2 `card_number_alias` — eccezioni numero → numero (secret/alt-art regionali)

```sql
create table public.card_number_alias (
  id                    bigint generated always as identity primary key,
  tcg                   text not null,
  canonical_set_id      text not null,        -- il set di riferimento (lato EN)
  alias_set_id          text not null,        -- il set regionale (lato JA)
  alias_card_number     text not null,        -- numero come in cards.card_number lato alias (raw)
  canonical_card_number text not null,        -- numero come in cards.card_number lato riferimento (raw)
  relation              text not null default 'same_card'
                        check (relation in ('same_card')),
  confidence            text not null default 'confirmed'
                        check (confidence in ('confirmed','candidate','rejected')),
  source                text not null default 'curated',
  note                  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- 1:1 IN ENTRAMBE LE DIREZIONI: una carta alias mappa a una sola carta di riferimento,
  -- e nessuna carta di riferimento riceve due carte alias diverse dallo stesso alias_set.
  unique (tcg, alias_set_id, alias_card_number),
  unique (tcg, canonical_set_id, alias_set_id, canonical_card_number)
);

create index card_number_alias_lookup_idx on public.card_number_alias (tcg, alias_set_id, alias_card_number) where confidence = 'confirmed';

alter table public.card_number_alias enable row level security;
create policy card_number_alias_public_read on public.card_number_alias for select using (true);
```

- Usata **solo** quando i due set sono collegati (via `set_alias` `equivalent`, oppure sono set diversi mappati come `partial`) e il numero **non** combacia. Popolata a mano, per carte chiave ad alto valore.
- Il match avviene su `card_number_norm` di entrambi i lati (la tabella conserva il raw, la RPC normalizza).
- **Strettamente 1:1 in entrambe le direzioni** (i due `unique`): un mapping numero→numero è un'asserzione puntuale "questa carta = quella carta", mai molti-a-uno. Se emergesse un caso reale molti-a-uno, si valuta allora, non ora.

### 2.3 Indice su `cards` (unico cambiamento a una tabella esistente)

```sql
create index if not exists cards_tcg_set_number_idx
  on public.cards (tcg, set_id, card_number_norm);
```

Serve alla RPC che filtra `where tcg = ? and set_id = any(?) and card_number_norm = any(?)`. Reversibile, non-bloccante (`create index` senza `concurrently` va bene: `cards` ~204k righe, downtime di scrittura di pochi secondi in finestra di manutenzione, oppure `concurrently` fuori da una transazione di migration).

### 2.4 Cosa NON cambia

- `canonical_cards` — nessun ALTER, nessun re-point, nessun merge di `id`/`slug`.
- `cards` — solo il nuovo indice.
- `market_valuations`, `market_observations`, `card_prices`, `portfolio_valuations` — intatti.
- `collection`, `watchlist`, `alerts` — intatti.

### 2.5 Garanzie di conservatività — perché un mapping ambiguo non può creare un falso link

Regola guida (requisito Ermal): **in caso di dubbio → nessun link.** Un link cross-lingua nasce **solo** da un'asserzione curata, esplicita, ad alta confidenza. Non esiste inferenza automatica, nessun fuzzy, nessuna similarità di nome, nessun "probabilmente".

Un link `A ↔ B` (righe `cards` di lingue diverse nello stesso concept) può nascere **solo** da uno di questi 4 percorsi, in ordine di forza:

| # | Percorso | Condizione | `link_basis` |
|---|---|---|---|
| 1 | Stesso `canonical_card_id` | già oggi (tutte le lingue che condividono `set_id`) | `same_canonical` |
| 2 | `set_alias` `equivalent` + `confirmed` **e** `card_number_norm` identico | il curatore ha asserito "questi due set SONO lo stesso set (stesso card list, stessa numerazione)" | `set_alias` |
| 3 | `card_number_alias` `same_card` + `confirmed` (1:1 bidirezionale) | il curatore ha asserito "QUESTA carta È quella carta" | `number_alias` |
| 4 | — | *nessun altro percorso esiste* | — |

**Ogni forma di ambiguità cade nel "nessun link":**

| Situazione ambigua | Comportamento |
|---|---|
| Set JA non presente nel seed | `xlang_key` usa il codice grezzo → non combacia con nessun EN → **nessun link** |
| `set_alias` con `confidence` ≠ `confirmed` (`candidate`/`rejected`) | ignorato dalla risoluzione → **nessun link** |
| `set_alias` con `relation` ≠ `equivalent` (`partial`/`subset`/`superset`) | NON alimenta `xlang_key`. I set restano separati per il match automatico. Link solo per le carte con una riga `card_number_alias` esplicita. → di default **nessun link** |
| Numero presente in un lato ma non nell'altro (secret/alt-art con numerazione diversa) | `card_number_norm` non combacia, nessun `card_number_alias` → **nessun link** (la carta resta mostrata come versione a sé) |
| Due carte diverse con lo stesso numero in set non mappati (Base Set 006 vs Jungle 006) | `xlang_key` include il set risolto → chiavi diverse → **nessun link** |
| `card_number_alias` molti-a-uno (curatore prova ad asserire 2 carte JA = 1 EN) | rifiutato dal `unique (tcg, canonical_set_id, alias_set_id, canonical_card_number)` → non entra in DB |
| Un `set_id` messo sia come `alias_set_id` sia come `canonical_set_id` | rifiutato dall'apply script + trigger difensivo → non entra in DB |
| `set_identity_key` collassa due spelling | **è già voluto e vettato**: i 26 gruppi di collisione analizzati nel dedup `me4`/`me04` sono tutti spelling dello *stesso* set. `xlang_key` compone `set_identity_key` *dopo* la risoluzione alias, non prima → nessun nuovo rischio introdotto qui. |

**Trigger difensivo (in M1):**

```sql
-- un set non può essere contemporaneamente riferimento e alias per lo stesso tcg
create or replace function public.set_alias_no_self_ref() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.set_alias
             where tcg = new.tcg and alias_set_id = new.canonical_set_id) then
    raise exception 'set % is already an alias_set_id for tcg % — cannot also be a canonical_set_id', new.canonical_set_id, new.tcg;
  end if;
  if exists (select 1 from public.set_alias
             where tcg = new.tcg and canonical_set_id = new.alias_set_id) then
    raise exception 'set % is already a canonical_set_id for tcg % — cannot also be an alias_set_id', new.alias_set_id, new.tcg;
  end if;
  return new;
end $$;
create trigger set_alias_no_self_ref_trg before insert or update on public.set_alias
  for each row execute function public.set_alias_no_self_ref();
```

**Il `xlang_key` SQL (§4.3) filtra `relation = 'equivalent'`** nella sottoquery `set_alias`. Nessuna riga `partial`/`subset`/`superset` influenza mai la chiave.

**Conseguenza per la coverage:** in v1 il sistema linkerà solo dove esiste un'asserzione `equivalent` (o un `card_number_alias` puntuale). I set con card list divergenti restano non linkati finché non li si mappa carta-per-carta. Questo è **voluto**: `ACCURACY > COVERAGE`. Il coverage KPI (§7) misura la copertura e guida l'estensione curata, mai un allentamento della soglia.

---

## 3. Seed format

### 3.1 File: `data/cross-language/set-aliases.json`

Editoriale DraGold, versionato in git, rivedibile riga per riga in PR.

```jsonc
{
  "$schema": "./set-aliases.schema.json",
  "generated_note": "Curated. Each entry is a factual assertion 'this JA set == this EN set'. Only 'confirmed' entries activate linking.",
  "aliases": [
    {
      "tcg": "pokemon",
      "alias_set_id": "SV2a",
      "canonical_set_id": "sv03.5",
      "relation": "equivalent",
      "confidence": "confirmed",
      "source": "bulbapedia",
      "note": "JA 'ポケモンカード151' (SV2a, 2023-06-16) == EN '151' (sv03.5, 2023-09-22). Same 165-card main set + shared numbering 001-165."
    },
    {
      "tcg": "pokemon",
      "alias_set_id": "SV1a",
      "canonical_set_id": "sv01",
      "relation": "partial",
      "confidence": "candidate",
      "source": "curated",
      "note": "JA 'SV1a Triplet Beat' overlaps EN 'sv01 Scarlet & Violet Base' partially — card lists differ. NOT active until reviewed number-by-number."
    }
  ]
}
```

### 3.2 File: `data/cross-language/card-number-aliases.json`

```jsonc
{
  "$schema": "./card-number-aliases.schema.json",
  "aliases": [
    {
      "tcg": "pokemon",
      "canonical_set_id": "sv03.5",
      "alias_set_id": "SV2a",
      "alias_card_number": "193",
      "canonical_card_number": "199",
      "confidence": "confirmed",
      "source": "curated",
      "note": "Charizard ex SAR — JA 151 numbers it 193/165, EN 151 numbers it 199/165. Same card."
    }
  ]
}
```

### 3.3 Seed initial scope (v1)

Curatela **prioritaria**, non esaustiva. Ordine: (1) set moderni Scarlet & Violet EN↔JA (2023→oggi, ~15 set + i "special" 151 / Paldean Fates / Shrouded Fable / Surging Sparks), (2) i set JA "high-class pack" recenti mappati come `partial` (candidate) finché non verificati, (3) all'indietro solo su richiesta. Un set JA non nel seed → le sue carte restano JA-only (mai link a caso).

Stima seed v1: ~25-40 righe `set_alias` `confirmed`, ~10-30 righe `card_number_alias` per le chase card note (Charizard/Pikachu/Umbreon SAR ecc.).

### 3.4 Apply script: `scripts/apply-cross-language-aliases.mjs`

- Legge i due JSON, valida contro lo schema, upsert idempotente in `set_alias` / `card_number_alias` (chiave: gli `unique` di §2).
- `--dry-run` di default; `--apply` scrive.
- **Validazioni che bloccano l'apply** (`--apply` esce ≠0 senza scrivere se una fallisce):
  - nessun `set_id` compare sia come `alias_set_id` sia come `canonical_set_id` per lo stesso `tcg`;
  - `card_number_alias` 1:1 in entrambe le direzioni (rispecchia i due `unique`);
  - ogni riga `confidence='confirmed'` ha una `note` non vuota;
  - `alias_set_id` ≠ `canonical_set_id`;
  - `relation` ∈ valori ammessi.
- Riporta: righe nuove / aggiornate / invariate, e un **sanity check** (non bloccante): per ogni alias `confirmed`, quante righe `cards` esistono su `alias_set_id` e su `canonical_set_id`, quanti card_number combaciano, quanti no (→ candidati per `card_number_alias`); alias che non matchano **nessuna** riga `cards` (probabile errore di codice set).
- Env: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (come gli altri script).
- Test: `scripts/__tests__/apply-cross-language-aliases.test.js` (validazione schema, idempotenza, rifiuto di righe malformate).

---

## 4. RPC contract

### 4.1 `card_versions(...)` — il resolver di identità cross-regione

```sql
create or replace function public.card_versions(
  p_card_id            text  default null,
  p_canonical_card_id  uuid  default null,
  p_tcg                text  default null,
  p_set_id             text  default null,
  p_card_number        text  default null,
  p_include_self       boolean default true
)
returns table (
  card_id            text,
  canonical_card_id  uuid,
  slug               text,        -- da canonical_cards, per il link SEO /carta/{slug}
  tcg                text,
  lang               text,
  set_id             text,
  set_name           text,
  card_number        text,
  name               text,
  name_en            text,
  rarity             text,
  print_variant      text,
  image_url          text,        -- coalesce(image_url_hi, image_url)
  is_query_row       boolean,     -- true = è (una del)la carta da cui parte la query
  link_basis         text,        -- 'self' | 'same_canonical' | 'set_alias' | 'number_alias'
  link_confidence    text,        -- 'exact' (self/same_canonical) | 'confirmed' (alias)
  alias_note         text,        -- l'evidenza (set_alias.note / card_number_alias.note) quando link_basis è un alias
  xlang_key          text         -- la chiave concept calcolata (provenance/debug)
)
language sql
stable
security invoker
set search_path = ''
as $$
  -- 1. risolvi il/i punto/i di partenza in (tcg, set_id_norm, number_norm)
  -- 2. calcola xlang_key applicando set_alias poi set_identity_key, e card_number_alias
  -- 3. trova tutte le righe cards con lo stesso xlang_key
  -- 4. annota link_basis / link_confidence / alias_note per ciascuna
  -- 5. join canonical_cards per slug
$$;

revoke all on function public.card_versions(text,uuid,text,text,text,boolean) from public;
grant execute on function public.card_versions(text,uuid,text,text,text,boolean) to anon, authenticated;
```

**Contratto:**

- **Input:** almeno uno tra `p_card_id`, `p_canonical_card_id`, oppure la tripla `(p_tcg, p_set_id, p_card_number)`. Se ne passi più di uno, `p_card_id` vince, poi `p_canonical_card_id`, poi la tripla. Nessun identificatore → 0 righe (non errore).
- **Un solo concept per chiamata:** ogni forma di input risolve a **esattamente un `xlang_key`** (`canonical_cards` è unico su `(tcg, set_id, card_number)` → un canonical = una coppia set+numero = un xlang_key; un `card_id` idem; la tripla idem). `card_versions` non "unisce" concept diversi.
- **Output:** 1 riga per ogni `cards.id` che appartiene a quel concept. Include tutte le lingue e tutte le `print_variant`. Ordinamento non garantito (il caller ordina — §5, §6).
- **`link_basis` / provenance (requisito 4):**
  - `self` — è (una del)le righe di partenza.
  - `same_canonical` — condivide `canonical_card_id` con una riga di partenza (già linkata oggi, es. tutte le lingue One Piece, o EN+ES+IT+PT via tcgdex).
  - `set_alias` — linkata perché il suo `set_id` risolve, via `set_alias` confirmed, allo stesso `canonical_set_id`, e `card_number_norm` combacia. `alias_note` = `set_alias.note`.
  - `number_alias` — come sopra ma il numero combacia solo via `card_number_alias` confirmed. `alias_note` = `card_number_alias.note`.
- **`link_confidence`:** `exact` per `self`/`same_canonical`; `confirmed` per gli alias. Non esiste `fuzzy`/`probable` in v1 — se non è `confirmed`, non compare.
- **Garanzie:**
  - **Nessun prezzo/valuation nell'output.** Identità e display only (requisito 7).
  - **Deterministica.** Stesso input → stesso output finché `set_alias`/`card_number_alias`/`cards` non cambiano.
  - **Bounded.** Il match è su `xlang_key` che include il numero → tipicamente 2-15 righe. Guardrail: `LIMIT 200` interno; se colpito, la riga extra `link_basis='__truncated__'` segnala misconfigurazione (non dovrebbe mai accadere).
  - **`security invoker` + `search_path=''`** come le RPC portfolio esistenti. Legge solo `cards` / `canonical_cards` / `set_alias` / `card_number_alias` (tutte public-read).

### 4.2 `card_versions_batch(p_queries jsonb)` — per Search

```sql
create or replace function public.card_versions_batch(p_queries jsonb)
returns table ( query_idx int, /* + tutte le colonne di card_versions */ ... )
language sql stable security invoker set search_path = '' as $$ ... $$;
```

- `p_queries` = `[{"tcg":"pokemon","set_id":"sv03.5","card_number":"006"}, ...]` (max ~200 elementi, cap interno).
- Un round-trip invece di N. `query_idx` mappa ogni riga di output alla query di input.
- Usata da `searchCards()` per espandere i name-match in tutte le versioni regionali in una chiamata.

### 4.3 `xlang_key(p_tcg text, p_set_id text, p_card_number text) → text` — funzione pura SQL

```sql
create or replace function public.xlang_key(p_tcg text, p_set_id text, p_card_number text)
returns text language sql stable set search_path = '' as $$
  with num_alias as (
    -- override puntuale completo: "questa carta È quella carta" → risolve SET e NUMERO
    -- al riferimento. Funziona anche se il set è 'partial' o non mappato.
    select canonical_set_id, canonical_card_number
    from public.card_number_alias
    where tcg = p_tcg and alias_set_id = p_set_id
      and regexp_replace(lower(alias_card_number),'[^a-z0-9]','','g')
        = regexp_replace(lower(p_card_number),'[^a-z0-9]','','g')
      and confidence = 'confirmed'
    limit 1
  ),
  set_equiv as (
    -- rimappa il set SOLO se asserito 'equivalent' + 'confirmed'
    select canonical_set_id from public.set_alias
    where tcg = p_tcg and alias_set_id = p_set_id
      and confidence = 'confirmed' and relation = 'equivalent'
    limit 1
  )
  select lower(p_tcg) || ':'
    || public.set_identity_key(coalesce(
         (select canonical_set_id from num_alias),   -- 1. override puntuale (set+numero)
         (select canonical_set_id from set_equiv),   -- 2. set-alias equivalent
         p_set_id))                                  -- 3. codice grezzo
    || ':'
    || coalesce(
         (select regexp_replace(lower(canonical_card_number),'[^a-z0-9]','','g') from num_alias),
         regexp_replace(lower(p_card_number),'[^a-z0-9]','','g'));
$$;
```

- Precedenza di risoluzione: **override puntuale `card_number_alias`** (risolve sia set che numero, vale anche per set `partial`/non mappati) → **`set_alias` `equivalent`** (rimappa solo il set, il numero resta) → **codice grezzo** (`set_identity_key` normalizza solo lo spelling).
- `stable` (non `immutable`): legge `set_alias` / `card_number_alias`. Va bene per l'uso in `card_versions` e per un indice **non** funzionale.
- La stessa logica esiste in JS (`scripts/lib/catalog/cross-lang.js#xlangKey(tcg, setId, num, {setAliases, numberAliases})`) come funzione **pura** — le mappe passate come argomento — per i test unitari (§10.1) e per il fallback client-side se la RPC non è disponibile.
- Una variante `immutable` pura (solo `set_identity_key`, senza lookup) può esistere in futuro come `xlang_key_raw` per un indice funzionale, se il benchmark lo richiede.

---

## 5. Search integration

**File toccato:** `src/lib/search.js` (+ `searchData.js` se servono alias linguistici, improbabile).

**Flusso attuale** (`searchCards`): query `cards` con `.or()` ilike → espansione multilingua (canonical_card_id / card_number / name_en) → `groupByCanonical` → `rankSearchResults`.

**Modifica:**

1. Dopo i name-match, raccogli le triple distinte `(tcg, set_id, card_number)` delle righe che hanno `card_number` valido con prefisso set (stesso filtro `safeNums` già presente).
2. **Una** chiamata `supabase.rpc('card_versions_batch', { p_queries })` invece delle 2-3 espansioni euristiche attuali (canonical / card_number / name_en expand). Le euristiche restano come **fallback** se la RPC fallisce o ritorna vuoto (degrado grazioso — comportamento odierno).
3. Merge dei risultati RPC con i name-match (dedupe per `card_id`).
4. `groupByCanonical` → **`groupByConcept`**: raggruppa per `xlang_key` (dalla RPC) con fallback a `canonical_card_id` con fallback a `id`. Il rappresentante del gruppo = riga EN, poi JA, poi la prima (ranking §5.6). `variantEntries` acquista `link_basis` e `link_confidence`.
5. `rankSearchResults` invariato per il ranking *fra* carte diverse; il ranking *dentro* un gruppo (le versioni) segue la regola sotto.

**5.6 Ordine delle versioni dentro un gruppo** (requisito 5):

```
1. la lingua di contesto, quando c'è:
     - Search: la lingua in langFilterCodes se l'utente ha filtrato (es. query "charizard jp")
     - Card page: selected.lang (la versione attualmente visualizzata) — vedi §6
2. en
3. ja
4. resto, ordine stabile (alfabetico sul codice lingua)
```

Quando non c'è lingua di contesto (ricerca generica senza filtro lingua), si parte dal punto 2: il rappresentante del gruppo è la riga EN, poi JA, poi il resto. Implementato in `groupByConcept` come comparatore parametrizzato su `contextLang`. `SearchResultItem.jsx` rende `variantEntries` in quest'ordine (oggi rende `variantEntries.filter(v => v.slug)` senza ordine esplicito → si aggiunge il sort).

**5.7 "Una ricerca EN scopre la JA"** (requisito 5): oggi cercare "Charizard" trova le righe EN (name match), poi `card_versions_batch` sulle loro triple `(pokemon, sv03.5, 006)` risolve `xlang_key` = `pokemon:sv035:006` e tira dentro la riga JA `SV2a/006` (che ha nome giapponese, mai trovata dal testo). `groupByConcept` le unisce. `SearchResultItem` mostra "+1 lang" con il flag 🇯🇵 e un link reale a `/carta/{slug-JA}?lang=ja`.

**5.8 Nessun cross-match** (requisito 2): `card_versions_batch` ritorna solo righe con `xlang_key` identico, che richiede `set_alias` confirmed + numero uguale (o `card_number_alias` confirmed). Nessuna similarità di nome, nessun fuzzy. Se il set JA non è nel seed → `xlang_key` usa `set_identity_key(set_id)` grezzo → non combacia con l'EN → nessun link.

**File NON toccati:** `SearchView.jsx`, `CommandSearch.jsx`, `SearchResults.jsx` — consumano `searchCards()` e `variantEntries` che restano compatibili (campi aggiuntivi, non breaking). `SearchResultItem.jsx` — modifica minima (sort di `variantEntries`, opzionale badge `link_basis='set_alias'` con tooltip "linked edition").

---

## 6. Card page integration

**File toccato:** `src/pages/card/cardPageData.js` (data layer). `CardPage.jsx` **non cambia logica**, solo eventuale micro-affordance.

**Modifica in `getCardPageData(slug, lang)`:**

1. Risoluzione canonical per slug: **invariata**.
2. Dopo aver caricato `allVariants` via `.eq('canonical_card_id', canonical.id)`, chiamare `supabase.rpc('card_versions', { p_canonical_card_id: canonical.id })`.
3. Merge delle righe extra in `allVariants` (dedupe per `id`). Ogni riga porta `link_basis` / `alias_note`.
4. `languages` = `[...new Set(allVariants.map(c => c.lang))]` **ordinato** per la regola §5.6 (default `lang` = quello richiesto, poi en, poi ja, poi resto) invece di `.sort()` alfabetico.
5. `primary` selection: **invariata** (curated → lang → EN → prima). Il default aprendo lo slug nudo resta EN (requisito: "versione visualizzata sempre in cima" è UI, non default).
6. Nuovo campo di ritorno `variantLinkBasis`: `{ [card_id]: { link_basis, alias_note } }` — così `CardPage.jsx` può mostrare, sotto il `crossLangBadge` esistente, una riga discreta tipo *"Linked via curated set mapping: SV2a = 151"* quando `link_basis === 'set_alias'`. Onestà sulla provenienza, opzionale.

**`CardPage.jsx`:** `languagePills` e `crossLangBadge` **già funzionano** su `variants`/`languages` — ricevono più lingue e basta. La versione corrente resta in cima perché `languagePills` marca `active` quella selezionata e (nuovo) `variantEntries`/pills si ordinano con la selezionata pinnata. `hreflangAlternates` (riga ~269) migliora automaticamente (più lingue reali → più `<link rel="alternate" hreflang>`).

**SEO:** ogni versione mantiene il **suo** `canonical_cards.slug` e la sua pagina canonica. Il cross-language layer aggiunge `hreflang` reciproci, non cambia quale URL è canonico. Nessun merge di slug, nessun redirect.

**Market su Card page:** `cardPageData.js` oggi legge `card_prices` per `primary.id` — **resta così** (migrazione a `market_valuations` è task separato). Quando si migrerà, si leggerà la valuation di `primary.id` (la versione mostrata), non un blend cross-lingua. La Card page potrà mostrare *"JA edition: €X · EN edition: €Y"* chiamando `portfolio_valuations([ja_id, en_id])` — due valori distinti, mai fusi (requisito 7).

---

## 7. Knowledge Graph integration

Il cross-language layer **è** un tipo di edge del Knowledge Graph, dichiarato ora anche se il KG normalizzato (tabelle `characters`/`illustrators`/`series`) arriverà dopo.

**Edge: `same_card_across_region`**

```
(canonical_card A)  --[same_card_across_region { via, confidence, note }]-->  (canonical_card B)
```

- `via` ∈ `set_alias` | `number_alias`
- `confidence` = `confirmed`
- `note` = l'evidenza curata
- **Non-diretto semanticamente** ma memorizzato con un verso (A = reference region, B = alias region) per poter rispondere "qual è l'edizione originale / la ristampa".

**Come si deriva l'edge** (senza nuova tabella in v1): due `canonical_card_id` sono connessi da `same_card_across_region` sse esiste una riga `cards` per ciascuno con lo stesso `xlang_key` e almeno una delle due è collegata via `set_alias`/`number_alias` (non `same_canonical`). Una vista `v_card_concept_edges` (o la RPC `card_versions` stessa, raggruppata) la materializza a query time.

**Perché è un edge e non un merge:** il KG esplorabile (Card → Set → Character → Variant → **Language/Region** → Related → Market) vuole mostrare "questa carta esiste anche come edizione giapponese, con **questo** valore, in **questo** set, uscita in **questa** data" — informazione che un merge di identità distruggerebbe. `relation` (`equivalent`/`subset`/`superset`) diventa un attributo dell'edge, utile per "il set JA X corrisponde a 2 set EN".

**Coverage KPI** (aggancio a `catalog_freshness_runs` / un nuovo KPI): `% canonical_card EN Pokémon che hanno un edge same_card_across_region verso una riga JA` — misura quanto il seed copre. Target: crescente, mai a scapito della precisione.

---

## 8. AI Agent integration

`card_versions` è progettata per essere un **tool deterministico** dell'agente (foundation, non implementazione ora).

### 8.1 Come diventa un tool

```
tool: card_versions
  input:  { card_id? | canonical_card_id? | (tcg, set_id, card_number)? }
  output: [{ card_id, tcg, lang, set_id, set_name, card_number, name, rarity,
             print_variant, slug, link_basis, link_confidence, alias_note, xlang_key }]
  properties: read-only, deterministic, no LLM, no external call, ~5-15 rows, <20ms
```

Wrapper: `api/_lib/agent-tools.js#cardVersions(args)` → `supabase.rpc('card_versions', ...)` → passthrough. Zero logica AI.

### 8.2 Flusso "Quanto vale il Charizard giapponese rispetto alla versione inglese?"

```
1. card_search("Charizard ex 151")            → candidati (canonical, slug, set, number, langs)
2. [disambigua se >1]                          → canonical_card_id scelto
3. card_versions(canonical_card_id)            → righe EN (sv03.5/199) e JA (SV2a/193), con link_basis='number_alias', alias_note
4. card_valuation(en_card_id, 'EUR')           → { estimated_value, confidence, confidence_reason, as_of, sources }
5. card_valuation(ja_card_id, 'EUR')           → { ... }   [oggi: probabilmente 'none' — JA non ancora coperta dalla pipeline prezzi]
6. l'agente sintetizza:
   "EN Charizard ex 199/165 (151): €152 (medium, TCGplayer, as of Sep 2).
    JA 193/165 (ポケモンカード151): non ho ancora dati di mercato affidabili per la stampa giapponese.
    Le due sono la stessa carta (mappatura curata: SV2a 193 = sv03.5 199), ma mercati distinti."
```

**Garanzia anti-allucinazione:** l'agente **non deduce** che EN e JA sono la stessa carta — lo legge da `card_versions.link_basis` + `alias_note`. Se `card_versions` non le collega, l'agente dice "non ho una corrispondenza confermata tra la versione inglese e quella giapponese" invece di indovinarla dal nome. La differenza di prezzo esce da **due** `card_valuation` separate, mai da un calcolo dell'agente.

### 8.3 Riuso da API pubblica

`card_versions` è già `grant execute to anon` → un endpoint `GET /api/card/:id/versions` è un passthrough di 10 righe. Nessun lavoro extra.

---

## 9. Open source & data-vs-software

**Requisito 10-12: DraGold resta genuinamente open source. Il cross-language layer non introduce niente di proprietario.**

### 9.1 Classificazione dei componenti di questa spec

| Componente | Cosa è | Licenza / redistribuibilità |
|---|---|---|
| Migrazioni `set_alias` / `card_number_alias` / `card_versions` / indice | **Software** (DDL + SQL) | Licenza del repo (MIT/Apache-2.0). Pienamente open, forkabile. |
| `xlang_key`, `groupByConcept`, `apply-cross-language-aliases.mjs`, test | **Software** | Licenza del repo. |
| Schema DB (struttura tabelle) | **Software/struttura** | Nel repo, open. |
| `data/cross-language/set-aliases.json` + `card-number-aliases.json` | **Dato curato editoriale di DraGold** — asserzioni fattuali "il set JA X è il set EN Y". I codici set sono identificatori fattuali (non coperti da copyright). Le `note` sono testo originale DraGold. | **Licenza esplicita e separata: CC0-1.0** (public domain dedication) in `data/cross-language/LICENSE`. Un fork può usarli liberamente. |
| Contenuto carte (nomi, immagini, testo) referenziato da `cards` | **Dato di terzi** (TCGdex, TCGCSV, Bandai) | **NON nostro da relicenziare.** Non entra nel seed. Un fork esegue la propria sync catalogo; il nostro seed dice solo "SV2a ≡ sv03.5", che è indipendente dal contenuto. |
| `market_valuations` / `market_observations` (dati) | Dati derivati da fonti di mercato (TCGCSV/TCGplayer) | Fuori scope di questa spec. Il cross-language layer non li tocca. |

**Punto chiave:** `set-aliases.json` è progettato per **non contenere dati di terzi**. Contiene: codici set (fattuali), lingua (fattuale), una relazione, una nota scritta da noi. Un contributor che forka DraGold ottiene il seed completo e funzionante senza problemi di licenza, e può estenderlo.

### 9.2 Nessun gate proprietario

- `card_versions` — RPC pubblica (`grant to anon`). Nessun tier, nessun paywall, nessuna scadenza.
- Il seed è nel repo, non su un server DraGold.
- Il KG edge `same_card_across_region` è derivato da tabelle pubbliche.
- Un fork con il proprio Supabase + il proprio catalogo + questo seed ottiene la stessa funzionalità.

### 9.3 AI provider abstraction (foundation, non in questa spec)

Questa spec **non** implementa l'agente, ma lo abilita in modo vendor-neutro:

- `card_versions` e tutti i futuri data-tool sono **SQL puro, zero LLM, zero vendor**. Funzionano identici sotto qualsiasi provider AI o senza AI.
- Il futuro layer agente definirà un'interfaccia `LlmProvider` (in `api/_lib/llm/`):
  ```
  interface LlmProvider {
    complete(params: { system, messages, tools, maxTokens, ... }): Promise<{ text, toolCalls, usage }>
  }
  ```
  Adapter: `AnthropicProvider`, `GeminiProvider`, `OllamaProvider` (locale, OpenAI-compatible `/v1/chat/completions`), `OpenAICompatibleProvider`. Selezione via env (`DRAGOLD_LLM_PROVIDER=ollama|anthropic|gemini`).
- Un fork che vuole 100% locale usa Ollama + il proprio catalogo + questo seed: nessuna dipendenza da servizi DraGold o Anthropic.
- **Questa spec garantisce solo che il pezzo di identità non crea lock-in.** Il resto è responsabilità della futura spec agente.

---

## 10. Testing strategy

### 10.1 Test puri (node:test) — `scripts/lib/catalog/__tests__/cross-lang.test.js`

Sulla funzione JS `xlangKey(tcg, setId, cardNumber, { setAliases, numberAliases })` e `resolveSetAlias` / `resolveNumberAlias` (fixture in-memory, nessun DB):

| # | Caso | Atteso |
|---|---|---|
| 1 | Set JA mappato → EN: `xlangKey('pokemon','SV2a','006')` con alias `SV2a→sv03.5` confirmed | `= xlangKey('pokemon','sv03.5','006')` |
| 2 | Set non mappato: `xlangKey('pokemon','XY9a','006')` senza alias | `= pokemon:xy9a:6` (grezzo, non combacia con nessun EN) |
| 3 | Alias `candidate` (non confirmed) | ignorato → chiave grezza |
| 4 | Alias `rejected` | ignorato → chiave grezza |
| 5 | Number exception: `xlangKey('pokemon','SV2a','193')` con `SV2a/193 → sv03.5/199` confirmed | `= xlangKey('pokemon','sv03.5','199')` |
| 6 | Number exception `candidate` | ignorata → numero grezzo |
| 7 | Spelling già gestito da `setIdentityKey`: `sv3pt5` vs `sv03.5` | stessa chiave **senza** alias (setIdentityKey li collassa) |
| 8 | One Piece già funzionante: `OP01-001` EN e JA condividono `set_id='OP-01'` | stessa chiave via percorso grezzo, nessun alias necessario |
| 9 | Card senza `canonical_card_id` ma con set+numero | `xlangKey` funziona lo stesso (non dipende da canonical) |
| 10 | Alias applica a tutte le lingue del set regionale: `SV2a` riga `ja` e riga `id` → stessa chiave (entrambe = la carta EN) | entrambe `= xlangKey('pokemon','sv03.5','006')` |
| 11 | Idempotenza: `xlangKey` chiamata 2× | identico |
| 12 | False-positive guard: due carte diverse stesso numero set diversi non mappati (`base1/006` Charizard vs `jungle/006` Beedrill) | chiavi diverse |
| 13 | Alias verso un `canonical_set_id` che a sua volta ha spelling variante (`sv03.5` vs `sv3pt5` sul lato EN) | `set_identity_key` li collassa → JA, EN-tcgdex, EN-ptcg tutte stessa chiave |
| 14 | **`relation='partial'` non rimappa il set**: `set_alias('SV1a'→'sv01', relation='partial', confidence='confirmed')`, `xlangKey('pokemon','SV1a','010')` senza number-alias | `= pokemon:sv1a:010` (grezzo) ≠ `pokemon:sv01:010` → **nessun link** |
| 15 | **`card_number_alias` su set `partial` funziona**: aggiungi `SV1a/010 → sv01/010 confirmed` | `xlangKey('pokemon','SV1a','010') = xlangKey('pokemon','sv01','010')` |
| 16 | **`relation='subset'`/`'superset'`** stesso comportamento di `partial` (nessun rimap set) | nessun link automatico |
| 17 | Precedenza: number-alias vince su set-alias `equivalent` in conflitto | usa il `canonical_set_id`/`canonical_card_number` del number-alias |

### 10.2 Test RPC (SQL) — `supabase/migrations/__tests__/` o script `scripts/__tests__/card-versions-rpc.test.mjs` (contro un branch DB di test o fixture seed)

| # | Caso | Atteso |
|---|---|---|
| R1 | `card_versions(p_card_id => <EN 151 Charizard 006>)` | include la riga JA `SV2a/006`, `link_basis='set_alias'`, `alias_note` presente, **nessun** campo prezzo |
| R2 | `card_versions(p_card_id => <JA 151 006>)` | include la riga EN `sv03.5/006` (simmetria JA→EN) |
| R3 | `card_versions` su carta di set JA non mappato | ritorna solo `same_canonical` + `self`, nessun `set_alias` |
| R4 | `card_versions` su carta One Piece EN | include tutte le lingue via `same_canonical`, `link_basis='same_canonical'` (nessun alias necessario — regressione: One Piece continua a funzionare) |
| R5 | `card_versions` su carta senza `canonical_card_id` | non crasha; ritorna le versioni trovate via `xlang_key` (set+numero), `canonical_card_id` = null nelle righe |
| R6 | `card_versions_batch` con 50 triple | 1 round-trip, `query_idx` corretto per ogni riga |
| R7 | `card_versions` non ritorna **mai** `estimated_value`/`price`/colonne market | assert sullo schema di output |
| R8 | Guardrail: alias malconfigurato che colleghererebbe 500 righe | `LIMIT 200` + riga `__truncated__` |
| R9 | `set_alias` con `confidence='candidate'` | non influenza l'output di `card_versions` |
| R10 | Idempotenza apply script: run 2× | 0 righe modificate al secondo run |
| R11 | Preservazione valuation: `market_valuations` per EN e per JA restano righe distinte con valori distinti prima/dopo il deploy | invariato (la spec non tocca `market_valuations`) |

### 10.3 Test integrazione UI (Vitest, quando disponibile su questi file — oggi node:test su logica pura)

| # | Caso | Atteso |
|---|---|---|
| U1 | `groupByConcept` su [EN 151 006, JA 151 006 (via xlang_key), EN 151 006 reverse-holo] | 1 gruppo, `variantLangs=['en','ja']`, ordine `en` poi `ja` |
| U2 | `groupByConcept` su carte con `xlang_key` diverso | gruppi separati (no cross-match) |
| U3 | `cardPageData` merge: canonical con 4 lingue + `card_versions` aggiunge JA | `languages` = 5, ordinate (lang richiesta → en → ja → resto), `variantLinkBasis[ja_id]='set_alias'` |
| U4 | Regressione Search: query "charizard" senza set → nessuna esplosione di falsi positivi (l'espansione xlang richiede set+numero) | risultati stabili vs baseline |
| U5 | Regressione Card page: carta EN-only (nessun alias) | `languages=['en']`, nessun pill, comportamento identico a oggi |

### 10.4 Dato di verifica

`scripts/verify-cross-language.mjs` (read-only, come `verify-*` esistenti): per un campione di 20 carte note (Charizard/Pikachu/Umbreon SV + One Piece), stampa `card_versions` e verifica a occhio EN↔JA. Da allegare alla PR.

---

## 11. Migration strategy

**3 migrazioni additive + reversibili**, applicate nell'ordine, ognuna con `_down`:

| # | File | Contenuto | Rischio |
|---|---|---|---|
| M1 | `YYYYMMDDHHMMSS_set_alias_tables.sql` (+ `_down`) | `set_alias`, `card_number_alias`, indici, RLS, policy | Nullo (CREATE TABLE nuove) |
| M2 | `YYYYMMDDHHMMSS_cards_tcg_set_number_idx.sql` (+ `_down`) | `create index cards_tcg_set_number_idx on cards (tcg, set_id, card_number_norm)` — con `concurrently` eseguito fuori transazione, o in finestra di manutenzione | Basso (lock scrittura ~5-15s su 204k righe se non `concurrently`) |
| M3 | `YYYYMMDDHHMMSS_card_versions_rpc.sql` (+ `_down`) | `xlang_key()`, `card_versions()`, `card_versions_batch()` + grant | Nullo (funzioni nuove) |

**Poi**, fuori dalle migrazioni (dato, non schema):
- `node scripts/apply-cross-language-aliases.mjs --dry-run` → review output
- `node scripts/apply-cross-language-aliases.mjs --apply` → popola `set_alias` / `card_number_alias` dal seed

**Poi** deploy del codice (Search + Card page) — che degrada con grazia se le RPC non ci sono ancora (fallback al comportamento attuale). Quindi: **migrazioni prima, codice dopo**, e il codice non rompe nulla anche se deployato per errore prima delle migrazioni.

**Nessun backfill di `cards` / `canonical_cards`. Nessun re-point. Nessun DELETE.**

`get_advisors` (security + performance) dopo M1 e M3 — atteso 0 nuovi warning (RLS public-read + `search_path=''` come le RPC esistenti).

---

## 12. Rollback strategy

| Livello | Come | Effetto |
|---|---|---|
| **Dati** (mapping sbagliato) | `update set_alias set confidence='rejected' where id = ...` oppure `delete` | Immediato, il concept torna a non-linkato. Nessun `cards` toccato. |
| **RPC** | `M3_down.sql`: `drop function card_versions...` | Search/Card page RPC-call falliscono → **fallback automatico** al comportamento pre-spec (canonical-only). Nessun crash. |
| **Indice** | `M2_down.sql`: `drop index cards_tcg_set_number_idx` | Nessun impatto funzionale (solo perf). |
| **Tabelle** | `M1_down.sql`: `drop table set_alias, card_number_alias` | Torna allo stato zero. |
| **Codice UI** | revert del commit Search/Card page | `groupByConcept`→`groupByCanonical`, `cardPageData` non chiama la RPC. |

**Punto chiave:** ogni livello è indipendente. Si può disattivare il mapping (dato) senza toccare codice, o disattivare il codice senza toccare i dati. Il fallback è sempre "il comportamento di oggi", mai un errore.

**Feature flag opzionale:** `searchCards` e `cardPageData` leggono `import.meta.env.VITE_XLANG_ENABLED` (default true); se false → skip della chiamata RPC. Utile per A/B o kill-switch senza redeploy delle migrazioni.

---

## 13. Exact files to modify / create

### Nuovi

| File | Scopo |
|---|---|
| `supabase/migrations/<ts>_set_alias_tables.sql` + `_down.sql` | M1 |
| `supabase/migrations/<ts>_cards_tcg_set_number_idx.sql` + `_down.sql` | M2 |
| `supabase/migrations/<ts>_card_versions_rpc.sql` + `_down.sql` | M3 |
| `data/cross-language/set-aliases.json` | seed mappa set |
| `data/cross-language/card-number-aliases.json` | seed eccezioni numero |
| `data/cross-language/set-aliases.schema.json` + `card-number-aliases.schema.json` | JSON schema di validazione |
| `data/cross-language/LICENSE` | CC0-1.0 per i mapping curati |
| `data/cross-language/README.md` | come si estende il seed, criteri di `confirmed` |
| `scripts/lib/catalog/cross-lang.js` | `xlangKey`, `resolveSetAlias`, `resolveNumberAlias` (JS puro, mirror di `xlang_key` SQL) |
| `scripts/lib/catalog/__tests__/cross-lang.test.js` | test §10.1 |
| `scripts/apply-cross-language-aliases.mjs` | apply idempotente del seed |
| `scripts/__tests__/apply-cross-language-aliases.test.js` | test §3.4 |
| `scripts/verify-cross-language.mjs` | verifica read-only §10.4 |
| `scripts/__tests__/card-versions-rpc.test.mjs` | test RPC §10.2 |

### Modificati

| File | Modifica |
|---|---|
| `src/lib/search.js` | `card_versions_batch` expand + `groupByConcept` (rinomina/estende `groupByCanonical`, retro-compat) + sort versioni §5.6. Le euristiche attuali diventano fallback. |
| `src/pages/card/cardPageData.js` | dopo `allVariants`: chiama `card_versions(p_canonical_card_id)`, merge, `languages` ordinate, nuovo campo `variantLinkBasis` |
| `src/components/search/SearchResultItem.jsx` | sort di `variantEntries` per §5.6; (opz.) tooltip `link_basis` |
| `src/pages/card/CardPage.jsx` | (opz.) riga discreta di provenance sotto `crossLangBadge` quando `variantLinkBasis[id].link_basis==='set_alias'` |
| `src/supabase.js` | (opz.) helper `fetchCardVersions(args)` se conviene centralizzare la chiamata RPC |
| `.github/workflows/tests.yml` | includere i nuovi test (già coperto se il glob è `scripts/**/*.test.js` + `src/**/*.test.js`) |

### NON toccati (esplicito)

`canonical_cards` (schema/dati), `cards` (dati; solo indice), `market_valuations`, `market_observations`, `card_prices`, `portfolio_valuations`, `collection`, `watchlist`, `alerts`, `DraGold.jsx`, `DraGold.legacy.jsx`, `SearchView.jsx`, `CommandSearch.jsx`, `AssetView.jsx`, `refresh-prices`, ingestion pipeline.

---

## 14. Implementation order

**Fase A — identità (nessun impatto UI)**
1. M1: tabelle `set_alias` / `card_number_alias` (+ `_down`, + `get_advisors`).
2. `scripts/lib/catalog/cross-lang.js` + test §10.1 (TDD: test prima).
3. `data/cross-language/` seed iniziale (~25-40 `set_alias`, ~10-30 `card_number_alias`) + schema + LICENSE + README.
4. `scripts/apply-cross-language-aliases.mjs` + test §3.4. Run `--dry-run`, review, `--apply`.
5. M2: indice `cards_tcg_set_number_idx`.
6. M3: `xlang_key` + `card_versions` + `card_versions_batch` + grant.
7. `scripts/__tests__/card-versions-rpc.test.mjs` (§10.2) + `scripts/verify-cross-language.mjs` (§10.4). **Deliverable: report di verifica su 20 carte campione.**

→ **Checkpoint 1:** RPC verificata, zero impatto su prodotto live. Merge-abile da sola.

**Fase B — Search**
8. `groupByConcept` in `search.js` + test §10.3 (U1-U2).
9. `card_versions_batch` expand in `searchCards` + fallback + sort versioni.
10. `SearchResultItem.jsx` sort.
11. Regressione §10.3 (U4). Build. Preview.

→ **Checkpoint 2:** ricerca "charizard" scopre la JA. Merge-abile.

**Fase C — Card page**
12. `cardPageData.js` merge `card_versions` + `languages` ordinate + `variantLinkBasis` + test §10.3 (U3, U5).
13. `CardPage.jsx` micro-affordance provenance (opz.).
14. Regressione Card page. Build. Preview.

→ **Checkpoint 3:** Card page mostra EN+JA con provenienza. Merge-abile.

**Fase D — KG + agente (documentazione, non codice qui)**
15. `docs/` — dichiarare l'edge `same_card_across_region` nella futura spec KG.
16. `docs/` — dichiarare `card_versions` come tool nella futura spec agente + interfaccia `LlmProvider`.

Ogni fase: branch dedicato, test verdi, build verde, revertibile in isolamento.

---

## 15. Risks

| Rischio | Prob. | Impatto | Mitigazione |
|---|---|---|---|
| **Mapping set sbagliato** (SV2a ≠ sv03.5) → carte diverse collegate | Bassa (curatela + `note` obbligatoria + review PR) | Alto (fiducia) | Solo `confidence='confirmed'` attiva; `verify-cross-language.mjs` allegato a ogni PR di seed; rollback = `update ... set confidence='rejected'` (dato, istantaneo). |
| **`card_number` combacia ma sono carte diverse** (numero riusato tra set non-equivalenti mappati per errore) | Bassa | Alto | Il rimap set richiede `relation='equivalent'` + `confirmed` — un'asserzione forte ("stesso card list, stessa numerazione"), non "i set si assomigliano". `partial`/`subset`/`superset` non rimappano nulla (§2.5). Set con divergenze → link solo carta-per-carta via `card_number_alias` 1:1. Test §10.1 #12/#14/#16. |
| **Seed troppo piccolo** → l'agente/Search dicono "nessuna corrispondenza" spesso | Alta (v1) | Medio | È il comportamento voluto (accuracy > coverage). Coverage KPI (§7) guida l'espansione curata. One Piece già coperto al 100% via canonical. |
| **`card_versions` lenta** (query su `xlang_key` calcolato) | Media | Medio | Indice `cards_tcg_set_number_idx`; `xlang_key` risolve alias con `LIMIT 1` su indici parziali; match bounded dal numero; `card_versions_batch` per Search (1 round-trip). Benchmark in Fase A checkpoint. |
| **Regressione Search** (espansione xlang introduce falsi positivi su query di nome) | Media | Medio | L'espansione xlang si attiva **solo** per righe con `card_number` set-prefixed (stesso `safeNums` di oggi); test U4; le euristiche attuali restano come fallback, non sostituite di colpo. |
| **`get_advisors` warning** su nuove RPC | Bassa | Basso | `security invoker` + `search_path=''` come le RPC portfolio (0 warning lì). |
| **Interazione con debito `me4`/`me04`** | Bassa | Basso | `set_identity_key` già collassa quei casi; `xlang_key` lo compone dopo l'alias → nessun conflitto. Il dedup `me4` resta task separato e indipendente. |
| **`set_identity_key` collassa due set genuinamente diversi** (sul lato riferimento) | Molto bassa | Alto | `set_identity_key` è già in produzione e vettato: i 26 gruppi di collisione analizzati nel report dedup `me4`/`me04` sono tutti spelling dello stesso set. Questa spec non modifica `set_identity_key` e non introduce nuovi input problematici (i codici JA vengono prima rimappati a un codice EN reale, poi normalizzati). Se un nuovo caso emergesse, è un bug di `set_identity_key` da fixare a monte, non di questo layer. Test §10.1 #7/#13. |
| **Mapping ambiguo** ("questi set si assomigliano ~80%") | Media (curatela) | Alto | Il seed non ha un livello "somiglianza". Solo `equivalent` (asserzione binaria "SONO lo stesso set") auto-linka. Il dubbio si registra come `candidate`/`partial` → **inerte**. §2.5 elenca ogni forma di ambiguità → tutte cadono in "nessun link". |
| **`card_versions` usata per fondere prezzi** da un futuro sviluppatore | Media | Alto | Contratto esplicito (§4.1): 0 colonne market nell'output; test R7 lo verifica; documentato in §7. |
| **Licenza seed** contestata (contiene dati di terzi) | Bassa | Medio | Seed = solo codici set + lingua + nota originale. Nessun nome carta, nessuna immagine, nessun prezzo. CC0 + review che il PR non introduca contenuto di terzi. |
| **`concurrently` index build fallisce** (lock, transazione) | Bassa | Basso | M2 separata, ri-eseguibile; fallback a build non-concurrent in finestra di manutenzione (5-15s). |
| **JA non nella pipeline prezzi** → l'esempio agente mostra sempre "JA: nessun dato" | Alta (oggi) | Basso | Onesto e corretto. La copertura prezzi JA (TCGCSV categoryId 85) è un task della roadmap market, indipendente. |

---

## 16. Verdetto e valutazione strategica

# BUILD

Questo layer:

1. **Sblocca una capacità oggi rotta al 99,8%** (EN↔JA Pokémon) senza toccare identità, mercato, o dati esistenti. È additivo, reversibile a ogni livello, e degrada al comportamento attuale se disattivato.

2. **È genuinamente open source per costruzione:** SQL puro, zero vendor, zero LLM, RPC pubblica senza gate, seed CC0 senza dati di terzi. Un fork con Ollama + il proprio catalogo ottiene la stessa funzionalità.

3. **Rispetta la separazione di mercato** che il brief impone: EN e JA restano `card_id`, `canonical_card_id`, `market_valuations` distinti. Il layer collega *identità e discovery*, non prezzo.

### Quanto ci avvicina ai primi veri prodotti AI di DraGold

`card_versions` è **il primo tool deterministico dell'agente** — e il più difficile da fare bene, perché "che carta è questa, e quali sono le sue altre versioni" è il gate assoluto di ogni risposta economica (l'audit AI-native, §21, lo chiama "il rischio più alto"). Con questo layer:

| Capacità prodotto AI | Prima | Dopo questo layer |
|---|---|---|
| "Quanto vale questa carta?" | possibile (una lingua) | possibile |
| "Quanto vale la versione giapponese vs inglese?" | **impossibile** (l'agente non sa che sono la stessa carta) | **possibile e deterministico** (`card_versions` → 2× `card_valuation` → explain) |
| "Mostrami tutte le versioni di Charizard ex 151" | parziale (solo lingue che condividono set_id) | completo (EN + JA + altre regioni, con provenienza) |
| "Che differenza c'è tra questa JA e la EN?" | l'agente indovina dal nome | l'agente legge `link_basis` + `alias_note`, non inventa |
| KG edge "edizione regionale" | non esiste | dichiarato, derivabile |

**In termini di roadmap:** dei 5 tool dell'MVP "Ask DraGold" (audit §18: `card_search`, `card_lookup`, `card_valuation`, `live_market`, `collection_lookup`), questo layer rende `card_lookup` **cross-regione** e aggiunge un 6° tool (`card_versions`) che è prerequisito per le query comparative — le più interessanti per un collezionista EU che compra sia EN che JA. Non costruisce l'agente, ma toglie di mezzo il pezzo che l'agente non potrebbe fare senza inventare.

**Costo per arrivarci:** ~2 migrazioni banali + 1 RPC + ~40 righe di seed curato + modifiche contenute a 2 file (`search.js`, `cardPageData.js`) di cui la UII è già pronta. Stima: Fase A ~2-3 gg, Fase B ~1,5 gg, Fase C ~1 gg. Molto meno di quanto valga come fondazione.

### Raccomandazione

**BUILD, Fase A per prima** (identità + RPC + seed + verifica), merge-abile da sola con zero rischio prodotto. Poi Fase B e C in checkpoint separati. Le sezioni Fase D (KG edge, tool agente, `LlmProvider`) restano **documentazione** finché non si apre la spec agente — questo layer le abilita, non le implementa.
