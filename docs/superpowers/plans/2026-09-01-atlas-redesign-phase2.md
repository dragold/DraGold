# Atlas Redesign — Phase 2 (Foundation + Static Home) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the DraGold visual-language foundation (self-hosted fonts, refined design tokens, motion tokens, grid), build the new site shell (scroll-aware header, command-search overlay, footer, preloader), fix the desktop-navigation bug, and assemble a **static, motion-off** version of the new "Atlas" home page from real data — with no GSAP, no Lenis, no WebGL.

**Architecture:** Additive-only changes to the existing React 18 + Vite SPA. All new home components live in `src/pages/home/`, all new shell components in `src/components/shell/`, each with its own co-located CSS file imported by the component. `src/styles.css` is touched in exactly two places: the `:root` token block (refined values + new tokens) and one appended rule to hide the mobile tab bar on desktop. `src/DraGold.jsx` is edited as an orchestrator only — its header/footer JSX is swapped for the new shell components and a `homeView` state is added; every existing state value, handler, and data flow is preserved. The pre-search home view becomes `<HomePage>` (the Atlas); once a search runs, the existing `<SearchView>` renders results exactly as today.

**Tech Stack:** React 18, Vite 5, plain JS/JSX (no TypeScript), `@supabase/supabase-js` v2, native View Transitions API, `node:test` for unit tests (built into Node — no new dependency), Playwright (MCP) + Lighthouse for visual/perf verification.

**Spec:** `DESIGN_DIRECTION.md` and `UX_ARCHITECTURE.md` (repo root). The plan argues from both; executors read all three.

## Global Constraints

Copied verbatim from the spec. Every task's requirements implicitly include this section.

- **Language:** JavaScript, not TypeScript. React + Vite. No Redux/Zustand, no router, no CSS framework, no component library.
- **Dependencies added in Phase 2:** none. (GSAP + Lenis are Phase 3+; Three.js/R3F deferred and not installed.)
- **Do not touch:** `src/DraGold.legacy.jsx`, `src/pages/card/CardPage.jsx`, `src/pages/card/cardPageData.js`.
- **`src/styles.css`:** additive only. Do not rename or delete any existing selector. Allowed edits: (a) the `:root` token block — refine values in place + add new tokens; (b) append one `@media (min-width:1024px){ .tabbar{ display:none } }` rule. All other new CSS lives in co-located `*.css` files next to the new components.
- **Do not modify:** Supabase access layer (`src/supabase.js`), `src/lib/auth.js`, `src/lib/search.js`, `src/lib/searchData.js`, ranking, SEO meta / JSON-LD / sitemaps, `src/api/*`, the routing shape in `src/main.jsx`.
- **New pages → `src/pages/<entity>/`. Never add features inside `DraGold.jsx`** — it may only grow as an orchestrator (global state + composition).
- **Palette (refined, additive):** `--gold: #E7B75F` (was `#fbbf24`), `--bg: #08090C` (was `#020208`), `--relation: #7E8BC4` (unchanged). Add channel tokens `--gold-rgb: 231 183 95`, `--relation-rgb: 126 139 196`, `--bg-rgb: 8 9 12`.
- **Typography:** three families kept — Fraunces (voice/display), Plus Jakarta Sans (interface), Space Mono (data). Self-hosted woff2, `font-display: swap`, no Google Fonts request.
- **Motion:** motion tokens defined, but Phase 2 ships **no scroll choreography**. The only motion is: `useReveal` opacity/translateУ reveal (already reduced-motion-gated), card tilt on `CardSpecimen`/`CardObject`, header condense, preloader. Everything must look exceptional with all of it disabled.
- **`prefers-reduced-motion: reduce`:** every screen must render a deliberate static state — never disabled CSS with broken layout. Extend the existing `@media (prefers-reduced-motion)` block in `styles.css`, don't replace it.
- **Data honesty:** no fabricated numbers, tickers, testimonials, or features. Academy has lessons + completion only (no quiz/XP/streak). Card ID is text lookup, not image recognition. Rarity/series pages do not exist — link to Academy instead. One Piece card art shows a `SAMPLE` watermark — never use it in a hero/featured slot; Pokémon EN/JA card art only for curated placements.
- **Accessibility:** semantic landmarks, one `<h1>`, keyboard path through everything, visible focus (`outline: 2px solid var(--gold); outline-offset: 2px`), `role="dialog"`+`aria-modal`+focus-trap on overlays, `aria-label` naming each rail's relationship, ≥44px touch targets.
- **Verification cycle (every task):** `npm run build` clean + no new console errors + Playwright screenshot review against the stated expectation + (where logic exists) `node --test` green. Task 14 adds Lighthouse + full a11y + all-breakpoint + contrast passes.
- **Branch:** all work on `redesign/atlas-foundation` (already created). Commit after every task. Do not push or merge to `main` without Ermal's explicit request.
- **Build/verify command:** `npm run build` (Vite). Dev server: `node node_modules/vite/bin/vite.js --port 5199 --strictPort` (the machine's `localhost` resolves IPv6-first — use `http://localhost:5199` in Playwright; `curl` needs `-g "http://[::1]:5199"`).

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `public/fonts/*.woff2` | Self-hosted font files (Fraunces roman + italic variable, Plus Jakarta Sans variable, Space Mono 400/700). |
| `src/components/shell/SiteHeader.jsx` | Scroll-aware top navigation: wordmark, primary nav (magnetic), ⌘K search trigger, currency + auth (props-fed). Desktop nav + mobile slim bar. |
| `src/components/shell/SiteFooter.jsx` | Stratum 7 "index": the four worlds with real counts, section links, one honest roadmap line, legal, wordmark. |
| `src/components/shell/Preloader.jsx` | `D → DRAGOLD` wordmark build, ≤1.2s, skippable, `aria-busy`, instant under reduced-motion. |
| `src/components/shell/CommandSearch.jsx` | Full-screen search overlay wrapping `lib/search.js`; grouped results (cards/sets/illustrators); keyboard-first; focus-trapped `role="dialog"`. |
| `src/components/shell/shell.css` | All shell selectors. Imported by the shell components. |
| `src/pages/home/HomePage.jsx` | The Atlas: composes the 7 strata from primitives + `useHomeData`. Rendered when `tab==="search"` and `homeView==="atlas"`. |
| `src/pages/home/useHomeData.js` | Read-only query composition for the home: featured card, its canonical group, its set + total + owned count, Academy lesson entry points, per-world counts. Anon-safe. |
| `src/pages/home/selectFeatured.js` | Pure helper: pick the featured card from a candidate list (deterministic, filters `SAMPLE`/One-Piece, prefers Pokémon EN/JA). Unit-tested. |
| `src/pages/home/AtlasGrid.jsx` | 12-column / 1320px grid container primitive. |
| `src/pages/home/Stratum.jsx` | Section primitive: mono edge-label + optional serif "voice" line + reveal-on-scroll wrapper + slot. |
| `src/pages/home/DoorRail.jsx` | Horizontal relationship rail (native scroll, drag on desktop, `aria-label`, edge fade). Wraps card tiles. |
| `src/pages/home/CardSpecimen.jsx` | The layered hero card (art / frame / holo planes), tiltable, one ambient foil-scan, delaminate-ready hooks (data attrs only in Phase 2). |
| `src/pages/home/home.css` | All home selectors. Imported by `HomePage`. |
| `src/pages/home/selectFeatured.test.js` | `node:test` unit tests for `selectFeatured`. |
| `src/pages/home/useHomeData.shape.test.js` | `node:test` tests for the pure data-shaping functions extracted from `useHomeData`. |

**Modified:**

| Path | Change |
|---|---|
| `src/styles.css` | `:root` block: refine `--bg`, `--surface{,-2,-3}`, `--gold{,-deep}`, `--text`, `--muted`, `--dim` values; add colour channel tokens, type scale, spacing scale, motion tokens, layout tokens, z-index scale. Append one `@media (min-width:1024px){ .tabbar{display:none} }` rule near the existing `.tabbar` block. Extend the existing `@media (prefers-reduced-motion)` block with the preloader + specimen rules. |
| `index.html` | Add two `<link rel="preload" as="font">` tags; remove the two Google Fonts `<link rel="preconnect">` tags. |
| `src/DraGold.jsx` | Replace `<header class="hdr">…</header>` with `<SiteHeader …/>`; replace `<footer class="foot">…</footer>` with `<SiteFooter/>`; mount `<Preloader/>` and `<CommandSearch …/>`; add `homeView` state (`"atlas" | "results"`) + `openSearch`/`closeSearch`; render `<HomePage/>` vs `<SearchView/>` based on it. No other logic changes. |
| `src/lib/useReveal.js` | Optional: accept `useReveal({ index, once } = {})` in addition to the current positional `index`. Backward compatible. |

---

## Task 1: Self-host fonts

**Files:**
- Create: `public/fonts/fraunces.woff2`, `public/fonts/fraunces-italic.woff2`, `public/fonts/plus-jakarta-sans.woff2`, `public/fonts/space-mono-400.woff2`, `public/fonts/space-mono-700.woff2`
- Modify: `src/styles.css:1` (replace the `@import` line with an `@font-face` block)
- Modify: `index.html` (preload + remove preconnect)

**Interfaces:**
- Produces: the same three `font-family` names already used across the codebase — `'Fraunces'`, `'Plus Jakarta Sans'`, `'Space Mono'` — now served locally. No API surface.

- [ ] **Step 1: Download the woff2 files**

Run (from repo root; the modern UA makes Google return single variable woff2 files):

```bash
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
mkdir -p public/fonts
# Fraunces variable (roman + italic), Plus Jakarta Sans variable, Space Mono 400/700
curl -s -A "$UA" "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..800;1,9..144,400..700&family=Plus+Jakarta+Sans:wght@400..800&family=Space+Mono:wght@400;700&display=swap" -o /tmp/gf.css
cat /tmp/gf.css
```

Inspect `/tmp/gf.css`. It contains `@font-face` rules whose `src: url(https://fonts.gstatic.com/....woff2)`. There will be one URL per `latin` block for Fraunces (roman), Fraunces (italic), Plus Jakarta Sans; and two for Space Mono (400, 700). Download each `latin` (and `latin-ext` if present — keep only `latin` if size matters) woff2 to the filenames above:

```bash
# example — substitute the real URLs from /tmp/gf.css:
curl -s -o public/fonts/fraunces.woff2          "<Fraunces latin roman woff2 URL>"
curl -s -o public/fonts/fraunces-italic.woff2   "<Fraunces latin italic woff2 URL>"
curl -s -o public/fonts/plus-jakarta-sans.woff2 "<Plus Jakarta Sans latin woff2 URL>"
curl -s -o public/fonts/space-mono-400.woff2    "<Space Mono latin 400 woff2 URL>"
curl -s -o public/fonts/space-mono-700.woff2    "<Space Mono latin 700 woff2 URL>"
ls -la public/fonts/
```

Expected: five non-empty `.woff2` files, each 10–120 KB.

- [ ] **Step 2: Replace the `@import` with `@font-face`**

In `src/styles.css`, replace line 1 (the `@import url('https://fonts.googleapis.com/...')`) with:

```css
@font-face{
  font-family:'Fraunces';
  src:url('/fonts/fraunces.woff2') format('woff2');
  font-weight:400 800;font-style:normal;font-display:swap;
}
@font-face{
  font-family:'Fraunces';
  src:url('/fonts/fraunces-italic.woff2') format('woff2');
  font-weight:400 700;font-style:italic;font-display:swap;
}
@font-face{
  font-family:'Plus Jakarta Sans';
  src:url('/fonts/plus-jakarta-sans.woff2') format('woff2');
  font-weight:400 800;font-style:normal;font-display:swap;
}
@font-face{
  font-family:'Space Mono';
  src:url('/fonts/space-mono-400.woff2') format('woff2');
  font-weight:400;font-style:normal;font-display:swap;
}
@font-face{
  font-family:'Space Mono';
  src:url('/fonts/space-mono-700.woff2') format('woff2');
  font-weight:700;font-style:normal;font-display:swap;
}
```

- [ ] **Step 3: Preload critical faces, drop preconnect**

In `index.html`, remove:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
```

Add in their place (inside `<head>`, before the SEO block):

```html
<link rel="preload" href="/fonts/fraunces.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/fonts/plus-jakarta-sans.woff2" as="font" type="font/woff2" crossorigin />
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS, no warnings about missing assets. `dist/fonts/` contains the five woff2 files.

- [ ] **Step 5: Visual + network verification**

Start the dev server, open `http://localhost:5199/` in Playwright at 1440×900.
- Screenshot `phase2-t1-fonts.png`. Expected: headline renders in Fraunces serif (identical to before), body in Plus Jakarta Sans.
- `browser_network_requests`: expected **zero** requests to `fonts.googleapis.com` or `fonts.gstatic.com`; two requests to `/fonts/*.woff2` with 200.
- `browser_console_messages` level error: expected none new.

- [ ] **Step 6: Commit**

```bash
git add public/fonts src/styles.css index.html
git commit -m "perf(fonts): self-host Fraunces / Plus Jakarta Sans / Space Mono

Replace the render-blocking Google Fonts @import with local woff2 +
font-display:swap + preload of the two critical faces. No family change.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NdfYZpokSPo6pSZjmL3sEz"
```

---

## Task 2: Design token layer

**Files:**
- Modify: `src/styles.css` — the `:root{ … }` block (currently lines ~13–35)

**Interfaces:**
- Produces (CSS custom properties, consumed by every later task):
  - Colour: `--bg --surface --surface-2 --surface-3 --border --border-2 --gold --gold-deep --foil --relation --text --muted --dim` (refined) + `--gold-rgb --relation-rgb --bg-rgb`
  - Type: `--fs-display --fs-h1 --fs-h2 --fs-h3 --fs-body-lg --fs-body --fs-ui --fs-data --fs-micro`
  - Space: `--space-1 … --space-9`
  - Motion: `--mo-instant --mo-tap --mo-lift --mo-settle --mo-reveal --mo-travel --ease-out --ease-inout`
  - Layout: `--maxw-read --maxw-page --grid-cols --grid-gutter`
  - Z-index: `--z-base --z-rail --z-header --z-overlay --z-preloader`

- [ ] **Step 1: Refine existing token values + add new tokens**

In `src/styles.css`, replace the body of the `:root{…}` block with the following. **Keep every currently-defined token name** (refine values only where listed); add the rest. Do not remove `--gain`/`--loss`/`--glass`/`--p`/`--maxw`/`--tabh`/`--dur-*`/`--ease-out`/`--dur-settle`/`--dur-reveal`/`--dur-lift` — other screens depend on them.

```css
:root{
  /* ── ink & surfaces (refined: warmer, lifted off pure black) ── */
  --bg:#08090C; --surface:#0F1116; --surface-2:#14161D; --surface-3:#1B1E27;
  --border:rgba(255,255,255,.09); --border-2:rgba(255,255,255,.14);
  --glass:rgba(255,255,255,.04);

  /* ── accents (two only) ── */
  --gold:#E7B75F; --gold-deep:#C9973F; --foil:#F3E1B8;
  --relation:#7E8BC4;
  --gold-rgb:231 183 95; --relation-rgb:126 139 196; --bg-rgb:8 9 12;

  /* ── text ── */
  --text:#EDEEF2; --muted:#9BA1AD; --dim:#6C7280;

  /* ── portfolio/alerts only — never on home/catalog/card/set/academy ── */
  --gain:#34d399; --loss:#f87171;

  /* ── legacy layout tokens (unchanged — load-bearing elsewhere) ── */
  --p:16px; --maxw:980px; --tabh:64px;

  /* ── type scale (fluid) ── */
  --fs-display:clamp(2.75rem,1.4rem + 6.2vw,8.25rem);
  --fs-h1:clamp(2rem,1.3rem + 3vw,3.5rem);
  --fs-h2:clamp(1.5rem,1.2rem + 1.4vw,2.125rem);
  --fs-h3:clamp(1.1875rem,1.1rem + .4vw,1.375rem);
  --fs-body-lg:clamp(1.0625rem,1rem + .3vw,1.1875rem);
  --fs-body:clamp(.9375rem,.9rem + .2vw,1rem);
  --fs-ui:clamp(.8125rem,.8rem + .1vw,.875rem);
  --fs-data:clamp(.625rem,.6rem + .1vw,.8125rem);
  --fs-micro:clamp(.5625rem,.55rem + .05vw,.625rem);

  /* ── spacing scale ── */
  --space-1:.25rem; --space-2:.5rem; --space-3:.75rem; --space-4:1rem;
  --space-5:1.5rem; --space-6:2rem; --space-7:3rem; --space-8:4.75rem; --space-9:7rem;

  /* ── motion tokens (Phase 2 defines them; scroll choreography is Phase 3) ── */
  --ease-out:cubic-bezier(.2,.7,.2,1);
  --ease-inout:cubic-bezier(.6,0,.35,1);
  --mo-instant:120ms; --mo-tap:180ms; --mo-lift:350ms;
  --mo-settle:500ms; --mo-reveal:700ms; --mo-travel:620ms;
  /* legacy aliases kept for existing callers */
  --dur-fast:150ms; --dur-settle:500ms; --dur-reveal:700ms; --dur-lift:350ms;

  /* ── layout ── */
  --maxw-read:980px; --maxw-page:1320px;
  --grid-cols:12; --grid-gutter:48px;

  /* ── z-index scale ── */
  --z-base:1; --z-rail:5; --z-header:40; --z-overlay:60; --z-preloader:90;
}
```

Note: the existing `--ease-out` value changes from `cubic-bezier(.16,1,.3,1)` to `cubic-bezier(.2,.7,.2,1)` per the spec (§8). This is a deliberate, spec-mandated easing refinement affecting existing transitions — acceptable and desired.

- [ ] **Step 2: Extend the reduced-motion block (placeholder for later tasks)**

At the end of the existing `@media (prefers-reduced-motion: reduce){ … }` block in `styles.css`, add a comment marker so later tasks append here:

```css
  /* Atlas redesign — preloader & specimen static states appended by
     shell/home tasks. Keep additive. */
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Regression spot-check**

Dev server + Playwright at 1440×900. Screenshot each and compare to a pre-change baseline (take baselines from `git stash` first if needed):
- `http://localhost:5199/` → `phase2-t2-home.png`
- `http://localhost:5199/academy` → `phase2-t2-academy.png`
- `http://localhost:5199/login` → `phase2-t2-login.png`

Expected: layouts intact; gold is visibly cooler/less saturated; background very slightly lifted; no element unstyled or mis-coloured. Note any existing screen that looks wrong in the task report (do not fix here unless broken).

- [ ] **Step 5: Token presence check**

In Playwright console:

```js
getComputedStyle(document.documentElement).getPropertyValue('--gold').trim()  // "#E7B75F"
getComputedStyle(document.documentElement).getPropertyValue('--fs-display').trim()  // non-empty clamp()
getComputedStyle(document.documentElement).getPropertyValue('--maxw-page').trim()   // "1320px"
```

- [ ] **Step 6: Commit**

```bash
git add src/styles.css
git commit -m "feat(tokens): refined additive design-token layer for the Atlas redesign

Refine --bg/--gold/--surface*/--text values in place; add fluid type
scale, spacing scale, motion tokens (--mo-*), layout tokens
(--maxw-page, grid) and a z-index scale. All existing token names kept.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NdfYZpokSPo6pSZjmL3sEz"
```

---

## Task 3: Navigation bug fix + shell CSS scaffold + useReveal signature

**Files:**
- Modify: `src/styles.css` (append one rule)
- Create: `src/components/shell/shell.css` (scaffold — sections filled by Tasks 4–7)
- Modify: `src/lib/useReveal.js`

**Interfaces:**
- Produces: `shell.css` with empty labelled sections `/* SiteHeader */ /* CommandSearch */ /* SiteFooter */ /* Preloader */`; `.tabbar` hidden ≥1024px; `useReveal` accepts an options object.

- [ ] **Step 1: Hide the mobile tab bar on desktop**

The bug: `.topnav{display:none}` is never re-enabled and `.tabbar` (`position:fixed;bottom:0`) shows on desktop. The new `SiteHeader` replaces `.topnav` entirely; we only need to hide `.tabbar` ≥1024. Immediately after the existing `.tabbar{…}` rule block in `src/styles.css`, append:

```css
/* Atlas redesign: the mobile bottom tab bar is mobile-only. Desktop
   navigation lives in SiteHeader (src/components/shell/). */
@media (min-width:1024px){ .tabbar{ display:none; } }
```

- [ ] **Step 2: Create the shell CSS scaffold**

Create `src/components/shell/shell.css`:

```css
/* ══ DraGold shell — Atlas redesign ══════════════════════════════════
   All shell selectors live here (additive; styles.css untouched save
   tokens + the tabbar-desktop-hide rule). Imported by the shell
   components. */

/* ── container ── */
.shell-wrap{ max-width:var(--maxw-page); margin:0 auto; padding-inline:clamp(1rem,4vw,3rem); }

/* SiteHeader ─────────────────────────────────────────────────────── */

/* CommandSearch ─────────────────────────────────────────────────── */

/* SiteFooter ────────────────────────────────────────────────────── */

/* Preloader ─────────────────────────────────────────────────────── */
```

- [ ] **Step 3: Extend `useReveal` to accept an options object**

Replace the signature line in `src/lib/useReveal.js`:

```js
export function useReveal(opts = 0) {
  const { index = 0, once = true } = typeof opts === "number" ? { index: opts } : opts;
  const ref = useRef(null);
  const [revealed, setRevealed] = useState(false);
```

And in the IntersectionObserver callback, replace `io.disconnect();` inside the `isIntersecting` branch with:

```js
          setRevealed(true);
          if (once) io.disconnect();
```

Everything else in the file stays. Existing callers pass a number → still works.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Verify**

Dev server + Playwright.
- Resize to 1280×900, open `http://localhost:5199/`. Screenshot `phase2-t3-desktop.png`. Expected: **no** bottom tab bar visible (it's still there in DOM at <1024).
- Resize to 390×844. Screenshot `phase2-t3-mobile.png`. Expected: bottom tab bar present.
- Console: `document.querySelector('.tabbar')` exists both times; `getComputedStyle(document.querySelector('.tabbar')).display` is `"none"` at 1280, `"flex"` at 390.
- Existing SearchView reveal-on-scroll still animates (scroll the home page, Hot Picks section fades in).

- [ ] **Step 6: Commit**

```bash
git add src/styles.css src/components/shell/shell.css src/lib/useReveal.js
git commit -m "fix(nav): hide mobile tab bar on desktop; scaffold shell.css; useReveal opts

The mobile bottom tab bar was showing on desktop (.tabbar fixed, never
hidden ≥1024; .topnav display:none never re-enabled). SiteHeader will
own desktop nav; this hides .tabbar ≥1024. useReveal now also takes
{ index, once }.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NdfYZpokSPo6pSZjmL3sEz"
```

---

## Task 4: SiteHeader

**Files:**
- Create: `src/components/shell/SiteHeader.jsx`
- Modify: `src/components/shell/shell.css` (fill the `SiteHeader` section)

**Interfaces:**
- Consumes: nothing from earlier tasks beyond tokens + `shell.css`.
- Produces:

```js
// SiteHeader.jsx
export function SiteHeader({
  authReady,          // bool
  isAuthed,           // bool
  displayName,        // string
  avatarInitial,      // string
  menuOpen,           // bool
  onToggleMenu,       // () => void
  onSignOut,          // () => void
  cur,                // "EUR" | "USD"
  onSetCur,           // (c) => void
  onOpenSearch,       // () => void   — opens CommandSearch
  onNav,              // (dest: "explore" | "academy" | "collection") => void
  onHome,             // () => void   — wordmark click
})
```

All of these map 1:1 to values/handlers already present in `DraGold.jsx` (Task 8 wires them). `onNav("explore")` → `goTab("explore")`; `onNav("academy")` → `window.location.href="/academy"`; `onNav("collection")` → `goTab("portfolio")`.

- [ ] **Step 1: Write the component**

Create `src/components/shell/SiteHeader.jsx`:

```jsx
import { useEffect, useRef, useState } from "react";
import { Icon } from "../shared/Icon.jsx";
import "./shell.css";

const NAV = [
  { dest: "explore", label: "Explore" },
  { dest: "academy", label: "Academy" },
  { dest: "collection", label: "Collection" },
];

export function SiteHeader({
  authReady, isAuthed, displayName, avatarInitial, menuOpen,
  onToggleMenu, onSignOut, cur, onSetCur, onOpenSearch, onNav, onHome,
}) {
  const [condensed, setCondensed] = useState(false);
  const reduce = useRef(
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const onScroll = () => setCondensed(window.scrollY > 320);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ⌘K / Ctrl+K opens search from anywhere
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenSearch]);

  return (
    <header className={`site-header${condensed ? " is-condensed" : ""}`}>
      <div className="shell-wrap site-header-in">
        <button className="site-wordmark" onClick={onHome} aria-label="DraGold — home">
          <img src="/logo192.png" alt="" width="26" height="26" />
          <span className="font-syne">DraGold</span>
        </button>

        <nav className="site-nav" aria-label="Primary">
          {NAV.map((n) => (
            <button
              key={n.dest}
              className="site-nav-i"
              onClick={() => onNav(n.dest)}
              onPointerMove={reduce.current ? undefined : magnetize}
              onPointerLeave={reduce.current ? undefined : demagnetize}
            >
              {n.label}
            </button>
          ))}
        </nav>

        <button className="site-search-trigger" onClick={onOpenSearch} aria-label="Search cards, sets, illustrators">
          <Icon name="search" size={16} />
          <span className="site-search-hint">Search</span>
          <kbd>⌘K</kbd>
        </button>

        <div className="site-header-right">
          <div className="cur-sel" role="group" aria-label="Currency">
            {["EUR", "USD"].map((c) => (
              <button key={c} className={`cur-b ${cur === c ? "on" : ""}`} onClick={() => onSetCur(c)}>{c}</button>
            ))}
          </div>
          {!authReady ? (
            <div className="auth-skel" />
          ) : isAuthed ? (
            <div className="usermenu">
              <button className="avatar" onClick={onToggleMenu} aria-label="Account" aria-expanded={menuOpen}>
                {avatarInitial}
              </button>
              {menuOpen && (
                <>
                  <div className="menu-scrim" onClick={onToggleMenu} />
                  <div className="menu">
                    <div className="menu-email">{displayName}</div>
                    <a className="menu-i" href="/account"><Icon name="card" size={16} /> Account</a>
                    <button className="menu-i" onClick={onSignOut}><Icon name="logout" size={16} /> Sign out</button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="site-auth-cta">
              <a className="btn btn-ghost btn-sm" href="/login">Sign in</a>
              <a className="btn btn-primary btn-sm" href="/register">Create account</a>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// Magnetic hover — ≤6px pull toward the cursor. Ref-mutation only, no state.
function magnetize(e) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
  const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
  el.style.transform = `translate(${dx * 4}px, ${dy * 4}px)`;
}
function demagnetize(e) {
  e.currentTarget.style.transform = "";
}
```

- [ ] **Step 2: Style it**

In `src/components/shell/shell.css`, fill the `SiteHeader` section:

```css
.site-header{
  position:sticky; top:0; z-index:var(--z-header);
  background:transparent;
  border-bottom:1px solid transparent;
  transition:background var(--mo-tap) var(--ease-out), border-color var(--mo-tap) var(--ease-out);
  padding-top:env(safe-area-inset-top,0px);
}
.site-header.is-condensed{
  background:rgba(var(--bg-rgb) / .82);
  backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px);
  border-bottom-color:var(--border);
}
.site-header-in{ display:flex; align-items:center; gap:clamp(.75rem,2vw,2rem); height:64px; }
.site-wordmark{ display:flex; align-items:center; gap:.5rem; }
.site-wordmark span{ font-size:1.15rem; }
.site-wordmark img{ border-radius:6px; }

.site-nav{ display:none; gap:.25rem; }
@media (min-width:1024px){ .site-nav{ display:flex; } }
.site-nav-i{
  padding:.5rem .875rem; border-radius:999px; font-size:var(--fs-ui); font-weight:600;
  color:var(--muted); transition:color var(--mo-tap) var(--ease-out), transform var(--mo-instant) linear;
}
.site-nav-i:hover{ color:var(--text); }
.site-nav-i:focus-visible{ outline:2px solid var(--gold); outline-offset:2px; }

.site-search-trigger{
  margin-left:auto; display:flex; align-items:center; gap:.5rem;
  padding:.5rem .75rem; border:1px solid var(--border); border-radius:999px;
  color:var(--muted); font-size:var(--fs-ui); transition:border-color var(--mo-tap) var(--ease-out), color var(--mo-tap) var(--ease-out);
}
.site-search-trigger:hover{ border-color:var(--border-2); color:var(--text); }
.site-search-trigger:focus-visible{ outline:2px solid var(--gold); outline-offset:2px; }
.site-search-hint{ display:none; }
@media (min-width:640px){ .site-search-hint{ display:inline; } }
.site-search-trigger kbd{
  font-family:'Space Mono',monospace; font-size:var(--fs-micro); letter-spacing:.05em;
  border:1px solid var(--border); border-radius:5px; padding:.05rem .3rem; color:var(--dim);
}
@media (max-width:1023px){ .site-search-trigger kbd{ display:none; } }

.site-header-right{ display:flex; align-items:center; gap:.625rem; }
.site-auth-cta{ display:none; gap:.5rem; }
@media (min-width:560px){ .site-auth-cta{ display:flex; } }

@media (prefers-reduced-motion: reduce){
  .site-nav-i{ transition:none; }
}
```

Reuses existing `.cur-sel`, `.cur-b`, `.auth-skel`, `.usermenu`, `.avatar`, `.menu*`, `.btn*` from `styles.css` — do not redefine them.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS. (SiteHeader is not mounted yet — Task 8 — so this only checks it compiles.)

- [ ] **Step 4: Isolated visual check via a scratch mount**

Temporarily add to `src/main.jsx` a branch `window.location.pathname === "/__scratch"` that renders `<SiteHeader … />` with stub props over a tall dummy div, OR mount it early in Task 8 and verify there. If using the scratch route: screenshot at 1440 (`phase2-t4-header-desktop.png` — wordmark left, 3 nav items, search trigger with ⌘K, currency + auth right) and 390 (`phase2-t4-header-mobile.png` — wordmark, search icon, avatar/CTA; no nav items). Scroll down 400px → header gains a blurred background + hairline. Remove the scratch route before commit.

- [ ] **Step 5: Keyboard check**

Tab through the header: wordmark → 3 nav → search trigger → currency EUR/USD → auth. Every stop shows a gold focus ring. `Cmd/Ctrl+K` logs/opens search (stub for now — verify the handler fires via console).

- [ ] **Step 6: Commit**

```bash
git add src/components/shell/SiteHeader.jsx src/components/shell/shell.css
git commit -m "feat(shell): SiteHeader — scroll-aware nav, magnetic items, ⌘K trigger

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NdfYZpokSPo6pSZjmL3sEz"
```

---

## Task 5: CommandSearch overlay

**Files:**
- Create: `src/components/shell/CommandSearch.jsx`
- Modify: `src/components/shell/shell.css` (`CommandSearch` section)

**Interfaces:**
- Consumes: `searchCards`, `groupByCanonical` from `src/lib/search.js` (read-only import — do not modify that file); `SearchResultItem` from `src/components/search/SearchResultItem.jsx` (reuse for card rows) OR a lightweight inline row.
- Produces:

```js
export function CommandSearch({
  open,            // bool
  onClose,         // () => void
  onPickCard,      // (card) => void   — DraGold.jsx opens it (View Transition)
  onPickSet,       // (ref) => void
  setsMap,         // Map (passed through for set names/logos)
})
```

- [ ] **Step 1: Write the component**

Create `src/components/shell/CommandSearch.jsx`:

```jsx
import { useEffect, useRef, useState, useCallback } from "react";
import { Icon } from "../shared/Icon.jsx";
import { searchCards, groupByCanonical } from "../../lib/search.js";
import "./shell.css";

export function CommandSearch({ open, onClose, onPickCard, onPickSet, setsMap }) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [cards, setCards] = useState([]);
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const debounceRef = useRef(null);

  // focus input on open; restore scroll lock
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();
    return () => { document.body.style.overflow = prevOverflow; };
  }, [open]);

  // Esc closes; Tab is trapped inside the dialog
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "Tab") {
        const f = dialogRef.current?.querySelectorAll(
          'input,button,a[href],[tabindex]:not([tabindex="-1"])'
        );
        if (!f || !f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const run = useCallback((term) => {
    const t = term.trim();
    if (t.length < 2) { setCards([]); setLoading(false); return; }
    setLoading(true);
    searchCards(t)
      .then((res) => { setCards(res || []); })
      .catch(() => setCards([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => run(q), 180);
    return () => clearTimeout(debounceRef.current);
  }, [q, run]);

  if (!open) return null;

  const groups = groupByCanonical(cards); // canonical card groups
  const cardHits = groups.slice(0, 8);
  // set hits: distinct sets present in the result set
  const setHits = [];
  const seen = new Set();
  for (const c of cards) {
    const key = `${c.tcg}:${c.set_id || c.set_name}`;
    if (c.set_name && !seen.has(key)) { seen.add(key); setHits.push(c); }
    if (setHits.length >= 4) break;
  }

  return (
    <div className="cmd-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="cmd-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Search DraGold"
        ref={dialogRef}
      >
        <div className="cmd-inputrow">
          <Icon name="search" size={20} />
          <input
            ref={inputRef}
            className="cmd-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a card, set or illustrator…"
            aria-label="Search"
            autoComplete="off"
            enterKeyHint="search"
          />
          <button className="cmd-close" onClick={onClose} aria-label="Close search"><Icon name="close" size={18} /></button>
        </div>

        <div className="cmd-results" aria-live="polite">
          {q.trim().length < 2 ? (
            <p className="cmd-empty">Type at least two characters. Try “Charizard”, “Ashen Horizon”, an illustrator name…</p>
          ) : loading ? (
            <p className="cmd-empty">Searching…</p>
          ) : cardHits.length === 0 ? (
            <p className="cmd-empty">No matches for “{q.trim()}”.</p>
          ) : (
            <>
              {setHits.length > 0 && (
                <section className="cmd-group">
                  <h2 className="cmd-group-h">Sets</h2>
                  {setHits.map((c) => (
                    <button key={`${c.tcg}:${c.set_id}`} className="cmd-hit"
                      onClick={() => onPickSet({ tcg: c.tcg, set_id: c.set_id, lang: c.lang || "en", set_name: c.set_name })}>
                      <span className="cmd-hit-kind">SET</span>
                      <span className="cmd-hit-name">{c.set_name}</span>
                      <span className="cmd-hit-meta">{(c.tcg || "").toUpperCase()}</span>
                    </button>
                  ))}
                </section>
              )}
              <section className="cmd-group">
                <h2 className="cmd-group-h">Cards</h2>
                {cardHits.map((g) => {
                  const c = g.primary || g[0] || g;
                  return (
                    <button key={c.id} className="cmd-hit" onClick={() => onPickCard(c)}>
                      <span className="cmd-hit-kind">CARD</span>
                      <span className="cmd-hit-name">{c.name}</span>
                      <span className="cmd-hit-meta">{c.set_name} · {c.card_number}</span>
                    </button>
                  );
                })}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

> Executor note: confirm `groupByCanonical`'s return shape against `src/lib/search.js` before finalising the `cardHits` mapping — it may return arrays with a `.primary`, or plain arrays. Adjust `const c = …` accordingly. This is the one place the plan defers to the real function signature; do not change `search.js`.

- [ ] **Step 2: Style it**

`shell.css`, `CommandSearch` section:

```css
.cmd-scrim{
  position:fixed; inset:0; z-index:var(--z-overlay);
  background:rgba(var(--bg-rgb) / .72);
  display:flex; align-items:flex-start; justify-content:center;
  padding:clamp(2rem,12vh,8rem) 1rem 1rem;
  animation:cmd-fade var(--mo-tap) var(--ease-out);
}
@keyframes cmd-fade{ from{ opacity:0 } to{ opacity:1 } }
.cmd-dialog{
  width:min(640px,100%); background:var(--surface); border:1px solid var(--border-2);
  border-radius:12px; overflow:hidden; box-shadow:0 30px 90px rgba(0,0,0,.6);
}
.cmd-inputrow{ display:flex; align-items:center; gap:.75rem; padding:.875rem 1rem; border-bottom:1px solid var(--border); color:var(--muted); }
.cmd-input{ flex:1; background:none; border:none; outline:none; color:var(--text); font-size:1rem; }
.cmd-close{ color:var(--dim); padding:.35rem; border-radius:8px; }
.cmd-close:hover{ color:var(--text); background:var(--surface-2); }
.cmd-results{ max-height:min(60vh,480px); overflow-y:auto; padding:.5rem; }
.cmd-empty{ padding:1.5rem 1rem; color:var(--dim); font-size:var(--fs-body); }
.cmd-group + .cmd-group{ margin-top:.5rem; }
.cmd-group-h{ font-family:'Space Mono',monospace; font-size:var(--fs-micro); letter-spacing:.14em; text-transform:uppercase; color:var(--dim); padding:.5rem .75rem .25rem; }
.cmd-hit{ display:flex; align-items:center; gap:.75rem; width:100%; text-align:left; padding:.625rem .75rem; border-radius:8px; }
.cmd-hit:hover, .cmd-hit:focus-visible{ background:var(--surface-2); outline:none; }
.cmd-hit:focus-visible{ box-shadow:inset 0 0 0 2px var(--gold); }
.cmd-hit-kind{ font-family:'Space Mono',monospace; font-size:var(--fs-micro); letter-spacing:.1em; color:var(--relation); flex-shrink:0; width:2.5rem; }
.cmd-hit-name{ font-weight:600; font-size:var(--fs-body); color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.cmd-hit-meta{ margin-left:auto; font-family:'Space Mono',monospace; font-size:var(--fs-data); color:var(--dim); flex-shrink:0; }
@media (prefers-reduced-motion: reduce){ .cmd-scrim{ animation:none; } }
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Verify (wire a temporary trigger)**

In Task 8 this is mounted for real. For now, verify via the scratch route from Task 4: render `<CommandSearch open onClose={()=>{}} onPickCard={console.log} onPickSet={console.log} setsMap={null}/>`.
- Screenshot `phase2-t5-cmd.png` — centered dialog, input focused.
- Type `char` → after ~200ms, a "Cards" group with rows appears (real Supabase data via the anon key in `.env.local`).
- Press `Esc` → `onClose` fires (console).
- `Tab` repeatedly → focus stays within the dialog (input → close → hits → back to input).
- Console errors: none.

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/CommandSearch.jsx src/components/shell/shell.css
git commit -m "feat(shell): CommandSearch overlay wrapping lib/search.js

Focus-trapped role=dialog overlay, debounced, grouped card/set results.
Reuses searchCards/groupByCanonical — search.js unchanged.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NdfYZpokSPo6pSZjmL3sEz"
```

---

## Task 6: SiteFooter

**Files:**
- Create: `src/components/shell/SiteFooter.jsx`
- Modify: `src/components/shell/shell.css` (`SiteFooter` section)

**Interfaces:**
- Consumes: `useHomeData` is **not** ready yet; SiteFooter fetches its own world counts with a tiny inline effect (4 count queries) OR — preferred — accepts `worldCounts` as a prop (`{ "pokemon:en": n, ... }`) that Task 9's `useHomeData` will provide, and renders "—" while null.
- Produces: `export function SiteFooter({ worldCounts })`.

- [ ] **Step 1: Write the component**

Create `src/components/shell/SiteFooter.jsx`:

```jsx
import "./shell.css";

const WORLDS = [
  { key: "pokemon:en", label: "Pokémon", sub: "English", href: "/pokemon" },
  { key: "pokemon:ja", label: "Pokémon", sub: "Japanese", href: "/pokemon" },
  { key: "onepiece:en", label: "One Piece", sub: "English", href: "/onepiece" },
  { key: "onepiece:ja", label: "One Piece", sub: "Japanese", href: "/onepiece" },
];

export function SiteFooter({ worldCounts }) {
  return (
    <footer className="site-footer">
      <div className="shell-wrap">
        <p className="site-footer-eyebrow">THE ATLAS</p>
        <div className="site-footer-worlds">
          {WORLDS.map((w) => {
            const n = worldCounts?.[w.key];
            return (
              <a key={w.key} className="site-footer-world" href={w.href}>
                <span className="site-footer-world-label">{w.label}</span>
                <span className="site-footer-world-sub">{w.sub}</span>
                <span className="site-footer-world-n">
                  {typeof n === "number" ? `${n.toLocaleString()} cards` : "—"}
                </span>
              </a>
            );
          })}
        </div>

        <nav className="site-footer-nav" aria-label="Sections">
          <a href="/academy">Academy</a>
          <a href="/card-id">Identify a card</a>
          <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("dg:nav-collection"))}>Collection</button>
        </nav>

        <p className="site-footer-soon">Binder, Blog and Community are in progress.</p>

        <div className="site-footer-base">
          <span className="font-syne">DraGold</span>
          <span className="site-footer-tag">The atlas for serious TCG collectors.</span>
          <div className="site-footer-legal">
            <a href="/privacy">Privacy</a><span>·</span>
            <a href="/cookie-policy">Cookies</a><span>·</span>
            <a href="mailto:hello@dragold.org">Contact</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
```

> Executor note: the `dg:nav-collection` CustomEvent is a lightweight bridge so the footer button reaches `DraGold.jsx`'s `goTab("portfolio")` without prop-drilling through `HomePage`. Task 8 adds the listener. If Ermal's review prefers explicit props, pass `onNavCollection` instead.

- [ ] **Step 2: Style it** — `shell.css` `SiteFooter` section:

```css
.site-footer{ border-top:1px solid var(--border); margin-top:var(--space-9); padding:var(--space-8) 0 var(--space-7); }
.site-footer-eyebrow{ font-family:'Space Mono',monospace; font-size:var(--fs-micro); letter-spacing:.24em; color:var(--dim); margin-bottom:var(--space-5); }
.site-footer-worlds{ display:grid; grid-template-columns:repeat(2,1fr); gap:1px; background:var(--border); border:1px solid var(--border); border-radius:10px; overflow:hidden; }
@media (min-width:768px){ .site-footer-worlds{ grid-template-columns:repeat(4,1fr); } }
.site-footer-world{ background:var(--surface); padding:var(--space-4); display:flex; flex-direction:column; gap:.15rem; transition:background var(--mo-tap) var(--ease-out); }
.site-footer-world:hover{ background:var(--surface-2); }
.site-footer-world-label{ font-weight:700; }
.site-footer-world-sub{ font-size:var(--fs-data); color:var(--muted); }
.site-footer-world-n{ font-family:'Space Mono',monospace; font-size:var(--fs-data); color:var(--gold); margin-top:.35rem; }
.site-footer-nav{ display:flex; flex-wrap:wrap; gap:1.25rem; margin:var(--space-5) 0; font-size:var(--fs-ui); color:var(--muted); }
.site-footer-nav a:hover, .site-footer-nav button:hover{ color:var(--text); }
.site-footer-soon{ font-size:var(--fs-data); color:var(--dim); }
.site-footer-base{ margin-top:var(--space-6); padding-top:var(--space-5); border-top:1px solid var(--border); display:flex; flex-direction:column; gap:.4rem; }
.site-footer-tag{ font-size:var(--fs-data); color:var(--muted); }
.site-footer-legal{ display:flex; gap:.5rem; font-size:var(--fs-data); color:var(--dim); margin-top:.25rem; }
```

- [ ] **Step 3: Build** — `npm run build` → PASS.

- [ ] **Step 4: Verify** via scratch route: `<SiteFooter worldCounts={{ "pokemon:en": 21400, "pokemon:ja": 29800, "onepiece:en": 2180, "onepiece:ja": 2460 }} />` and again with `worldCounts={null}` (shows "—"). Screenshot `phase2-t6-footer.png` at 1440 and 390. Expected: 4-up grid desktop, 2-up mobile; restrained; no three-card "coming soon" block.

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/SiteFooter.jsx src/components/shell/shell.css
git commit -m "feat(shell): SiteFooter — restrained atlas index with real world counts

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NdfYZpokSPo6pSZjmL3sEz"
```

---

## Task 7: Preloader

**Files:**
- Create: `src/components/shell/Preloader.jsx`
- Modify: `src/components/shell/shell.css` (`Preloader` section) + `src/styles.css` (reduced-motion block append)

**Interfaces:**
- Produces: `export function Preloader()` — self-contained, renders nothing after it completes. Uses `sessionStorage` so it plays once per tab session.

- [ ] **Step 1: Write the component**

Create `src/components/shell/Preloader.jsx`:

```jsx
import { useEffect, useState } from "react";
import "./shell.css";

const STEPS = ["D", "DR", "DRA", "DRAG", "DRAGO", "DRAGOL", "DRAGOLD"];
const SEEN_KEY = "dg_preloader_seen";

export function Preloader() {
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const alreadySeen =
    typeof window !== "undefined" && (() => {
      try { return sessionStorage.getItem(SEEN_KEY) === "1"; } catch { return false; }
    })();

  const [gone, setGone] = useState(reduce || alreadySeen);
  const [step, setStep] = useState(reduce || alreadySeen ? STEPS.length - 1 : 0);

  useEffect(() => {
    if (gone) return;
    let raf;
    const start = performance.now();
    const DURATION = 1100; // ≤1.2s hard cap
    const tick = (now) => {
      const t = Math.min(1, (now - start) / DURATION);
      setStep(Math.min(STEPS.length - 1, Math.floor(t * STEPS.length)));
      if (t < 1) raf = requestAnimationFrame(tick);
      else finish();
    };
    raf = requestAnimationFrame(tick);
    const hardStop = setTimeout(finish, 1300);
    function finish() {
      try { sessionStorage.setItem(SEEN_KEY, "1"); } catch {}
      setGone(true);
    }
    return () => { cancelAnimationFrame(raf); clearTimeout(hardStop); };
  }, [gone]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" || e.key === "Enter") skip(); };
    function skip() {
      try { sessionStorage.setItem(SEEN_KEY, "1"); } catch {}
      setGone(true);
    }
    if (!gone) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gone]);

  if (gone) return null;

  return (
    <div className="preloader" role="status" aria-busy="true" aria-label="Loading DraGold">
      <span className="preloader-word font-syne">{STEPS[step]}</span>
      <button
        className="preloader-skip"
        onClick={() => {
          try { sessionStorage.setItem(SEEN_KEY, "1"); } catch {}
          setGone(true);
        }}
      >
        Skip
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Style it** — `shell.css` `Preloader` section:

```css
.preloader{
  position:fixed; inset:0; z-index:var(--z-preloader);
  background:var(--bg); display:flex; align-items:center; justify-content:center;
  animation:preloader-out .4s var(--ease-inout) 1s both;
}
@keyframes preloader-out{ to{ opacity:0; visibility:hidden; } }
.preloader-word{
  font-size:clamp(2.5rem,10vw,6rem); letter-spacing:.04em; color:var(--text);
}
.preloader-skip{
  position:absolute; bottom:2rem; right:2rem;
  font-family:'Space Mono',monospace; font-size:var(--fs-data); letter-spacing:.1em;
  text-transform:uppercase; color:var(--dim); padding:.5rem;
}
.preloader-skip:hover{ color:var(--muted); }
.preloader-skip:focus-visible{ outline:2px solid var(--gold); outline-offset:2px; }
```

- [ ] **Step 3: Reduced-motion append** — in `src/styles.css`, after the marker comment added in Task 2:

```css
  .preloader{ animation:none !important; }
```

(The component already renders `gone === true` immediately under reduced-motion, so this is belt-and-braces for the CSS exit animation.)

- [ ] **Step 4: Build** — `npm run build` → PASS.

- [ ] **Step 5: Verify** via scratch route (clear `sessionStorage` first):
- Load → Playwright screenshots at 0ms, 200ms, 500ms, 1000ms (`phase2-t7-preloader-{0,200,500,1000}.png`). Expected: `D` → … → `DRAGOLD`, then fades to reveal the page.
- Reload → preloader does **not** play again (sessionStorage).
- New context with `prefers-reduced-motion: reduce` → preloader never visible; page shown immediately.
- Press `Esc` mid-animation → skips instantly.

- [ ] **Step 6: Commit**

```bash
git add src/components/shell/Preloader.jsx src/components/shell/shell.css src/styles.css
git commit -m "feat(shell): Preloader — D→DRAGOLD build, ≤1.2s, skippable, once per session

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NdfYZpokSPo6pSZjmL3sEz"
```

---

## Task 8: Wire the shell into DraGold.jsx

**Files:**
- Modify: `src/DraGold.jsx`
- Create: `src/pages/home/HomePage.jsx` (placeholder — real strata in Tasks 12–13)
- Create: `src/pages/home/home.css` (empty scaffold)

**Interfaces:**
- Consumes: `SiteHeader`, `SiteFooter`, `Preloader`, `CommandSearch` (Tasks 4–7).
- Produces: `HomePage` mounted; `homeView` orchestration.

- [ ] **Step 1: Placeholder HomePage**

Create `src/pages/home/home.css` (empty but for a marker comment) and `src/pages/home/HomePage.jsx`:

```jsx
import "./home.css";

export function HomePage({ onOpenSearch }) {
  return (
    <div className="home">
      <section className="home-strata-placeholder shell-wrap">
        <h1 className="font-syne">Every card is a door.</h1>
        <p>Atlas strata land in Tasks 12–13.</p>
        <button className="btn btn-primary" onClick={onOpenSearch}>Search</button>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Edit `DraGold.jsx` — imports**

Add near the existing imports:

```js
import { SiteHeader } from "./components/shell/SiteHeader.jsx";
import { SiteFooter } from "./components/shell/SiteFooter.jsx";
import { Preloader } from "./components/shell/Preloader.jsx";
import { CommandSearch } from "./components/shell/CommandSearch.jsx";
import { HomePage } from "./pages/home/HomePage.jsx";
```

- [ ] **Step 3: Edit `DraGold.jsx` — state**

After the existing `const [menuOpen, setMenuOpen] = useState(false);`:

```js
const [searchOpen, setSearchOpen] = useState(false);
const [homeView, setHomeView] = useState("atlas"); // "atlas" | "results"
const openSearch = useCallback(() => setSearchOpen(true), []);
const closeSearch = useCallback(() => setSearchOpen(false), []);
```

Add a listener for the footer's collection bridge event, near the other `useEffect`s:

```js
useEffect(() => {
  const go = () => goTab("portfolio");
  window.addEventListener("dg:nav-collection", go);
  return () => window.removeEventListener("dg:nav-collection", go);
}, [goTab]);
```

- [ ] **Step 4: Edit `DraGold.jsx` — replace `<header>`**

Replace the entire `<header className="hdr">…</header>` block with:

```jsx
<SiteHeader
  authReady={authReady}
  isAuthed={isAuthed}
  displayName={displayName || userEmail}
  avatarInitial={avatarInitial}
  menuOpen={menuOpen}
  onToggleMenu={() => setMenuOpen((o) => !o)}
  onSignOut={signOut}
  cur={cur}
  onSetCur={setCur}
  onOpenSearch={openSearch}
  onNav={(dest) => {
    if (dest === "academy") { window.location.href = "/academy"; return; }
    if (dest === "collection") { goTab("portfolio"); return; }
    goTab("explore");
  }}
  onHome={() => { setHomeView("atlas"); goTab("search"); }}
/>
```

- [ ] **Step 5: Edit `DraGold.jsx` — replace the `tab==="search"` branch + footer**

In the `<main>`, replace the `{tab==="search" && (<SearchView … />)}` block with:

```jsx
{tab === "search" && homeView === "atlas" && (
  <HomePage onOpenSearch={openSearch} />
)}
{tab === "search" && homeView === "results" && (
  <SearchView
    country={country} cur={cur} eurRate={eurRate}
    onOpenAsset={openAsset} setsMap={setsMap} onOpenSet={openSet}
    initialSearchState={getSavedSearch()}
    onSearchStateChange={setSavedSearch}
    onSearchStateClear={() => { clearSavedSearch(); setHomeView("atlas"); }}
    onOpenExplore={() => goTab("explore")}
    isAuthed={isAuthed}
  />
)}
```

Replace the `<footer className="foot">…</footer>` block with `<SiteFooter worldCounts={null} />` (real counts arrive in Task 9 via `useHomeData`; for now `null` renders "—").

Mount the overlay + preloader — just inside the top-level `<div className="app">`:

```jsx
<Preloader />
<CommandSearch
  open={searchOpen}
  onClose={closeSearch}
  onPickCard={(card) => { closeSearch(); openAsset(card); }}
  onPickSet={(ref) => { closeSearch(); openSet(ref); }}
  setsMap={setsMap}
/>
```

Keep the existing `<nav className="tabbar">` (now correctly desktop-hidden by Task 3). Its Academy link and tabs are unchanged; optionally add a "Collection" tab pointing at `goTab("portfolio")` — **defer to Task 14** to avoid scope creep here.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: PASS. No unused-import errors (Vite won't fail on those, but check the diff).

- [ ] **Step 7: Full-app verification**

Dev server + Playwright.
- `http://localhost:5199/` at 1440 → `phase2-t8-home.png`: preloader plays, resolves to the new header + placeholder HomePage + new footer. **Bottom tab bar absent.**
- Click the header search trigger (or ⌘K) → CommandSearch opens. Type "charizard" → results. Click a card → overlay closes, card detail (`AssetView`) opens via View Transition. Back button returns to the Atlas placeholder.
- At 390 → `phase2-t8-mobile.png`: slim header, bottom tab bar present, placeholder readable.
- Navigate: header "Explore" → SetsView renders. Header "Academy" → `/academy` loads. Header wordmark → back to Atlas.
- Auth: signed-out shows Sign in / Create account; the avatar menu still opens when signed in (test with a real login if possible, else verify the `isAuthed` branch renders).
- Console: no new errors. Existing routes (`/carta/...`, `/set/...`, `/academy`) still load (they don't import `DraGold.jsx`).

- [ ] **Step 8: Commit**

```bash
git add src/DraGold.jsx src/pages/home/HomePage.jsx src/pages/home/home.css
git commit -m "feat(shell): mount SiteHeader/Footer/Preloader/CommandSearch in the app shell

DraGold.jsx swaps header/footer JSX for the shell components and adds
homeView orchestration (atlas | results). Pre-search view is now
HomePage (placeholder); SearchView still renders results unchanged.
No data/auth/routing logic changed.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NdfYZpokSPo6pSZjmL3sEz"
```

---

## Task 9: `useHomeData` + `selectFeatured`

**Files:**
- Create: `src/pages/home/selectFeatured.js`
- Create: `src/pages/home/selectFeatured.test.js`
- Create: `src/pages/home/useHomeData.js`
- Create: `src/pages/home/useHomeData.shape.test.js`
- Modify: `src/DraGold.jsx` (pass real `worldCounts` to `SiteFooter` — small)

**Interfaces:**
- Consumes: `supabase` from `src/supabase.js` (read-only import); `groupByCanonical`, `setIdCandidates` (from `src/pages/set/SetDetailPage.jsx` — already exported); `ACADEMY_LESSONS` from `src/pages/academy/academyContent.js`.
- Produces:

```js
// selectFeatured.js
export function selectFeatured(candidates)
// candidates: array of card rows. Returns one card row or null.
// Rules: only tcg==="pokemon"; lang "en" or "ja"; has image_url; name present;
// image_url does NOT contain "sample" (case-insensitive). Deterministic:
// pick by (hash of id) % list — stable across renders in a session.

// useHomeData.js
export function useHomeData({ isAuthed }) 
// returns {
//   loading: bool,
//   featured: cardRow | null,
//   prints: cardRow[],            // canonical group of `featured` (incl. itself)
//   set: { set_code, set_name, logo_url, release_date, release_year } | null,
//   setTotal: number | null,     // real distinct-canonical count in that set
//   setOwned: number | null,     // owned count for that set (isAuthed only)
//   siblings: cardRow[],         // up to 12 other cards from the same set
//   lessons: { slug, title, summary, minutes, category }[],  // 3 entries
//   worldCounts: { "pokemon:en": n, "pokemon:ja": n, "onepiece:en": n, "onepiece:ja": n } | null,
// }
```

- [ ] **Step 1: Write `selectFeatured` failing test**

Create `src/pages/home/selectFeatured.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { selectFeatured } from "./selectFeatured.js";

const rows = [
  { id: "a", tcg: "pokemon", lang: "en", name: "Charizard", image_url: "https://x/char.png" },
  { id: "b", tcg: "onepiece", lang: "en", name: "Luffy", image_url: "https://x/luffy.png" },
  { id: "c", tcg: "pokemon", lang: "ja", name: "Pikachu", image_url: "https://x/SAMPLE_pika.png" },
  { id: "d", tcg: "pokemon", lang: "de", name: "Glurak", image_url: "https://x/glurak.png" },
  { id: "e", tcg: "pokemon", lang: "ja", name: "Mew", image_url: "https://x/mew.png" },
];

test("only pokemon en/ja with a clean image", () => {
  const picked = selectFeatured(rows);
  assert.ok(["a", "e"].includes(picked.id));
});

test("rejects sample-watermarked images", () => {
  const picked = selectFeatured(rows);
  assert.notEqual(picked.id, "c");
});

test("deterministic for the same input", () => {
  assert.equal(selectFeatured(rows).id, selectFeatured(rows).id);
});

test("returns null when nothing qualifies", () => {
  assert.equal(selectFeatured([{ id: "z", tcg: "mtg", lang: "en", name: "x", image_url: "y" }]), null);
});
```

- [ ] **Step 2: Run — expect fail**

Run: `node --test src/pages/home/selectFeatured.test.js`
Expected: FAIL — `Cannot find module './selectFeatured.js'`.

- [ ] **Step 3: Implement `selectFeatured.js`**

```js
// Pick the home page's featured card. Pokémon EN/JA only, real clean image,
// no SAMPLE-watermarked art (One Piece pipeline issue — PRODUCT_SPEC §1).
// Deterministic within a session so the whole Atlas doesn't reshuffle on
// every render.
export function selectFeatured(candidates) {
  const ok = (c) =>
    c &&
    c.tcg === "pokemon" &&
    (c.lang === "en" || c.lang === "ja") &&
    typeof c.name === "string" && c.name.trim() &&
    typeof c.image_url === "string" &&
    !/sample/i.test(c.image_url);
  const pool = (candidates || []).filter(ok);
  if (!pool.length) return null;
  let h = 0;
  for (const c of pool) for (const ch of c.id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return pool[Math.abs(h) % pool.length];
}
```

- [ ] **Step 4: Run — expect pass**

Run: `node --test src/pages/home/selectFeatured.test.js`
Expected: PASS (4/4).

- [ ] **Step 5: Write `useHomeData` with extractable pure shapers + tests**

Create `src/pages/home/useHomeData.js`. Fetch strategy (all read-only, anon-safe):

```js
import { useEffect, useState } from "react";
import { supabase } from "../../supabase.js";
import { groupByCanonical, setIdCandidates } from "../set/SetDetailPage.jsx";
import { ACADEMY_LESSONS } from "../academy/academyContent.js";
import { selectFeatured } from "./selectFeatured.js";

// ── pure shapers (unit-tested) ──────────────────────────────────────
export function pickLessons(all, cardName) {
  // 3 lessons: prefer rarity/variants + en-vs-jp + card-anatomy, in that order,
  // fall back to the first lessons. Never invent slugs.
  const want = ["rarity-variants", "pokemon-en-jp", "card-anatomy"];
  const bySlug = new Map(all.map((l) => [l.slug, l]));
  const out = [];
  for (const s of want) if (bySlug.has(s)) out.push(bySlug.get(s));
  for (const l of all) { if (out.length >= 3) break; if (!out.includes(l)) out.push(l); }
  return out.slice(0, 3).map(({ slug, title, summary, minutes, category }) => ({ slug, title, summary, minutes, category }));
}

export function shapeWorldCounts(rows) {
  // rows: [{ tcg, lang, n }]
  const out = { "pokemon:en": null, "pokemon:ja": null, "onepiece:en": null, "onepiece:ja": null };
  for (const r of rows || []) {
    const k = `${r.tcg}:${r.lang}`;
    if (k in out) out[k] = r.n;
  }
  return out;
}

// ── hook ────────────────────────────────────────────────────────────
export function useHomeData({ isAuthed }) {
  const [state, setState] = useState({
    loading: true, featured: null, prints: [], set: null, setTotal: null,
    setOwned: null, siblings: [], lessons: [], worldCounts: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) { setState((s) => ({ ...s, loading: false })); return; }

      // 1. candidate pool for the featured card — reuse hot_picks if present,
      //    else a small recent Pokémon EN/JA slice.
      const today = new Date().toISOString().slice(0, 10);
      let candidates = [];
      const { data: hp } = await supabase
        .from("hot_picks").select("card_id").eq("computed_date", today).limit(20);
      const hpIds = (hp || []).map((r) => r.card_id);
      if (hpIds.length) {
        const { data } = await supabase
          .from("cards")
          .select("id,tcg,lang,name,set_id,set_name,card_number,rarity,illustrator,image_url,image_url_hi,canonical_card_id")
          .in("id", hpIds);
        candidates = data || [];
      }
      if (candidates.filter((c) => c.tcg === "pokemon").length < 3) {
        const { data } = await supabase
          .from("cards")
          .select("id,tcg,lang,name,set_id,set_name,card_number,rarity,illustrator,image_url,image_url_hi,canonical_card_id")
          .eq("tcg", "pokemon").in("lang", ["en", "ja"])
          .not("image_url", "is", null)
          .order("updated_at", { ascending: false }).limit(60);
        candidates = candidates.concat(data || []);
      }
      const featured = selectFeatured(candidates);

      // 2. canonical print/language group
      let prints = [];
      if (featured?.canonical_card_id) {
        const { data } = await supabase
          .from("cards")
          .select("id,tcg,lang,name,set_id,set_name,card_number,rarity,image_url,canonical_card_id")
          .eq("canonical_card_id", featured.canonical_card_id).limit(12);
        prints = data || [];
      }

      // 3. the set (from set_logos via set_id) + real total + siblings
      let set = null, setTotal = null, siblings = [];
      if (featured?.set_id) {
        const { data: sl } = await supabase
          .from("set_logos")
          .select("set_code,set_name,logo_url,release_date")
          .eq("tcg", featured.tcg).eq("set_code", featured.set_id).maybeSingle();
        if (sl) set = { ...sl, release_year: sl.release_date ? new Date(sl.release_date).getFullYear() : null };

        const cand = setIdCandidates(featured.set_id);
        const { data: setCards } = await supabase
          .from("cards").select("id,set_id,canonical_card_id,name,card_number,image_url,lang")
          .eq("tcg", featured.tcg).eq("lang", featured.lang).in("set_id", cand).limit(4000);
        if (setCards) {
          setTotal = groupByCanonical(setCards).length;
          siblings = setCards
            .filter((c) => c.id !== featured.id && c.image_url && !/sample/i.test(c.image_url))
            .slice(0, 12);
        }
      }

      // 4. owned count for that set (signed-in only) — collection.set_name
      let setOwned = null;
      if (isAuthed && set?.set_name) {
        const { data: u } = await supabase.auth.getUser();
        if (u?.user?.id) {
          const { data: coll } = await supabase
            .from("collection").select("quantity,set_name,tcg")
            .eq("user_id", u.user.id).eq("tcg", featured.tcg).eq("set_name", set.set_name);
          setOwned = (coll || []).reduce((n, r) => n + (r.quantity || 1), 0);
        }
      }

      // 5. academy lessons
      const lessons = pickLessons(ACADEMY_LESSONS, featured?.name);

      // 6. world counts (4 head:true count queries)
      const worlds = [["pokemon", "en"], ["pokemon", "ja"], ["onepiece", "en"], ["onepiece", "ja"]];
      const counts = await Promise.all(
        worlds.map(async ([tcg, lang]) => {
          const { count } = await supabase
            .from("cards").select("id", { count: "exact", head: true })
            .eq("tcg", tcg).eq("lang", lang);
          return { tcg, lang, n: count ?? null };
        })
      );

      if (cancelled) return;
      setState({
        loading: false, featured, prints, set, setTotal, setOwned, siblings,
        lessons, worldCounts: shapeWorldCounts(counts),
      });
    })().catch(() => { if (!cancelled) setState((s) => ({ ...s, loading: false })); });

    return () => { cancelled = true; };
  }, [isAuthed]);

  return state;
}
```

> Executor notes:
> - Verify `set_logos` has a `set_code` + `tcg` + `release_date` column set (audit confirms it does via `src/lib/state.js` / `src/lib/tcgSets.js`). If `maybeSingle()` errors on duplicates, switch to `.limit(1)` + `[0]`.
> - Verify `setIdCandidates` and `groupByCanonical` are exported from `SetDetailPage.jsx` (audit confirms `setIdCandidates` is; `groupByCanonical` is imported there from `lib/search.js` and re-exported — if not re-exported, import it from `../../lib/search.js` directly).
> - If `hot_picks` is empty locally that's fine — the fallback slice covers it.

- [ ] **Step 6: Write shaper tests**

Create `src/pages/home/useHomeData.shape.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickLessons, shapeWorldCounts } from "./useHomeData.js";

const lessons = [
  { slug: "tcg-basics", title: "A", summary: "s", minutes: 3, category: "x" },
  { slug: "card-anatomy", title: "B", summary: "s", minutes: 3, category: "x" },
  { slug: "rarity-variants", title: "C", summary: "s", minutes: 3, category: "x" },
  { slug: "pokemon-en-jp", title: "D", summary: "s", minutes: 3, category: "x" },
  { slug: "collection-basics", title: "E", summary: "s", minutes: 2, category: "x" },
];

test("pickLessons prefers rarity → en-jp → anatomy, returns 3", () => {
  const out = pickLessons(lessons);
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((l) => l.slug), ["rarity-variants", "pokemon-en-jp", "card-anatomy"]);
});

test("pickLessons falls back when preferred slugs missing", () => {
  const out = pickLessons(lessons.slice(0, 2));
  assert.equal(out.length, 2);
  assert.equal(out[0].slug, "card-anatomy");
});

test("shapeWorldCounts maps known keys, ignores others", () => {
  const out = shapeWorldCounts([
    { tcg: "pokemon", lang: "en", n: 10 },
    { tcg: "pokemon", lang: "fr", n: 99 },
  ]);
  assert.equal(out["pokemon:en"], 10);
  assert.equal(out["onepiece:ja"], null);
  assert.equal(out["pokemon:fr"], undefined);
});
```

> Note: `useHomeData.js` imports React and `SetDetailPage.jsx` (a `.jsx` with JSX) — `node --test` can't parse JSX. **Fix:** move `pickLessons` and `shapeWorldCounts` into a sibling `src/pages/home/homeData.pure.js` with no React/JSX imports, re-export them from `useHomeData.js`, and point the test at `homeData.pure.js`. Do this in Step 5.

- [ ] **Step 7: Run tests**

Run: `node --test src/pages/home/`
Expected: PASS — `selectFeatured` (4) + shapers (3).

- [ ] **Step 8: Live smoke test of the hook**

Add `useHomeData` to the placeholder `HomePage` temporarily and `console.log` the result; load `http://localhost:5199/` with the anon key active. Expected console output: `loading:false`, a `featured` Pokémon card, `prints.length ≥ 1`, `set` populated, `setTotal` a number, `worldCounts` four numbers, `lessons.length === 3`. No console errors. Remove the temporary log.

- [ ] **Step 9: Pass real counts to the footer**

In `DraGold.jsx`, the footer needs `worldCounts`. Rather than call `useHomeData` twice, lift it: call `const home = useHomeData({ isAuthed })` in `DraGold.jsx` **only if** `tab==="search"`… simpler: keep `useHomeData` inside `HomePage`, and have `HomePage` render its own `<SiteFooter worldCounts={home.worldCounts} />`? No — footer is app-shell. **Decision:** `DraGold.jsx` calls `useHomeData({ isAuthed })` once, passes `home` down to `<HomePage home={home} />` and `worldCounts` to `<SiteFooter>`. The fetch is cheap and gated behind `supabase` existing. Update `DraGold.jsx`:

```js
const home = useHomeData({ isAuthed });
// ...
<SiteFooter worldCounts={home.worldCounts} />
// ...
<HomePage home={home} onOpenSearch={openSearch} />
```

and `HomePage` signature becomes `({ home, onOpenSearch })`.

- [ ] **Step 10: Build + test + commit**

Run: `npm run build` → PASS. `node --test src/pages/home/` → PASS.

```bash
git add src/pages/home/ src/DraGold.jsx
git commit -m "feat(home): useHomeData — real featured card, prints, set, counts, lessons

Read-only query composition for the Atlas. Pure shapers unit-tested with
node:test (no new dep). selectFeatured keeps SAMPLE-watermarked art out
of the hero.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NdfYZpokSPo6pSZjmL3sEz"
```

---

## Task 10: Layout primitives — AtlasGrid, Stratum, DoorRail

**Files:**
- Create: `src/pages/home/AtlasGrid.jsx`, `src/pages/home/Stratum.jsx`, `src/pages/home/DoorRail.jsx`
- Modify: `src/pages/home/home.css`

**Interfaces:**
- Produces:

```js
export function AtlasGrid({ children, className })
// 12-col grid, max --maxw-page, responsive → 1 col below 768.

export function Stratum({ edgeLabel, voice, children, index, id })
// edgeLabel: string (mono, e.g. "CARD → SET"); voice: optional serif line;
// index: reveal stagger; id: anchor. Wraps content in useReveal.

export function DoorRail({ label, children })
// label: aria-label naming the relationship; horizontal native-scroll rail
// with edge fade + desktop drag (reuse useDragScroll).
```

- [ ] **Step 1: AtlasGrid**

```jsx
import "./home.css";
export function AtlasGrid({ children, className = "" }) {
  return <div className={`atlas-grid ${className}`.trim()}>{children}</div>;
}
```

- [ ] **Step 2: Stratum**

```jsx
import { useReveal } from "../../lib/useReveal.js";
import "./home.css";

export function Stratum({ edgeLabel, voice, children, index = 0, id }) {
  const r = useReveal({ index });
  return (
    <section className="stratum" id={id} ref={r.ref}>
      <div className={`stratum-in shell-wrap ${r.className}`} style={r.style}>
        {edgeLabel && <p className="stratum-edge">{edgeLabel}</p>}
        {voice && <p className="stratum-voice font-syne">{voice}</p>}
        {children}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: DoorRail** (reuse `src/lib/useDragScroll.js`)

```jsx
import { useDragScroll } from "../../lib/useDragScroll.js";
import "./home.css";

export function DoorRail({ label, children }) {
  const drag = useDragScroll();
  return (
    <div
      className="door-rail"
      role="group"
      aria-label={label}
      ref={drag.ref}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerLeave={drag.onPointerLeave}
      onClickCapture={drag.onClickCapture}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 4: home.css primitives**

```css
/* ══ DraGold home — Atlas ═══════════════════════════════════════════ */
.home{ }

.atlas-grid{
  display:grid; grid-template-columns:1fr; gap:var(--space-5);
  max-width:var(--maxw-page); margin-inline:auto;
}
@media (min-width:768px){
  .atlas-grid{ grid-template-columns:repeat(var(--grid-cols),1fr); column-gap:var(--grid-gutter); }
}

.stratum{ padding-block:var(--space-8); }
.stratum-in{ }
.stratum-edge{
  font-family:'Space Mono',monospace; font-size:var(--fs-micro); letter-spacing:.2em;
  text-transform:uppercase; color:var(--relation); margin-bottom:var(--space-4);
}
.stratum-voice{
  font-size:var(--fs-h2); font-weight:700; letter-spacing:-.015em; line-height:1.15;
  color:var(--text); max-width:24ch; margin-bottom:var(--space-5);
}
.stratum-voice em{ font-style:italic; font-weight:600; color:var(--gold); }

.door-rail{
  display:flex; gap:var(--space-3); overflow-x:auto; padding-bottom:var(--space-2);
  scroll-snap-type:x proximity; scrollbar-width:none;
  -webkit-mask-image:linear-gradient(to right,transparent,#000 24px,#000 calc(100% - 32px),transparent);
          mask-image:linear-gradient(to right,transparent,#000 24px,#000 calc(100% - 32px),transparent);
  cursor:grab;
}
.door-rail::-webkit-scrollbar{ display:none; }
.door-rail:active{ cursor:grabbing; }
.door-rail > *{ scroll-snap-align:start; flex:0 0 auto; }
```

- [ ] **Step 5: Build + verify**

Run: `npm run build` → PASS.
Render all three in the placeholder HomePage with dummy content; Playwright screenshot `phase2-t10-primitives.png` at 1440 and 390. Expected: grid collapses to 1 col on mobile; Stratum shows mono edge-label + serif voice; DoorRail scrolls horizontally with edge fade, drag works on desktop.

- [ ] **Step 6: Commit**

```bash
git add src/pages/home/AtlasGrid.jsx src/pages/home/Stratum.jsx src/pages/home/DoorRail.jsx src/pages/home/home.css
git commit -m "feat(home): AtlasGrid / Stratum / DoorRail layout primitives

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NdfYZpokSPo6pSZjmL3sEz"
```

---

## Task 11: CardSpecimen primitive

**Files:**
- Create: `src/pages/home/CardSpecimen.jsx`
- Modify: `src/pages/home/home.css`; `src/styles.css` (reduced-motion append)

**Interfaces:**
- Consumes: `useTilt` from `src/lib/useTilt.js` (reuse); `pickCardImage` from `src/components/shared/cardImage.js`.
- Produces:

```js
export function CardSpecimen({ card, layer = "rest" })
// layer: "rest" | "identity" | "set" | "print" — a data attribute only in
// Phase 2 (data-layer); the delamination timeline (Phase 3) will read it.
// Renders 3 stacked planes (art / frame / holo) so Phase 3 can separate them.
```

- [ ] **Step 1: Component**

```jsx
import { useTilt } from "../../lib/useTilt.js";
import { pickCardImage } from "../shared/cardImage.js";
import "./home.css";

export function CardSpecimen({ card, layer = "rest" }) {
  const { plateRef, onPointerMove, onPointerLeave } = useTilt({ max: 7 });
  const src = card ? pickCardImage(card) : null;

  return (
    <div className="specimen" data-layer={layer}>
      <div
        className="specimen-plate"
        ref={plateRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        {src ? (
          <>
            <img className="specimen-art" src={src} alt={card?.name ? `${card.name} — card art` : ""} />
            <span className="specimen-frame" aria-hidden="true" />
            <span className="specimen-holo" aria-hidden="true" />
          </>
        ) : (
          <span className="specimen-ph" aria-hidden="true" />
        )}
      </div>
      <span className="specimen-shadow" aria-hidden="true" />
    </div>
  );
}
```

- [ ] **Step 2: home.css**

```css
.specimen{ position:relative; width:min(320px,74vw); aspect-ratio:63/88; perspective:1100px; margin-inline:auto; }
.specimen-plate{
  position:relative; width:100%; height:100%; transform-style:preserve-3d;
  border-radius:8px; will-change:transform;
  transition:transform var(--mo-settle) var(--ease-out);
}
.specimen-art, .specimen-frame, .specimen-holo, .specimen-ph{
  position:absolute; inset:0; border-radius:inherit;
}
.specimen-art{ width:100%; height:100%; object-fit:contain; filter:drop-shadow(0 8px 18px rgba(0,0,0,.45)) drop-shadow(0 30px 60px rgba(0,0,0,.5)); }
.specimen-frame{ box-shadow:inset 0 0 0 1px var(--border-2); }
.specimen-holo{
  mix-blend-mode:overlay; opacity:.5;
  background:
    radial-gradient(circle at var(--mx,50%) var(--my,50%), rgba(255,255,255,.45), transparent 60%),
    linear-gradient(var(--foil-angle,115deg), transparent 34%, rgb(var(--gold-rgb) / .22) 46%, rgb(var(--relation-rgb) / .2) 56%, transparent 72%);
}
.specimen-ph{ background:linear-gradient(150deg,var(--surface-3),var(--surface-2)); }
.specimen-shadow{
  position:absolute; left:10%; right:10%; bottom:-22px; height:26px; z-index:-1;
  background:radial-gradient(closest-side, rgba(0,0,0,.55), transparent 75%); filter:blur(7px);
}
/* one ambient foil-scan — the single indulgent loop, hero only */
.specimen-plate::after{
  content:""; position:absolute; top:0; bottom:0; left:-40%; width:30%;
  background:linear-gradient(100deg, transparent, rgb(var(--gold-rgb) / .10), transparent);
  animation:specimen-scan 9.5s ease-in-out infinite; pointer-events:none; border-radius:inherit;
}
@keyframes specimen-scan{ 0%{ left:-40% } 55%{ left:106% } 100%{ left:106% } }
```

- [ ] **Step 3: Reduced-motion append** — `src/styles.css`, after the Task 2/7 marker:

```css
  .specimen-plate{ transition:none !important; }
  .specimen-plate::after{ animation:none !important; }
```

- [ ] **Step 4: Build + verify**

Run: `npm run build` → PASS.
Render `<CardSpecimen card={realCard} />` in the placeholder HomePage. Playwright:
- `phase2-t11-specimen.png` at 1440 — card floats with a contact shadow, faint holo, subtle ambient scan.
- Move the pointer over it → tilts ±7°, holo highlight tracks the cursor, releases smoothly on leave.
- New context `prefers-reduced-motion: reduce` → no tilt, no scan; card static and correct.
- Mobile 390 → card scales to `74vw`, no tilt (coarse pointer).

- [ ] **Step 5: Commit**

```bash
git add src/pages/home/CardSpecimen.jsx src/pages/home/home.css src/styles.css
git commit -m "feat(home): CardSpecimen — layered, tiltable hero card (delaminate-ready)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NdfYZpokSPo6pSZjmL3sEz"
```

---

## Task 12: HomePage — strata 0–3 (Threshold, Identity, Set, Print)

**Files:**
- Modify: `src/pages/home/HomePage.jsx` (replace placeholder)
- Modify: `src/pages/home/home.css`

**Interfaces:**
- Consumes: `home` (from `useHomeData`), `AtlasGrid`, `Stratum`, `DoorRail`, `CardSpecimen`, `SearchResultItem` (reuse for sibling/print tiles), `onOpenSearch`.
- Produces: `HomePage` rendering strata 0–3 + a hook point for 4–7 (Task 13 appends).

- [ ] **Step 1: Rewrite HomePage with strata 0–3**

Per `UX_ARCHITECTURE.md §2`. Exact copy below — do not paraphrase.

```jsx
import { AtlasGrid } from "./AtlasGrid.jsx";
import { Stratum } from "./Stratum.jsx";
import { DoorRail } from "./DoorRail.jsx";
import { CardSpecimen } from "./CardSpecimen.jsx";
import { SearchResultItem } from "../../components/search/SearchResultItem.jsx";
import { Icon } from "../../components/shared/Icon.jsx";
import "./home.css";

export function HomePage({ home, onOpenSearch }) {
  const { loading, featured, prints, set, setTotal, setOwned, siblings, lessons } = home;

  return (
    <div className="home">
      {/* ── Stratum 0 · Threshold ───────────────────────────────── */}
      <section className="threshold">
        <AtlasGrid className="threshold-grid">
          <div className="threshold-copy">
            <h1 className="threshold-h font-syne">Every card is a door.</h1>
            <p className="threshold-sub">
              Search one card and follow it outward — through its prints, its set,
              and the releases standing behind it.
            </p>
            <button className="threshold-search" onClick={onOpenSearch}>
              <Icon name="search" size={18} />
              <span>Search a card, set or illustrator</span>
              <kbd>⌘K</kbd>
            </button>
          </div>
          <div className="threshold-card">
            <CardSpecimen card={featured} layer="rest" />
          </div>
        </AtlasGrid>
      </section>

      {/* ── Stratum 1 · Identity ────────────────────────────────── */}
      <Stratum edgeLabel="CARD · IDENTITY" voice="A card knows what it is." index={0}>
        {featured ? (
          <dl className="fact-ledger">
            <Fact k="Name">{featured.name}</Fact>
            <Fact k="Number">{featured.card_number || "—"}</Fact>
            <Fact k="Rarity">{featured.rarity || "—"}</Fact>
            <Fact k="Illustrator">{featured.illustrator || "—"}</Fact>
            <Fact k="Set">{featured.set_name || "—"}</Fact>
            <Fact k="Language">{(featured.lang || "").toUpperCase()}</Fact>
          </dl>
        ) : loading ? <LedgerSkeleton /> : null}
        <p className="stratum-doors">
          <a href="/card-id">Identify a card you're holding →</a>
          {featured?.illustrator && (
            <span> · <a href={`/illustrator/${slug(featured.illustrator)}`}>More by {featured.illustrator} →</a></span>
          )}
        </p>
      </Stratum>

      {/* ── Stratum 2 · Set ─────────────────────────────────────── */}
      <Stratum edgeLabel="CARD → SET" voice="And it belongs somewhere." index={1}>
        {set && (
          <div className="set-identity">
            {set.logo_url && <img className="set-identity-logo" src={set.logo_url} alt={set.set_name} />}
            <div>
              <p className="set-identity-name font-syne">{set.set_name}</p>
              <p className="set-identity-meta">
                {typeof setTotal === "number" ? `${setTotal} cards` : ""}
                {typeof setOwned === "number" && typeof setTotal === "number"
                  ? ` · ${setOwned} of ${setTotal} in your collection` : ""}
                {set.release_year ? ` · ${set.release_year}` : ""}
              </p>
            </div>
          </div>
        )}
        {siblings.length > 0 && (
          <DoorRail label={`Other cards from ${set?.set_name || "this set"}`}>
            {siblings.map((c) => (
              <div className="home-tile" key={c.id}>
                <SearchResultItem card={c} priceInfo={null} country="IT" cur="EUR" eurRate={0.92} onOpen={() => {}} />
              </div>
            ))}
          </DoorRail>
        )}
        <p className="stratum-doors">
          <a href={set ? `/set/${slugSet(set.set_code)}` : "#"}>Open the full set →</a>
        </p>
      </Stratum>

      {/* ── Stratum 3 · Print / Language ────────────────────────── */}
      <Stratum edgeLabel="CARD → PRINT / LANGUAGE" voice="The same card speaks more than one language." index={2}>
        {prints.length > 1 ? (
          <DoorRail label="Prints and language editions of this card">
            {prints.map((p) => (
              <div className={`home-tile${p.lang !== featured?.lang ? " home-tile-relation" : ""}`} key={p.id}>
                <SearchResultItem card={p} priceInfo={null} country="IT" cur="EUR" eurRate={0.92} onOpen={() => {}} />
              </div>
            ))}
          </DoorRail>
        ) : (
          <p className="stratum-note">This card has one known print in the catalog so far.</p>
        )}
        <p className="stratum-doors">
          <a href="/academy/pokemon-en-jp">EN vs JP — why they're not the same card →</a>
        </p>
      </Stratum>

      {/* strata 4–7 appended in Task 13 */}
    </div>
  );
}

function Fact({ k, children }) {
  return (
    <div className="fact">
      <dt className="fact-k">{k}</dt>
      <dd className="fact-v">{children}</dd>
    </div>
  );
}
function LedgerSkeleton() {
  return <div className="fact-ledger">{Array.from({ length: 6 }).map((_, i) => <div className="fact fact-skel" key={i} />)}</div>;
}
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function slugSet(code) { return String(code || "").toLowerCase(); }
```

> Executor notes:
> - `SearchResultItem` opens cards via its own `onOpen` — wire it to the real `openAsset` by threading an `onOpenCard` prop from `DraGold.jsx` through `HomePage` (add it; it maps to `openAsset`). The `() => {}` stubs above are placeholders — replace with `onOpenCard`.
> - `slug()` for illustrator: check `src/lib/illustratorSlug.js` for the canonical slug function and use it instead of the local `slug()` if the format differs.
> - `slugSet()`: check `src/lib/setSlug.js` `buildSetSlug(tcg, code)` (used in `SearchView.jsx`) and use that.

- [ ] **Step 2: home.css — strata 0–3**

```css
/* Stratum 0 · Threshold */
.threshold{ padding-block:var(--space-9) var(--space-8); }
.threshold-grid{ align-items:center; row-gap:var(--space-7); }
.threshold-copy{ grid-column:1 / -1; }
.threshold-card{ grid-column:1 / -1; }
@media (min-width:768px){
  .threshold-copy{ grid-column:1 / span 7; }
  .threshold-card{ grid-column:9 / -1; }
}
.threshold-h{ font-size:var(--fs-display); line-height:1.02; letter-spacing:-.025em; }
.threshold-sub{ margin-top:var(--space-4); color:var(--muted); font-size:var(--fs-body-lg); max-width:36ch; line-height:1.55; }
.threshold-search{
  margin-top:var(--space-5); display:flex; align-items:center; gap:.75rem;
  width:100%; max-width:420px; padding:.9rem 1rem; border:1px solid var(--border-2);
  border-radius:10px; color:var(--muted); font-size:var(--fs-body);
  transition:border-color var(--mo-tap) var(--ease-out);
}
.threshold-search:hover, .threshold-search:focus-visible{ border-color:var(--gold); outline:none; }
.threshold-search kbd{ margin-left:auto; font-family:'Space Mono',monospace; font-size:var(--fs-micro); border:1px solid var(--border); border-radius:5px; padding:.1rem .35rem; color:var(--dim); }

/* fact ledger */
.fact-ledger{ display:grid; grid-template-columns:1fr; gap:1px; background:var(--border); border:1px solid var(--border); border-radius:10px; overflow:hidden; max-width:560px; }
@media (min-width:560px){ .fact-ledger{ grid-template-columns:1fr 1fr; } }
.fact{ background:var(--surface); padding:.8rem 1rem; display:flex; flex-direction:column; gap:.25rem; min-height:64px; }
.fact-k{ font-family:'Space Mono',monospace; font-size:var(--fs-micro); letter-spacing:.14em; text-transform:uppercase; color:var(--dim); }
.fact-v{ font-size:var(--fs-body); font-weight:600; color:var(--text); }
.fact-skel{ min-height:64px; }

/* set identity */
.set-identity{ display:flex; align-items:center; gap:var(--space-4); margin-bottom:var(--space-5); flex-wrap:wrap; }
.set-identity-logo{ height:44px; max-width:200px; object-fit:contain; }
.set-identity-name{ font-size:var(--fs-h3); }
.set-identity-meta{ font-family:'Space Mono',monospace; font-size:var(--fs-data); color:var(--muted); margin-top:.2rem; }

/* shared home bits */
.home-tile{ width:150px; }
.home-tile-relation :is(.card-item){ border-color:rgb(var(--relation-rgb) / .4); }
.stratum-doors{ margin-top:var(--space-5); font-family:'Space Mono',monospace; font-size:var(--fs-data); color:var(--muted); }
.stratum-doors a{ color:var(--gold); }
.stratum-doors a:hover{ text-decoration:underline; }
.stratum-note{ color:var(--dim); font-size:var(--fs-body); }
```

- [ ] **Step 3: Thread `onOpenCard` from `DraGold.jsx`**

`DraGold.jsx`: `<HomePage home={home} onOpenSearch={openSearch} onOpenCard={openAsset} />`. Update `HomePage` signature + replace the `onOpen={() => {}}` stubs with `onOpen={onOpenCard}`.

- [ ] **Step 4: Build + verify**

Run: `npm run build` → PASS. `node --test src/pages/home/` → PASS.
Playwright at 1440, 1024, 768, 390 — screenshots `phase2-t12-{1440,1024,768,390}.png`:
- Threshold: display headline left, specimen right (desktop) / stacked (mobile). One search affordance, no competing button.
- Identity: mono edge-label, serif voice line, 2-col fact ledger with **real** values from the featured card.
- Set: real set logo + name + real total + release year; sibling rail scrolls; "Open the full set" links to a real `/set/...` slug.
- Print: real canonical group; JP/other-lang tiles carry the periwinkle border; Academy door links to `/academy/pokemon-en-jp` (real lesson).
- Reduced-motion context → all four strata fully visible, static, correctly laid out.
- Click a sibling card → `AssetView` opens (real `openAsset`).
- Console: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/home/HomePage.jsx src/pages/home/home.css src/DraGold.jsx
git commit -m "feat(home): Atlas strata 0-3 — Threshold, Identity, Set, Print

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NdfYZpokSPo6pSZjmL3sEz"
```

---

## Task 13: HomePage — strata 4–7 (History, Knowledge, Collection, Index)

**Files:**
- Modify: `src/pages/home/HomePage.jsx` (append strata), `src/pages/home/useHomeData.js` (add `siblingSets` for the history spine), `src/pages/home/home.css`

**Interfaces:**
- Consumes: `home.set`, `home.lessons`, `home.setOwned`/`setTotal`, plus a new `home.timeline` (sets of the same TCG ordered by `release_date`).
- Produces: full 7-stratum HomePage.

- [ ] **Step 1: Add `timeline` to `useHomeData`**

In the hook, after fetching `set`, add:

```js
// history spine — same-TCG sets by release date (real dates: pokemon/onepiece)
let timeline = [];
if (featured?.tcg) {
  const { data: tl } = await supabase
    .from("set_logos")
    .select("set_code,set_name,logo_url,release_date")
    .eq("tcg", featured.tcg).not("release_date", "is", null)
    .order("release_date", { ascending: true });
  timeline = (tl || []).map((s) => ({ ...s, year: new Date(s.release_date).getFullYear() }));
}
```

Add `timeline` to the returned state (default `[]`). Update the `useHomeData` interface doc-comment.

- [ ] **Step 2: Append strata 4–7 to HomePage**

Exact copy per `UX_ARCHITECTURE.md §2`. Insert before the closing `</div>` of `.home`:

```jsx
{/* ── Stratum 4 · History ──────────────────────────────────── */}
<Stratum edgeLabel="SET → RELEASE TIMELINE" voice="It arrived at a moment." index={3}>
  {home.timeline.length > 1 ? (
    <DoorRail label={`${featured?.tcg === "onepiece" ? "One Piece" : "Pokémon"} sets in release order`}>
      {home.timeline.map((s) => (
        <a
          className={`tl-mark${s.set_code === set?.set_code ? " is-current" : ""}`}
          key={s.set_code}
          href={`/set/${slugSet(s.set_code)}`}
        >
          <span className="tl-year">{s.year}</span>
          <span className="tl-name">{s.set_name}</span>
        </a>
      ))}
    </DoorRail>
  ) : (
    <p className="stratum-note">Release dates for this line aren't complete yet.</p>
  )}
  <p className="stratum-doors"><a href="/academy/tcg-basics">How sets and releases work →</a></p>
</Stratum>

{/* ── Stratum 5 · Knowledge ────────────────────────────────── */}
<Stratum edgeLabel="CARD → KNOWLEDGE" voice={<>Don't just collect it. <em>Know it.</em></>} index={4}>
  <div className="know-grid">
    {lessons.map((l) => (
      <a className="know-card" href={`/academy/${l.slug}`} key={l.slug}>
        <span className="know-cat">{l.category}</span>
        <span className="know-title font-syne">{l.title}</span>
        <span className="know-sum">{l.summary}</span>
        <span className="know-min">{l.minutes} min</span>
      </a>
    ))}
  </div>
  <p className="stratum-doors"><a href="/academy">Everything in the Academy →</a></p>
</Stratum>

{/* ── Stratum 6 · Collection ───────────────────────────────── */}
<Stratum edgeLabel="CARD → COLLECTION" voice="And then it's part of something you're building." index={5}>
  {typeof setOwned === "number" && typeof setTotal === "number" ? (
    <div className="coll-progress">
      <div
        className="coll-ring"
        style={{ "--pct": `${Math.min(100, Math.round((setOwned / Math.max(1, setTotal)) * 100))}%` }}
        role="img"
        aria-label={`${setOwned} of ${setTotal} cards from ${set?.set_name} in your collection`}
      >
        <span className="coll-ring-in"><b>{setOwned}</b><small>/{setTotal}</small></span>
      </div>
      <p className="coll-copy">Gold where you've been, ink where you haven't. Open your collection to see every set.</p>
    </div>
  ) : (
    <div className="coll-signedout">
      <p className="coll-copy">Track which cards you own in every set — owned cards glow, gaps stay dark.</p>
      <a className="btn btn-primary btn-sm" href="/register">Create a free account</a>
    </div>
  )}
  <p className="stratum-doors">
    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("dg:nav-collection"))}>Open your collection →</button>
  </p>
</Stratum>
```

Stratum 7 is the existing `<SiteFooter>` already rendered by `DraGold.jsx` — no HomePage element needed. Add a short comment noting that.

- [ ] **Step 3: home.css — strata 4–7**

```css
/* Stratum 4 · timeline */
.tl-mark{ display:flex; flex-direction:column; gap:.2rem; width:132px; padding:.75rem; border:1px solid var(--border); border-radius:8px; background:var(--surface); transition:border-color var(--mo-tap) var(--ease-out); }
.tl-mark:hover{ border-color:var(--border-2); }
.tl-mark.is-current{ border-color:var(--gold); }
.tl-year{ font-family:'Space Mono',monospace; font-size:var(--fs-data); color:var(--gold); }
.tl-name{ font-size:var(--fs-data); color:var(--muted); line-height:1.3; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }

/* Stratum 5 · knowledge */
.know-grid{ display:grid; grid-template-columns:1fr; gap:var(--space-3); }
@media (min-width:768px){ .know-grid{ grid-template-columns:repeat(3,1fr); } }
.know-card{ display:flex; flex-direction:column; gap:.4rem; padding:var(--space-4); border:1px solid var(--border); border-radius:10px; background:var(--surface); transition:border-color var(--mo-tap) var(--ease-out); }
.know-card:hover{ border-color:var(--gold); }
.know-cat{ font-family:'Space Mono',monospace; font-size:var(--fs-micro); letter-spacing:.12em; text-transform:uppercase; color:var(--relation); }
.know-title{ font-size:var(--fs-h3); }
.know-sum{ font-size:var(--fs-data); color:var(--muted); line-height:1.5; }
.know-min{ font-family:'Space Mono',monospace; font-size:var(--fs-micro); color:var(--dim); margin-top:auto; }

/* Stratum 6 · collection */
.coll-progress{ display:flex; align-items:center; gap:var(--space-5); flex-wrap:wrap; }
.coll-ring{ width:96px; height:96px; border-radius:50%; background:conic-gradient(var(--gold) var(--pct,0%), var(--surface-3) var(--pct,0%)); display:grid; place-items:center; position:relative; flex-shrink:0; }
.coll-ring::after{ content:""; position:absolute; inset:6px; border-radius:50%; background:var(--bg); }
.coll-ring-in{ position:relative; z-index:1; font-family:'Space Mono',monospace; font-size:var(--fs-data); color:var(--text); }
.coll-ring-in small{ color:var(--dim); }
.coll-copy{ color:var(--muted); font-size:var(--fs-body); max-width:40ch; line-height:1.55; }
.coll-signedout{ display:flex; flex-direction:column; gap:var(--space-4); align-items:flex-start; }
```

- [ ] **Step 4: Build + tests + verify**

Run: `npm run build` → PASS. `node --test src/pages/home/` → PASS.
Playwright at 1440 / 768 / 390 — full-page screenshots `phase2-t13-{1440,768,390}.png`:
- History: horizontal rail of dated set markers, the featured card's set outlined in gold, real years.
- Knowledge: 3 real Academy lessons (`rarity-variants`, `pokemon-en-jp`, `card-anatomy`), links resolve to `/academy/{slug}`.
- Collection (signed-out): the copy + "Create a free account" → `/register`. (Signed-in, if testable: the ring with real owned/total.)
- Footer (Stratum 7): four worlds with **real** card counts now (from `useHomeData.worldCounts`).
- Full reduced-motion screenshot `phase2-t13-reduced.png` — the entire home is a clean static document top to bottom.
- Console: no errors. Lighthouse (desktop) run — record the score; fixes in Task 14.

- [ ] **Step 5: Commit**

```bash
git add src/pages/home/HomePage.jsx src/pages/home/useHomeData.js src/pages/home/home.css
git commit -m "feat(home): Atlas strata 4-7 — History, Knowledge, Collection, Index

Full static motion-off Atlas home. Real data throughout: release-dated
set timeline, real Academy lessons, real set completion, real world
counts. No GSAP/Lenis/WebGL.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NdfYZpokSPo6pSZjmL3sEz"
```

---

## Task 14: Verification & polish loop

**Files:**
- Modify: any of the above as defects require; `src/DraGold.jsx` (add "Collection" to the mobile `.tabbar`)

**Interfaces:** none new.

- [ ] **Step 1: Add Collection to the mobile tab bar**

In `DraGold.jsx`'s `<nav className="tabbar">`, add a fourth item after Academy:

```jsx
<button className={`tab-i ${tab==="portfolio"?"on":""}`} onClick={()=>goTab("portfolio")}>
  <Icon name="wallet" size={22} stroke={tab==="portfolio"?2.4:2} />
  <span>Collection</span>
</button>
```

- [ ] **Step 2: Lighthouse pass**

Run Lighthouse (desktop preset) against `http://localhost:5199/` (after `npm run build` + `npm run preview` on a fixed port, IPv6-aware). Record: Performance, Accessibility, Best Practices, SEO.
Targets: Performance ≥ 95, Accessibility ≥ 95, CLS ≤ 0.02, TBT ≤ 200ms.
For any miss: identify the cause (unsized image, font swap jank, long task) and fix. Re-run.

- [ ] **Step 3: Accessibility audit**

- Tab through the entire home from the top: preloader skip → header (wordmark, 3 nav, search, currency, auth) → each stratum's links/rails → footer. Every focus stop has a visible gold ring. Record the tab order.
- Screen-reader landmark check (Playwright `browser_snapshot`): one `<h1>` ("Every card is a door."), `<header>`/`<nav>`/`<main>`/`<footer>` present, each `DoorRail` announces its `aria-label`.
- `CommandSearch`: open, verify `role="dialog"` + `aria-modal`, focus lands in the input, `Tab` is trapped, `Esc` closes and returns focus to the trigger.
- Colour contrast: sample `--text`, `--muted`, `--gold`, `--relation` on `--bg` and on `--surface` with a contrast tool. `--dim` must only appear on non-essential text. Record ratios.
- `prefers-reduced-motion`: full-page screenshot; confirm no motion, no broken layout, all content present and ordered.

- [ ] **Step 4: Cross-breakpoint pass**

Full-page screenshots at 360, 390, 768, 1024, 1280, 1440, 1920 (`phase2-t14-{w}.png`). Check each against `DESIGN_DIRECTION.md §9` and `UX_ARCHITECTURE.md §6`:
- No horizontal body scroll at any width.
- ≤768: stacked strata, native rails, slim header + bottom tab bar, no tilt.
- ≥1024: 12-col grid, top nav, no bottom tab bar, tilt active.
- Content never exceeds `--maxw-page` (1320px) — centered with gutter beyond that.
Fix any layout break inline; re-screenshot.

- [ ] **Step 5: Regression sweep of existing screens**

Screenshot and eyeball: `/` (post-search results — run a search, verify `SearchView` still renders), `/carta/<any real slug>`, `/set/<any real slug>`, `/academy`, `/academy/tcg-basics`, `/login`, `/account` (if auth), `/pokemon`. Expected: all still render, tokens applied consistently, nothing visually broken by the shared token changes.

- [ ] **Step 6: Console & network clean**

On the home route: `browser_console_messages` level error → none. `browser_network_requests` → no 404s, no `fonts.googleapis.com`, no failed Supabase calls (403/404).

- [ ] **Step 7: Final build + full test run**

Run: `npm run build` → PASS.
Run: `node --test src/pages/home/` → PASS (all).

- [ ] **Step 8: Commit + summary**

```bash
git add -A
git commit -m "chore(home): Phase 2 verification pass — a11y, Lighthouse, breakpoints, regressions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NdfYZpokSPo6pSZjmL3sEz"
```

Write a task report: files changed/created, Lighthouse scores, tab order, contrast ratios, screenshots captured, any deviations from the spec, and the list of things to carry into Phase 3 (GSAP + Lenis, the delamination timeline, the horizontal-scroll History spine, `useScrollScene`).

---

## Self-Review

**1. Spec coverage**

| Spec item | Task |
|---|---|
| DD §3 typography — self-host, families kept | T1 |
| DD §3 fluid type scale tokens | T2 |
| DD §4 refined colour tokens + `-rgb` channels + migration | T2 |
| DD §5 spacing/grid/geometry tokens | T2, T10 |
| DD §6 card treatment / specimen / SAMPLE rule | T9 (`selectFeatured`), T11 |
| DD §7 interaction — magnetic nav, tilt, no hover-only info | T4, T11 |
| DD §8 motion tokens; no scroll choreography in Phase 2; reduced-motion designed | T2, T7, T11, T12, T13, T14 |
| DD §9 responsive breakpoints | T3, T12, T13, T14 |
| DD §10 accessibility | T4, T5, T7, T14 |
| DD §11 do-not list | Global Constraints, all tasks |
| DD §13 dependencies — none added in Phase 2 | Global Constraints |
| DD §14 performance budget | T1, T14 |
| DD §15 implementation order | task order 1→14 |
| DD §16 definition of done | T14 |
| UX §2 seven strata, real data, three doors each | T12 (0–3), T13 (4–7) |
| UX §3 navigation + desktop-nav bug fix + CommandSearch | T3, T4, T5 |
| UX §4 journeys (search/explore/academy/identify/collection) | T4 (nav), T5 (search), T12–13 (doors) |
| UX §5 CTA hierarchy (one primary per stratum) | T12, T13 |
| UX §6 desktop/mobile/reduced-motion table | T12, T13, T14 |
| UX §7 data reality checklist (no quiz/XP, no CV, no rarity/series routes) | T9, T12, T13 (Academy links only to real slugs; identify → text `/card-id`) |
| UX §8 out-of-scope untouched | Global Constraints |

Gaps: none blocking. The horizontal-**scroll-driven** History spine (UX §2 stratum 4 "vertical scroll drives horizontal") is delivered in Phase 2 as a plain native-scroll rail; the scroll-driven behaviour is explicitly Phase 3 (needs GSAP). Noted in T13 and the T14 carry-forward list.

**2. Placeholder scan**

No "TBD"/"TODO"/"add error handling" left. Three "Executor note" blocks defer to real function signatures (`groupByCanonical` shape, `illustratorSlug`/`setSlug` helpers, `set_logos` single-row) — these are *verification instructions against existing code*, not unfilled work, and each states the fallback.

**3. Type consistency**

- `selectFeatured(candidates) → cardRow | null` — used consistently in T9.
- `useHomeData({ isAuthed }) → { loading, featured, prints, set, setTotal, setOwned, siblings, lessons, worldCounts, timeline }` — `timeline` added in T13 Step 1 and the interface doc updated there; T13 consumes `home.timeline`. Consistent.
- Pure shapers `pickLessons` / `shapeWorldCounts` moved to `homeData.pure.js` (T9 Step 6 note) so `node --test` can import them without JSX. Tests point there.
- `HomePage` signature evolves: T8 `({ onOpenSearch })` → T9 `({ home, onOpenSearch })` → T12 `({ home, onOpenSearch, onOpenCard })`. Each task states the change. Consistent.
- Shell component prop names (`onOpenSearch`, `onNav`, `worldCounts`, `open`/`onClose`/`onPickCard`/`onPickSet`) match between definition (T4–7) and wiring (T8). Consistent.
- CSS custom-property names identical between T2 definitions and T4–T13 consumers (`--mo-*`, `--fs-*`, `--space-*`, `--gold-rgb`, `--relation-rgb`, `--bg-rgb`, `--maxw-page`, `--z-*`).

Fixed inline during review: T13 `coll-ring` uses `--pct` (matches the existing `.set-completion-ring` / `.discover-tile-ring` convention in `styles.css`).
