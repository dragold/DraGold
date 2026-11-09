# Canonical Cards Slug Duplicate Analysis

## Summary

**Total rows with slug:** 87,189  
**Unique slugs:** 86,909  
**Duplicate slugs:** 280 (560 rows total)

## Classification

| Category | Count | Description |
|----------|-------|-------------|
| Case-difference (set_id) | 279 | Same TCG, same card_number, but `set_id` differs only by case (e.g., `sv9` vs `SV9`) |
| Other (special chars in card_number) | 1 | `ex10` with card_number `?` and `!` (Unown variants) |

## Root Cause

The slug is generated as: `pokemon-{set_id_lowercase}-{card_number}`

When the same physical set has rows with `set_id` differing only in case (e.g., `sv9` from one source, `SV9` from another), they produce **identical slugs** but remain **distinct canonical_cards rows** (different `id`, different `base_name`, different language variants).

Examples:
- `pokemon-sv9-110` → `sv9` + `SV9` (Copperajah vs オオタチ)
- `pokemon-sv10-074` → `sv10` + `SV10` (Ampharos da Equipe Rocket vs エアームド)
- `pokemon-sv3-120` → `sv3` + `SV3` (Klawf ex vs กูร์ตง)

All 279 case-difference collisions are **Pokémon** cards where the same set_id appears in different casings across data sources.

The 1 "other" collision is `pokemon-ex10-` with card_numbers `?` and `!` (Unown variants).

## Impact

- **SEO**: Two distinct canonical cards share the same public slug → `/carta/{slug}` ambiguous
- **Sitemap**: Duplicate URLs in sitemap
- **CardPage**: Middleware must disambiguate via `?lang=` or `primary_image_card_id`
- **Unique constraint**: Cannot add `UNIQUE(slug)` until resolved

## Proposed Fix

**Option A (preferred): Normalize set_id to lowercase at ingestion**

Modify the slug generation or ingestion pipeline to always use `set_id.toLowerCase()` before generating the slug. This would merge the duplicate canonical rows at the source.

**Option B: Add disambiguation to slug**

Include a hash or language code in the slug: `pokemon-sv9-110-en` vs `pokemon-sv9-110-ja`. But this changes existing URLs.

**Option C: Deduplicate canonical_cards rows**

Merge rows with same `(tcg, lower(set_id), card_number)` into one canonical card, keeping all language variants linked via `cards.canonical_card_id`. This is the cleanest long-term fix but requires data migration.

## Recommendation

**Do not auto-fix yet.** The collision pattern is clear (case sensitivity in `set_id`), but the fix requires deciding:

1. Whether to normalize `set_id` at ingestion (affects future data)
2. Whether to backfill/merge existing 279 duplicate groups (data migration)
3. Whether to add a unique constraint on `(tcg, lower(set_id), card_number)` instead of `slug`

This is a **data architecture decision** that should be made explicitly, not an automatic code fix.

## Blocked

- Adding `UNIQUE(slug)` to `canonical_cards`
- Reliable lesson→card deep-links for Academy (until slug is unique)