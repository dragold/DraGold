# Ask DraGold — Product Hardening & Beta Readiness — RESULTS

> **Date:** 2026-09-03 · **Branch:** `feat/cross-language-identity` · **PR #26 — NOT merged.**
> Goal: move Ask DraGold from "works in development" to "safe enough for a private beta".

## 1. What was fixed / added

| Area | Change |
|---|---|
| **Rate limiting** | `api/_lib/ask/rateLimit.js` — 3 windows (60s): GLOBAL + PER_USER durable (count `agent_queries`), PER_IP best-effort in-memory. `429` + `Retry-After` + `scope`. Tunable `ASK_RL_GLOBAL` / `ASK_RL_USER` / `ASK_RL_IP` / `ASK_RL_WINDOW_S`. No external service. |
| **Provider health** | `providerStatus()` — reports config state without throwing or leaking keys. `GET /api/ask` returns it (provider, model, `configured`, base_url — **no secrets**). `503` + a clear hint when a provider is selected but unconfigured. Ollama default model → `gpt-oss:20b`. |
| **Input validation** | body must be an object; `message` string ≤ 2000; `history` sanitised (role whitelist `user`/`assistant`, content string, ≤ 12 items, ≤ 2000 chars each). `X-Robots-Tag: noindex`. |
| **agent_queries user id** | comes from `userSb.auth.getUser()` (signature-checked), never a client JWT claim. |
| **Robustness** | step-cap without a final answer → explicit message + tool evidence, `outcome: insufficient_data` (not an empty string). |
| **Card Dossier UX** | "no valuation" state redesigned — "Not yet valued" + a plain-language reason + "this is a data-coverage gap, not an error. Rather than show an unreliable number, DraGold says it doesn't know." Proper collection panel (total EUR, valued/unvalued, confidence mix) instead of raw JSON. |
| **Eval** | +7 adversarial fixtures (35 total). Universal no-secret-leak check on every answer. |

## 2. Tests run

| Suite | Result |
|---|---|
| `npm test` (src) | 22/22 |
| `npm run test:scripts` | 583/583 |
| `npm run test:rpc` (`scripts/__tests__/*.test.mjs`) | rpc 12 · ask-tools 8 · ask-agent 4 · **ask-hardening 12** · **ask-security 6** = **42/42** |
| `npm run build` | green (`/ask` chunk ~13 KB gz; `ai`/`zod` server-side only) |
| `scripts/verify-cross-language.mjs` | pass |
| `scripts/verify-ask-collection.mjs` | **pass — authenticated collection path E2E** |
| `get_advisors` (security) | 0 new warnings |

### Authenticated collection path — verified end to end
`verify-ask-collection.mjs` creates a throwaway auth user, signs in, seeds real
One Piece cards into `collection`, then:
- RLS: the user reads exactly their own 3 rows ✓
- `collection` tool (summary): `estimated_total_eur` numeric, `valued + unvalued
  == total`, `confidence_mix` + `disclaimer` present ✓ (1/6 cards valued — One
  Piece price coverage is thin; the unvalued handling is correct)
- `set_completion`: returns the best-effort caveat ✓
- full agent run (mock LLM) uses the `collection` tool, evidence carries the
  summary ✓
- anonymous ctx → `sign_in_required` ✓
- test user + rows deleted ✓

<!-- GPT_OSS_EVAL -->

## 5. Security review

**Model: the LLM is treated as untrusted input.** It can only pick from a fixed
set of 6 tools and pass typed (zod-validated) arguments. It cannot construct SQL,
choose a table or RPC, read env, or bypass RLS.

| Check | Finding |
|---|---|
| **auth** | Optional `Bearer` JWT → `userSb.auth.getUser()` verifies the signature server-side. A forged/expired JWT → treated as anonymous. `userId` only set on successful verification. |
| **RLS** | `agent_queries`: RLS on, owner-read policy, **no** anon/authenticated write policy → only the service role (the endpoint) writes. `collection` reads go through the user-scoped client → RLS scopes to the caller's rows. `set_alias` / `card_number_alias` / `cards` / `canonical_cards` / `market_valuations` are public-read, no user data. |
| **input validation** | see §1. |
| **prompt injection** | Mitigated architecturally: the UI's economic figures and identities come from the `evidence` block (**derived from tool results, not the LLM's prose**). An injected LLM cannot make the Dossier show a fabricated price or a fake EN↔JA link. The system prompt also forbids it. Catalogue text (`cards.name`) is the only semi-trusted string in tool output; it is rendered as data, never executed. Adversarial fixtures (`adv-*`) exercise "ignore instructions", "assume it's worth €500", "don't use tools", "guess anyway". |
| **tool arguments** | zod schemas. All values reach Postgres as **parameters** (`supabase-js` `.rpc()` / `.eq()`), never string-interpolated into SQL. Verified with SQL-injection-style payloads (`'; drop table cards; --`, `Charizard' OR '1'='1`, `${process.env.SUPABASE_SERVICE_KEY}`) — `cards` table intact, no auth data returned. |
| **SQL/RPC injection** | Not possible — the agent selects among 6 tools, each bound to one specific RPC/query with typed args. No dynamic SQL anywhere in `api/_lib/ask/`. |
| **provider key exposure** | Keys read from `process.env` in `api/` only. `providerStatus()` / `GET /api/ask` return names and booleans, never values. Frontend bundle contains no server env (`ai`/`zod` are server-side; build verified). |
| **server/client boundary** | `api/_lib/ask/*` imported only by `api/*`. `useAsk.js` imports only `supabase` (public anon key) + `fetch('/api/ask')`. |
| **private collection data** | The `collection` tool has **no user-id / owner parameter** — it uses the caller's `userSb`. `adv-otheruser-1` fixture: "show me user 000…001's collection" — cannot. Anonymous → `sign_in_required`. |
| **write-capable tools** | None. All 6 tools are read-only (verified: tool names contain no write/exec/sql/admin token; every executor only reads). |
| **secrets in tool output** | Verified: no service-key fragment, no `eyJ…`-shaped or `*_API_KEY` strings in any tool output. |

### Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| F1 | Low | `agent_queries.query` stores the full question for every request (incl. anonymous). If a user types PII it is retained. | **Recommend a retention job** (e.g. daily `delete from agent_queries where created_at < now() - interval '90 days'`). Not a beta blocker; no IP/email is stored. |
| F2 | Info | `Access-Control-Allow-Origin: *` on `/api/ask`. | Acceptable for a rate-limited public read API. Tighten to the beta origin if desired. `X-Robots-Tag: noindex` added. |
| F3 | Info | Prompt injection via catalogue text is theoretically possible. | Mitigated: the Dossier's facts come from `evidence` (tool-derived), not the LLM prose. Adversarial fixtures cover it. |
| F4 | Info | PER_IP rate limit is per-instance / resets on cold start. | The durable GLOBAL + PER_USER counts (via `agent_queries`) are the real protection against cost/loop/Ollama-overload. |
| — | — | **No high / critical findings.** | |

## 6. Rate limiting — as implemented

- **Window:** 60s (all three).
- **GLOBAL:** 30 `/api/ask` calls / window across everyone → `429 scope:global`. Durable (counts `agent_queries`). Protects Ollama / cost from a runaway loop anywhere.
- **PER_USER:** 8 / window per signed-in user → `429 scope:user`. Durable.
- **PER_IP:** 5 / window per anonymous IP → `429 scope:ip`. Best-effort in-memory.
- **On exceed:** `429` JSON `{ error, scope, limit, window_seconds, retry_after_seconds }` + `Retry-After` header. No agent run, no LLM call, no `agent_queries` row.
- **Fail-open** on a DB count error for the GLOBAL rule (don't hard-block the whole service on a transient count failure); the PER_IP bucket still applies.
- **Tunable** via `ASK_RL_*` env with no redeploy of logic.

## 7. Agent changes driven by tests

<!-- AGENT_FIXES -->

## 8. Card Dossier — UX review

The `/ask` page is a **dossier**, not a chat clone:
- The answer prose renders **FACT / INFERENCE / RECOMMENDATION** as chips.
- **Cards referenced** — linked to `/carta/{slug}`.
- **Cross-language / cross-region** — only when ≥ 2 printings; each row shows
  `link_basis` (curated set/number mapping · shared identity · spelling variant)
  and the `alias_note` evidence.
- **Market valuation** — value · range · **sources** · **observations** · **as-of**
  · **confidence** + `confidence_reason` + "DraGold estimate, not a confirmed
  sale price".
- **No verified value** → *"Not yet valued"* + a plain reason + *"this is a
  data-coverage gap, not an error. Rather than show an unreliable number, DraGold
  says it doesn't know."* — deliberately not styled as a failure.
- **Live market** — active listings, "asking prices, not sold data".
- **Knowledge Graph context** — illustrator / set relationships / reprints + the
  honest roadmap note.
- **Footer** — provider/model · tools used · latency · "flagged: insufficient
  data" when applicable.

Visual QA: the input/examples state was rendered in a browser (screenshot sent
earlier). The Dossier states were reviewed in code and compile; a live render of
every Dossier branch needs the API running (dev server doesn't run Vercel
functions) — recommend a Storybook-style harness or a preview deploy.

## 9. Production readiness checklist

| Item | State |
|---|---|
| build | ✅ green |
| unit tests | ✅ 22 src · 583 scripts |
| RPC tests | ✅ 12 |
| Agent tests | ✅ 4 (mock) + 8 tool + verify scripts |
| eval | ⏳ gpt-oss:20b run — see §3/§4 |
| auth test | ✅ `verify-ask-collection.mjs` |
| rate-limit test | ✅ `ask-hardening.test.mjs` (12) |
| security review | ✅ this §5 — no high/critical |
| provider configuration | ✅ `GET /api/ask` health; 503 + hint when unconfigured |
| no secrets client-side | ✅ verified (build + `ask-security` test) |
| no PII leakage | ⚠️ F1 — `agent_queries.query` retained; recommend a retention job |
| no write-capable Agent tools | ✅ verified |
| Vercel compatibility | ⚠️ `maxDuration: 300` needs a plan that allows it. Hosted providers (Gemini/Anthropic) finish in seconds. **Self-hosted Ollama on Vercel is impractical** — run Ollama on a separate host and point `OLLAMA_BASE_URL` at it, or use a hosted provider for the deployed beta. |

## 10. Fase B / Fase C — technical note (do NOT implement yet)

The identity layer is **one primitive shared by three consumers**. The
resolution logic (alias remap, spelling collapse, cross-language safety) lives
**only** in SQL `public.xlang_key` / `public.card_versions` and its JS mirror
`scripts/lib/catalog/cross-lang.js`. Nothing else re-implements it.

| Consumer | How it should call the same primitive |
|---|---|
| **Agent** (done) | `card_versions` tool → `api/_lib/ask/toolImpls.js#cardVersions` → `rpc('card_versions')` |
| **Fase B — Search** (`src/lib/search.js`) | After the name-match, collect distinct `(tcg, set_id, card_number)` triples → **one** `rpc('card_versions_batch', { p_queries })` → merge rows (dedupe by `card_id`) → rename `groupByCanonical` → `groupByConcept`: group by `xlang_key` from the RPC, fallback `canonical_card_id`, fallback `id`. The existing heuristic multi-lang expansions become a *fallback* for when the RPC is unavailable. `SearchResultItem` gains `link_basis` on `variantEntries`. |
| **Fase C — Card page** (`src/pages/card/cardPageData.js`) | After `allVariants` via `canonical_card_id` → **one** `rpc('card_versions', { p_canonical_card_id })` → merge extra rows → order languages by the rule (context lang → en → ja → rest) → expose `link_basis` / `alias_note` to `CardPage.jsx`'s existing `crossLangBadge`. No `CardPage.jsx` logic change. |

Suggested shared client helper (Fase B): `src/lib/xlang.js` — wraps the
`card_versions` / `card_versions_batch` fetch + the `orderVersions` sort, so
Search and Card page don't each re-write the call. The agent stays server-side
but hits the same RPC. **Do not port the resolution logic into JS a second
time** — `cross-lang.js` is the mirror, and only for unit tests / an offline
fallback.

## 11. Ten demo questions for the beta

`scripts/eval/demo-questions.md` — high-value questions that show DraGold's real
advantage (identity, EN↔JA, provenance, confidence, honest gaps). Numbered 1–10,
each with the expected shape of a good answer.

## Beta readiness: <!-- BETA_READINESS -->

## Blockers / open items

<!-- BLOCKERS -->

## Commit / branch

Branch `feat/cross-language-identity`, PR #26 (**not merged**). Hardening commits
listed at the end of the final report.
