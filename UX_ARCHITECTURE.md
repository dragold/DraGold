# UX_ARCHITECTURE.md — DraGold

**Status:** Draft for approval · 2026-09-01
**Scope:** Information architecture, navigation, user journeys and the home-page section map for the redesign.
**Companion:** `DESIGN_DIRECTION.md` (visual language, tokens, motion, dependencies).
**Constraint:** Presentation changes only. No change to routing shape, Supabase queries, `lib/search.js`, ranking, auth, SEO routes, or `PRODUCT_SPEC.md` product logic.

---

## 1. Concept → structure

**Every card is a door. DraGold is an atlas.** The home page is one continuous descent through a single card. Scrolling reveals the layers of knowledge DraGold holds about it:

```
0  THRESHOLD   the card as object + the way in (search)
1  IDENTITY    what the card is                     — cards row
2  SET         where it belongs                     — set_logos + cards + collection
3  PRINT       the same card in other editions      — canonical_card_id group
4  HISTORY     the moment it arrived                — set_logos.release_date (PKM/OP)
5  KNOWLEDGE   what there is to understand          — academyContent.js + academy_progress
6  COLLECTION  it becomes part of what you build    — collection + set totals
7  INDEX       the atlas, briefly mapped            — real counts + honest "soon"
```

No stratum is terminal. Each owes the user **three doors**: one obvious next step, one lateral step, one they did not expect. The unexpected door is what turns a lookup into an hour.

---

## 2. Home-page section map

The "featured card" is one real Pokémon EN/JA card chosen server-side or from the existing Hot Picks data (never a `SAMPLE`-watermarked One Piece image). Every stratum below the threshold is *about that same card*.

### Stratum 0 — THRESHOLD

| | |
|---|---|
| **Purpose** | Establish the object and the single way in. |
| **Composition** | Preloader resolves (`D → DR → … → DRAGOLD`, ≤1.2s, skippable) into: the `CardSpecimen` (layered, tiltable, one ambient foil-scan); the wordmark settling into the header; one serif line — *"Every card is a door."*; one grotesque sub-line — *"Search one card and follow it outward — through its prints, its set, and the releases standing behind it."*; the search field with a `⌘K` hint. |
| **Real data** | Featured card from `cards`. Optional mono status line **only if the number is real**: total `cards` row count + `Pokémon EN·JA · One Piece EN·JA`. No activity ticker. |
| **CTA** | **Primary:** the search field (= "Start exploring"). No competing filled button. |
| **Doors** | next: search · lateral: "See the sets" → Explore · unexpected: scrolling begins the descent (the specimen starts to delaminate). |
| **Desktop** | Full-bleed, card right / voice left on the 12-col grid, pinned as the timeline starts. |
| **Mobile** | Card centered on top, voice below, search below that. Static card (light parallax at most). Shorter preloader. |
| **Reduced-motion** | Card static, wordmark already resolved, no pin. Everything visible immediately. |

### Stratum 1 — IDENTITY

| | |
|---|---|
| **Purpose** | "A card knows what it is." |
| **Composition** | As the descent begins, the specimen tilts toward flat and its **face-plate lifts** to expose a mono fact-ledger beside it: number, rarity, illustrator, released, prints known, languages. Edge-label: `CARD` / `IDENTITY`. |
| **Real data** | The featured card's `cards` row: `card_number`, `rarity`, `illustrator`, plus `set_logos.release_date`, canonical-group size for prints/languages. |
| **Doors** | next: "Identify a card you're holding" → `/card-id` · lateral: the rarity → (rarity page when it exists; until then, an Academy rarity lesson) · unexpected: the illustrator → `/illustrator/{slug}`. |
| **Desktop** | Ledger in mono, 2-col, `--relation` keys; card held at ~15° during this stratum. |
| **Mobile** | Ledger as a full-width `.asset-fact-grid`-style block under a static card. |
| **Reduced-motion** | Card static; ledger simply present below it with the edge-label. |

### Stratum 2 — SET

| | |
|---|---|
| **Purpose** | "And it belongs somewhere." |
| **Composition** | The **frame-plate slides back** to reveal the set behind the card: set logo, name, series, and a completion ring. Below: a `DoorRail` of sibling cards from the same set. Edge-label: `CARD → SET`. |
| **Real data** | `set_logos` (logo, name, release); `cards` filtered by the set's `set_id` candidates (reuse `setIdCandidates` + `groupByCanonical`, already exported from `SetDetailPage.jsx`) for the real total; `collection` (via `listCollection`) for owned count and the ring — **signed-in only**; signed-out shows the real total with a "create account to track" line (existing pattern). |
| **Doors** | next: open the set → `SetDetailPage` · lateral: the series → (series page when it exists) · unexpected: a specific card from the set the user doesn't own ("the chase card"), when ownership is known. |
| **Desktop** | Set logo large; ring to the side (reuse `.set-completion-ring` conic-gradient mechanic); rail below. |
| **Mobile** | Logo + name stacked; ring inline; rail = native horizontal scroll. |
| **Reduced-motion** | Set block simply present; no plate slide. |

### Stratum 3 — PRINT / LANGUAGE

| | |
|---|---|
| **Purpose** | "The same card speaks more than one language." |
| **Composition** | The **holo-plate fans** into the canonical group — EN / JA / other prints side by side, the JP print outlined in `--relation`. In-place language switch (same interaction as `AssetView`'s lang pills). Edge-label: `CARD → PRINT` / `CARD → LANGUAGE`. |
| **Real data** | The `canonical_card_id` group for the featured card (`groupByCanonical`); each print's image + `lang` + `card_number`. |
| **Doors** | next: the JP print (opens it via View Transition "travel") · lateral: an alternate-art print · unexpected: "EN vs JP — why they're not the same card" → Academy lesson `pokemon-en-jp`. |
| **Desktop** | Prints fanned horizontally; hovering one brings it forward, others recede (`:has()` dim, already a pattern in `.constellation-rail`). |
| **Mobile** | Prints in a native horizontal rail; tap to switch. |
| **Reduced-motion** | Prints in a static row; JP outlined; no fan animation. |

### Stratum 4 — HISTORY

| | |
|---|---|
| **Purpose** | "It arrived at a moment." |
| **Composition** | A horizontal, scroll-scrubbed spine of the set's series / neighbouring releases — the featured card's set is one mark on a timeline of real release dates. Edge-label: `SET → SERIES` / `RELEASE TIMELINE`. |
| **Real data** | `set_logos.release_date` + `release_year` (real for Pokémon and One Piece; **not** MTG/YGO — timeline is PKM/OP only). Ordering from `lib/tcgSets.js` (already sorts sets by `release_date DESC`). **LIMITATION:** dense per-day accuracy isn't guaranteed for every set; present as year-anchored, not day-precise. If series-level grouping data proves too thin, fall back to a chronological set spine without era labels — do not invent dates. |
| **Doors** | next: the series page (when it exists) · lateral: an earlier or later set on the spine · unexpected: Academy "how sets and releases work". |
| **Desktop** | Vertical scroll drives horizontal movement along the spine (GSAP horizontal scroll section). |
| **Mobile** | Native horizontal scroll rail of dated set markers; no scroll hijack. |
| **Reduced-motion** | A static vertical list of sets by year. |

### Stratum 5 — KNOWLEDGE (Academy)

| | |
|---|---|
| **Purpose** | "Don't just collect it. Know it." — the descent's payoff: the card's deepest layer is understanding. |
| **Composition** | Editorial treatment. Serif measure (`--maxw-read`), the featured card inlined as a figure in the prose, 2–3 real Academy lesson entry points rendered as editorial cards (not a catalog dump). Edge-label: `CARD → KNOWLEDGE`. |
| **Real data** | `academyContent.js` (`ACADEMY_LESSONS`, `ACADEMY_CATEGORIES`); `academy_progress` (completed lessons) for a subtle "done" state when signed in. **Only lessons + completion exist** — no quiz, XP, or streak (not implemented); do not show them. |
| **Doors** | next: a specific lesson relevant to the featured card's type (e.g. `rarity-variants`, `pokemon-en-jp`) · lateral: the Academy hub `/academy` · unexpected: `card-anatomy` opened on the exact card on screen. |
| **Desktop** | Single-column reading measure, centered, generous leading; lesson cards as figures. |
| **Mobile** | Same, full width, `--p` padding. |
| **Reduced-motion** | Identical — this stratum is text-led and barely animates anyway (reading-progress only, per the North Star). |

### Stratum 6 — COLLECTION

| | |
|---|---|
| **Purpose** | "And then it's part of something you're building." |
| **Composition** | The card **re-assembles**, now with the owned-foil treatment. Around it, a quiet field: set-completion as *territory claimed* — owned cards glow gold, gaps are ink. Edge-label: `CARD → COLLECTION`. |
| **Real data** | `collection` (`listCollection`) + set totals (as Stratum 2) for signed-in users. Signed-out: a real preview using one demonstrative set with a sign-up door — clearly framed as "this is what tracking looks like," not fabricated as the user's own. |
| **Doors** | next: your collection → `PortfolioView` · lateral: a set you're close to completing (real, when signed in) · unexpected / signed-out: create a free account → `/register`. |
| **Desktop** | Card center; completion field as a restrained grid of owned/missing markers (reuse `.constellation-satellite` owned/unowned styling). Not an orbit, not a node graph. |
| **Mobile** | Card + a compact "N sets started · best completion X%" real summary + a rail of in-progress sets. |
| **Reduced-motion** | Card static with foil state; completion field static. |

### Stratum 7 — INDEX (footer)

| | |
|---|---|
| **Purpose** | Map the atlas in one honest glance. Replace the current three-card "Coming soon" block. |
| **Composition** | A restrained index: the worlds (Pokémon EN, Pokémon JA, One Piece EN, One Piece JA — with **real** set/card counts), plus Explore · Academy · Collection · Identify. Genuine roadmap items (Binder, Blog, Community) get **one honest line**, not three big cards. Then legal links + wordmark. |
| **Real data** | `cards` counts per `tcg`+`lang`; `set_logos` counts. Query once, cache. |
| **Doors** | Every world and section is a link. |

---

## 3. Navigation

### Desktop (≥1024)

- **Left:** `DRAGOLD` wordmark (Fraunces).
- **Right:** `Explore · Academy · Collection` (grotesque, magnetic hover, hairline-underline-on-hover), a `⌘K` search affordance, then currency toggle + auth (Sign in / Create account, or avatar menu) — reusing the existing auth state and handlers from `DraGold.jsx`.
- **Scroll-aware:** full bar at the top; after Stratum 0 it condenses to wordmark + `⌘K` + avatar. Background goes from transparent to `--bg` with a hairline. No dropdowns except the existing account menu.
- **Fixes the current bug:** `.topnav` (`display:none`) is never re-enabled and the mobile `.tabbar` (`position:fixed;bottom:0`) is never hidden on desktop. New rule: `.site-nav` visible ≥1024, `.tabbar` hidden ≥1024.

### Mobile (≤1024)

- Slim top bar: wordmark + `⌘K` icon + avatar.
- Existing bottom `.tabbar` stays — **mobile only** — as `Search · Explore · Academy · Collection`. (Add "Collection" to the current Search/Explore/Academy set so the tabbar matches the journeys; reuse existing routing.)

### Command search overlay (`CommandSearch`)

The universal entry point. Opens on `⌘K`, `/`, or clicking the search field.

- Wraps the **existing** `lib/search.js` (`searchCards`, `rankSearchResults`, `groupByCanonical`) — no new search engine.
- Results grouped: **cards · sets · illustrators**. Keyboard-first (arrow keys, Enter, Esc).
- Fade in 180ms, no slide. `role="dialog"`, `aria-modal`, focus-trapped, live-region result count.
- Selecting a card opens it via the View Transition "travel" (`--mo-travel`), already wired in `DraGold.jsx`.

---

## 4. User journeys (all real routes, no dead ends)

### Search
Home field or `⌘K` → overlay → type → grouped results → select card → View-Transition "travel" → `AssetView` hub → relationship rails ("other prints", "more from set") → deeper into the graph. Back restores the overlay/results (existing `getSavedSearch`/`setSavedSearch` behaviour preserved).

### Explore / Catalog
Nav `Explore` → `SetsView` (redesigned presentation: sets by TCG → language → year, vertical-scroll-drives-horizontal archive on desktop; existing data loading via `lib/tcgSets.js` untouched) → a set → `SetDetailPage` (identity header + completion ring + constellation, already partly built) → a card.

### Academy
Stratum 5 or nav → `AcademyPage` (redesigned: editorial hub, categories + lessons from `academyContent.js`) → `AcademyLessonPage` (serif measure, card figures) → prev/next lesson → CTA back to a related card or set. Completion via `markLessonComplete` (existing). No quiz/XP/streak surface.

### Identify
Stratum 1 door, or a header entry, or nav → `/card-id` (`CardIdPage`). **Honest framing:** this is assisted identification — the user types what's printed on the card (name + number + language), `searchCards` matches it, results open the real `/card/{id}` deep link. A card that isn't in the catalog routes into the existing **missing-card contribution** flow (`submitCardContribution`). Visual states may be staged ("MATCHING… / IDENTIFIED") but must reflect the real text-match step — **no fake camera scan, no implied computer vision**.

### Collection
Stratum 6, nav, or tabbar → `PortfolioView` (redesigned shell; existing Portfolio 2.0 data/logic preserved — value history from `card_prices`, quantities, movers) → set completion → missing cards → a card → Add to Portfolio (existing `addToCollection`). Set-completion surfaces stay driven by *progress*, not value (per `PRODUCT_SPEC §4`); the Portfolio screen keeps its own value view.

---

## 5. CTA hierarchy

- **One primary action per stratum, maximum.** Never three filled buttons in a row.
- **Global primary:** search (the field / `⌘K`).
- **Per-stratum primary:** the "next" door — a solid gold button *or* the search field, never both.
- **Secondary:** the "lateral" door — ghost / hairline button (`--relation` tint on relationship doors).
- **Tertiary:** the "unexpected" door — a mono text-link with a hairline underline.
- Gold appears on ~2% of any screen — mostly the card and the single primary action.

---

## 6. Desktop / mobile / reduced-motion at a glance

| Stratum | Desktop | Mobile (≤768) | Reduced-motion |
|---|---|---|---|
| 0 Threshold | Pinned specimen, split layout, preloader ≤1.2s | Centered static card, stacked, short preloader | Everything shown at once, no pin |
| 1 Identity | Face-plate lift on scroll, mono ledger beside card | Static card + full-width fact grid | Ledger simply present |
| 2 Set | Frame-plate slide reveals set + ring + rail | Stacked set block + native rail | Set block present, no slide |
| 3 Print | Prints fan; hover brings one forward | Native horizontal rail, tap to switch | Static row, JP outlined |
| 4 History | Vertical scroll → horizontal spine | Native horizontal date rail | Static list by year |
| 5 Knowledge | Serif reading measure, card as figure | Same, full width | Same (text-led) |
| 6 Collection | Card re-assembles, completion field | Card + real summary + in-progress rail | Static card + field |
| 7 Index | Restrained multi-column index | Stacked index | Identical |

WebGL: never on mobile; deferred everywhere for Phase 2.

---

## 7. Data reality checklist (verify against Supabase before building each stratum)

Per `CLAUDE.md §9` — do not assume schema state.

| Needed for | Status from audit | Action |
|---|---|---|
| Featured card row | `cards` — confirmed | Pick selection method (server flag vs Hot Picks reuse) |
| Total card count / per-TCG-lang counts | `cards` — queryable | Confirm exact numbers at build time, cite the date |
| Set logo / name / release date | `set_logos` (`set_code, set_name, logo_url, symbol_url, release_date`) — real for PKM/OP | Confirmed via `lib/state.js` + `lib/tcgSets.js` |
| Real set total (denominator for ring) | `cards` + `setIdCandidates` + `groupByCanonical` — pattern exists | Reuse from `SetDetailPage.jsx` |
| Owned counts | `collection` — real column is `set_name` (not `card_set`; migration is stale — see `SearchView.jsx` comment) | Use `set_name`; signed-in only |
| Canonical print/language group | `canonical_card_id` on `cards` + `groupByCanonical` | Confirmed |
| Series-level grouping / eras | `lib/setEras.js` exists; depth uncertain | **Verify** before Stratum 4; fall back to plain chronological spine if thin |
| Academy lessons + completion | `academyContent.js` + `academy_progress` (`lesson_slug, completed_at`) | Confirmed |
| Academy quiz / XP / streak | **Not implemented** | Do **not** surface |
| Card ID recognition | **Text search only** (`searchCards`) + contribution flow | No fake scan |
| Illustrator pages | `/illustrator/{slug}` route + `lib/illustratorSlug.js` | Confirmed |
| Rarity / series pages | **Not built** | Link to Academy until they exist; don't invent the route |

---

## 8. Out of scope / untouched

- `src/pages/card/CardPage.jsx`, `src/pages/card/cardPageData.js` — separate SEO render path.
- `src/DraGold.legacy.jsx`.
- `lib/search.js`, `lib/searchData.js`, ranking — reused as-is.
- Supabase access layer (`src/supabase.js`), auth (`lib/auth.js`), RLS, Edge Functions, `/api/*`.
- SEO meta / JSON-LD / sitemaps / hreflang.
- Routing shape in `main.jsx` (the hand-rolled `pathname` matcher stays; new home components mount inside the existing `DraGold` shell).
- MTG / Yu-Gi-Oh content work (architecture-only, per `PRODUCT_SPEC`).
