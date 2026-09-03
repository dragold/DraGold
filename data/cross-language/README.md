# Cross-Language Set / Number Mapping (curated data)

Editorial assertions that a regional set (e.g. Japanese `SV2a`) IS the same set
as a reference-region set (e.g. English `sv03.5`), used by `public.xlang_key` /
`public.card_versions` to link the same physical card across languages.

## What's in here (and what isn't)

**Facts only:** set codes, languages, release dates, a relation, a confidence
level, and a human-written note citing the evidence.

**No third-party card content** — no card names, images, prices, or rules text.
A deployment runs its own catalogue sync; this seed is independent of that
content and works against any catalogue that uses the same `cards.set_id`
codes.

**License: CC0-1.0** ([`./LICENSE`](./LICENSE)). Public domain. Use freely, with
or without attribution.

## Files

| File | What |
|---|---|
| `set-aliases.json` | regional set → reference set. `relation` + `confidence`. |
| `card-number-aliases.json` | per-card number exceptions (secret/alt-art), strictly 1:1. |
| `*.schema.json` | JSON Schema (draft-07) for each. |

## How linking actually works

`xlang_key(tcg, set_id, card_number)` composes a language-independent "card
concept" key:

1. a **`confirmed` `card-number-aliases.json`** row → remaps *set + number*, or
2. a **`confirmed` + `relation:equivalent` `set-aliases.json`** row → remaps
   *set only* (number kept), then
3. otherwise the raw code, with `set_identity_key` collapsing spelling
   (`sv3pt5` ≡ `sv03.5`) and leading zero-padding on the number (`006` ≡ `6`).

Two `cards` rows with the same `xlang_key` are the same physical card in
different regions.

## The bar for `confidence: "confirmed"`

Set `confirmed` **only** when you can verify from a primary/secondary source
(Bulbapedia, official set lists, publisher announcements) that:

- **`relation: "equivalent"`** — the two sets share the **same main-set card
  list and the same numbering**. Card N in one is card N in the other.
- **`relation: "partial" / "subset" / "superset"`** — the sets overlap but card
  lists or numbering differ. These do **not** auto-link. Individual cards link
  only via an explicit `card-number-aliases.json` row.

If in doubt → `confidence: "candidate"` (stored, inert) or leave it out.
**Zero false links is the goal** — accuracy over coverage.

`relation: "rejected"` records a pair that was examined and is NOT equivalent,
so nobody re-investigates it.

## Applying

```bash
node scripts/apply-cross-language-aliases.mjs            # dry-run: validate + diff + sanity report
node scripts/apply-cross-language-aliases.mjs --apply    # write to DB (idempotent upsert)
```

Env: `SUPABASE_URL` (or `VITE_SUPABASE_URL`) + `SUPABASE_SERVICE_KEY`.

The apply script **blocks** on: a set that is both an alias and a reference; a
`card-number-aliases` many-to-one; a `confirmed` row without a note; a
self-referential row; a bad `relation`. It also prints, per confirmed alias, how
many `cards` rows sit on each side (0 on the alias side usually means a wrong
set code).
