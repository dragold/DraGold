# Ask DraGold — MVP — RESULTS

> **Date:** 2026-09-03 · **Branch:** `feat/cross-language-identity` (stacked on Fase A) · **DB:** Supabase `pimwkmwrduqkaydyvxqz`
> **Objective:** first real Ask DraGold answer from real DraGold data. **Met.**

## Summary

`POST /api/ask` is a thin LLM orchestrator over six read-only DraGold tools. The
model plans, calls tools, and synthesises — it never produces a card identity or
an economic figure itself. Runs on **Ollama** (self-hosted, default), **Gemini**,
or **Anthropic**, selected by `DRAGOLD_LLM_PROVIDER`. A fully self-hosted,
key-free path (Ollama + Postgres) is complete.

Verified end-to-end against production data with local Ollama:
- `llama3.2:latest` (3B) and `gpt-oss:20b` both identified the Japanese
  リザードンex for EN 151 #006 **via the curated `card_versions` mapping**, and
  **refused to state a price** when `card_valuation` returned no data.

## STEP 1 — reused, not rewritten

| Need | Reused |
|---|---|
| search | `public.search_cards(q, tcg, lang, limit_n)` RPC (trigram; migration 005) |
| card identity / EN↔JA | `public.card_versions(...)` RPC (Fase A) |
| market valuation | `public.portfolio_valuations(text[])` RPC → resolves aliases → `market_valuations` (+ `sources`, `newest_observed_at` read directly) |
| live market | `api/_lib/ebay.js` (`getEbayToken`, `MARKETPLACE_MAP`) + `scripts/lib/valuation/ebay-browse.js` (`buildBrowseQuery` / `parseBrowseResponse` / `summarizeListings`) |
| collection | `collection` table (per-user RLS) + `portfolio_valuations` for values |
| Knowledge Graph | `card_versions` (cross-region edge) + `cards.illustrator` + `set_alias` + `canonical_cards` (reprints) |

No catalogue/market/collection code was rewritten. New code is the provider
abstraction, the tool wrappers, the agent loop, and the UI.

## What shipped

| Artefact | Path |
|---|---|
| Provider abstraction (Ollama / Gemini / Anthropic) | `api/_lib/ask/providers.js` |
| Server Supabase clients (service + user-scoped) | `api/_lib/ask/db.js` |
| 6 deterministic tools | `api/_lib/ask/toolImpls.js` + `tools.js` |
| Guardrail system prompt | `api/_lib/ask/systemPrompt.js` |
| Agent orchestration + grounded `evidence` derivation | `api/_lib/ask/agent.js` |
| Endpoint | `api/ask.js` (`POST /api/ask`) |
| Observability | migration `20260903190000_agent_queries` (applied) |
| Manual runner | `scripts/ask-dragold-repl.mjs` (`npm run ask:repl`) |
| Frontend | `src/pages/ask/` (`/ask` route) — question input + Card Dossier |
| Evaluation | `scripts/eval/ask-dragold-fixtures.json` (28) + `run-eval.mjs` + `compare-baseline.mjs` |
| Tests | `scripts/__tests__/ask-tools.test.mjs` (8) + `ask-agent.test.mjs` (4, mock LLM) |

## Guardrails (STEP 5)

The system prompt forbids inventing identities, prices, EN↔JA equivalences, and
sources; requires declaring insufficient data; requires `source + as_of +
confidence` on every economic value; requires FACT / INFERENCE / RECOMMENDATION
separation; and requires `card_search` before any card_id use. The tools fail
safe independently: an unknown `card_id` → `card_valuation` returns
`available:false` (never a number), `card_versions` returns 0 versions with
"no confirmed cross-language match" guidance. `agent.js` flags
`outcome: 'insufficient_data'` when the answer declines and no valuation was
obtained.

## agent_queries (STEP 6)

`query, user_id (opt), provider, model, latency_ms, tools_used, tool_calls
(jsonb), outcome, error, input/output/total_tokens, cost_usd`. RLS: owner-read
only, no anon/authenticated writes (service role only). No IP, no email, no
content beyond the question.

## Evaluation (STEP 8) & competitive proof (STEP 9)

28 fixtures across basic_identity / en / ja / en_ja / set_number / ambiguous /
price / price_provenance / collection / knowledge_graph / insufficient_data /
hallucination_trap. Deterministic checks only (tool usage, outcome, structured
evidence, answer regex, a universal "money must be grounded" check). Hard cases
included: Pokémon 151 EN↔JA, SV8/sv08 false identity, renumbered secret rare
#199, English Trainer #156 renumbering, cards outside the curated mapping.

### Results — `llama3.2:latest` (3B, local Ollama), 2026-09-03

**13 / 28 (46%).** By category: en 1/1 · ja 1/1 · ambiguous 2/2 · collection 2/2 ·
price 1/2 · price_provenance 1/2 · insufficient_data 2/3 · set_number 1/2 ·
knowledge_graph 1/3 · hallucination_trap 1/5 · **basic_identity 0/2 · en_ja 0/3**.

**The failures are model-capability failures, not DraGold-layer failures.**
Almost every failure is `llama3.2` *not emitting a real tool call* — it prints
`{"name":"card_versions","parameters":[…]}` as text, or claims "I obtained this
from card_versions" without calling it, then paraphrases an identity from its own
memory. When the model *does* call the tools, they return correct grounded data
(verified by the 24/24 tool + agent tests and the manual `gpt-oss:20b` runs).

Even with the weak model: **zero fabricated prices across all 28 fixtures** (the
universal "money must be grounded" check never caught a fabrication), and the
`insufficient_data` / `ambiguous` / `collection` behaviour is right.

`gpt-oss:20b` (also installed locally) calls tools reliably and handled the
hard cases (SV8/sv08, #199, One Piece identity) correctly in manual runs, at
~150 s/query. **Recommendation: run the beta on `gpt-oss:20b` or a hosted model
(Gemini Flash / Claude Haiku); `llama3.2` is a dev convenience only.**

### Competitive proof — same model (`llama3.2`), 6 hard questions, with vs without DraGold tools

`npm run ask:compare` → `scripts/eval/results/compare-llama32.json`:

| | Baseline (LLM alone) | Ask DraGold (LLM + tools) |
|---|---|---|
| fabricated a price with no hedge | 0/6 | **0/6** |
| fabricated a Japanese card number | **1/6** | 0/6 |
| price grounded in a tool OR explicitly declined | — | **4/6** |
| EN↔JA link established by a tool | — | 1/6 (model misread 1 tool result) |

Illustrative:
- *"market value of 151 Charizard ex 006, source + date?"* — Baseline invents
  "the TCGplayer price guide, as of my Dec 2023 cutoff". Ask DraGold:
  "not available — `unavailable_reason: no_data_yet`".
- *"Japanese number for English 151 Charizard ex SR #199?"* — Baseline invents
  "HP Code HP 00.00". Ask DraGold: "not found in `card_versions` — no confirmed
  cross-language match, do not infer from the name."
- *"equivalent Japanese card for Charizard ex 006?"* — Baseline: "Charizard EX is
  from the *EX Ruby & Sapphire* set" (wrong card entirely). Ask DraGold: 噴火龍ex
  #006, from `card_versions`.
- *One weak-model miss:* on "is Surging Sparks #100 the same as JA SV8 #100?",
  `card_versions` correctly returned **no** JA link, but `llama3.2` then wrote
  "the tool confirmed a direct cross-language match." `gpt-oss:20b` gets this
  right. The DraGold layer did its job; the 3B model misreported it.

## Tests / build

- `npm test` 22 · `npm run test:scripts` 583 · `npm run build` green (`/ask` is
  its own ~11 KB gz lazy chunk; `ai`/`zod` stay server-side).
- `npm run test:rpc` — RPC (12) + Ask tools (8) + Ask agent (4) = **24/24**.
- `get_advisors` security: **0 new warnings**.
- No changes to `src/lib/search.js`, `market_*`, `portfolio_*`, `collection`.

## COMPLETE / PARTIAL / BLOCKED

**COMPLETE**
- `/api/ask` end to end; 6 deterministic tools; grounded `evidence` block.
- Ollama path (llama3.2 + gpt-oss:20b verified against prod data).
- Guardrails; `agent_queries`; `/ask` UI (Card Dossier); 28 eval fixtures +
  runner + baseline comparison; tests; build.

**PARTIAL**
- **Gemini / Anthropic adapters**: written and wired, `resolveModel()` returns
  the right model, but **not executed** — no API key in this environment. Needs
  `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` to smoke-test.
- **`collection` tool**: implemented and returns `sign_in_required` correctly
  when anonymous; the signed-in path (RLS-scoped read + valuation aggregation)
  is **not tested with a real user token** (no test account).
- **`collection` set-completion**: best-effort estimate only — collection rows
  are not reliably tagged with a `set_id`, so owned-vs-total is approximate. A
  proper implementation needs collection rows keyed to `cards.id` / a set.
- **Frontend visual QA**: builds and the components are simple, but not rendered
  in a browser this session (no dev server run).
- **Small-model tool reliability**: `llama3.2` (3B) scores 46% on the 28-fixture
  eval — almost entirely because it fails to emit real tool calls, not because
  the tools are wrong. `gpt-oss:20b` is markedly better but ~150 s/query
  locally. Recommend `gpt-oss:20b` or a hosted model for the public beta.
- **Full eval on `gpt-oss:20b` / Gemini / Anthropic not run** this session
  (time / no keys). The runner (`npm run ask:eval`) is ready for it.

**BLOCKED**
- Deploy to production / Vercel — the user's call (merge auto-deploys). Needs
  `DRAGOLD_LLM_PROVIDER` + provider creds (or a hosted Ollama URL) set in Vercel.
- Fase B (Search `groupByConcept`) / Fase C (Card page) integration of
  `card_versions` — separate plans, not part of the Ask MVP.
- Normalized Knowledge Graph (characters, typed edges) — roadmap; the
  `knowledge_graph` tool exposes only what exists and says so.

## Residual risks / follow-ups

1. Tool-calling quality is model-bound. Ship the beta on `gpt-oss:20b` (local)
   or Gemini Flash / Claude Haiku (hosted); `llama3.2` is a dev convenience.
2. `search_cards` reads the stale `card_prices_latest` for its price columns —
   `card_search` drops them, but the RPC still does the join. Harmless, slightly
   wasteful; a lean `card_search_identity` RPC could replace it later.
3. `/api/ask` has no rate limiting or auth requirement — fine for a gated beta,
   needs a limiter before a public launch.
4. One Piece `card_versions` coverage is thin (EN/JA share `canonical_card_id`
   only where the catalogue is clean; some OP sets are mis-tagged per the vNext
   audit) — the agent reports tool output honestly regardless.
