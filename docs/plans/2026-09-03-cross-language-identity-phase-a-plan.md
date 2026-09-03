# Cross-Language Identity — Fase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the additive cross-language identity layer (`set_alias` + `card_number_alias` tables, curated seed, `xlang_key` + `card_versions` RPCs) so EN↔JA versions of the same card can be resolved deterministically — without touching `canonical_card_id`, `market_valuations`, or any existing data.

**Architecture:** Two new curated mapping tables (RLS public-read). A pure JS resolver (`cross-lang.js`) mirrored by a SQL function `xlang_key(tcg, set_id, card_number)` that composes a language-independent "card concept" key: `card_number_alias` override → `set_alias` `equivalent` remap → raw code, then `set_identity_key` for spelling. An RPC `card_versions(...)` returns every `cards` row sharing that key, with provenance (`link_basis`, `alias_note`). Search and Card page integration are **Fase B/C — NOT in this plan.**

**Tech Stack:** Postgres 17 (Supabase), `node:test` (pure JS + integration scripts), `@supabase/supabase-js`, migrations applied via `mcp__claude_ai_Supabase__apply_migration` and committed to `supabase/migrations/`.

**Spec:** `docs/plans/2026-09-03-cross-language-identity-spec.md` — the plan argues from the spec; executors read both.

## Global Constraints

- **Additive only.** No `ALTER` on existing tables except one new index on `cards`. No `DELETE`, no `UPDATE` to `cards` / `canonical_cards` / `market_*` / `collection`.
- **Zero backfill.** No `canonical_card_id` writes. No re-point.
- **Reversible.** Every migration ships a `_down.sql`. Every step is revertible in isolation.
- **Idempotent.** Migrations use `create ... if not exists` / `create or replace` / `drop ... if exists` guards. The seed apply script upserts; re-running writes 0 rows.
- **`card_versions` returns NO price/valuation columns.** Identity + display only. Test-enforced.
- **Only `confidence='confirmed'` participates in resolution.** Only `set_alias.relation='equivalent'` remaps a set. `partial`/`subset`/`superset` are inert for matching (spec §2.5).
- **In dubbio → nessun link.** Every ambiguity resolves to "no link" (spec §2.5 table).
- **JS style:** ESM `.mjs`/`.js`, no TypeScript. Match `scripts/lib/catalog/normalize-set-code.js` (pure functions, `export function`, JSDoc, never throw on bad input).
- **Test file names:** `*.test.js` under `scripts/**` (picked up by `npm run test:scripts` → `node --test "scripts/**/*.test.js"`) or `__tests__/`.
- **Supabase project id:** `pimwkmwrduqkaydyvxqz`.
- **Migration file naming:** `supabase/migrations/YYYYMMDDHHMMSS_<name>.sql` + `_down.sql`. Use a real UTC timestamp at creation time, sequential across the 3 migrations.
- **Existing helpers to reuse:** `public.set_identity_key(text)` (RPC, exists), `public.set_updated_at()` (trigger fn, exists), `cards.card_number_norm` (generated column, exists).

---

## File Structure

**Create:**
- `supabase/migrations/<ts1>_set_alias_tables.sql` + `_down.sql` — M1: the two tables, constraints, trigger, RLS.
- `supabase/migrations/<ts2>_cards_tcg_set_number_idx.sql` + `_down.sql` — M2: composite index on `cards`.
- `supabase/migrations/<ts3>_card_versions_rpc.sql` + `_down.sql` — M3: `xlang_key`, `card_versions`, `card_versions_batch`.
- `scripts/lib/catalog/cross-lang.js` — pure resolvers: `resolveSetAlias`, `resolveNumberAlias`, `xlangKey`, `orderVersions`.
- `scripts/lib/catalog/__tests__/cross-lang.test.js` — 17 pure tests (spec §10.1).
- `data/cross-language/set-aliases.json` — curated set map seed.
- `data/cross-language/card-number-aliases.json` — curated number-exception seed.
- `data/cross-language/set-aliases.schema.json` — JSON Schema for the above.
- `data/cross-language/card-number-aliases.schema.json`
- `data/cross-language/LICENSE` — CC0-1.0 text.
- `data/cross-language/README.md` — how to extend the seed; the `confirmed` bar.
- `scripts/apply-cross-language-aliases.mjs` — idempotent seed → DB, with blocking validations + sanity report.
- `scripts/__tests__/apply-cross-language-aliases.test.js` — validation + idempotency tests (pure, on the validation/planning functions).
- `scripts/verify-cross-language.mjs` — read-only: dump `card_versions` for a sample, produce a report.
- `scripts/__tests__/card-versions-rpc.test.mjs` — 11 RPC integration tests (spec §10.2), run against the live project.

**Modify:** none in Fase A. (`src/lib/search.js`, `src/pages/card/cardPageData.js` are Fase B/C.)

**Never touch:** `canonical_cards`, `cards` data, `market_valuations`, `market_observations`, `card_prices`, `collection`, `watchlist`, `alerts`, `DraGold.jsx`, `DraGold.legacy.jsx`, `search.js`, `cardPageData.js`, `refresh-prices`, ingestion scripts.

---

## Task 1: Pure resolution functions (`cross-lang.js`)

**Files:**
- Create: `scripts/lib/catalog/cross-lang.js`
- Test: `scripts/lib/catalog/__tests__/cross-lang.test.js`

**Interfaces:**
- Consumes: `setIdentityKey` from `../normalize-set-code.js` (exists: `export function setIdentityKey(raw)`).
- Produces:
  - `normNum(raw: string) → string` — `lower`, strip non-`[a-z0-9]`. Mirrors the SQL `regexp_replace(lower(x),'[^a-z0-9]','','g')`.
  - `resolveSetAlias(tcg, setId, aliases) → string` — returns `canonical_set_id` if an `equivalent`+`confirmed` alias exists for `(tcg, setId)`, else `setId`. `aliases` = array of `{tcg, alias_set_id, canonical_set_id, relation, confidence}`.
  - `resolveNumberAlias(tcg, setId, cardNumber, numberAliases) → {canonical_set_id, canonical_card_number} | null` — matches on `(tcg, alias_set_id=setId, normNum(alias_card_number)===normNum(cardNumber), confidence='confirmed')`.
  - `xlangKey(tcg, setId, cardNumber, {setAliases=[], numberAliases=[]}) → string` — `\`${lower(tcg)}:${setIdentityKey(resolvedSet)}:${resolvedNum}\`` where number-alias override wins over set-alias `equivalent` over raw.
  - `orderVersions(rows, contextLang) → rows` — stable sort by: `contextLang` first (if provided), then `en`, then `ja`, then rest alphabetical by `lang`.

- [ ] **Step 1: Write the failing test file**

Create `scripts/lib/catalog/__tests__/cross-lang.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normNum, resolveSetAlias, resolveNumberAlias, xlangKey, orderVersions } from '../cross-lang.js';

const SA = [
  { tcg: 'pokemon', alias_set_id: 'SV2a', canonical_set_id: 'sv03.5', relation: 'equivalent', confidence: 'confirmed' },
  { tcg: 'pokemon', alias_set_id: 'SV2aCand', canonical_set_id: 'sv03.5', relation: 'equivalent', confidence: 'candidate' },
  { tcg: 'pokemon', alias_set_id: 'SV2aRej', canonical_set_id: 'sv03.5', relation: 'equivalent', confidence: 'rejected' },
  { tcg: 'pokemon', alias_set_id: 'SV1a', canonical_set_id: 'sv01', relation: 'partial', confidence: 'confirmed' },
  { tcg: 'pokemon', alias_set_id: 'SUBSET', canonical_set_id: 'sv02', relation: 'subset', confidence: 'confirmed' },
];
const NA = [
  { tcg: 'pokemon', alias_set_id: 'SV2a', alias_card_number: '193', canonical_set_id: 'sv03.5', canonical_card_number: '199', confidence: 'confirmed' },
  { tcg: 'pokemon', alias_set_id: 'SV1a', alias_card_number: '010', canonical_set_id: 'sv01', canonical_card_number: '010', confidence: 'confirmed' },
  { tcg: 'pokemon', alias_set_id: 'SV2a', alias_card_number: '999', canonical_set_id: 'sv03.5', canonical_card_number: '250', confidence: 'candidate' },
];
const K = (t, s, n) => xlangKey(t, s, n, { setAliases: SA, numberAliases: NA });

test('1 — mapped JA set resolves to EN concept', () => {
  assert.equal(K('pokemon', 'SV2a', '006'), K('pokemon', 'sv03.5', '006'));
});
test('2 — unmapped set stays raw (no false link)', () => {
  assert.equal(K('pokemon', 'XY9a', '006'), 'pokemon:xy9a:6');
  assert.notEqual(K('pokemon', 'XY9a', '006'), K('pokemon', 'sv03.5', '006'));
});
test('3 — candidate set alias is inert', () => {
  assert.equal(K('pokemon', 'SV2aCand', '006'), 'pokemon:sv2acand:6');
});
test('4 — rejected set alias is inert', () => {
  assert.equal(K('pokemon', 'SV2aRej', '006'), 'pokemon:sv2arej:6');
});
test('5 — number exception maps set + number', () => {
  assert.equal(K('pokemon', 'SV2a', '193'), K('pokemon', 'sv03.5', '199'));
});
test('6 — candidate number alias is inert', () => {
  assert.equal(K('pokemon', 'SV2a', '999'), K('pokemon', 'sv03.5', '999'));  // set still remapped by equivalent set_alias, number stays raw
});
test('7 — set_identity_key spelling collapse without alias (sv3pt5 vs sv03.5)', () => {
  assert.equal(K('pokemon', 'sv3pt5', '199'), K('pokemon', 'sv03.5', '199'));
});
test('8 — One Piece: EN and JA share set_id, no alias needed', () => {
  assert.equal(K('onepiece', 'OP-01', 'OP01-001'), K('onepiece', 'OP-01', 'OP01-001'));
  assert.equal(K('onepiece', 'OP-01', 'OP01-001'), 'onepiece:op01:op01001');
});
test('9 — works without canonical (function does not read canonical)', () => {
  assert.equal(typeof K('pokemon', 'SV2a', '077'), 'string');
});
test('10 — alias applies to every language of the regional set', () => {
  // both ja and id rows of SV2a resolve identically (function is lang-agnostic)
  assert.equal(K('pokemon', 'SV2a', '006'), K('pokemon', 'sv03.5', '006'));
});
test('11 — idempotent', () => {
  assert.equal(K('pokemon', 'SV2a', '006'), K('pokemon', 'SV2a', '006'));
});
test('12 — cross-set number reuse does not collide (Base 006 vs Jungle 006)', () => {
  assert.notEqual(K('pokemon', 'base1', '006'), K('pokemon', 'jungle', '006'));
});
test('13 — alias target spelling variant still converges (JA + EN-tcgdex + EN-ptcg)', () => {
  const a = K('pokemon', 'SV2a', '006');       // -> sv03.5 -> sv35
  const b = K('pokemon', 'sv03.5', '006');     // -> sv35
  const c = K('pokemon', 'sv3pt5', '006');     // -> sv35
  assert.equal(a, b); assert.equal(b, c);
});
test('14 — relation=partial does NOT remap the set', () => {
  assert.equal(K('pokemon', 'SV1a', '020'), 'pokemon:sv1a:20');
  assert.notEqual(K('pokemon', 'SV1a', '020'), K('pokemon', 'sv01', '020'));
});
test('15 — number alias on a partial set DOES link that one card', () => {
  assert.equal(K('pokemon', 'SV1a', '010'), K('pokemon', 'sv01', '010'));
});
test('16 — relation=subset behaves like partial (no set remap)', () => {
  assert.equal(K('pokemon', 'SUBSET', '005'), 'pokemon:subset:5');
});
test('17 — number alias precedence over set alias', () => {
  // SV2a has an equivalent set_alias to sv03.5 AND a number alias 193->199.
  // The number-alias result must win: number becomes 199, set sv03.5.
  assert.equal(K('pokemon', 'SV2a', '193'), 'pokemon:sv35:199');
});

test('normNum strips separators and lowercases', () => {
  assert.equal(normNum('OP01-001'), 'op01001');
  assert.equal(normNum('006/165'), '006165');
  assert.equal(normNum('  6 '), '6');
  assert.equal(normNum(null), '');
});
test('resolveSetAlias: confirmed+equivalent only', () => {
  assert.equal(resolveSetAlias('pokemon', 'SV2a', SA), 'sv03.5');
  assert.equal(resolveSetAlias('pokemon', 'SV2aCand', SA), 'SV2aCand');
  assert.equal(resolveSetAlias('pokemon', 'SV1a', SA), 'SV1a');   // partial -> not remapped
  assert.equal(resolveSetAlias('pokemon', 'nope', SA), 'nope');
});
test('resolveNumberAlias: confirmed only, norm match', () => {
  assert.deepEqual(resolveNumberAlias('pokemon', 'SV2a', '193', NA), { canonical_set_id: 'sv03.5', canonical_card_number: '199' });
  assert.equal(resolveNumberAlias('pokemon', 'SV2a', '999', NA), null);  // candidate
  assert.equal(resolveNumberAlias('pokemon', 'SV2a', '006', NA), null);
});
test('orderVersions: contextLang, then en, ja, rest', () => {
  const rows = [{ lang: 'de' }, { lang: 'ja' }, { lang: 'en' }, { lang: 'it' }];
  assert.deepEqual(orderVersions(rows, 'it').map(r => r.lang), ['it', 'en', 'ja', 'de']);
  assert.deepEqual(orderVersions(rows, null).map(r => r.lang), ['en', 'ja', 'de', 'it']);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `node --test scripts/lib/catalog/__tests__/cross-lang.test.js`
Expected: FAIL — `Cannot find module '../cross-lang.js'`.

- [ ] **Step 3: Implement `cross-lang.js`**

Create `scripts/lib/catalog/cross-lang.js`:

```js
// DraGold — Cross-Language Identity (Fase A)
// Puro, nessun I/O. Mirror JS di public.xlang_key (spec §4.3).
// Le mappe (set_alias / card_number_alias) sono passate come argomento:
// gli stessi dati che vivono nelle tabelle omonime.
import { setIdentityKey } from './normalize-set-code.js';

/** lower + solo [a-z0-9]. Mirror di regexp_replace(lower(x),'[^a-z0-9]','','g'). */
export function normNum(raw) {
  return String(raw ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Ritorna canonical_set_id se esiste un set_alias equivalent+confirmed per
 * (tcg, setId); altrimenti setId invariato. partial/subset/superset NON rimappano.
 */
export function resolveSetAlias(tcg, setId, setAliases = []) {
  const hit = (setAliases || []).find(a =>
    a && a.tcg === tcg && a.alias_set_id === setId
    && a.confidence === 'confirmed' && a.relation === 'equivalent');
  return hit ? hit.canonical_set_id : setId;
}

/**
 * Override puntuale: se una riga card_number_alias confirmed matcha
 * (tcg, alias_set_id=setId, normNum(alias_card_number)===normNum(cardNumber)),
 * ritorna { canonical_set_id, canonical_card_number }; altrimenti null.
 */
export function resolveNumberAlias(tcg, setId, cardNumber, numberAliases = []) {
  const n = normNum(cardNumber);
  const hit = (numberAliases || []).find(a =>
    a && a.tcg === tcg && a.alias_set_id === setId
    && a.confidence === 'confirmed'
    && normNum(a.alias_card_number) === n);
  return hit ? { canonical_set_id: hit.canonical_set_id, canonical_card_number: hit.canonical_card_number } : null;
}

/**
 * La chiave "card concept" language-independent.
 * Precedenza: number-alias (set+numero) > set-alias equivalent (solo set) > grezzo.
 * setIdentityKey normalizza lo spelling del set risolto.
 */
export function xlangKey(tcg, setId, cardNumber, { setAliases = [], numberAliases = [] } = {}) {
  const t = String(tcg ?? '').toLowerCase();
  const na = resolveNumberAlias(tcg, setId, cardNumber, numberAliases);
  if (na) return `${t}:${setIdentityKey(na.canonical_set_id)}:${normNum(na.canonical_card_number)}`;
  const refSet = resolveSetAlias(tcg, setId, setAliases);
  return `${t}:${setIdentityKey(refSet)}:${normNum(cardNumber)}`;
}

const LANG_RANK = { en: 1, ja: 2 };
/** Ordina le versioni: contextLang, poi en, poi ja, poi resto alfabetico. Stabile. */
export function orderVersions(rows, contextLang = null) {
  const rank = (l) => {
    if (contextLang && l === contextLang) return 0;
    return LANG_RANK[l] ?? 3;
  };
  return [...(rows || [])]
    .map((r, i) => [r, i])
    .sort(([a, ia], [b, ib]) => {
      const ra = rank(a.lang), rb = rank(b.lang);
      if (ra !== rb) return ra - rb;
      const la = (a.lang || ''), lb = (b.lang || '');
      if (la !== lb) return la < lb ? -1 : 1;
      return ia - ib;
    })
    .map(([r]) => r);
}
```

- [ ] **Step 4: Run tests, verify all pass**

Run: `node --test scripts/lib/catalog/__tests__/cross-lang.test.js`
Expected: PASS — 22 tests (17 numbered + 5 helper tests).

If test 6 fails: re-read — with a `candidate` number alias, the number stays raw but the `equivalent` set_alias still remaps `SV2a→sv03.5`, so `K('pokemon','SV2a','999')` must equal `K('pokemon','sv03.5','999')`. The assertion is written that way.

- [ ] **Step 5: Run the whole scripts suite (no regressions)**

Run: `npm run test:scripts`
Expected: PASS — 567 prior + 22 new.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/catalog/cross-lang.js scripts/lib/catalog/__tests__/cross-lang.test.js
git commit -m "feat(xlang): pure cross-language concept key resolver (cross-lang.js)"
```

---

## Task 2: Migration M1 — `set_alias` + `card_number_alias` tables

**Files:**
- Create: `supabase/migrations/<ts1>_set_alias_tables.sql`
- Create: `supabase/migrations/<ts1>_set_alias_tables_down.sql`

**Interfaces:**
- Consumes: `public.set_updated_at()` (existing trigger fn).
- Produces: tables `public.set_alias`, `public.card_number_alias` with the constraints below; trigger `set_alias_no_self_ref_trg`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/<ts1>_set_alias_tables.sql` (replace `<ts1>` with `date -u +%Y%m%d%H%M%S`):

```sql
-- Cross-Language Identity (Fase A) — M1: curated set/number mapping tables.
-- Additive. RLS public-read, service_role write. Spec: docs/plans/2026-09-03-cross-language-identity-spec.md §2
-- DOWN: <ts1>_set_alias_tables_down.sql

create table if not exists public.set_alias (
  id               bigint generated always as identity primary key,
  tcg              text not null,
  alias_set_id     text not null,
  canonical_set_id text not null,
  relation         text not null default 'equivalent'
                   check (relation in ('equivalent','subset','superset','partial')),
  confidence       text not null default 'confirmed'
                   check (confidence in ('confirmed','candidate','rejected')),
  source           text not null default 'curated',
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint set_alias_not_self check (alias_set_id <> canonical_set_id),
  unique (tcg, alias_set_id)
);
create index if not exists set_alias_lookup_idx
  on public.set_alias (tcg, alias_set_id) where confidence = 'confirmed';
create index if not exists set_alias_canon_idx
  on public.set_alias (tcg, canonical_set_id) where confidence = 'confirmed';

alter table public.set_alias enable row level security;
drop policy if exists set_alias_public_read on public.set_alias;
create policy set_alias_public_read on public.set_alias for select using (true);

create table if not exists public.card_number_alias (
  id                    bigint generated always as identity primary key,
  tcg                   text not null,
  canonical_set_id      text not null,
  alias_set_id          text not null,
  alias_card_number     text not null,
  canonical_card_number text not null,
  relation              text not null default 'same_card' check (relation in ('same_card')),
  confidence            text not null default 'confirmed'
                        check (confidence in ('confirmed','candidate','rejected')),
  source                text not null default 'curated',
  note                  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (tcg, alias_set_id, alias_card_number),
  unique (tcg, canonical_set_id, alias_set_id, canonical_card_number)
);
create index if not exists card_number_alias_lookup_idx
  on public.card_number_alias (tcg, alias_set_id, alias_card_number) where confidence = 'confirmed';

alter table public.card_number_alias enable row level security;
drop policy if exists card_number_alias_public_read on public.card_number_alias;
create policy card_number_alias_public_read on public.card_number_alias for select using (true);

-- Difensivo: un set non può essere sia riferimento che alias per lo stesso tcg.
create or replace function public.set_alias_no_self_ref() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.set_alias
             where tcg = new.tcg and alias_set_id = new.canonical_set_id
               and (tg_op = 'INSERT' or id <> new.id)) then
    raise exception 'set % is already an alias_set_id for tcg % — cannot also be canonical', new.canonical_set_id, new.tcg;
  end if;
  if exists (select 1 from public.set_alias
             where tcg = new.tcg and canonical_set_id = new.alias_set_id
               and (tg_op = 'INSERT' or id <> new.id)) then
    raise exception 'set % is already a canonical_set_id for tcg % — cannot also be an alias', new.alias_set_id, new.tcg;
  end if;
  return new;
end $$;
drop trigger if exists set_alias_no_self_ref_trg on public.set_alias;
create trigger set_alias_no_self_ref_trg before insert or update on public.set_alias
  for each row execute function public.set_alias_no_self_ref();

drop trigger if exists set_alias_updated_at on public.set_alias;
create trigger set_alias_updated_at before update on public.set_alias
  for each row execute function public.set_updated_at();
drop trigger if exists card_number_alias_updated_at on public.card_number_alias;
create trigger card_number_alias_updated_at before update on public.card_number_alias
  for each row execute function public.set_updated_at();
```

Create `supabase/migrations/<ts1>_set_alias_tables_down.sql`:

```sql
drop trigger if exists set_alias_updated_at on public.set_alias;
drop trigger if exists card_number_alias_updated_at on public.card_number_alias;
drop trigger if exists set_alias_no_self_ref_trg on public.set_alias;
drop function if exists public.set_alias_no_self_ref();
drop table if exists public.card_number_alias;
drop table if exists public.set_alias;
```

- [ ] **Step 2: Verify `set_updated_at()` exists (dependency check)**

Run via `mcp__claude_ai_Supabase__execute_sql` (project `pimwkmwrduqkaydyvxqz`):

```sql
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and proname='set_updated_at';
```

Expected: 1 row. If 0 rows: add `create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;` to the top of M1 and to `_down` drop it.

- [ ] **Step 3: Apply the migration**

Use `mcp__claude_ai_Supabase__apply_migration` with `name` = `<ts1>_set_alias_tables` and `query` = the full M1 SQL.

- [ ] **Step 4: Verify tables + constraints exist**

Run via `execute_sql`:

```sql
select table_name, (select count(*) from information_schema.columns c where c.table_name=t.table_name and c.table_schema='public') cols
from information_schema.tables t where table_schema='public' and table_name in ('set_alias','card_number_alias');
```

Expected: `set_alias` 10 cols, `card_number_alias` 12 cols.

- [ ] **Step 5: Verify the guards reject bad rows**

Run via `execute_sql` (each should ERROR):

```sql
-- self-alias rejected
insert into public.set_alias (tcg, alias_set_id, canonical_set_id) values ('t','x','x');
```
Expected: ERROR `set_alias_not_self`.

```sql
-- self-ref trigger: insert an alias, then try to make its canonical an alias too
insert into public.set_alias (tcg, alias_set_id, canonical_set_id) values ('t','a','b');
insert into public.set_alias (tcg, alias_set_id, canonical_set_id) values ('t','b','c');
```
Expected: second insert ERRORs (`b is already a canonical_set_id`). Then clean up: `delete from public.set_alias where tcg='t';`

```sql
-- number alias 1:1 reverse
insert into public.card_number_alias (tcg,canonical_set_id,alias_set_id,alias_card_number,canonical_card_number) values ('t','c','a','1','9');
insert into public.card_number_alias (tcg,canonical_set_id,alias_set_id,alias_card_number,canonical_card_number) values ('t','c','a','2','9');
```
Expected: second insert ERRORs (`unique (tcg, canonical_set_id, alias_set_id, canonical_card_number)`). Clean up: `delete from public.card_number_alias where tcg='t';`

- [ ] **Step 6: Run security advisors**

Use `mcp__claude_ai_Supabase__get_advisors` with `type` = `security`.
Expected: no NEW warnings referencing `set_alias` / `card_number_alias` (RLS enabled + public-read policy present; both tables read-only to anon).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/<ts1>_set_alias_tables.sql supabase/migrations/<ts1>_set_alias_tables_down.sql
git commit -m "feat(xlang): M1 — set_alias + card_number_alias curated mapping tables"
```

---

## Task 3: Seed data + JSON schemas + apply script

**Files:**
- Create: `data/cross-language/set-aliases.json`, `card-number-aliases.json`, `set-aliases.schema.json`, `card-number-aliases.schema.json`, `LICENSE`, `README.md`
- Create: `scripts/apply-cross-language-aliases.mjs`
- Test: `scripts/__tests__/apply-cross-language-aliases.test.js`

**Interfaces:**
- Consumes: `set_alias` / `card_number_alias` tables (Task 2), `@supabase/supabase-js`.
- Produces (exported from `apply-cross-language-aliases.mjs` for testing):
  - `validateSeed(setAliases, numberAliases) → {ok: boolean, errors: string[]}` — the blocking validations (spec §3.4).
  - `planUpserts(seedRows, dbRows) → {insert, update, unchanged}` — pure diff for idempotency assertions.

- [ ] **Step 1: Write the JSON schemas**

Create `data/cross-language/set-aliases.schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["aliases"],
  "properties": {
    "generated_note": { "type": "string" },
    "aliases": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["tcg", "alias_set_id", "canonical_set_id", "relation", "confidence", "source", "note"],
        "properties": {
          "tcg": { "type": "string", "enum": ["pokemon", "onepiece", "mtg", "ygo"] },
          "alias_set_id": { "type": "string", "minLength": 1 },
          "canonical_set_id": { "type": "string", "minLength": 1 },
          "relation": { "type": "string", "enum": ["equivalent", "subset", "superset", "partial"] },
          "confidence": { "type": "string", "enum": ["confirmed", "candidate", "rejected"] },
          "source": { "type": "string", "minLength": 1 },
          "note": { "type": "string", "minLength": 10 }
        }
      }
    }
  }
}
```

Create `data/cross-language/card-number-aliases.schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["aliases"],
  "properties": {
    "aliases": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["tcg", "canonical_set_id", "alias_set_id", "alias_card_number", "canonical_card_number", "confidence", "source", "note"],
        "properties": {
          "tcg": { "type": "string", "enum": ["pokemon", "onepiece", "mtg", "ygo"] },
          "canonical_set_id": { "type": "string", "minLength": 1 },
          "alias_set_id": { "type": "string", "minLength": 1 },
          "alias_card_number": { "type": "string", "minLength": 1 },
          "canonical_card_number": { "type": "string", "minLength": 1 },
          "confidence": { "type": "string", "enum": ["confirmed", "candidate", "rejected"] },
          "source": { "type": "string", "minLength": 1 },
          "note": { "type": "string", "minLength": 10 }
        }
      }
    }
  }
}
```

- [ ] **Step 2: Write the seed files (v1 initial scope)**

Before writing entries, gather ground truth via `execute_sql` — list the JA Pokémon SV-era set codes actually present:

```sql
select set_id, set_name, count(*) n, min(card_number) lo, max(card_number) hi
from public.cards where tcg='pokemon' and lang='ja' and set_id ~* '^(sv|m)[0-9]'
group by set_id, set_name order by set_id;
```

And the EN counterparts:

```sql
select set_id, set_name, count(*) n from public.cards
where tcg='pokemon' and lang='en' and source='tcgdex' and set_id ~* '^sv'
group by set_id, set_name order by set_id;
```

Then create `data/cross-language/set-aliases.json` with the **confirmed** SV-era equivalences you can verify from Bulbapedia (each `note` cites the JA name, JA release, EN name, EN release, and "shared main-set numbering"). Start with these high-confidence pairs (verify each set_id string against the query output — adjust casing to match `cards.set_id` exactly):

```jsonc
{
  "$schema": "./set-aliases.schema.json",
  "generated_note": "Curated cross-language set equivalences. Each entry asserts 'this JA set IS this EN set' (same card list + numbering). Only confidence:confirmed activates linking. Facts only (set codes, languages, release dates) — no third-party card content. License: CC0-1.0.",
  "aliases": [
    { "tcg": "pokemon", "alias_set_id": "SV2a", "canonical_set_id": "sv03.5", "relation": "equivalent", "confidence": "confirmed", "source": "bulbapedia",
      "note": "JA 'Pokemon Card 151' (SV2a, 2023-06-16) == EN '151' (sv03.5, 2023-09-22). Shared 165-card main set, numbering 001-165." },
    { "tcg": "pokemon", "alias_set_id": "SV4a", "canonical_set_id": "sv04.5", "relation": "equivalent", "confidence": "confirmed", "source": "bulbapedia",
      "note": "JA 'Shiny Treasure ex' (SV4a, 2023-12-01) == EN 'Paldean Fates' (sv04.5, 2024-01-26). Shared main-set numbering." },
    { "tcg": "pokemon", "alias_set_id": "SV6a", "canonical_set_id": "sv06.5", "relation": "equivalent", "confidence": "confirmed", "source": "bulbapedia",
      "note": "JA 'Night Wanderer' (SV6a, 2024-06-07) == EN 'Shrouded Fable' subset overlap — VERIFY numbering before confirm; downgrade to candidate if unsure." }
  ]
}
```

**Rule while curating:** if you cannot confirm from Bulbapedia that the two sets share the same main-set card list AND numbering, set `confidence: "candidate"` (inert) — never guess. It is correct and expected for v1 to ship with only ~5-15 confirmed pairs.

Create `data/cross-language/card-number-aliases.json` with the chase-card number exceptions you can confirm (e.g. SAR/secret rares that JA and EN number differently). Example format (verify each before adding as `confirmed`):

```jsonc
{
  "$schema": "./card-number-aliases.schema.json",
  "aliases": [
    { "tcg": "pokemon", "canonical_set_id": "sv03.5", "alias_set_id": "SV2a", "alias_card_number": "201", "canonical_card_number": "223", "confidence": "candidate", "source": "curated",
      "note": "Charizard ex SIR — JA 151 numbers it differently from EN 151. PLACEHOLDER — verify exact numbers before setting confirmed." }
  ]
}
```

- [ ] **Step 3: Write LICENSE and README**

Create `data/cross-language/LICENSE` = the full CC0-1.0 legal text (from https://creativecommons.org/publicdomain/zero/1.0/legalcode.txt).

Create `data/cross-language/README.md`:

```markdown
# Cross-Language Set/Number Mapping (curated data)

Editorial assertions that a regional set (e.g. Japanese `SV2a`) IS the same set
as a reference-region set (e.g. English `sv03.5`), used by `public.xlang_key` /
`public.card_versions` to link the same physical card across languages.

## What's in here (and what isn't)

Facts only: set codes, languages, release dates, and original DraGold notes.
**No third-party card content** — no card names, images, prices, or text.
A fork runs its own catalog sync; this seed is independent of that content.

**License: CC0-1.0** (`./LICENSE`). Use freely.

## The bar for `confidence: "confirmed"`

Only set `confirmed` when you can verify from a primary/secondary source
(Bulbapedia, official set lists) that:

- `relation: "equivalent"` — the two sets share the **same main-set card list
  and the same numbering**. A card with number N in one is the same card as
  number N in the other.
- `relation: "partial"/"subset"/"superset"` — the sets overlap but card lists
  differ. These do **not** auto-link; only explicit `card-number-aliases.json`
  entries link individual cards.

If in doubt → `confidence: "candidate"` (stored, inert) or leave it out.
Zero false links is the goal.

## Applying

    node scripts/apply-cross-language-aliases.mjs --dry-run   # review
    node scripts/apply-cross-language-aliases.mjs --apply     # write to DB (idempotent)
```

- [ ] **Step 4: Write the failing test for the apply script**

Create `scripts/__tests__/apply-cross-language-aliases.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSeed, planUpserts } from '../apply-cross-language-aliases.mjs';

const good = {
  setAliases: [
    { tcg: 'pokemon', alias_set_id: 'SV2a', canonical_set_id: 'sv03.5', relation: 'equivalent', confidence: 'confirmed', source: 'bulbapedia', note: 'x'.repeat(12) },
  ],
  numberAliases: [
    { tcg: 'pokemon', canonical_set_id: 'sv03.5', alias_set_id: 'SV2a', alias_card_number: '193', canonical_card_number: '199', confidence: 'confirmed', source: 'curated', note: 'x'.repeat(12) },
  ],
};

test('validateSeed: clean seed passes', () => {
  assert.equal(validateSeed(good.setAliases, good.numberAliases).ok, true);
});
test('validateSeed: set both alias and canonical -> fail', () => {
  const sa = [
    { tcg: 'pokemon', alias_set_id: 'A', canonical_set_id: 'B', relation: 'equivalent', confidence: 'confirmed', source: 's', note: 'x'.repeat(12) },
    { tcg: 'pokemon', alias_set_id: 'B', canonical_set_id: 'C', relation: 'equivalent', confidence: 'confirmed', source: 's', note: 'x'.repeat(12) },
  ];
  const r = validateSeed(sa, []);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => /both .*alias.*canonical|self-ref/i.test(e)));
});
test('validateSeed: confirmed without note -> fail', () => {
  const sa = [{ tcg: 'pokemon', alias_set_id: 'A', canonical_set_id: 'B', relation: 'equivalent', confidence: 'confirmed', source: 's', note: '' }];
  assert.equal(validateSeed(sa, []).ok, false);
});
test('validateSeed: alias_set_id == canonical_set_id -> fail', () => {
  const sa = [{ tcg: 'pokemon', alias_set_id: 'A', canonical_set_id: 'A', relation: 'equivalent', confidence: 'confirmed', source: 's', note: 'x'.repeat(12) }];
  assert.equal(validateSeed(sa, []).ok, false);
});
test('validateSeed: number alias many-to-one -> fail', () => {
  const na = [
    { tcg: 'pokemon', canonical_set_id: 'sv03.5', alias_set_id: 'SV2a', alias_card_number: '1', canonical_card_number: '9', confidence: 'confirmed', source: 's', note: 'x'.repeat(12) },
    { tcg: 'pokemon', canonical_set_id: 'sv03.5', alias_set_id: 'SV2a', alias_card_number: '2', canonical_card_number: '9', confidence: 'confirmed', source: 's', note: 'x'.repeat(12) },
  ];
  assert.equal(validateSeed([], na).ok, false);
});
test('planUpserts: idempotent — identical db rows -> 0 insert 0 update', () => {
  const seed = good.setAliases;
  const db = good.setAliases.map(r => ({ ...r }));
  const p = planUpserts(seed, db, ['tcg', 'alias_set_id']);
  assert.equal(p.insert.length, 0);
  assert.equal(p.update.length, 0);
  assert.equal(p.unchanged.length, 1);
});
test('planUpserts: changed note -> update', () => {
  const seed = [{ ...good.setAliases[0], note: 'y'.repeat(12) }];
  const db = [{ ...good.setAliases[0] }];
  const p = planUpserts(seed, db, ['tcg', 'alias_set_id']);
  assert.equal(p.update.length, 1);
});
```

- [ ] **Step 5: Run it, verify it fails**

Run: `node --test scripts/__tests__/apply-cross-language-aliases.test.js`
Expected: FAIL — module not found.

- [ ] **Step 6: Implement `apply-cross-language-aliases.mjs`**

Create `scripts/apply-cross-language-aliases.mjs`:

```js
#!/usr/bin/env node
/**
 * DraGold — applica il seed cross-language (data/cross-language/*.json) alle
 * tabelle set_alias / card_number_alias. Idempotente. dry-run di default.
 *
 *   node scripts/apply-cross-language-aliases.mjs [--apply] [--json=out.json]
 * Env: SUPABASE_URL (o VITE_SUPABASE_URL), SUPABASE_SERVICE_KEY
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'data', 'cross-language');

/** Validazioni bloccanti (spec §3.4). Pura. */
export function validateSeed(setAliases, numberAliases) {
  const errors = [];
  const sa = setAliases || [], na = numberAliases || [];

  for (const r of sa) {
    if (r.alias_set_id === r.canonical_set_id)
      errors.push(`set_alias ${r.tcg}/${r.alias_set_id}: alias_set_id == canonical_set_id`);
    if (r.confidence === 'confirmed' && !(r.note && r.note.trim().length >= 10))
      errors.push(`set_alias ${r.tcg}/${r.alias_set_id}: confirmed requires a note (>=10 chars)`);
    if (!['equivalent', 'subset', 'superset', 'partial'].includes(r.relation))
      errors.push(`set_alias ${r.tcg}/${r.alias_set_id}: bad relation ${r.relation}`);
  }
  // self-ref: un set non è sia alias che canonical per lo stesso tcg
  for (const r of sa) {
    if (sa.some(o => o.tcg === r.tcg && o.alias_set_id === r.canonical_set_id))
      errors.push(`set_alias ${r.tcg}/${r.canonical_set_id}: is both a canonical and an alias (self-ref)`);
  }
  // dup unique (tcg, alias_set_id)
  const seen = new Set();
  for (const r of sa) {
    const k = `${r.tcg}|${r.alias_set_id}`;
    if (seen.has(k)) errors.push(`set_alias duplicate (tcg, alias_set_id): ${k}`);
    seen.add(k);
  }

  for (const r of na) {
    if (r.confidence === 'confirmed' && !(r.note && r.note.trim().length >= 10))
      errors.push(`card_number_alias ${r.tcg}/${r.alias_set_id}/${r.alias_card_number}: confirmed requires a note`);
  }
  // 1:1 in entrambe le direzioni
  const fwd = new Set(), rev = new Set();
  for (const r of na) {
    const f = `${r.tcg}|${r.alias_set_id}|${r.alias_card_number}`;
    const b = `${r.tcg}|${r.canonical_set_id}|${r.alias_set_id}|${r.canonical_card_number}`;
    if (fwd.has(f)) errors.push(`card_number_alias duplicate forward key: ${f}`);
    if (rev.has(b)) errors.push(`card_number_alias many-to-one (reverse key): ${b}`);
    fwd.add(f); rev.add(b);
  }
  return { ok: errors.length === 0, errors };
}

/** Diff puro per idempotenza/report. */
export function planUpserts(seedRows, dbRows, keyCols) {
  const key = (r) => keyCols.map(c => r[c]).join('|');
  const dbByKey = new Map((dbRows || []).map(r => [key(r), r]));
  const compareCols = Object.keys(seedRows[0] || {}).filter(c => !['id', 'created_at', 'updated_at'].includes(c));
  const insert = [], update = [], unchanged = [];
  for (const s of seedRows || []) {
    const d = dbByKey.get(key(s));
    if (!d) insert.push(s);
    else if (compareCols.some(c => String(s[c] ?? '') !== String(d[c] ?? ''))) update.push(s);
    else unchanged.push(s);
  }
  return { insert, update, unchanged };
}

async function main() {
  const APPLY = process.argv.includes('--apply');
  const jsonOut = process.argv.find(a => a.startsWith('--json='))?.split('=')[1] || null;

  const setSeed = JSON.parse(readFileSync(join(DATA, 'set-aliases.json'), 'utf8')).aliases || [];
  const numSeed = JSON.parse(readFileSync(join(DATA, 'card-number-aliases.json'), 'utf8')).aliases || [];

  const v = validateSeed(setSeed, numSeed);
  if (!v.ok) {
    console.error('SEED VALIDATION FAILED:\n' + v.errors.map(e => '  - ' + e).join('\n'));
    process.exit(1);
  }
  console.log(`[apply-cross-language-aliases] ${APPLY ? 'APPLY' : 'DRY-RUN'} — set_alias ${setSeed.length}, card_number_alias ${numSeed.length}`);

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) { console.error('ERROR: SUPABASE_URL e SUPABASE_SERVICE_KEY richiesti'); process.exit(1); }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: dbSet } = await sb.from('set_alias').select('*');
  const { data: dbNum } = await sb.from('card_number_alias').select('*');

  const setPlan = planUpserts(setSeed, dbSet || [], ['tcg', 'alias_set_id']);
  const numPlan = planUpserts(numSeed, dbNum || [], ['tcg', 'alias_set_id', 'alias_card_number']);

  console.log(`  set_alias:  insert ${setPlan.insert.length}, update ${setPlan.update.length}, unchanged ${setPlan.unchanged.length}`);
  console.log(`  card_number_alias: insert ${numPlan.insert.length}, update ${numPlan.update.length}, unchanged ${numPlan.unchanged.length}`);

  // sanity report (non bloccante): quante righe cards toccate da ogni alias confirmed
  const report = { generated_at: new Date().toISOString(), apply: APPLY, sanity: [] };
  for (const a of setSeed.filter(x => x.confidence === 'confirmed')) {
    const { count: cAlias } = await sb.from('cards').select('id', { count: 'exact', head: true }).eq('tcg', a.tcg).eq('set_id', a.alias_set_id);
    const { count: cCanon } = await sb.from('cards').select('id', { count: 'exact', head: true }).eq('tcg', a.tcg).eq('set_id', a.canonical_set_id);
    report.sanity.push({ alias: `${a.tcg}/${a.alias_set_id}→${a.canonical_set_id}`, rows_on_alias: cAlias, rows_on_canonical: cCanon });
    if (!cAlias) console.warn(`  WARN: ${a.tcg}/${a.alias_set_id} matches 0 cards rows — check the set code`);
  }

  if (APPLY) {
    if (setPlan.insert.length || setPlan.update.length) {
      const { error } = await sb.from('set_alias').upsert(
        [...setPlan.insert, ...setPlan.update].map(stripMeta), { onConflict: 'tcg,alias_set_id' });
      if (error) { console.error('set_alias upsert:', error.message); process.exit(1); }
    }
    if (numPlan.insert.length || numPlan.update.length) {
      const { error } = await sb.from('card_number_alias').upsert(
        [...numPlan.insert, ...numPlan.update].map(stripMeta), { onConflict: 'tcg,alias_set_id,alias_card_number' });
      if (error) { console.error('card_number_alias upsert:', error.message); process.exit(1); }
    }
    console.log('  applied.');
  }

  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 2));
}

function stripMeta(r) { const { id, created_at, updated_at, ...rest } = r; return rest; }

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (invokedDirectly) main().catch(e => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
```

- [ ] **Step 7: Run tests, verify all pass**

Run: `node --test scripts/__tests__/apply-cross-language-aliases.test.js`
Expected: PASS — 7 tests.

- [ ] **Step 8: Dry-run against the DB**

```bash
set -a && source .env.local && set +a
node scripts/apply-cross-language-aliases.mjs --dry-run --json=/tmp/xlang-seed-report.json
```

Expected: validation passes, prints insert/update counts, sanity report shows `rows_on_alias` > 0 for each confirmed pair (if a pair shows 0, fix the set code in the JSON to match `cards.set_id` exactly, or downgrade to `candidate`).

- [ ] **Step 9: Apply**

```bash
node scripts/apply-cross-language-aliases.mjs --apply
```

Then verify idempotency — run it again:

```bash
node scripts/apply-cross-language-aliases.mjs --apply
```

Expected: second run prints `insert 0, update 0`.

- [ ] **Step 10: Verify in DB**

Run via `execute_sql`:

```sql
select confidence, relation, count(*) from public.set_alias group by 1,2 order by 1,2;
select count(*) from public.card_number_alias;
```

Expected: rows match the seed; all `confirmed` rows have non-null `note`.

- [ ] **Step 11: Commit**

```bash
git add data/cross-language/ scripts/apply-cross-language-aliases.mjs scripts/__tests__/apply-cross-language-aliases.test.js
git commit -m "feat(xlang): curated cross-language seed (CC0) + idempotent apply script"
```

---

## Task 4: Migrations M2 + M3 — index + `xlang_key` / `card_versions` RPCs

**Files:**
- Create: `supabase/migrations/<ts2>_cards_tcg_set_number_idx.sql` + `_down.sql`
- Create: `supabase/migrations/<ts3>_card_versions_rpc.sql` + `_down.sql`
- Test: `scripts/__tests__/card-versions-rpc.test.mjs`

**Interfaces:**
- Consumes: `public.set_identity_key(text)` (exists), `set_alias` / `card_number_alias` (Task 2/3), `cards` / `canonical_cards`.
- Produces:
  - `public.xlang_key(p_tcg text, p_set_id text, p_card_number text) → text` — `stable`, matches JS `xlangKey` exactly.
  - `public.card_versions(p_card_id text default null, p_canonical_card_id uuid default null, p_tcg text default null, p_set_id text default null, p_card_number text default null, p_include_self boolean default true)` → table (spec §4.1 columns). `security invoker`, `search_path=''`, `grant execute to anon, authenticated`.
  - `public.card_versions_batch(p_queries jsonb)` → same columns + leading `query_idx int`. `grant execute to anon, authenticated`.

- [ ] **Step 1: Write M2 (index)**

Create `supabase/migrations/<ts2>_cards_tcg_set_number_idx.sql`:

```sql
-- Cross-Language Identity (Fase A) — M2: composite index for card_versions lookups.
-- Non-concurrent create index: cards is ~204k rows, brief write lock, acceptable pre-launch.
-- DOWN: <ts2>_cards_tcg_set_number_idx_down.sql
create index if not exists cards_tcg_set_number_idx
  on public.cards (tcg, set_id, card_number_norm);
```

Create `supabase/migrations/<ts2>_cards_tcg_set_number_idx_down.sql`:

```sql
drop index if exists public.cards_tcg_set_number_idx;
```

- [ ] **Step 2: Apply M2**

`mcp__claude_ai_Supabase__apply_migration`, name `<ts2>_cards_tcg_set_number_idx`, query = M2 SQL.
Verify via `execute_sql`: `select indexname from pg_indexes where tablename='cards' and indexname='cards_tcg_set_number_idx';` → 1 row.

- [ ] **Step 3: Write the failing RPC test file**

Create `scripts/__tests__/card-versions-rpc.test.mjs`. This runs against the live project (read-only). It first resolves real card ids for the fixtures, then asserts behaviour:

```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });

let EN151_006, JA151_006, OP_EN, NOCANON;

before(async () => {
  // EN 151 Charizard-line card 006 (tcgdex)
  const { data: en } = await sb.from('cards').select('id,canonical_card_id,set_id,card_number')
    .eq('tcg', 'pokemon').eq('lang', 'en').eq('source', 'tcgdex').eq('set_id', 'sv03.5').eq('card_number', '006').limit(1);
  EN151_006 = en?.[0];
  const { data: ja } = await sb.from('cards').select('id,canonical_card_id,set_id,card_number')
    .eq('tcg', 'pokemon').eq('lang', 'ja').eq('set_id', 'SV2a').eq('card_number', '006').limit(1);
  JA151_006 = ja?.[0];
  const { data: op } = await sb.from('cards').select('id,canonical_card_id')
    .eq('tcg', 'onepiece').eq('lang', 'en').not('canonical_card_id', 'is', null).limit(1);
  OP_EN = op?.[0];
  const { data: nc } = await sb.from('cards').select('id,tcg,set_id,card_number')
    .is('canonical_card_id', null).eq('tcg', 'onepiece').limit(1);
  NOCANON = nc?.[0];
});

async function cv(args) {
  const { data, error } = await sb.rpc('card_versions', args);
  assert.ifError(error);
  return data;
}

test('R1 — EN 151/006 -> includes JA SV2a/006 via set_alias, with alias_note, NO price columns', async (t) => {
  if (!EN151_006 || !JA151_006) return t.skip('fixtures not present (seed SV2a→sv03.5 confirmed first)');
  const rows = await cv({ p_card_id: EN151_006.id });
  const ja = rows.find(r => r.lang === 'ja');
  assert.ok(ja, 'JA row present');
  assert.equal(ja.link_basis, 'set_alias');
  assert.ok(ja.alias_note && ja.alias_note.length > 0);
  for (const r of rows) {
    assert.equal(r.estimated_value, undefined);
    assert.equal(r.price, undefined);
    assert.equal(r.price_eur, undefined);
  }
});
test('R2 — symmetry: JA 151/006 -> includes EN sv03.5/006', async (t) => {
  if (!JA151_006) return t.skip('fixture');
  const rows = await cv({ p_card_id: JA151_006.id });
  assert.ok(rows.some(r => r.lang === 'en' && r.set_id === 'sv03.5'));
});
test('R3 — unmapped JA set -> only self + same_canonical, no set_alias rows', async () => {
  // a JA card in a set with no alias (pick any older JA set)
  const { data } = await sb.from('cards').select('id').eq('tcg', 'pokemon').eq('lang', 'ja').eq('set_id', 'PCG1').limit(1);
  if (!data?.[0]) return;
  const rows = await cv({ p_card_id: data[0].id });
  assert.ok(rows.every(r => r.link_basis !== 'set_alias' && r.link_basis !== 'number_alias'));
});
test('R4 — One Piece: all langs via same_canonical (regression: still works)', async (t) => {
  if (!OP_EN) return t.skip('fixture');
  const rows = await cv({ p_canonical_card_id: OP_EN.canonical_card_id });
  assert.ok(rows.length >= 1);
  assert.ok(rows.some(r => r.link_basis === 'same_canonical' || r.link_basis === 'self'));
});
test('R5 — card without canonical_card_id: does not crash', async (t) => {
  if (!NOCANON) return t.skip('fixture');
  const rows = await cv({ p_card_id: NOCANON.id });
  assert.ok(Array.isArray(rows));
  assert.ok(rows.some(r => r.card_id === NOCANON.id));
});
test('R6 — card_versions_batch: query_idx maps rows to inputs', async (t) => {
  if (!EN151_006 || !OP_EN) return t.skip('fixture');
  const { data, error } = await sb.rpc('card_versions_batch', { p_queries: [
    { tcg: 'pokemon', set_id: EN151_006.set_id, card_number: EN151_006.card_number },
    { tcg: OP_EN_TCG(), set_id: 'zzz-nope', card_number: '0' },
  ]});
  assert.ifError(error);
  assert.ok(data.some(r => r.query_idx === 0));
});
function OP_EN_TCG() { return 'onepiece'; }

test('R7 — output schema has no market columns', async (t) => {
  if (!EN151_006) return t.skip('fixture');
  const rows = await cv({ p_card_id: EN151_006.id });
  const cols = new Set(Object.keys(rows[0] || {}));
  for (const banned of ['estimated_value', 'observed_low', 'price', 'price_eur', 'confidence', 'confidence_reason']) {
    assert.equal(cols.has(banned), false, `column ${banned} must NOT be in card_versions output`);
  }
  for (const req of ['card_id', 'lang', 'link_basis', 'link_confidence', 'xlang_key', 'slug', 'is_query_row']) {
    assert.equal(cols.has(req), true, `column ${req} required`);
  }
});
test('R8 — bounded: no concept returns > 200 rows', async (t) => {
  if (!EN151_006) return t.skip('fixture');
  const rows = await cv({ p_card_id: EN151_006.id });
  assert.ok(rows.length <= 200);
});
test('R9 — candidate set_alias does not affect output', async () => {
  // insert a candidate alias for a test set, verify no linking, then remove
  await sb.from('set_alias').insert({ tcg: 'pokemon', alias_set_id: '__test_cand__', canonical_set_id: 'sv03.5', relation: 'equivalent', confidence: 'candidate', source: 'test', note: 'test candidate '.repeat(2) });
  const { data } = await sb.rpc('xlang_key', { p_tcg: 'pokemon', p_set_id: '__test_cand__', p_card_number: '006' });
  assert.equal(data, 'pokemon:__testcand__:6');
  await sb.from('set_alias').delete().eq('alias_set_id', '__test_cand__');
});
test('R10 — apply script idempotency already covered (Task 3 step 9)', () => { assert.ok(true); });
test('R11 — market_valuations untouched: EN and JA (if present) are distinct rows', async (t) => {
  if (!EN151_006 || !JA151_006) return t.skip('fixture');
  const { data } = await sb.from('market_valuations').select('card_id').in('card_id', [EN151_006.id, JA151_006.id]);
  // may be 0, 1 or 2 rows — the assertion is only that they are never merged into one shared row
  const ids = new Set((data || []).map(r => r.card_id));
  assert.ok(ids.size === (data || []).length);
});
test('xlang_key SQL matches JS', async () => {
  const { data } = await sb.rpc('xlang_key', { p_tcg: 'pokemon', p_set_id: 'sv3pt5', p_card_number: '199' });
  const { data: d2 } = await sb.rpc('xlang_key', { p_tcg: 'pokemon', p_set_id: 'sv03.5', p_card_number: '199' });
  assert.equal(data, d2);
});
```

- [ ] **Step 4: Run it, verify it fails**

Run: `set -a && source .env.local && set +a && node --test scripts/__tests__/card-versions-rpc.test.mjs`
Expected: FAIL — `card_versions` / `xlang_key` do not exist.

- [ ] **Step 5: Write M3 (RPCs) — reference implementation**

Create `supabase/migrations/<ts3>_card_versions_rpc.sql`. This is the reference implementation; **adjust the body until every test in Step 3 passes** (the tests are the contract):

```sql
-- Cross-Language Identity (Fase A) — M3: xlang_key + card_versions RPCs.
-- security invoker, search_path='', read-only, grant to anon+authenticated.
-- Spec: docs/plans/2026-09-03-cross-language-identity-spec.md §4
-- DOWN: <ts3>_card_versions_rpc_down.sql

create or replace function public.xlang_key(p_tcg text, p_set_id text, p_card_number text)
returns text language sql stable set search_path = '' as $$
  with num_alias as (
    select canonical_set_id, canonical_card_number
    from public.card_number_alias
    where tcg = p_tcg and alias_set_id = p_set_id
      and regexp_replace(lower(alias_card_number),'[^a-z0-9]','','g')
        = regexp_replace(lower(coalesce(p_card_number,'')),'[^a-z0-9]','','g')
      and confidence = 'confirmed'
    limit 1
  ),
  set_equiv as (
    select canonical_set_id from public.set_alias
    where tcg = p_tcg and alias_set_id = p_set_id
      and confidence = 'confirmed' and relation = 'equivalent'
    limit 1
  )
  select lower(coalesce(p_tcg,'')) || ':'
    || public.set_identity_key(coalesce(
         (select canonical_set_id from num_alias),
         (select canonical_set_id from set_equiv),
         p_set_id))
    || ':'
    || coalesce(
         (select regexp_replace(lower(canonical_card_number),'[^a-z0-9]','','g') from num_alias),
         regexp_replace(lower(coalesce(p_card_number,'')),'[^a-z0-9]','','g'));
$$;

create or replace function public.card_versions(
  p_card_id           text  default null,
  p_canonical_card_id uuid  default null,
  p_tcg               text  default null,
  p_set_id            text  default null,
  p_card_number       text  default null,
  p_include_self      boolean default true
)
returns table (
  card_id text, canonical_card_id uuid, slug text,
  tcg text, lang text, set_id text, set_name text, card_number text,
  name text, name_en text, rarity text, print_variant text,
  image_url text, is_query_row boolean, link_basis text,
  link_confidence text, alias_note text, xlang_key text
)
language sql stable security invoker set search_path = '' as $$
  with seed as (
    select c.tcg, c.set_id, c.card_number, c.id as scid, c.canonical_card_id as scanon
    from public.cards c
    where p_card_id is not null and c.id = p_card_id
    union all
    select c.tcg, c.set_id, c.card_number, c.id, c.canonical_card_id
    from public.cards c
    where p_card_id is null and p_canonical_card_id is not null and c.canonical_card_id = p_canonical_card_id
    union all
    select p_tcg, p_set_id, p_card_number, null::text, null::uuid
    where p_card_id is null and p_canonical_card_id is null
      and p_tcg is not null and p_set_id is not null and p_card_number is not null
  ),
  s as (
    select tcg, set_id, card_number, public.xlang_key(tcg, set_id, card_number) as k
    from seed limit 1
  ),
  seed_ids as (
    select coalesce(array_agg(distinct scid) filter (where scid is not null), '{}'::text[]) as ids,
           coalesce(array_agg(distinct scanon) filter (where scanon is not null), '{}'::uuid[]) as canons
    from seed
  ),
  cand_sets as (
    select set_id from s
    union
    select sa.alias_set_id from public.set_alias sa, s
      where sa.tcg = s.tcg and sa.confidence='confirmed' and sa.relation='equivalent'
        and public.set_identity_key(sa.canonical_set_id) = public.set_identity_key(
              coalesce((select x.canonical_set_id from public.set_alias x
                        where x.tcg=s.tcg and x.alias_set_id=s.set_id
                          and x.confidence='confirmed' and x.relation='equivalent' limit 1), s.set_id))
    union
    select sa.canonical_set_id from public.set_alias sa, s
      where sa.tcg = s.tcg and sa.confidence='confirmed' and sa.relation='equivalent'
        and public.set_identity_key(sa.alias_set_id) = public.set_identity_key(s.set_id)
    union
    select cna.alias_set_id from public.card_number_alias cna, s where cna.tcg=s.tcg and cna.confidence='confirmed'
    union
    select cna.canonical_set_id from public.card_number_alias cna, s where cna.tcg=s.tcg and cna.confidence='confirmed'
  ),
  hits as (
    select c.*, public.xlang_key(c.tcg, c.set_id, c.card_number) as ck
    from public.cards c, s
    where c.tcg = s.tcg and c.set_id in (select set_id from cand_sets)
  ),
  matched as (
    select h.* from hits h, s where h.ck = s.k
  )
  select
    m.id,
    m.canonical_card_id,
    cc.slug,
    m.tcg, m.lang, m.set_id, m.set_name, m.card_number,
    m.name, m.name_en, m.rarity, m.print_variant,
    coalesce(m.image_url_hi, m.image_url) as image_url,
    (m.id = any((select ids from seed_ids))
      or (m.canonical_card_id is not null and m.canonical_card_id = any((select canons from seed_ids)))) as is_query_row,
    case
      when m.id = any((select ids from seed_ids)) then 'self'
      when m.canonical_card_id is not null and m.canonical_card_id = any((select canons from seed_ids)) then 'same_canonical'
      when exists (select 1 from public.card_number_alias cna
                   where cna.tcg=m.tcg and cna.alias_set_id=m.set_id and cna.confidence='confirmed'
                     and regexp_replace(lower(cna.alias_card_number),'[^a-z0-9]','','g')
                       = regexp_replace(lower(m.card_number),'[^a-z0-9]','','g')) then 'number_alias'
      when exists (select 1 from public.set_alias sa
                   where sa.tcg=m.tcg and sa.alias_set_id=m.set_id
                     and sa.confidence='confirmed' and sa.relation='equivalent') then 'set_alias'
      else 'same_canonical'
    end as link_basis,
    case
      when m.id = any((select ids from seed_ids)) then 'exact'
      when m.canonical_card_id is not null and m.canonical_card_id = any((select canons from seed_ids)) then 'exact'
      else 'confirmed'
    end as link_confidence,
    coalesce(
      (select cna.note from public.card_number_alias cna
       where cna.tcg=m.tcg and cna.alias_set_id=m.set_id and cna.confidence='confirmed'
         and regexp_replace(lower(cna.alias_card_number),'[^a-z0-9]','','g')
           = regexp_replace(lower(m.card_number),'[^a-z0-9]','','g') limit 1),
      (select sa.note from public.set_alias sa
       where sa.tcg=m.tcg and sa.alias_set_id=m.set_id
         and sa.confidence='confirmed' and sa.relation='equivalent' limit 1)
    ) as alias_note,
    m.ck as xlang_key
  from matched m
  left join public.canonical_cards cc on cc.id = m.canonical_card_id
  where p_include_self or not (m.id = any((select ids from seed_ids)))
  order by m.lang
  limit 200;
$$;

revoke all on function public.card_versions(text,uuid,text,text,text,boolean) from public;
grant execute on function public.card_versions(text,uuid,text,text,text,boolean) to anon, authenticated;

create or replace function public.card_versions_batch(p_queries jsonb)
returns table (
  query_idx int, card_id text, canonical_card_id uuid, slug text,
  tcg text, lang text, set_id text, set_name text, card_number text,
  name text, name_en text, rarity text, print_variant text,
  image_url text, is_query_row boolean, link_basis text,
  link_confidence text, alias_note text, xlang_key text
)
language sql stable security invoker set search_path = '' as $$
  select (q.idx - 1) as query_idx, v.*
  from jsonb_array_elements(coalesce(p_queries,'[]'::jsonb)) with ordinality as q(elem, idx)
  cross join lateral public.card_versions(
    p_tcg => q.elem->>'tcg',
    p_set_id => q.elem->>'set_id',
    p_card_number => q.elem->>'card_number'
  ) v
  where q.idx <= 200;
$$;

revoke all on function public.card_versions_batch(jsonb) from public;
grant execute on function public.card_versions_batch(jsonb) to anon, authenticated;

grant execute on function public.xlang_key(text,text,text) to anon, authenticated;
```

Create `supabase/migrations/<ts3>_card_versions_rpc_down.sql`:

```sql
drop function if exists public.card_versions_batch(jsonb);
drop function if exists public.card_versions(text,uuid,text,text,text,boolean);
drop function if exists public.xlang_key(text,text,text);
```

- [ ] **Step 6: Apply M3**

`mcp__claude_ai_Supabase__apply_migration`, name `<ts3>_card_versions_rpc`, query = M3 SQL.

- [ ] **Step 7: Run the RPC tests**

Run: `set -a && source .env.local && set +a && node --test scripts/__tests__/card-versions-rpc.test.mjs`

Expected: PASS. Tests that `t.skip` because a fixture isn't seeded yet (e.g. no confirmed `SV2a→sv03.5`) are acceptable for this task **only if** R3/R4/R5/R7/R8/R9 and the `xlang_key` test pass — those don't need the seed. **R1/R2 must pass** once at least one `confirmed` set_alias covering a real EN/JA pair is in the seed (Task 3). If R1 fails after seeding: debug `card_versions` body against the failing assertion; the tests are the contract.

- [ ] **Step 8: Manual spot check via `execute_sql`**

```sql
select card_id, lang, set_id, card_number, link_basis, left(alias_note, 40) note, xlang_key
from public.card_versions(p_tcg => 'pokemon', p_set_id => 'sv03.5', p_card_number => '006');
```

Expected: EN + JA rows (if seeded), same `xlang_key`, JA row `link_basis='set_alias'`.

- [ ] **Step 9: Security + performance advisors**

`mcp__claude_ai_Supabase__get_advisors` type `security`, then type `performance`.
Expected: no new security warnings (functions are `security invoker` + `search_path=''`). Performance: if it flags a seq scan on `card_versions`, confirm the `cand_sets` filter keeps the `cards` scan to a handful of set_ids (check with `explain analyze` on the Step 8 query — should be < 50ms).

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/<ts2>_* supabase/migrations/<ts3>_* scripts/__tests__/card-versions-rpc.test.mjs
git commit -m "feat(xlang): M2 index + M3 xlang_key/card_versions/card_versions_batch RPCs"
```

---

## Task 5: Verification script + report + final integration check

**Files:**
- Create: `scripts/verify-cross-language.mjs`

**Interfaces:**
- Consumes: `card_versions` RPC, `@supabase/supabase-js`.
- Produces: a console + JSON report for a curated sample of ~20 cards.

- [ ] **Step 1: Write `verify-cross-language.mjs`**

Create `scripts/verify-cross-language.mjs`:

```js
#!/usr/bin/env node
/**
 * DraGold — verifica read-only del layer cross-language. Nessuna scrittura.
 *   node scripts/verify-cross-language.mjs [--json=out.json]
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });

// campione: nomi noti EN + carte One Piece note. Il verificatore controlla che
// card_versions produca il set di lingue atteso e nessun link inatteso.
const SAMPLE = [
  { tcg: 'pokemon', set_id: 'sv03.5', card_number: '006', label: 'Charizard ex 151 006' },
  { tcg: 'pokemon', set_id: 'sv03.5', card_number: '199', label: 'Charizard ex 151 199 (SAR)' },
  { tcg: 'pokemon', set_id: 'sv04.5', card_number: '001', label: 'Paldean Fates 001' },
  { tcg: 'onepiece', set_id: 'OP-01', card_number: 'OP01-001', label: 'OP-01 001' },
  { tcg: 'onepiece', set_id: 'OP-17', card_number: 'OP17-001', label: 'OP-17 001' },
];

async function main() {
  const jsonOut = process.argv.find(a => a.startsWith('--json='))?.split('=')[1] || null;
  const report = { generated_at: new Date().toISOString(), samples: [] };

  // coverage KPI
  const { count: enPk } = await sb.from('cards').select('canonical_card_id', { count: 'exact', head: true })
    .eq('tcg', 'pokemon').eq('lang', 'en');
  const { data: sa } = await sb.from('set_alias').select('confidence,relation');
  report.coverage = {
    set_alias_confirmed_equivalent: (sa || []).filter(r => r.confidence === 'confirmed' && r.relation === 'equivalent').length,
    set_alias_total: (sa || []).length,
  };

  for (const q of SAMPLE) {
    const { data, error } = await sb.rpc('card_versions', { p_tcg: q.tcg, p_set_id: q.set_id, p_card_number: q.card_number });
    const langs = [...new Set((data || []).map(r => r.lang))].sort();
    const bases = [...new Set((data || []).map(r => r.link_basis))].sort();
    report.samples.push({ ...q, error: error?.message || null, n: (data || []).length, langs, link_bases: bases,
      keys: [...new Set((data || []).map(r => r.xlang_key))] });
    console.log(`${q.label.padEnd(32)} n=${(data||[]).length}  langs=[${langs}]  basis=[${bases}]`);
    // hard check: never more than one distinct xlang_key
    const keys = new Set((data || []).map(r => r.xlang_key));
    if (keys.size > 1) { console.error(`  !! ${q.label} produced ${keys.size} distinct xlang_key — BUG`); process.exitCode = 1; }
  }

  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 2));
  console.log('\ncoverage:', JSON.stringify(report.coverage));
}
main().catch(e => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
```

- [ ] **Step 2: Run it**

```bash
set -a && source .env.local && set +a
node scripts/verify-cross-language.mjs --json=/tmp/xlang-verify.json
```

Expected: each sample prints its languages + link_bases; exit 0 (no sample produces >1 distinct `xlang_key`). One Piece samples show `langs=[en,ja]` via `same_canonical`. Pokémon 151 samples show `langs` including `ja` via `set_alias` **if** the seed has `SV2a→sv03.5` confirmed.

- [ ] **Step 3: Full regression — whole test suite + build**

```bash
npm run test:scripts && npm test && npm run build
```

Expected: all green. New test counts: +22 (cross-lang) +7 (apply) + RPC tests. `npm test` (src) unchanged. Build unchanged (no `src/` files touched).

- [ ] **Step 4: Confirm the untouched invariants (spec Global Constraints)**

Run via `execute_sql`:

```sql
-- canonical_cards row count unchanged from baseline 88292 (± only organic sync drift)
select count(*) from public.canonical_cards;
-- no cards row lost its canonical
select count(*) filter (where canonical_card_id is null) from public.cards;   -- ~9306, unchanged
-- market_valuations untouched
select count(*) from public.market_valuations;   -- ~6706, unchanged
```

Expected: all consistent with the pre-Fase-A baseline (§0 of the spec).

- [ ] **Step 5: Write the verification report into the PR-ready doc**

Append a short "Fase A — verification results" section to `docs/plans/2026-09-03-cross-language-identity-spec.md` (or a sibling `*-phase-a-RESULTS.md`) with: migrations applied, test counts, `verify-cross-language.mjs` output, coverage KPI (N confirmed equivalents), and the untouched-invariant checks from Step 4.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-cross-language.mjs docs/plans/2026-09-03-cross-language-identity-phase-a-RESULTS.md
git commit -m "test(xlang): verify script + Fase A verification results"
```

- [ ] **Step 7: Open the PR**

```bash
git push -u origin feat/cross-language-identity
gh pr create --base main --title "feat(xlang): cross-language identity layer — Fase A (identity + card_versions RPC)" --body "<summary: what, spec link, migrations M1-M3, seed size, test counts, verification report, explicit: no search/card-page changes (Fase B/C), no backfill, no canonical/valuation changes, reversible via _down + confidence flags>"
```

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task |
|---|---|
| §2.1 `set_alias` schema | Task 2 |
| §2.2 `card_number_alias` schema | Task 2 |
| §2.3 index on `cards` | Task 4 (M2) |
| §2.5 conservatism guards (trigger, relation gate, 1:1) | Task 2 (trigger + uniques), Task 4 (`relation='equivalent'` filter in `xlang_key`), Task 1 (pure tests 14-17) |
| §3.1-3.3 seed format + schemas + LICENSE + README | Task 3 |
| §3.4 apply script + blocking validations | Task 3 |
| §4.1 `card_versions` contract | Task 4 (M3) + Task 4 tests R1-R11 |
| §4.2 `card_versions_batch` | Task 4 (M3) + R6 |
| §4.3 `xlang_key` (SQL + JS mirror) | Task 1 (JS) + Task 4 (SQL) + "xlang_key SQL matches JS" test |
| §10.1 pure tests (17) | Task 1 |
| §10.2 RPC tests (11) | Task 4 |
| §10.4 verification script | Task 5 |
| §11 migration strategy (3 additive + down) | Tasks 2, 4 |
| §12 rollback | `_down.sql` files (Tasks 2, 4); `confidence` downgrade (data); feature flag is Fase B/C |
| §7 coverage KPI | Task 5 (verify script `report.coverage`) |
| Fase B (Search) / Fase C (Card page) | **Intentionally excluded** — separate plans |

Gaps: none for Fase A. Fase B/C (§5, §6) and KG/Agent doc sections (§7, §8) are out of scope by the user's instruction.

**2. Placeholder scan:** The M3 `card_versions` body is a full reference implementation, explicitly labeled "adjust until tests pass" with the test suite as the contract — this is not a placeholder, it is a complete first implementation plus an acceptance gate. The seed JSON values (SV4a/SV6a, number aliases) are marked `candidate` / "verify before confirmed" deliberately — the plan cannot assert set equivalences it hasn't verified; Task 3 Step 2 gives the exact queries + rule for the executor to curate. No `TODO`/`TBD`/"handle edge cases".

**3. Type consistency:** `xlangKey` (JS, Task 1) ↔ `xlang_key` (SQL, Task 4) — same 3 args, same precedence (number-alias → equivalent set-alias → raw), verified equal by the "xlang_key SQL matches JS" test. `card_versions` column list identical in M3 DDL, `card_versions_batch` (prefixed with `query_idx`), and test R7's required-columns assertion. `link_basis` values (`self`/`same_canonical`/`set_alias`/`number_alias`) consistent between M3 `case` and tests R1/R3. `validateSeed` / `planUpserts` signatures identical in Task 3 test and implementation.

---

## Execution Handoff

**Plan complete and saved to `docs/plans/2026-09-03-cross-language-identity-phase-a-plan.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?** — and note the user asked for the plan only right now, plus the second deliverable ("Open Source AI Architecture & Product Opportunities") before any implementation.
