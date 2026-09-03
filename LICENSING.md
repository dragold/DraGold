# Licensing

DraGold is built from three kinds of material with three different licences.
Read this before redistributing anything from this repository or a deployment
of it.

## 1. Software — Apache-2.0

Everything in this repository that is *code* — application source (`src/`),
serverless functions (`api/`), scripts (`scripts/`), database migrations
(`supabase/migrations/`), build config, and tests — is licensed under the
**Apache License, Version 2.0**. Full text: [`LICENSE`](./LICENSE). Attribution
notice: [`NOTICE`](./NOTICE).

You may run, fork, modify, self-host, and commercialise the software, subject
to the Apache-2.0 terms (retain the licence and NOTICE, state significant
changes, no trademark grant).

## 2. First-party curated mappings — CC0-1.0 (public domain)

DraGold authors a small amount of **editorial data**: assertions that a
regional TCG set is the same set as another region's set, and that a
particular card is the same card across regions. These live in:

- [`data/cross-language/`](./data/cross-language/) — set/number cross-language
  equivalences (`set-aliases.json`, `card-number-aliases.json`).

These files contain only **facts and DraGold's own words**: set codes,
languages, release dates, a relation, a confidence level, and a
human-written note citing the evidence. They contain **no third-party card
content** — no card names, images, rules text, or prices.

DraGold dedicates these files to the **public domain under CC0-1.0**
([`data/cross-language/LICENSE`](./data/cross-language/LICENSE)). Use them for
anything, with or without attribution. A fork gets the complete, working seed.

## 3. Third-party data — not ours, not redistributed

The catalogue the app reasons over (card names, images, rules text, set
metadata, prices, sold/listing data) comes from external sources, retrieved
**at runtime** by a deployment. It is **not stored in this repository** and
**not redistributed by the DraGold project**. Each source keeps its own
licence and Terms of Service, including but not limited to:

| Source | Used for | Terms |
|---|---|---|
| [TCGdex](https://www.tcgdex.net/) | Pokémon catalogue + images | tcgdex.net terms; open API |
| [TCGCSV](https://tcgcsv.com/) | market prices + One Piece catalogue (TCGplayer-derived) | tcgcsv.com terms; TCGplayer data |
| [Cardmarket](https://www.cardmarket.com/) | EU prices | Cardmarket API terms |
| [JustTCG](https://justtcg.com/) | condition-specific prices | JustTCG API terms |
| [Scryfall](https://scryfall.com/) | Magic catalogue | Scryfall data terms |
| [YGOPRODeck](https://ygoprodeck.com/) | Yu-Gi-Oh catalogue | YGOPRODeck API terms |
| [eBay](https://developer.ebay.com/) | live listings, affiliate links | eBay API License Agreement + EPN terms |
| Bandai / One Piece Card Game | official One Piece names/images (enrichment) | publisher terms; hotlink-protected |

**If you self-host DraGold, you are the party fetching that data** and are
responsible for complying with each source's licence and ToS. Do not
redistribute a source's data unless that source's licence permits it.

## Self-hosting target

DraGold is designed to be **100% self-hostable** with:

- **Postgres** (or Supabase) for storage
- **Ollama** for the Ask DraGold agent LLM (no proprietary model required)
- **TCGdex + TCGCSV** for the Pokémon / One Piece catalogue and prices,
  *where those sources' terms permit your use*

No DraGold-operated API, key, or paid tier is required to run the core.

## Contributing data

When adding to `data/cross-language/`, contributions are accepted **only**
under CC0-1.0, and must be facts + your own notes — never pasted third-party
card text. See [`data/cross-language/README.md`](./data/cross-language/README.md)
for the `confirmed` bar.
