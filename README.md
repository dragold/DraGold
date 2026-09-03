# DraGold

**An open-source TCG Intelligence Layer.** DraGold turns fragmented trading-card
data — catalogue, cross-language identity, market prices, your collection — into
one queryable knowledge layer, and puts a deterministic agent (**Ask DraGold**)
in front of it.

> "What is this card, what's the equivalent Japanese version, what's it worth,
> and which sources tell you that?"
> "What is my collection worth, and what do I need to finish this set?"

Every economic answer is deterministic and comes from a tool call, carrying
`source`, `as_of`, `confidence`, and `confidence_reason`. The LLM is not allowed
to invent prices, identities, or cross-language equivalences.

## Status

Early. Actively built in the open. See [`docs/plans/`](./docs/plans/) for the
current roadmap and phase results.

- ✅ Catalogue freshness + release monitor (Pokémon, One Piece)
- ✅ Market valuation foundation (`market_observations` → `market_valuations`, explainable confidence)
- ✅ Collection valuation ("My Collection → My Market Value")
- 🚧 Cross-language identity layer (EN↔JA) — *Phase A in progress*
- 🚧 Ask DraGold agent (deterministic tools + swappable LLM) — *MVP next*

## Architecture

```
DraGold Open Source Core
├── Catalog                (TCGdex / TCGCSV ingestion, freshness monitor)
├── Identity / EN↔JA       (canonical cards + curated cross-language mapping)
├── Knowledge Graph        (cards ↔ sets ↔ characters ↔ illustrators ↔ regions)
├── Market Intelligence    (observations → valuations, live market, affiliate)
├── Collection Intelligence(portfolio valuation, set completion)
├── deterministic tools    (read-only, no LLM, SQL-backed)
└── Ask DraGold Agent      (LLM orchestrates the tools; never invents data)
```

The LLM provider is swappable: **Ollama** (default, self-host), Gemini, or
Anthropic — selected by env, behind one abstraction (Vercel AI SDK).

## Stack

React 18 + Vite 5 (plain JS, no TypeScript) · Supabase / Postgres ·
Vercel serverless functions · `node:test`. No React Router, no Redux.

## Run it locally

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + keys
npm run dev                  # http://localhost:5173
npm test && npm run test:scripts
```

Self-hosting (Postgres + Ollama + TCGdex/TCGCSV) is a first-class target —
see [`LICENSING.md`](./LICENSING.md) for what you may and may not redistribute.

## Licensing

Three kinds of material, three licences — read [`LICENSING.md`](./LICENSING.md):

1. **Software** (all code): **Apache-2.0** — [`LICENSE`](./LICENSE)
2. **DraGold's curated cross-language mappings** (`data/cross-language/`):
   **CC0-1.0**, public domain — [`data/cross-language/LICENSE`](./data/cross-language/LICENSE)
3. **Third-party card data** (names, images, prices): **not ours, not
   redistributed** — fetched at runtime, each source's own terms apply.

## Contributing

Issues and PRs welcome. Data contributions to `data/cross-language/` are
accepted only under CC0-1.0 and must be facts + your own notes (never pasted
third-party card text). The bar for a `confirmed` mapping is in
[`data/cross-language/README.md`](./data/cross-language/README.md).
