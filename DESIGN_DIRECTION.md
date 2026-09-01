# DESIGN_DIRECTION.md — DraGold

**Status:** Approved · 2026-09-01 · Phases 2–3 built on `redesign/atlas-foundation`
**Build note:** Ermal lifted the "prove it without WebGL first / GSAP+Lenis later" sequencing after the static Atlas landed — GSAP + Lenis are now in (scroll choreography), and 3D/WebGL is explicitly on the table for further elevation, not deferred. The priority order in §0 still holds: the page must remain exceptional with all of it off.
**Scope:** Redesign of the DraGold frontend, starting from the home page. This document is the visual-language source of truth. Product scope/behaviour lives in `PRODUCT_SPEC.md`; operating rules in `CLAUDE.md`; this file governs *how DraGold looks, moves and feels*.
**Companion:** `UX_ARCHITECTURE.md` (information architecture, journeys, section map).

---

## 0. Priority order (never reverse)

1. **Concept**
2. **Typography**
3. **Composition**
4. **UX**
5. **Motion**
6. **Interaction**
7. **WebGL**

If every animation and every WebGL effect were removed, the home page must still read as an exceptional, premium, editorial digital product. Motion then takes it from excellent to extraordinary. WebGL is optional infrastructure that may enhance the concept later — it is never the concept.

---

## 1. Creative concept

> **Every card is a door. DraGold is an atlas.**

DraGold is not a database with better styling. You arrive looking for one card and leave having walked its prints, its languages, its set, and the twenty years of releases standing behind it. The artwork is the protagonist; typography, space and motion are the stagecraft.

### The home page is one continuous descent through a single card

Not sections stacked on a landing page — **strata descended**. The user enters, meets a card, and scrolling moves *into* it. Each layer of the scroll reveals something DraGold knows about that card:

```
CARD → IDENTITY → SET → PRINT → HISTORY → KNOWLEDGE → COLLECTION
```

This sequence is the narrative spine of the home page (detailed per-stratum in `UX_ARCHITECTURE.md §2`).

### Demonstrate, don't advertise

The interaction communicates the concept. We do **not** write "every card contains information about its identity, rarity, set and history" — we show the card physically separating into those layers. We do **not** write "DraGold helps you learn about cards" — we let the user arrive at the knowledge layer by descending to it. The product performs its philosophy.

### Temperament

| | |
|---|---|
| **Premium** | Restraint, space and typography do the work — not effects. |
| **Mysterious** | Deep ink, low light, things that reveal rather than announce. |
| **Collectible** | Ownership is visible. Your cards look different from everyone else's. |
| **Intelligent** | Depth on demand. Never a diagram where a path will do. |
| **Cinematic** | Scenes, not screens. Arrivals and departures are staged. |
| **Tactile** | Cards have mass, shadow, tilt. The one thing you can pick up. |
| **Editorial** | Part museum, part archive. A place that lets you handle the objects. |

Intelligent without looking technical — no node graphs on the wall, no telemetry aesthetic. Gold is a signature, not a coat of paint: roughly **2% of any screen**.

---

## 2. Visual North Star (foundation)

The art direction is grounded in the existing, already-authored **DraGold Visual North Star** (`~/Downloads/DraGold Visual North Star (standalone).html` + `design_handoff_dragold_north_star/README.md`). The shipped app is a ~40% implementation of it (the `useTilt`/`useReveal` hooks, `CardObject`, edge-labels, View Transitions exist; the cinematic staging, the desktop layout and the "card as doorway" narrative do not). This redesign realises the North Star at full fidelity.

Where this document and the North Star mock diverge, **this document wins** (notably: refined palette values in §4, and the explicit ban on fabricated activity tickers in §12).

---

## 3. Typography

Three families, one job each. All three are already loaded in the project and already match the North Star — we keep the families and **change only the delivery** (self-host, subset, preload) for performance and no FOUT.

| Role | Family | Used for |
|---|---|---|
| **Voice / narrative** | **Fraunces** (optical-size axis 9–144, italic axis) | Display headlines, the serif "narrator" line on each stratum, editorial measure in Academy. Italic = accent/aside only. |
| **Interface / work** | **Plus Jakarta Sans** | Navigation, buttons, labels, body copy, filters, form fields, card names. Everything the user operates. |
| **Facts / metadata** | **Space Mono** (400 / 700) | Numbers, card codes, dates, languages, rarities, counts, edge-labels. Reserved for data that is *literally true* — this is what makes the UI read as an instrument, not a brochure. |

### Type scale (fluid, token-driven)

Additive tokens in `:root`. `clamp()` for display sizes; fixed rem for UI/data.

| Token | Range (min → max) | Family | Use |
|---|---|---|---|
| `--fs-display` | 2.75rem → 8.25rem | Fraunces 800 | Home threshold headline, one per page |
| `--fs-h1` | 2rem → 3.5rem | Fraunces 800 | Stratum titles |
| `--fs-h2` | 1.5rem → 2.125rem | Fraunces 700 | Sub-sections, editorial headings |
| `--fs-h3` | 1.1875rem → 1.375rem | Fraunces 700 / Jakarta 700 | Rail titles, card-detail name |
| `--fs-body-lg` | 1.0625rem → 1.1875rem | Jakarta 400 | Stratum lead paragraph |
| `--fs-body` | 0.9375rem → 1rem | Jakarta 400 | Default body |
| `--fs-ui` | 0.8125rem → 0.875rem | Jakarta 600 | Buttons, nav, labels |
| `--fs-data` | 0.625rem → 0.8125rem | Space Mono 700 | Fact ledgers, edge-labels, counts |
| `--fs-micro` | 0.5625rem → 0.625rem | Space Mono 700 | Eyebrows, table headers, `.set-completion-k`-style captions |

- Display and h1 use tight tracking (`-0.02em` to `-0.025em`) and line-height ≤ 1.03.
- Mono data uses `+0.04em` to `+0.14em` tracking depending on size (tighter as it grows).
- Editorial body measure caps at **68ch** (`--maxw-read`, ≈ current `--maxw` 980px).

### Delivery (Phase 2, item 1)

- Self-host `Fraunces[opsz,wght]` + `Fraunces-Italic[opsz,wght]` (variable, subset to Latin), `Plus Jakarta Sans` (400/500/600/700/800 or the variable font), `Space Mono` (400/700) as `woff2` in `public/fonts/`.
- Replace the render-blocking `@import` at the top of `styles.css` with `@font-face` + `font-display: swap`.
- `<link rel="preload">` the two critical faces (Fraunces display weight, Jakarta 400) in `index.html`.
- Keep the existing `preconnect` hints removed once Google Fonts is gone.

---

## 4. Color

Restrained, premium, dark. **Two accents only.** Gold means *you* — ownership, focus, the current thing. Periwinkle means *relation* — edges of the knowledge graph, alternate languages, links outward. Nothing else is coloured, ever.

### Refined tokens (additive — see migration §4.2)

| Token | Value | Was | Role |
|---|---|---|---|
| `--bg` | `#08090C` | `#020208` | Page ink. Lifted from near-black so directional light behind a card can register. |
| `--surface` | `#0F1116` | `#0b0b18` | Raised panels, cards at rest. Hue shifted neutral-warm (away from blue). |
| `--surface-2` | `#14161D` | `#111127` | Inputs, secondary panels. |
| `--surface-3` | `#1B1E27` | `#181830` | Hover fills, ring tracks. |
| `--border` | `rgba(255,255,255,.09)` | `.08` | The **only** border weight in the product. Hairline. |
| `--border-2` | `rgba(255,255,255,.14)` | `.14` | Emphasised hairline (focus-within, active). |
| `--gold` | `#E7B75F` | `#fbbf24` | Signature. Cooler, more metallic, less "casino." |
| `--gold-deep` | `#C9973F` | `#d97706` | The rare gradient partner (avatars, progress fill). |
| `--foil` | `#F3E1B8` | *(new)* | Highlight tint for foil/sheen only. |
| `--relation` | `#7E8BC4` | `#7E8BC4` | **Unchanged.** Relationship edges, JP prints, edge-labels, lateral doors. |
| `--text` | `#EDEEF2` | `#f5f5f7` | Primary. |
| `--muted` | `#9BA1AD` | `#9ca3af` | Secondary. |
| `--dim` | `#6C7280` | `#5a5a72` | Tertiary / captions. |
| `--gain` / `--loss` | `#34d399` / `#f87171` | *(unchanged)* | **Portfolio & Alerts screens only.** Never on home, catalog, card, set, Academy, collection-progress surfaces. |

### Channel tokens (for alpha composition)

Add alongside, to stop new code re-hardcoding `rgba(231,183,95,.x)`:

```
--gold-rgb: 231 183 95;
--relation-rgb: 126 139 196;
--bg-rgb: 8 9 12;
```

New code uses `rgb(var(--gold-rgb) / 0.12)` etc.

### 4.1 Contrast

- `--gold #E7B75F` on `--bg #08090C` ≈ 9:1 — safe for text, but gold text stays large and sparse (the 2% rule).
- `--muted` on `--bg` ≈ 6.5:1; `--dim` on `--bg` ≈ 4.6:1 — `--dim` is for non-essential captions only.
- Verify every new combination with a contrast check in the Phase 2 review; record results in the review notes.

### 4.2 Migration strategy (non-destructive)

The token system exists but leaks: **~34** literal `#020208` / `rgba(2,2,8,…)` and **~112** `rgba(251,191,36,…)` occurrences, plus 13 literal `#fbbf24` (of which the ones in `pages/card/*`, `DraGold.legacy.jsx`, `pages/set/SetPage.jsx`, `pages/tcg/TcgPage.jsx`, `lib/tcgConfig.js` are **out of scope** — SEO routes, legacy, and TCG brand colours).

1. **Refine token *values* in place** in `:root` (top of `styles.css`). This is additive in spirit — no selector renamed, no rule deleted — and instantly shifts every surface that already uses `var(--*)` (`var(--gold)` has 73 uses, `var(--bg)` 6).
2. **Add** the channel tokens and the type/space/motion/layout tokens below.
3. **Catalogue** the remaining hardcoded `#020208` / `rgba(2,2,8,…)` / `rgba(251,191,36,…)` spots in a checklist; migrate opportunistically when touching that screen for another reason. Not a blocking rewrite.
4. **New home + shell components use refined tokens exclusively** from day one.
5. **Never touch** `src/pages/card/CardPage.jsx`, `src/pages/card/cardPageData.js`, `src/DraGold.legacy.jsx`.

---

## 5. Spacing, grid, geometry

### Spacing scale (token-driven)

`4 · 8 · 12 · 16 · 24 · 32 · 48 · 76 · 112` → `--space-1 … --space-9`. Every margin/padding/gap in new code uses a token. Whitespace is intentional and large — the home breathes.

### Grid

| Token | Value | Use |
|---|---|---|
| `--maxw-read` | `980px` | Reading measure (Academy, legal, stratum lead copy). Alias of today's `--maxw`; **`--maxw` itself is not changed** (it's load-bearing in `.hdr-in` / `.main` for every existing screen). |
| `--maxw-page` | `1320px` | New shell + home + redesigned Explore. |
| grid | **12 columns**, 1320 max, 48px gutter (desktop) | `AtlasGrid` primitive. |

Below 768px the grid collapses to a single column with `--space-4` side padding (`--p`).

### Radii

`6px` card · `10px` panel · `12px` large panel · `999px` pill. **Nothing exceeds 12px unless it is a pill.** (Current app has stray `14px`/`16px`/`18px`/`22px` radii — new code does not; existing ones migrate opportunistically.)

### Borders & shadows

- **One border weight**: 1px hairline (`--border` / `--border-2`). No 2px, no double borders.
- **Shadows belong to cards only.** They are the only objects with mass. Panels, headers, rails, inputs get a hairline, never a shadow.
- Card shadow = two layers: a tight contact shadow + a soft ambient shadow (already the pattern in `.card-object-hero`).

---

## 6. Card treatment

The card is the protagonist. It gets the largest surface, the best light, and the only real shadow on the page.

| State | Treatment |
|---|---|
| **Rest** | `object-fit: contain` on a neutral plate, 6–10px radius, two-layer shadow, hairline. Never crop the art. |
| **Hover (grid/rail)** | Lift −6px over 350ms (`lift`), hairline warms toward `--gold` (or `--relation` on relationship rails), shadow deepens. Not a scale. |
| **Tilt (interactive)** | Pointer-tracked ±7°, sheen tracks pointer, releases on 500ms ease-out (`settle`). CSS transforms only. Existing `useTilt` / `CardObject`. |
| **Owned** | Foil-scan overlay (gold + periwinkle band, `color-dodge`), only on owned cards, only outside utility grids. |
| **Specimen (hero)** | New variant. Larger, high-res, layered planes (art / frame / holo as separately transformable layers) so the card has real depth and can **delaminate**. One ambient foil-scan (9–11s loop). This is the object the whole home descends through. |

**Image honesty:** One Piece card images currently render a `SAMPLE` watermark (upstream hotlink/referrer protection, documented in `PRODUCT_SPEC §1`). Until that pipeline is fixed, **curated/hero placements use Pokémon EN/JA card art only** — matching the existing `HotPicksSection` fallback policy. Never place a `SAMPLE`-watermarked image in a hero or featured slot.

---

## 7. Interaction principles

- **Magnetic** attraction on the primary CTA and top-nav items only. Subtle (≤6px pull), disabled on touch and under reduced-motion.
- **Card tilt** — cards only, ±7°, per §6.
- **Text reveal** — the display headline and stratum titles mask-and-rise once on entry. Body copy does not animate.
- **Links** — hairline underline draws in on hover (120–180ms).
- **Progressive disclosure** — the card's fact ledger, print/language switching, and set details reveal as you descend; nothing is a wall of chrome up front.
- **No hover-only information** — anything revealed on hover is also reachable by tap/focus (mobile parity + a11y).
- **Custom cursor** — *optional, low priority, desktop-only.* A small dot that scales over interactive targets. Must degrade to the native cursor and is off under reduced-motion. Not required for Phase 2.
- **Never** drive animation from continuous React state. Refs, GSAP timelines, CSS transforms, `requestAnimationFrame`, and the WebGL loop only.

---

## 8. Motion principles

Motion is **narrative**. Not everything animates. Three rules:

1. Anything that moves comes from somewhere the user just looked.
2. Anything important moves slower than anything trivial.
3. Exactly **one** indulgent moment per page — here, the card delamination. Everything else earns it by moving with restraint.

### Motion tokens (from the North Star scale)

| Token | Duration | Easing | Use |
|---|---|---|---|
| `--mo-instant` | 120ms | linear | Pointer-tracked values (tilt, sheen, scrub) |
| `--mo-tap` | 180ms | ease-out | Buttons, chips, toggles, filters |
| `--mo-lift` | 350ms | ease-out | Card hover lift |
| `--mo-settle` | 500ms | ease-out | Card releasing from tilt |
| `--mo-reveal` | 700ms | ease-out | Section reveal on scroll (18px rise + fade, 60ms stagger) |
| `--mo-travel` | 620ms | ease-in-out | Card → card page (the clicked card *is* the transition — View Transitions API, already wired) |
| `--mo-ambient` | 9–11s | ease-in-out | Hero drift / foil scan. Loops only. **Never on utility screens.** |

`--ease-out: cubic-bezier(.2,.7,.2,1)` (entrances, hovers, lifts)
`--ease-inout: cubic-bezier(.6,0,.35,1)` (page & hero transitions)

- **No spring** on utility surfaces. **No animation over 700ms** unless it is scroll-driven.
- Keep the existing `--dur-fast` / `--dur-settle` / `--dur-reveal` / `--ease-out` tokens working; the `--mo-*` set is the canonical vocabulary going forward and maps onto them.

### The Atlas timeline

The home scroll is **one** GSAP timeline, scrubbed by scroll position, Lenis-smoothed. The hero card pins; its layers separate into the seven strata as the user descends. It is **not** seven independent `fade-in` blocks — the common "scroll-triggered website" look is explicitly rejected. The user should feel their scrolling is physically moving them through the Atlas.

### Reduced motion

`prefers-reduced-motion: reduce` gets a **deliberately designed static Atlas**, not disabled CSS: the card sits static at the top, the strata become full-width labelled editorial sections in normal document flow, no pin, no scrub, no parallax. It must look intentional and complete. (Extend the existing `@media (prefers-reduced-motion)` block in `styles.css`, don't replace it.)

---

## 9. Responsive principles

Breakpoints: **360 / 390 / 768 / 1024 / 1280 / 1440+**. Design each intentionally; never just shrink the desktop composition.

| Range | Experience |
|---|---|
| **≤768 (mobile)** | Designed vertical narrative. Card at top (static or very light parallax). Strata = full-width editorial blocks with mono edge-labels. Rails = native horizontal scroll. Preloader shortened. No custom cursor. **No WebGL, ever.** Bottom `.tabbar` stays (mobile only). |
| **768–1024 (tablet)** | Transitional. The narrative and strata, lighter pinning, no heavy parallax. |
| **≥1024 (desktop)** | Full pinned Atlas timeline. 12-col / 1320 grid. Real top navigation (see §11 bug). |
| **≥1440** | Same as desktop with more gutter; content does not exceed `--maxw-page`. |

---

## 10. Accessibility principles

- Semantic landmarks (`header` / `nav` / `main` / `footer`), exactly one `<h1>`, heading order that reads top-to-bottom through the strata even with motion off.
- Full keyboard path. Visible focus: `outline: 2px solid var(--gold); outline-offset: 2px` (already the convention — keep).
- `prefers-reduced-motion` → the static Atlas (§8).
- Command search overlay: `role="dialog"` + `aria-modal`, focus-trapped, `Esc` closes, result count announced via a live region.
- Every rail is keyboard-scrollable, has a visible focus state, and an `aria-label` naming the relationship it represents ("Other prints of this card", "Cards from this set").
- No essential information conveyed by colour alone (price direction uses a glyph, not red/green — already the house rule).
- Respect `prefers-reduced-transparency`; never put essential text over a blur.
- Preloader is skippable, does not trap focus, sets `aria-busy`, and auto-dismisses after ≤1.5s regardless.
- Target sizes ≥ 44px on touch.

---

## 11. Things we explicitly DO NOT do

**Visual**
- No glassmorphism, frosted panels, or blurred chrome.
- No decorative gradients. Light is directional and comes from behind the artwork.
- No generic SaaS hero (centered headline + subhead + two filled buttons + product screenshot).
- No radius over 12px on anything that is not a pill.
- No second gold, no second dark, no third accent.
- No red/green financial-UI language on home / catalog / card / set / Academy / collection-progress.
- No literal node-graph visualisation as primary navigation.
- No shadows on panels — cards only.

**Content**
- No fabricated data. No invented card/scan counts, no "2,410 scans today" activity tickers (the North Star mock shows them illustratively — **we do not ship them** unless the number is real and queryable). No fake testimonials, users, reviews, or AI capabilities.
- No claiming a feature works when it doesn't. **Academy has lessons + completion only** — no quiz, XP, or streak is implemented; do not show them. **Card ID is assisted text lookup + contribution, not image recognition** — do not stage a fake camera "scan."
- Where a concept isn't built, communicate it visually without pretending it already works (per brief).

**Technical**
- No TypeScript migration.
- No router library. No Redux / Zustand / other state library.
- No CSS framework, no Tailwind, no component library.
- No rewrite of Supabase access, `lib/search.js`, ranking, SEO/card routes, sitemaps, or auth.
- No touching `src/DraGold.legacy.jsx` or `src/pages/card/CardPage.jsx` / `cardPageData.js`.
- No renaming or removing live CSS selectors — additive CSS only.
- No WebGL / Three.js / R3F in Phase 2 (not installed).
- No animation library beyond GSAP + Lenis (see §13).
- No animation driven by continuous React re-render.

---

## 12. References & inspiration (technique, not imitation)

- **DraGold Visual North Star** (in-repo handoff) — the primary reference for type, colour, motion scale, house rules, and per-surface choreography.
- **GSAP ScrollTrigger** — pinned, scrubbed, branching scroll timelines (the Atlas descent). Study the pin + scrub + snap pattern; build our own choreography.
- **Lenis** — normalised smooth scroll as the input ScrollTrigger reads.
- **Editorial / archive-led Awwwards sites** — type as art direction, restraint, masked image reveals, horizontal timelines. Extract the discipline, not the layout.
- **Digital museum / collection experiences** — object-first presentation, low light, directional light, "handle the exhibit" tone.
- **CSS-only holographic / foil card techniques** — for the specimen and owned states (no WebGL needed for v1).

Per `CLAUDE.md §4`: research current open-source solutions before implementing an advanced interaction; prefer extracting a technique over importing a template; every dependency needs a documented reason (§13).

---

## 13. Dependency decisions

The `PRODUCT_SPEC.md` line "niente nuove librerie oltre a quelle già presenti" is **superseded for this redesign** by Ermal's explicit current brief, per the `CLAUDE.md §0` source hierarchy (explicit current instruction > PRODUCT_SPEC). Each addition is still justified individually and kept out of the shared/global bundle.

| Dependency | Target | Why it earns its place | Budget / containment |
|---|---|---|---|
| **gsap** + **@gsap/react** | `^3.15` / `^2.1` | The Atlas descent is a single scroll-scrubbed timeline transforming the sticky specimen through its six states. Not expressible with `IntersectionObserver` + CSS. Free incl. all plugins. `useGSAP` for cleanup. **Installed.** | Dynamically imported → own chunks (gsap ~28KB gz, ScrollTrigger ~18KB gz). Home route + desktop (≥1024) + non-reduced-motion only. Not in the shared bundle. |
| **lenis** | `^1.3` | Smooth-scroll normalisation ScrollTrigger consumes; without it the scrubbed timeline judders on trackpads/mice. **Installed.** | ~6KB gz chunk, lazy. Desktop + non-reduced-motion + `innerWidth ≥ 1024` only. `lenis.destroy()` on unmount. |
| **three** + **@react-three/fiber** + **@react-three/drei** | *(available — not yet used)* | A WebGL holographic-foil / directional-light layer for the hero specimen + owned cards is on the table for further elevation (Ermal, 2026-09-01). The CSS-3D delamination already delivers the core effect; WebGL would be a refinement. | If added: own lazy chunk, desktop + GPU-capability-gated, disabled under reduced-motion / low-power, paused when offscreen, `devicePixelRatio` capped. Never required for the page to work. |

**Explicitly not adding:** Motion / Framer-Motion (View Transitions API + GSAP + CSS cover component transitions), any router, any state library, any CSS/UI framework.

---

## 14. Performance budget (performance is part of the design)

| Metric | Budget |
|---|---|
| Home LCP (desktop, fast 3G-equivalent CPU 4×) | ≤ 2.0s |
| Home CLS | ≤ 0.02 |
| Home TBT | ≤ 200ms |
| Initial JS (shared bundle, gz) | ≤ current (~117KB gz) **+ 0** — GSAP/Lenis are lazy, home-route chunks are split |
| Home route chunk incl. GSAP+Lenis (gz) | ≤ 90KB |
| Fonts | self-hosted woff2, subset, 2 preloaded faces, `font-display: swap`; no render-blocking `@import` |
| Card images | responsive `srcset`, `loading="lazy"` below fold, low→high swap, capped dimensions, never full-res in a grid |
| Animation loop | one `requestAnimationFrame` driver (Lenis); GSAP ScrollTrigger batched; WebGL (if ever) paused when hidden |
| DPR | capped at 2 for any canvas work |
| Re-renders | animation state in refs; memoised data hooks; no state update per scroll frame |

Route-split the currently-monolithic `main.jsx` (all 15 pages static-imported into one chunk) with `React.lazy` as part of Phase 10 — noted here because it directly affects the home budget.

Validate every milestone with Lighthouse + Playwright (screenshots, console errors, network errors, a11y, mobile, reduced-motion).

---

## 15. Implementation order (Phase 2 — foundation only)

Phase 2 does **not** build the whole home page. It establishes the language, then a static motion-off home, then (only if that looks exceptional) the timeline.

1. **Fonts** — self-host + subset Fraunces / Plus Jakarta Sans / Space Mono; replace `@import`; preload critical faces.
2. **Token layer** — additive in `:root`: refined colour values + `-rgb` channels, type scale, spacing scale, motion tokens (`--mo-*`, `--ease-out`, `--ease-inout`), `--maxw-read` / `--maxw-page`, a z-index scale. Every existing token still works.
3. **Shell components** (`src/components/shell/`): `SiteHeader` (scroll-aware, magnetic nav, ⌘K trigger), `SiteFooter`, `CommandSearch` (overlay shell wrapping the existing `lib/search.js`), `Preloader`. Wired into `DraGold.jsx` additively — replace header/footer JSX, keep every state value and handler.
4. **Navigation bug fix** — real desktop `.site-nav` at ≥1024; hide `.tabbar` at ≥1024. (Today `.topnav{display:none}` is never re-enabled and the mobile bottom bar shows on desktop.) Also introduce `--maxw-page` layout on the shell so desktop stops capping at 980px.
5. **`useReveal` v2** — extend the existing hook: stagger index, reduced-motion no-op, one-shot. Don't break current callers.
6. **`useScrollScene`** (`src/lib/`) — a GSAP + Lenis wrapper hook that lazy-imports GSAP, no-ops under reduced-motion / ≤768 / low-end, and cleans up on unmount (`useGSAP` pattern).
7. **Home primitives** (`src/pages/home/`): `AtlasGrid` (12-col), `Stratum` (section primitive + edge-label + reveal), `CardSpecimen` (layered hero card), `DoorRail` (relationship rail).
8. **Static motion-off home** — assemble the seven strata from primitives + a new `useHomeData` hook (extract the three `useEffect` data loads currently inline in `SearchView.jsx`). **Review checkpoint: must look exceptional with zero motion.**
9. **Introduce motion** — GSAP + Lenis; wire the single delamination timeline; build the reduced-motion static variant in parallel.
10. **Polish loop** — Playwright screenshots at all breakpoints + reduced-motion, Lighthouse, console/network/a11y check, fix, commit on a feature branch, review.

Each step: build (`npm run build`) → inspect → fix → commit. Feature branch, not `main`.

---

## 16. Definition of done (Phase 2)

- `npm run build` clean; no new console errors on the home route.
- Home page looks exceptional **with motion disabled** (the review checkpoint at step 8).
- Refined tokens live; no existing screen visually broken (spot-check search, card detail, set detail, Academy, auth, portfolio).
- Desktop navigation present; bottom tab bar hidden on desktop.
- Fonts self-hosted; no render-blocking font request; CLS ≤ 0.02.
- Reduced-motion path is a designed static document, not disabled CSS.
- Keyboard: full path through header, search overlay, strata, rails, footer; visible focus throughout.
- No fabricated data anywhere on the page.
- Lighthouse home (desktop) ≥ 95 performance, ≥ 95 a11y — or a written explanation of any gap.
