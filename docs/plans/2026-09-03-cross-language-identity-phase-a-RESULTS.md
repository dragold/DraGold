# Cross-Language Identity — Fase A — RESULTS

> **Date:** 2026-09-03 · **Branch:** `feat/cross-language-identity` · **Plan:** `2026-09-03-cross-language-identity-phase-a-plan.md` · **Spec:** `2026-09-03-cross-language-identity-spec.md`
> **DB:** Supabase `pimwkmwrduqkaydyvxqz` (prod) — migrations applied live via MCP.

## Summary

The additive cross-language identity layer is built and live. EN↔JA (and every
other regional printing) of the same physical card can now be resolved
**deterministically**, with provenance, via `public.card_versions(...)` — without
touching `canonical_card_id`, `market_valuations`, or any existing row.

`canonical_cards` 88292 · `cards` no-canonical 9306 · `market_valuations` 6706 —
**all unchanged** from the pre-Fase-A baseline (spec §0).

## What shipped

| Artefact | Path | State |
|---|---|---|
| Pure JS concept-key resolver | `scripts/lib/catalog/cross-lang.js` (+ 22 tests) | committed |
| M1 — `set_alias` + `card_number_alias` tables | `supabase/migrations/20260903175600_*` | applied |
| M2 — `cards` composite index + functional index on `set_identity_key(set_id)` | `supabase/migrations/20260903175700_*` | applied |
| M3 — `xlang_key`, `card_versions`, `card_versions_batch` | `supabase/migrations/20260903175800_*` | applied |
| Curated seed (CC0) + JSON schemas + LICENSE + README | `data/cross-language/` | committed + applied |
| Idempotent apply script (+ 9 tests) | `scripts/apply-cross-language-aliases.mjs` | committed |
| RPC integration tests (12) | `scripts/__tests__/card-versions-rpc.test.mjs` (`npm run test:rpc`) | committed |
| Read-only verification | `scripts/verify-cross-language.mjs` | committed |

## Deviations from the plan (all documented in commits)

1. **Leading-zero normalization of the card-number key component** (`006` ≡ `6`).
   The plan's reference `xlangKey`/`xlang_key` omitted it, but its own tests
   2/3/4/14/16 and RPC test R9 all expected it. Added to both JS (`numKey`) and
   SQL. Verified harmless for the flagship case (EN `sv03.5` and JA `SV2a` both
   store `006`-style numbers); it adds robustness across sources that pad
   differently.

2. **`card_versions` is `plpgsql` + `set plan_cache_mode = 'force_custom_plan'`,
   not `language sql`.** A `language sql` function with `set search_path` cannot
   be inlined by the planner; the generic plan seq-scanned `cards` (~1 s). The
   plpgsql form re-plans per call with the resolved key parts bound, so the
   functional index is used (~25–95 ms server-side).

3. **`SV2a → sv03.5` is `candidate`/`partial`, not `confirmed`/`equivalent`.**
   Verification against the live catalogue showed the sets do **not** share a
   full card list + numbering: the base 151 Pokémon (001–151) match by number in
   both regions, but the Trainer cards (EN 152–165) are renumbered and the
   secret rares (191+) differ entirely (EN #199 = Charizard ex, JA #199 =
   マサキの転送). So the flagship EN↔JA link is delivered per-card via **151
   verified `card_number_alias` rows** (`SV2a 001–151 ↔ sv03.5 001–151`), which
   is the spec's mechanism for `partial` sets. Every number 001–151 was checked
   to have exactly one card per region with matching Pokémon identity.

4. **New cross-language safety guard in `card_versions`.** `set_identity_key`
   collapses zero-padding, so JA `SV8` ≡ EN `sv08` ≡ `sv8` — but they are
   different sets (EN sv08 #100 = Annihilape; JA SV8 #100 = a Trainer item). A
   bare `set_identity_key` match (`link_basis = 'same_concept'`) is now kept
   **only** for rows whose language is already anchored in the concept (the
   language of a self / same_canonical / curated-alias row, or of a row in the
   queried set, or — when a curated cross-language bridge is active — of the
   reference region). Crossing a language boundary requires `self`,
   `same_canonical`, `set_alias`, or `number_alias`. Regression-tested (R3b).

## Seed contents (v1 — accuracy over coverage)

- `set_alias`: 4 rows, **0 active** (1 `candidate/partial` SV2a→sv03.5 documenting
  the partial relationship + its evidence; 3 `candidate/partial` for
  SV11B/SV11W Black Bolt/White Flare and SV4a Shiny Treasure ex→Paldean Fates,
  each with a note explaining why they are not `equivalent`).
- `card_number_alias`: 151 `confirmed` rows — the verified TCG 151 base-Pokémon
  range.

Net effect: the only **active** curated cross-language links in production are the
151 base Pokémon of TCG 151. Everything else links only via shared
`canonical_card_id` (One Piece, tcgdex multi-lang) or same-language spelling
variants (tcgdex `sv03.5` ↔ ptcg `sv3pt5`).

## Verification

- `npm test` 22 · `npm run test:scripts` 583 · `npm run build` green.
- `npm run test:rpc` — 12/12 (live prod, read-only + one throwaway candidate row
  in R9). Includes "xlang_key SQL matches the JS resolver".
- `scripts/verify-cross-language.mjs` — every sample resolves to exactly one
  concept:
  - EN 151 #006 → 11 rows incl. JA リザードンex, `link_basis=number_alias`.
  - JA 151 #006 → symmetric, 11 rows incl. EN Charizard ex.
  - EN 151 #199 (SR, out of verified range) → **7 rows, no JA** (correct).
  - EN Surging Sparks #100 → **7 rows, no JA** (SV8/sv08 false positive blocked).
  - SV1a #010 (candidate/partial) → 4 rows, JA-family only, no EN.
- `get_advisors` (security): **0 new warnings** — `xlang_key`/`card_versions`/
  `card_versions_batch` are `security invoker` + `search_path=''`.
- Untouched-invariant checks: `canonical_cards` 88292, `cards` no-canonical 9306,
  `market_valuations` 6706 — unchanged.

## Not in Fase A (as designed)

- Search integration (`groupByConcept`) — Fase B.
- Card page integration (`cardPageData.js` merge, hreflang) — Fase C.
- Knowledge Graph `same_card_across_region` edge / coverage KPI — later.
- The Ask DraGold agent tool wrapper around `card_versions` — Ask DraGold MVP.

## Residual risks / follow-ups

1. **Coverage is deliberately tiny.** Only TCG 151's 151 base Pokémon link
   across EN↔JA today. Extending it = adding verified `card_number_alias` rows
   (next candidates: 151 Trainers 152–165 renumbering; IR reprints 166–190; then
   other SV-era High Class sets). Each needs individual verification.
2. **`same_concept` links via pre-existing `set_identity_key` collapse** are not
   gated by the curated `confirmed` bar — they are inherited from the shipped
   Phase 3 normalization. The new safety guard prevents them from crossing
   languages, but same-language spelling collapses (e.g. hypothetical bad
   `me4`/`me04`) remain as before. Out of scope to change `set_identity_key`.
3. **RPC latency from a remote client** is ~0.5–1.2 s in the integration tests
   (network + fixture loads); server-side `explain analyze` is 25–95 ms. Fine
   for an agent tool; revisit if it becomes a hot UI path in Fase B.
4. **Migration history on prod is iterative** (several `card_versions` replaces
   during development). The committed migration files are the clean final state
   and reproduce it via `create or replace` / `if not exists`.
